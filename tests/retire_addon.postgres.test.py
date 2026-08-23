#!/usr/bin/env python3
"""services#67 — the addon schema is retired, and retiring it DESTROYS NOTHING.

`services_addon` and `services_addon_services` were born in `001_init.sql` and never got a door:
no command writes them, no query reads them, no schema names them, the WASM handler ignores them.
ADR-0376 gave the concept a real owner — the `modifiers` module — and declared this pair retired
once that owner existed. This file is the proof that the retirement is safe to run on a hub that
is already live.

A table name is a CONTRACT with every hub that already created it, so the interesting assertions
here are not "the table is gone" but the three that surround it:

  1. **It is SET ASIDE, not destroyed.** The manifest declares migration 009 as `kind:"contract"`
     (hub#542/#1093), the only declaration under which the runtime accepts a `DROP` — and it
     accepts it by TRANSLATING it: `DROP TABLE t` is applied as `ALTER TABLE t RENAME TO
     _deprecated_t`. Metadata only, no lock, no byte copied, and the rows stay. So this file seeds
     a row BEFORE 009 and proves the row is still readable AFTER it.

  2. **Reverting is a rename back.** Not a restore from backup, not a re-CREATE that would come
     back empty: the same row, under the original name.

  3. 🔴 **The `DROP`s carry no prose in front of them.** This is not style. The runtime's
     translator matches `DROP TABLE ` at the START of the statement text, and its splitter keeps
     comments INSIDE the statement they precede — so a header comment above the first `DROP` makes
     the translation silently miss, and the hub executes a REAL, irreversible `DROP TABLE`.
     Verified against `hub/crates/runtime/src/migration_guard.rs` itself, compiled and run on this
     very migration. That is why the prose of `009_retire_addon_tables.sql` sits at the BOTTOM of
     the file, and why this test would go red if someone "tidied" it back to the top.

And, so the module is not merely amputated: the catalogue still works with the pair gone — a
service is created and listed through the manifest's own command and query.

The Postgres half needs the workspace container; without it the file reports SKIPPED. The contract
half (the manifest declaration, and that no statement of the module names the pair) needs nothing
and always runs.

Usage: tests/retire_addon.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import pathlib
import sys

from pg_harness import (
    HUB,
    MANIFEST,
    MODULE_DIR,
    ScratchDb,
    container_available,
    migration_entries,
    set_aside_instead_of_dropping,
    split_statements,
    strip_comments,
)

RETIRED = ("services_addon", "services_addon_services")
INIT_FILE = "migrations/postgres/001_init.sql"
CONTRACT_FILE = "migrations/postgres/009_retire_addon_tables.sql"

# The only two files allowed to say the names: the one that CREATED the pair and the one that
# retires it. `001_init.sql` keeps its `CREATE TABLE` on purpose — `_hub_migrations` records by
# FILE NAME, so editing an already-applied migration re-runs nothing on the hubs that have it and
# only changes the story for the ones that do not. History is append-only; the retirement is 009.
MAY_NAME_THEM = (INIT_FILE, CONTRACT_FILE)

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def ok(label: str, condition: bool, detail: str = "") -> None:
    print(f"  {'ok' if condition else 'FAIL'}: {label}{'' if condition else f' — {detail}'}")
    if not condition:
        failures.append(f"{label}{f' — {detail}' if detail else ''}")


# ── 1 · The manifest declares the retirement the only way the runtime accepts ────────────


def check_declaration() -> None:
    entries = migration_entries()
    contracts = [(f, k) for f, k in entries if k == "contract"]
    ok(
        "009 is declared, and as a `contract`",
        contracts == [(CONTRACT_FILE, "contract")],
        f"contract entries = {contracts!r}",
    )

    raw = {
        e["file"]: e
        for e in MANIFEST["migrations"]["postgres"]
        if isinstance(e, dict)
    }
    entry = raw.get(CONTRACT_FILE, {})
    ok(
        "the contract carries `since` (the version that stopped using what it retires)",
        isinstance(entry.get("since"), str) and entry["since"],
        f"since = {entry.get('since')!r}",
    )
    ok(
        "the declared file is in the package",
        (MODULE_DIR / CONTRACT_FILE).is_file(),
        f"{CONTRACT_FILE} missing",
    )
    # The chain stays linear: one head, in order, no gaps (two open heads abort `migrate` silently).
    files = [f for f, _ in entries]
    ok(
        "the migration chain is still ordered and gapless",
        files == sorted(files) and files[-1] == CONTRACT_FILE,
        f"{files!r}",
    )


# ── 2 · Nothing in the module names the pair any more ────────────────────────────────────


def check_no_statement_names_them() -> None:
    looked_at = 0
    guilty: list[str] = []
    for path in sorted(MODULE_DIR.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(MODULE_DIR).as_posix()
        if rel.startswith(("node_modules/", ".git/", "build/", "tests/", "dist/", "docs/")):
            continue
        if path.suffix not in (".sql", ".json", ".rs"):
            continue
        if rel in MAY_NAME_THEM:
            continue
        looked_at += 1
        text = path.read_text(errors="ignore")
        if any(name in text for name in RETIRED):
            guilty.append(rel)

    # A search that finds nothing proves nothing until it has found the thing that IS there:
    # `services_service` is alive and must light up the very same sweep.
    positive = sum(
        1
        for path in sorted(MODULE_DIR.rglob("*.sql"))
        if not path.relative_to(MODULE_DIR).as_posix().startswith(("node_modules/", "tests/"))
        and "services_service" in path.read_text(errors="ignore")
    )
    ok("the sweep detects the positive (`services_service` is alive)", positive > 0, "found 0")
    ok(
        f"only the birth and the retirement name the pair ({looked_at} other files swept)",
        not guilty,
        f"{guilty!r}",
    )


# ── 3 · The `DROP`s are translated, not executed ─────────────────────────────────────────


def check_the_drops_are_translated() -> None:
    path = MODULE_DIR / CONTRACT_FILE
    if not path.is_file():
        failures.append(f"{CONTRACT_FILE} does not exist — nothing to translate")
        print(f"  FAIL: {CONTRACT_FILE} does not exist")
        return
    sql = path.read_text()
    applied = [set_aside_instead_of_dropping(s) for s in split_statements(sql)]
    # On the SQL, not on the prose: this file EXPLAINS the translation, so the words «DROP TABLE»
    # appear in its comments and a raw text match would fail on its own documentation.
    dropping = [s for s in applied if "DROP TABLE" in strip_comments(s).upper()]
    ok(
        "no statement reaches the database as a real DROP TABLE",
        not dropping,
        f"{dropping!r} — prose above a DROP defeats the runtime's translation",
    )
    renamed = sorted(
        name for name in RETIRED
        if any(f"RENAME TO _deprecated_{name}" in s for s in applied)
    )
    check("both tables are set aside by rename", sorted(RETIRED), renamed)


# ── 4 · Against a real Postgres: the rows survive, and coming back is a rename ───────────


ADDON = "addon-keratin"
LINK_SERVICE = "svc-colour"


def seed_a_row_in_the_doomed_pair(db: ScratchDb) -> None:
    """A hub that somehow DID get rows in — the case the retirement must not lose."""
    db.psql(
        [],
        db=db.name,
        stdin=(
            "INSERT INTO services_service (id, hub_id, name, slug, duration_minutes) "
            f"VALUES ('{LINK_SERVICE}', '{HUB}', 'Colour', 'colour', 45);\n"
            "INSERT INTO services_addon (id, hub_id, name, price, duration_minutes) "
            f"VALUES ('{ADDON}', '{HUB}', 'Keratin treatment', 1500, 20);\n"
            "INSERT INTO services_addon_services (addon_id, service_id) "
            f"VALUES ('{ADDON}', '{LINK_SERVICE}');\n"
        ),
    )


def table_exists(db: ScratchDb, table: str) -> bool:
    return db.scalar(
        "SELECT COUNT(*) FROM information_schema.tables "
        f"WHERE table_schema = current_schema() AND table_name = '{table}'"
    ) == "1"


def run_against_postgres() -> None:
    db = ScratchDb("services67")
    try:
        # Everything up to (not including) the retirement — the schema a live hub has today.
        db.create(through="migrations/postgres/008_discount_basis_points.sql")
        for name in RETIRED:
            ok(f"`{name}` exists before the retirement", table_exists(db, name), "not created")
        seed_a_row_in_the_doomed_pair(db)

        db.apply(CONTRACT_FILE)

        for name in RETIRED:
            ok(f"`{name}` is gone from the live schema", not table_exists(db, name), "still there")
            ok(
                f"`_deprecated_{name}` holds it instead",
                table_exists(db, f"_deprecated_{name}"),
                "the rename did not happen — the table was DESTROYED",
            )

        check(
            "the row is still there, set aside",
            "Keratin treatment|1500",
            db.scalar(
                "SELECT name || '|' || price FROM _deprecated_services_addon "
                f"WHERE id = '{ADDON}'"
            ),
        )
        check(
            "the link row too (the FK followed the rename)",
            "1",
            db.scalar(
                "SELECT COUNT(*) FROM _deprecated_services_addon_services "
                f"WHERE addon_id = '{ADDON}'"
            ),
        )

        # Re-running the contract cannot break a boot that died halfway.
        db.apply(CONTRACT_FILE)
        ok("applying the retirement twice does not raise", True)

        # Reverting is a rename back — the same row, not an empty re-CREATE.
        db.psql(
            [],
            db=db.name,
            stdin=(
                "ALTER TABLE _deprecated_services_addon_services RENAME TO services_addon_services;\n"
                "ALTER TABLE _deprecated_services_addon RENAME TO services_addon;\n"
            ),
        )
        check(
            "reverting is a rename back, with the data intact",
            "Keratin treatment",
            db.scalar(f"SELECT name FROM services_addon WHERE id = '{ADDON}'"),
        )
    except (RuntimeError, KeyError, OSError) as exc:
        failures.append(f"the retirement run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()


def run_the_catalogue_without_them() -> None:
    """Amputating is not enough: what is left has to work."""
    db = ScratchDb("services67_use")
    try:
        db.create()
        for name in RETIRED:
            ok(f"a NEW hub never creates `{name}`", not table_exists(db, name), "created anyway")
        db.run_command(
            "services._insert_service",
            {
                "service_id": "svc-haircut",
                "name": "Haircut",
                "slug": "haircut",
                "description": "",
                "short_description": "",
                "category_id": None,
                "pricing_type": "fixed",
                "price": 2000,
                "cost": 0,
                "duration_minutes": 30,
                "buffer_before": 0,
                "buffer_after": 0,
                "max_capacity": 1,
                "is_bookable": 1,
                "requires_confirmation": 0,
                "allow_online_booking": 1,
                "sort_order": 0,
                "is_featured": 0,
                "sku": "",
                "barcode": "",
                "notes": "",
            },
        )
        rows = db.run_query("services.services.list", {})
        check(
            "the catalogue still creates and lists a service",
            ["Haircut"],
            [r["name"] for r in rows],
        )
    except (RuntimeError, KeyError, OSError) as exc:
        failures.append(f"the catalogue run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()


def main() -> int:
    print("services#67 — retiring services_addon / services_addon_services\n")

    print("contract — the manifest declares it the way the runtime accepts:")
    check_declaration()
    print("\ncontract — nothing names the retired pair any more:")
    check_no_statement_names_them()
    print("\ncontract — the DROPs are translated into renames, not executed:")
    check_the_drops_are_translated()

    if container_available():
        print("\npostgres — the rows survive the retirement:")
        run_against_postgres()
        print("\npostgres — the catalogue works without them:")
        run_the_catalogue_without_them()
    else:
        print("\nSKIPPED — no Postgres test container (the contract half above still ran)")

    print()
    if failures:
        print(f"FAILED — {len(failures)} point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the addon schema is retired, set aside rather than destroyed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
