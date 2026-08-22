#!/usr/bin/env python3
"""services#52 — the three business reasons behind the gate, against a REAL Postgres.

The runtime halves of the fix live elsewhere: the reason→code mapping is the WASM handler's
(unit-tested in `handler/src/lib.rs`), and the manifest wiring is
`tests/redeem_reasons.contract.test.py`. What only the database can prove is the OTHER half of
the issue's acceptance criteria:

  1. `services.packages.redeem_check` — the read the handler now refuses with — answers the
     RIGHT reason for each scenario: exhausted, expired, unknown package (and an other-hub
     package is unknown, not "yours").
  2. The gated statements (`services._redeem`: conditional INSERT + assert + clear) still refuse
     and ROLL BACK in every one of those scenarios — the read is advisory, the gate stays the
     transactional authority, so a race between the read and the write still aborts.
  3. After a refusal NOTHING is left behind: no redemption row, no row in the guard table.
  4. The happy path still writes the ledger row and leaves the guard table empty in repose.

Usage: tests/redeem_reasons.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import re
import sys
import uuid

from pg_harness import HUB, MODULE_DIR, OTHER_HUB, ScratchDb, container_available

failures: list[str] = []

# `pg_harness.NOW` — the harness binds every :now to this instant.
NOW = "2026-08-18T10:00:00Z"
# 48 days before NOW: with validity_days = 30, a first use anchored here is long expired.
FIRST_USE_LONG_AGO = "2026-07-01T10:00:00Z"

# The hub's db layer lowers the `erp_*` SQL bridges (ADR-0007) to native Postgres before PREPARE;
# this miniature does the same for the ONLY two this module uses (`erp_dt`, `erp_dateadd`), the
# same way `appointments/tests/availability.postgres.test.py` shims its larger set.
BRIDGES = ("erp_dt", "erp_dateadd")


def lower_bridge(name: str, args: list[str]) -> str | None:
    if name == "erp_dt" and len(args) == 1:
        return f"(({args[0]})::timestamptz)"
    if name == "erp_dateadd" and len(args) == 3:
        return f"(({args[0]})::timestamptz + (({args[1]}) || ' ' || {args[2]})::interval)"
    return None


def lower_bridges(sql: str) -> str:
    """Rewrite every `erp_*(…)` call to its native Postgres expression (args may nest)."""
    if not any(f in sql for f in BRIDGES):
        return sql
    call = re.compile(r"\b(erp_dt|erp_dateadd)\s*\(", re.IGNORECASE)
    while True:
        m = call.search(sql)
        if not m:
            return sql
        depth, i = 1, m.end()
        while i < len(sql) and depth:
            if sql[i] == "(":
                depth += 1
            elif sql[i] == ")":
                depth -= 1
            i += 1
        inner, args, depth, start = sql[m.end() : i - 1], [], 0, 0
        for j, c in enumerate(inner):
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            elif c == "," and depth == 0:
                args.append(inner[start:j])
                start = j + 1
        args.append(inner[start:])
        native = lower_bridge(m.group(1).lower(), [a.strip() for a in args])
        if native is None:
            raise RuntimeError(f"cannot lower the bridge call {sql[m.start():i]!r}")
        sql = sql[: m.start()] + native + sql[i:]


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(db: ScratchDb, label: str, fn) -> None:
    """The gated statements must REFUSE — an exception is the pass; a silent success is the fail."""
    try:
        fn()
    except RuntimeError as exc:
        first = str(exc).splitlines()[0][:100]
        print(f"  ok: refused {label} ({first})")
        return
    failures.append(f"{label}: the gate ACCEPTED it")
    print(f"  FAIL: the gate ACCEPTED {label}")


def seed_service(db: ScratchDb, hub: str, name: str) -> str:
    db.run_command(
        "services.services.create",
        {"name": name, "price": 1000, "duration_minutes": 30, "tax_category_key": "standard"},
        hub=hub,
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{hub}' AND name = '{name}'"
    )


def seed_package(db: ScratchDb, hub: str, name: str, max_uses, validity_days) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": name.lower(),
            "description": "",
            "discount_type": "percentage",
            "discount_percent_bp": 0,
            "discount_amount_cents": 0,
            "fixed_price": None,
            "validity_days": validity_days,
            "max_uses": max_uses,
            "sort_order": 0,
            "is_active": 1,
            "is_featured": 0,
        },
        hub=hub,
    )
    return package_id


def redeem(db: ScratchDb, package_id: str, customer: str = "cus-1") -> None:
    """One use consumed through the gated statements, the way the handler's intention runs.

    `pg_harness.run_command` does not lower the `erp_*` bridges (no other services statement
    uses them), so this runs the same three statements with the same system params, lowered.
    """
    from pg_harness import USER, bind

    params = {
        "redemption_id": str(uuid.uuid4()),
        "package_id": package_id,
        "customer_id": customer,
        "hub_id": HUB,
        "current_user_id": USER,
        "now": NOW,
    }
    script = ["BEGIN;"]
    for rel in ("commands/_redeem_insert.sql", "commands/_redeem_assert.sql", "commands/_gate_clear.sql"):
        script.append(lower_bridges(bind((MODULE_DIR / rel).read_text(), params)))
    script.append("COMMIT;")
    db.psql([], db=db.name, stdin="\n".join(script))


def check_reason(db: ScratchDb, label: str, expected_reason: str, package_id: str, customer: str = "cus-1") -> None:
    from pg_harness import bind

    sql = (MODULE_DIR / "queries/package_redeem_check.sql").read_text().rstrip().rstrip(";")
    lowered = lower_bridges(bind(sql, {"hub_id": HUB, "now": NOW, "package_id": package_id, "customer_id": customer}))
    out = db.psql(["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({lowered}) t"], db=db.name)
    rows = json.loads(out.strip() or "[]")
    reason = rows[0].get("reason") if rows else None
    check(f"redeem_check reason · {label}", expected_reason, reason)
    check(f"redeem_check redeemable · {label}", 0, rows[0].get("redeemable"))


def residue(db: ScratchDb, package_id: str) -> tuple[int, int]:
    redemptions = int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE package_id = '{package_id}' AND is_deleted = 0"
        )
    )
    gate = int(db.scalar("SELECT count(*) FROM services__gate"))
    return redemptions, gate


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_redeem_reasons_test")
    db.create()
    try:
        seed_service(db, HUB, "Cut")
        print("A. exhausted — the 3rd use of a 2-use package")
        capped = seed_package(db, HUB, "Bono 2 usos", max_uses=2, validity_days=None)
        redeem(db, capped)
        redeem(db, capped)
        check("two uses consumed", 2, residue(db, capped)[0])
        check_reason(db, "exhausted", "no_uses_left", capped)
        refused(db, "the 3rd use", lambda: redeem(db, capped))
        check("no redemption row was left behind", (2, 0), residue(db, capped))

        print("\nB. expired — validity_days ran out since the first use")
        expiring = seed_package(db, HUB, "Bono caduca", max_uses=None, validity_days=30)
        # A first use anchored 48 days ago: the anchor starts the clock, not the purchase.
        db.psql(
            [],
            db=db.name,
            stdin=(
                "INSERT INTO services_package_redemption "
                "(id, hub_id, package_id, customer_id, note, redeemed_at, is_deleted) VALUES "
                f"('{uuid.uuid4()}', '{HUB}', '{expiring}', 'cus-1', 'first use', "
                f"'{FIRST_USE_LONG_AGO}', 0);"
            ),
        )
        check_reason(db, "expired", "expired", expiring)
        refused(db, "a use past the deadline", lambda: redeem(db, expiring))
        check("no redemption row was left behind", (1, 0), residue(db, expiring))

        print("\nC. unknown package — no bono by that id in this hub")
        ghost = str(uuid.uuid4())
        check_reason(db, "unknown package", "package_not_found", ghost)
        refused(db, "a ghost package", lambda: redeem(db, ghost))
        check("no residue at all", (0, 0), residue(db, ghost))

        print("\nD. another hub's package is UNKNOWN here, not shared")
        seed_service(db, OTHER_HUB, "Cut")
        foreign = seed_package(db, OTHER_HUB, "Bono 2 usos", max_uses=2, validity_days=None)
        check_reason(db, "other hub's package", "package_not_found", foreign)
        refused(db, "a cross-hub redemption", lambda: redeem(db, foreign))
        check("the other hub's ledger is untouched", (0, 0), residue(db, foreign))

        print("\nE. the happy path still writes the ledger and empties the guard")
        fresh = seed_package(db, HUB, "Bono abierto", max_uses=None, validity_days=None)
        from pg_harness import bind

        sql = (MODULE_DIR / "queries/package_redeem_check.sql").read_text().rstrip().rstrip(";")
        lowered = lower_bridges(bind(sql, {"hub_id": HUB, "now": NOW, "package_id": fresh, "customer_id": "cus-1"}))
        out = db.psql(["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({lowered}) t"], db=db.name)
        check("redeem_check redeemable", 1, json.loads(out.strip() or "[{}]")[0].get("redeemable"))
        redeem(db, fresh)
        check("one use consumed, gate empty in repose", (1, 0), residue(db, fresh))
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the gate refuses for the right reason and leaves nothing behind")
    return 0


if __name__ == "__main__":
    sys.exit(main())
