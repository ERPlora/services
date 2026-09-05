#!/usr/bin/env python3
"""services#91 — every gate of `services__gate` refuses UNDER ITS OWN NAME.

`services__gate` was created (`migrations/postgres/003_package_redemption.sql`) with the anonymous
column check of the copied pattern:

    ok INTEGER NOT NULL CHECK (ok = 1)

Postgres auto-names it `services__gate_ok_check`, so ALL THREE gates of the module refuse with the
same primary message and the name of the gate that refused travels in the separate DETAIL field:

    ERROR:   new row for relation "services__gate" violates check constraint "services__gate_ok_check"
    DETAIL:  Failing row contains (package_redeemable, 0).

DETAIL never reaches the caller. A refusal arrives as `sqlx::Error::Database` wrapping
`PgDatabaseError`, whose `Display` writes the PRIMARY message and nothing else, and whose
`message()` does not carry DETAIL. So nothing downstream — the log, the API, the assistant, a flow
— can tell WHICH of the three rolled the transaction back.

This is the module's BACK ROAD, not its front door: `services.packages.redeem` answers through the
WASM handler's pre-check with a domain code (services#52), and that path does not depend on DETAIL.
What this battery pins is what happens when the pre-check and the gate DISAGREE — a race, or a
caller that does not go through the handler: the refusal has to name itself.

What is proven, against a REAL Postgres, on the schema the migrations actually build:

  1. THE REGISTRY (no Postgres needed) — every gate the commands INSERT has its own named
     constraint AND sits in the whitelist, and the whitelist carries nothing else. A gate added
     tomorrow without registering it fails HERE, loudly, instead of failing open in a customer's
     database.
  2. THE REPRODUCTION — each of the three gates refuses under its OWN name in the primary message,
     and does NOT name either of its siblings. Before the fix all three answered
     `services__gate_ok_check` and this half is what goes red.
  3. FAILS CLOSED — a gate nobody declared is refused by `services__gate_is_declared`, with ok = 0
     and with ok = 1 alike. That whitelist is what lets the anonymous catch-all go without opening
     a hole: with one constraint per gate, a row whose `gate` matches none of them would violate
     NOTHING, so a typo in an assert would commit.
  4. The happy path is untouched: a declared gate with ok = 1 still writes its row, so
     `commands/_gate_clear.sql` still has something to drain.

Usage: python3 tests/named_gate_constraints.postgres.test.py   (exit 0 = green)
  Uses the `erplora-test-pg-5433` container (override: SERVICES_TEST_PG_CONTAINER).
"""

import re
import sys

from pg_harness import (
    MODULE_DIR,
    ScratchDb,
    container_available,
    migration_entries,
    strip_comments,
)

GATE_TABLE = "services__gate"
WHITELIST = f"{GATE_TABLE}_is_declared"
ANONYMOUS = f"{GATE_TABLE}_ok_check"

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def check_names(label: str, gate: str, refusal: str) -> None:
    if gate in refusal:
        print(f"  ok: {label} names `{gate}`")
    else:
        failures.append(f"{label}: `{gate}` is not in the refusal `{refusal}`")
        print(f"  FAIL: {label}: `{gate}` is not in the refusal `{refusal}`")


def check_silent_about(label: str, other: str, refusal: str) -> None:
    if other in refusal:
        failures.append(f"{label}: the refusal also names `{other}` — `{refusal}`")
        print(f"  FAIL: {label}: the refusal also names `{other}` — `{refusal}`")
    else:
        print(f"  ok: {label} says nothing about `{other}`")


# ── what the CODE inserts, which is the only list that counts ────────────────

INSERTED = re.compile(
    r"INSERT\s+INTO\s+" + GATE_TABLE + r"\s*\([^)]*\)\s*SELECT\s+'([a-z0-9_]+)'",
    re.IGNORECASE,
)


def gates_the_commands_insert() -> list[str]:
    found: list[str] = []
    for sql_file in sorted((MODULE_DIR / "commands").glob("*.sql")):
        for gate in INSERTED.findall(strip_comments(sql_file.read_text())):
            if gate not in found:
                found.append(gate)
    return sorted(found)


# ── what the MIGRATIONS declare, replayed in the manifest's own order ────────

PER_GATE = re.compile(
    r"ADD\s+CONSTRAINT\s+([A-Za-z0-9_]+)\s+CHECK\s*\(\s*gate\s*<>\s*'([a-z0-9_]+)'\s*OR\s+ok\s*=\s*1\s*\)",
    re.IGNORECASE,
)
DECLARED = re.compile(
    r"ADD\s+CONSTRAINT\s+" + WHITELIST + r"\s+CHECK\s*\(\s*gate\s+IN\s*\(([^)]*)\)\s*\)",
    re.IGNORECASE,
)
DROPPED = re.compile(
    r"DROP\s+CONSTRAINT\s+(?:IF\s+EXISTS\s+)?" + ANONYMOUS + r"\b", re.IGNORECASE
)


def declared_sql() -> str:
    return "\n".join(
        strip_comments((MODULE_DIR / rel).read_text()) for rel, _kind in migration_entries()
    )


def manifest_half() -> None:
    """The registry: the gates the commands use are exactly the gates the schema knows about."""
    print("\nregistry: every gate the commands insert is declared, and nothing else is")
    sql = declared_sql()
    inserted = gates_the_commands_insert()
    check("the gates the commands insert", ["package_granted", "package_redeemable", "redemption_refunded"], inserted)

    named = {gate: name for name, gate in PER_GATE.findall(sql)}
    check("every inserted gate has its own named constraint", inserted, sorted(named))
    for gate, name in sorted(named.items()):
        check(f"the constraint guarding `{gate}` is named after it", gate, name)

    whitelisted = DECLARED.findall(sql)
    check("the whitelist is declared exactly once", 1, len(whitelisted))
    listed = sorted(re.findall(r"'([a-z0-9_]+)'", whitelisted[0])) if whitelisted else []
    check("the whitelist enumerates the inserted gates and nothing else", inserted, listed)

    check("the anonymous catch-all is dropped", 1, len(DROPPED.findall(sql)))


# ── the schema the migrations really build ───────────────────────────────────


def as_the_caller_sees_it(pg_stderr: str) -> str:
    """The primary message and nothing else — which is all `PgDatabaseError` hands the caller.

    Postgres puts the failing ROW, and therefore the `gate` value, in the separate DETAIL field.
    A battery that grepped psql's whole stderr would find a gate name the caller can never
    receive, and would pass just as well over the broken schema.
    """
    for line in pg_stderr.splitlines():
        line = line.strip()
        if line.startswith("ERROR:"):
            return line[len("ERROR:") :].strip()
    return " ".join(pg_stderr.split())


def refuses(db: ScratchDb, gate: str, ok: int) -> str | None:
    """Insert `(gate, ok)` and return the refusal as the caller sees it (None = it was accepted)."""
    try:
        db.psql([], db=db.name, stdin=f"INSERT INTO {GATE_TABLE} (gate, ok) VALUES ('{gate}', {ok});")
        return None
    except RuntimeError as exc:
        return as_the_caller_sees_it(str(exc))


def sql_half() -> None:
    db = ScratchDb("services_named_gates")
    db.create()
    try:
        gates = gates_the_commands_insert()

        print("\ngate table: every gate refuses under its OWN name")
        for gate in gates:
            refusal = refuses(db, gate, 0)
            if refusal is None:
                failures.append(f"gate `{gate}` accepted ok = 0 — the table fails OPEN")
                print(f"  FAIL: gate `{gate}` accepted ok = 0 — the table fails OPEN")
                continue
            check_names(f"the `{gate}` refusal", gate, refusal)
            # The relation name stays in the text: it is what a caller that has not been taught
            # the specific gate still keys on, so this migration must not break that mapping.
            check_names(f"the `{gate}` refusal", GATE_TABLE, refusal)
            for other in gates:
                if other != gate and other not in gate and gate not in other:
                    check_silent_about(f"the `{gate}` refusal", other, refusal)

        print("\ngate table: a gate nobody declared fails CLOSED, whatever `ok` says")
        for ok in (0, 1):
            refusal = refuses(db, "a_gate_nobody_declared", ok)
            if refusal is None:
                failures.append(f"an undeclared gate with ok = {ok} was accepted — the table fails OPEN")
                print(f"  FAIL: an undeclared gate with ok = {ok} was accepted — the table fails OPEN")
                continue
            check_names(f"the undeclared gate with ok = {ok}", WHITELIST, refusal)

        print("\ngate table: a gate that PASSES still writes its row")
        # Drain first: the count below has to answer about THIS insert, not about whatever a
        # previous refusal happened to leave behind (a fails-open regression would leak a row
        # here and the assertion would read as a different failure).
        db.psql([], db=db.name, stdin=(MODULE_DIR / "commands" / "_gate_clear.sql").read_text())
        check("a passing gate inserts", None, refuses(db, gates[0], 1))
        check("and `_gate_clear.sql` has something to drain", "1", db.scalar(f"SELECT count(*) FROM {GATE_TABLE}"))
        db.psql([], db=db.name, stdin=(MODULE_DIR / "commands" / "_gate_clear.sql").read_text())
        check("the clear drains it", "0", db.scalar(f"SELECT count(*) FROM {GATE_TABLE}"))
    finally:
        db.drop()


def main() -> int:
    manifest_half()
    if container_available():
        sql_half()
    else:
        print("\n  SKIPPED: the Postgres container is not available (SQL half not run)")
        return 1 if failures else 0
    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nall green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
