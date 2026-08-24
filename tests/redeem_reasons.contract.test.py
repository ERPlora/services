#!/usr/bin/env python3
"""services#52 — the wiring that makes a refused redemption SPEAK (no Postgres needed).

`services.packages.redeem` used to be pure declarative SQL: when the gate refused (no uses left,
expired, unknown package), the caller — the API (`expose_api: true`), a flow, the assistant —
received the raw internals of the guard table:

    db: sqlx: … violates check constraint "services__gate_ok_check" at line 2076

The module already computed the reason (`services.packages.redeem_check` answers
`no_uses_left` / `expired` / `package_not_found`); the command just never said it. The fix routes
the command through the WASM handler, which reads its own pre-check (`reads`, ADR-0069), maps the
reason to a namespaced domain code and refuses with it — the same ladder as payment_gateways#23.

This file pins the CONTRACT (the Rust unit tests pin the mapping itself, and
`tests/redeem_reasons.postgres.test.py` pins the SQL):

  1. the command routes to the handler `redeem_package` and declares the read of
     `services.packages.redeem_check`, parameterized with the payload's GRANT id and `required`
     (a redemption is money: it does not admit guessing, hub#701). Since services#73 the payload
     names the customer's PURCHASE and not a catalogue package plus a customer id: the owner and
     the voucher are read off the grant, so the pair cannot be forged on the wire;
  2. the gated statements (conditional INSERT + assert + clear) live in the private command
     `services._redeem`, reachable only as the handler's intention;
  3. those statements bind `:redemption_id` — the id the handler takes from the host's batch and
     hands back to the caller — and no longer the per-statement `:new_id`;
  4. the four refusal codes (+ the closed-guard fallback) exist in BOTH locales, so what reaches
     a Spanish screen is a sentence, not a code or a stack trace. `services.package_no_grant` is
     the one services#73 added, and it is the honest answer to «this customer never bought that».

Usage: tests/redeem_reasons.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def sql_of(rel: str) -> str:
    """A `.sql` file without its `--` comments — a rule written in a comment enforces nothing."""
    return "\n".join(
        line
        for line in (MODULE_DIR / rel).read_text().split("\n")
        if not line.strip().startswith("--")
    )


def main() -> int:
    commands = MANIFEST["commands"]
    redeem = commands.get("services.packages.redeem", {})

    print("1. the command routes through the handler that names the reason")
    check(
        "handler function",
        "redeem_package",
        (redeem.get("handler") or {}).get("function"),
    )
    check(
        "no direct sql of its own (the gate lives in the private intention)",
        [],
        redeem.get("sql", []),
    )

    print("\n2. the read of its own pre-check, parameterized and required")
    reads = redeem.get("reads", [])
    if len(reads) != 1:
        failures.append(f"reads: expected exactly one read, got {reads!r}")
        print(f"  FAIL: reads = {reads!r}")
    else:
        read = reads[0]
        check("read query", "services.packages.redeem_check", read.get("query"))
        check(
            "read params come from the payload",
            {"grant_id": "payload.grant_id"},
            read.get("params"),
        )
        check(
            "read is required (a redemption does not admit guessing)",
            True,
            read.get("required"),
        )

    print("\n3. the gate lives in the private intention the handler emits")
    gated = commands.get("services._redeem", {})
    check(
        "services._redeem statements",
        [
            # 🔴 FIRST, and its position is the contract (services#77). It soft-deletes the holds
            # of this hub whose deadline has passed, INSIDE this command's transaction, so the
            # guard below counts a voucher's real balance instead of one an abandoned checkout is
            # still sitting on. Put it after the INSERT and the session is reclaimed one statement
            # too late — the redemption would already have been refused.
            "commands/hold_expire.sql",
            "commands/_redeem_insert.sql",
            "commands/_redeem_assert.sql",
            "commands/_gate_clear.sql",
        ],
        gated.get("sql", []),
    )
    check(
        "services._redeem permission (the handler's ceiling must cover it, hub#459)",
        "services.redeem_package",
        gated.get("permission"),
    )
    insert = sql_of("commands/_redeem_insert.sql")
    assert_sql = sql_of("commands/_redeem_assert.sql")
    check(
        "_redeem_insert binds :redemption_id (the id the handler hands back)",
        True,
        ":redemption_id" in insert and ":new_id" not in insert,
    )
    check(
        "_redeem_assert checks THE SAME row (:redemption_id, not a fresh :new_id)",
        True,
        ":redemption_id" in assert_sql and ":new_id" not in assert_sql,
    )

    print("\n4. the refusal codes exist in BOTH locales (en source + es, ADR-0055)")
    codes = [
        "services.package_no_grant",
        "services.grant_customer_required",
        "services.package_no_uses_left",
        "services.package_expired",
        "services.package_not_found",
        "services.package_not_redeemable",
    ]
    for lang in ("en", "es"):
        errors = json.loads((MODULE_DIR / "locales" / f"{lang}.json").read_text()).get(
            "errors", {}
        )
        for code in codes:
            sentence = errors.get(code)
            if not isinstance(sentence, str) or not sentence.strip():
                failures.append(f"locales/{lang}.json: `{code}` is missing from `errors`")
                print(f"  FAIL: locales/{lang}.json errors.{code} = {sentence!r}")
            else:
                print(f"  ok: locales/{lang}.json errors.{code}")

    print()
    if failures:
        print(f"FAILED — {len(failures)} contract violation(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — a refused redemption answers with a code the caller can translate")
    return 0


if __name__ == "__main__":
    sys.exit(main())
