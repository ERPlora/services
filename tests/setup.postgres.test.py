#!/usr/bin/env python3
"""Setup-check contract test (services#26) — runs against a REAL Postgres 18 in Docker.

`tests/manifest.contract.test.py` proves the `setup` block PARSES the way the runtime parses it.
It cannot prove the only thing that matters afterwards: that the declared query, run against a real
database with real rows, actually ANSWERS — and answers the right thing. A `configured_when.field`
that no column produces reads as NULL, NULL is loosely false, and the item would sit on the
onboarding checklist as "pending" forever, with nothing anywhere saying why. That failure is
invisible to every static check, so it gets a database.

What is under test is the whole chain the runtime walks (`crates/runtime/src/setup_status.rs`):

    module.json `setup.query` → the query's SQL → first row → `configured_when` → done | pending

with the evaluator ported here verbatim (`truthy`/`as_text`/`is_configured`), so a change in the
core's semantics that this module depends on shows up as a red test and not as a hub that quietly
stops telling the user their catalogue is empty.

The acceptance points, and why each one is in the list:

  1. AN EMPTY CATALOGUE ANSWERS. The query returns a row even with zero services, and that row
     carries the `configured_when` field. A status query that returns NO row would still read as
     pending — the right answer for the wrong reason, and the moment somebody inverts a check it
     breaks silently.
  2. Empty catalogue ⇒ PENDING. This is the item's whole point: slot 31 of the checklist,
     "your catalogue", must light up on a fresh hub.
  3. One service ⇒ DONE. Created through the module's own `services.services.create`, not by hand:
     what marks the item as configured has to be the real path the user walks.
  4. Deactivated ⇒ PENDING again. `is_active = 0` is not sellable, so it does not count.
  5. Soft-deleted ⇒ PENDING again. The row contract (§2.5): deleted rows are still in the table.
  6. ANOTHER HUB'S CATALOGUE DOES NOT COUNT. The check runs per hub; without `:hub_id` in the
     WHERE, one tenant's services would tick every other tenant's checklist.

Usage: tests/setup.postgres.test.py
  Uses the `erplora-test-pg-5433` container by default (override: SERVICES_TEST_PG_CONTAINER).
  Creates a scratch database and DROPS it at the end, pass or fail.
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import uuid

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SERVICES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
DB = f"services_setup_test_{os.getpid()}"
HUB = "hub-under-test"
OTHER_HUB = "hub-next-door"
USER = "u-owner"
NOW = "2026-08-07T10:00:00Z"

MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

failures: list[str] = []


# ── Postgres plumbing ────────────────────────────────────────────────────────────────────


def psql(args: list[str], db: str | None = None, stdin: str | None = None) -> str:
    cmd = [
        "docker",
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
    ]
    if db:
        cmd += ["-d", db]
    cmd += args
    res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(res.stderr.strip() or res.stdout.strip())
    return res.stdout


# ── The runtime, in miniature ────────────────────────────────────────────────────────────

PARAM = re.compile(r":([a-z_][a-z0-9_]*)", re.IGNORECASE)


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def bind(sql: str, params: dict) -> str:
    """Single pass over `:name` placeholders — a value that itself contains a colon (an ISO
    timestamp) must never be rescanned. Params absent from the payload bind as NULL, which is what
    the runtime's driver does (`DynNull`, crates/db/src/lib.rs)."""
    return PARAM.sub(lambda m: literal(params.get(m.group(1))), sql)


def run_command(name: str, payload: dict) -> None:
    """Execute a manifest command's `sql[]` the way the runtime does: one transaction, system
    params injected."""
    cmd = MANIFEST["commands"][name]
    params = dict(payload)
    params.setdefault("hub_id", HUB)
    params.setdefault("current_user_id", USER)
    params.setdefault("now", NOW)
    params.setdefault("new_id", str(uuid.uuid4()))

    script = ["BEGIN;"]
    for rel in cmd["sql"]:
        stmt_params = dict(params, new_id=str(uuid.uuid4()))
        script.append(bind((MODULE_DIR / rel).read_text(), stmt_params))
    script.append("COMMIT;")
    psql([], db=DB, stdin="\n".join(script))


def run_query(name: str, params: dict) -> list[dict]:
    """Execute a manifest query (base SELECT, no list wrapper) and return rows as dicts."""
    qdef = MANIFEST["queries"][name]
    sql = (MODULE_DIR / qdef["sql"]).read_text().strip().rstrip(";")
    out = psql(["-tAc", f"SELECT row_to_json(r) FROM ({bind(sql, params)}) r"], db=DB)
    return [json.loads(line) for line in out.splitlines() if line.strip()]


# ── The evaluator, ported from crates/runtime/src/setup_status.rs ────────────────────────


def truthy(value) -> bool:
    """Loosely truthy: not null, not empty, not zero, not `false` — and not the STRINGS `"0"` /
    `"false"` either, because a boolean crossing a text column arrives spelled out."""
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        s = value.strip()
        return s != "" and s != "0" and s.lower() != "false"
    if isinstance(value, (list, tuple)):
        return len(value) > 0
    return True


def as_text(value) -> str:
    if isinstance(value, str):
        return value
    if value is None:
        return ""
    return json.dumps(value)


def passes(row: dict, check: dict) -> bool:
    value = row.get(check["field"])
    if "truthy" in check:
        return truthy(value) == check["truthy"]
    if "equals" in check:
        return as_text(value) == as_text(check["equals"])
    # Neither: a half-written contract must never silently tick the item as done.
    return False


def is_configured(rows: list[dict], checks: list[dict]) -> bool:
    """Configured ⇔ there is a row AND every check passes. No row ⇒ not configured (ADR-0063)."""
    if not rows:
        return False
    return all(passes(rows[0], c) for c in checks)


def setup_state(hub_id: str = HUB) -> str:
    """What `hub.setup.status` would report for this module's item."""
    setup = MANIFEST["setup"]
    params = dict(setup.get("params", {}))
    params["hub_id"] = hub_id
    rows = run_query(setup["query"], params)
    return "done" if is_configured(rows, setup["configured_when"]) else "pending"


# ── Assertions ───────────────────────────────────────────────────────────────────────────


def check(label: str, expected, actual) -> None:
    if expected != actual:
        failures.append(f"{label} — expected [{expected}], got [{actual}]")
        print(f"  FAIL: {label} — expected [{expected}], got [{actual}]")
    else:
        print(f"  ok: {label} = {expected}")


# ── Scenarios ────────────────────────────────────────────────────────────────────────────


def scenario_empty_catalogue_answers_and_is_pending() -> None:
    print("\n1+2. an empty catalogue answers, and the answer is `pending`")
    setup = MANIFEST["setup"]
    rows = run_query(setup["query"], {"hub_id": HUB})
    check("the status query returns exactly one row on an empty hub", 1, len(rows))
    if not rows:
        return
    for chk in setup["configured_when"]:
        field = chk["field"]
        check(
            f"the row carries `{field}` (a missing column reads NULL = pending forever)",
            True,
            field in rows[0],
        )
    check("empty catalogue", "pending", setup_state())


def scenario_one_service_is_done() -> str:
    print("\n3. one service created through `services.services.create` ⇒ done")
    run_command(
        "services.services.create",
        {
            "name": "Haircut",
            "price": 1800,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
    )
    check("catalogue with one active service", "done", setup_state())
    return psql(
        ["-tAc", f"SELECT id FROM services_service WHERE hub_id = '{HUB}' LIMIT 1"],
        db=DB,
    ).strip()


def scenario_deactivated_does_not_count(service_id: str) -> None:
    print("\n4. a deactivated service is not sellable ⇒ pending")
    run_command(
        "services.services.update",
        {
            "service_id": service_id,
            "name": "Haircut",
            "slug": "haircut",
            "description": "",
            "category_id": None,
            "pricing_type": "fixed",
            "price": 1800,
            "cost": 0,
            "duration_minutes": 30,
            "is_bookable": 1,
            "is_active": 0,
            "sort_order": 0,
            "tax_category_key": "standard",
        },
    )
    check("only service deactivated", "pending", setup_state())


def scenario_soft_deleted_does_not_count(service_id: str) -> None:
    print("\n5. a soft-deleted service is still a row, and it must not count ⇒ pending")
    # Back to active first, so what this scenario proves is the DELETE and not the previous one.
    run_command(
        "services.services.update",
        {
            "service_id": service_id,
            "name": "Haircut",
            "slug": "haircut",
            "description": "",
            "category_id": None,
            "pricing_type": "fixed",
            "price": 1800,
            "cost": 0,
            "duration_minutes": 30,
            "is_bookable": 1,
            "is_active": 1,
            "sort_order": 0,
            "tax_category_key": "standard",
        },
    )
    check("reactivated", "done", setup_state())
    run_command("services.services.delete", {"service_id": service_id})
    check("only service soft-deleted", "pending", setup_state())
    check(
        "the deleted row is still in the table (soft-delete, not a purge)",
        "1",
        psql(
            ["-tAc", f"SELECT count(*) FROM services_service WHERE hub_id = '{HUB}'"],
            db=DB,
        ).strip(),
    )


def scenario_other_hub_does_not_count() -> None:
    print("\n6. another hub's catalogue does not tick this hub's checklist")
    run_command(
        "services.services.create",
        {
            "hub_id": OTHER_HUB,
            "name": "Manicure",
            "price": 1200,
            "duration_minutes": 45,
            "tax_category_key": "standard",
        },
    )
    check("the neighbour's hub is configured", "done", setup_state(OTHER_HUB))
    check("ours is still empty", "pending", setup_state(HUB))


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def setup_database() -> None:
    psql(["-c", f'DROP DATABASE IF EXISTS "{DB}"'])
    psql(["-c", f'CREATE DATABASE "{DB}"'])
    for rel in MANIFEST["migrations"]["postgres"]:
        psql([], db=DB, stdin=(MODULE_DIR / rel).read_text())


def teardown_database() -> None:
    try:
        psql(["-c", f'DROP DATABASE IF EXISTS "{DB}" WITH (FORCE)'])
    except RuntimeError as exc:
        print(f"  ! could not drop {DB}: {exc}")


def main() -> int:
    if "setup" not in MANIFEST:
        print(
            "FAILED — module.json declares no `setup` block (services#26), so there is no check "
            "to run. Contract: architecture/hub/setup-status.md §6."
        )
        return 1

    try:
        subprocess.run(
            ["docker", "inspect", CONTAINER], capture_output=True, check=True, text=True
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print(f"SKIPPED — no `{CONTAINER}` container (set SERVICES_TEST_PG_CONTAINER)")
        return 0

    print(f"setup.query = {MANIFEST['setup']['query']}   ({DB} on {CONTAINER})")
    setup_database()
    try:
        scenario_empty_catalogue_answers_and_is_pending()
        service_id = scenario_one_service_is_done()
        scenario_deactivated_does_not_count(service_id)
        scenario_soft_deleted_does_not_count(service_id)
        scenario_other_hub_does_not_count()
    except (RuntimeError, KeyError) as exc:
        failures.append(f"the run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        teardown_database()

    print()
    if failures:
        print(f"FAILED — {len(failures)} acceptance point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the declared setup check answers, per hub, with real rows")
    return 0


if __name__ == "__main__":
    sys.exit(main())
