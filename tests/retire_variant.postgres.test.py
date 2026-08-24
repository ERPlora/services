#!/usr/bin/env python3
"""services#69 — `services_variant` is retired, and retiring it DESTROYS NOTHING.

`services_variant` was born in `001_init.sql` and never got a door: no command writes it, no query
reads it, no JSON Schema names it, the WASM handler ignores it, no permission mentions it. It is
the last of the three tables services#14 took out of scope on 2026-08-06 — the addon pair went
with services#67 (migration `009`), and this file retires the one that was left behind.

A table name is a CONTRACT with every hub that already created it, so the interesting assertions
here are not "the table is gone" but the four that surround it:

  1. **It is SET ASIDE, not destroyed.** The manifest declares migration 010 as `kind:"contract"`
     (hub#542/#1093), the only declaration under which the runtime accepts a `DROP` — and it
     accepts it by TRANSLATING it: `DROP TABLE t` is applied as `ALTER TABLE t RENAME TO
     _deprecated_t`. Metadata only, no lock, no byte copied, and the rows stay. So this file seeds
     a row BEFORE 010 and proves the row is still readable AFTER it.

  2. **Reverting is a rename back.** Not a restore from backup, not a re-CREATE that would come
     back empty: the same row, under the original name.

  3. 🔴 **The `DROP` carries no prose in front of it.** This is not style. The runtime's translator
     matches `DROP TABLE ` at the START of the statement text, and its splitter keeps comments
     INSIDE the statement they precede — so a header comment above the `DROP` makes the
     translation silently miss, and the hub executes a REAL, irreversible `DROP TABLE` on a
     customer database. That is why the prose of `010_retire_variant_table.sql` sits at the BOTTOM
     of the file, and why this test goes red if someone "tidies" it back to the top. The hub-side
     fix is ERPlora/hub#1137, still open.

  4. 🔴 **No `DROP INDEX`.** The two indexes of the table are NOT translated by the guard — a
     `DROP INDEX` would be the one genuinely destructive statement in a migration whose whole
     point is that nothing is destroyed. Postgres carries indexes along with their table through a
     rename, so they follow `_deprecated_services_variant` on their own.

And, so the module is not merely amputated: the catalogue still works with the table gone — a
service is created and listed through the manifest's own command and query.

The Postgres half needs the workspace container; without it the file reports SKIPPED. The contract
half (the manifest declaration, and that no statement of the module names the table) needs nothing
and always runs.

Usage: tests/retire_variant.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

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

RETIRED = "services_variant"
INIT_FILE = "migrations/postgres/001_init.sql"
ADDON_CONTRACT = "migrations/postgres/009_retire_addon_tables.sql"
CONTRACT_FILE = "migrations/postgres/010_retire_variant_table.sql"

# The only two files allowed to say the name: the one that CREATED the table and the one that
# retires it. `001_init.sql` keeps its `CREATE TABLE` on purpose — `_hub_migrations` records by
# FILE NAME, so editing an already-applied migration re-runs nothing on the hubs that have it and
# only changes the story for the ones that do not. History is append-only; the retirement is 010.
MAY_NAME_IT = (INIT_FILE, CONTRACT_FILE)

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok_ = expected == actual
    print(
        f"  {'ok' if ok_ else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok_ else f" (expected {expected!r})")
    )
    if not ok_:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def ok(label: str, condition: bool, detail: str = "") -> None:
    print(
        f"  {'ok' if condition else 'FAIL'}: {label}{'' if condition else f' — {detail}'}"
    )
    if not condition:
        failures.append(f"{label}{f' — {detail}' if detail else ''}")


# ── 1 · The manifest declares the retirement the only way the runtime accepts ────────────


def check_declaration() -> None:
    entries = migration_entries()
    contracts = [(f, k) for f, k in entries if k == "contract"]
    ok(
        "010 is declared, and as a `contract`",
        (CONTRACT_FILE, "contract") in contracts,
        f"contract entries = {contracts!r}",
    )
    ok(
        "009 still carries its own (retiring one table did not un-declare the other)",
        (ADDON_CONTRACT, "contract") in contracts,
        f"contract entries = {contracts!r}",
    )

    raw = {
        e["file"]: e for e in MANIFEST["migrations"]["postgres"] if isinstance(e, dict)
    }
    entry = raw.get(CONTRACT_FILE, {})
    ok(
        "the contract carries `since` (the version that stopped using what it retires)",
        isinstance(entry.get("since"), str) and bool(entry["since"]),
        f"since = {entry.get('since')!r}",
    )
    ok(
        "the declared file is in the package",
        (MODULE_DIR / CONTRACT_FILE).is_file(),
        f"{CONTRACT_FILE} missing",
    )
    # The chain stays linear: in order, no gaps (two open heads abort `migrate` silently). The head
    # is NOT pinned to 010 — pinning it is what made the 009 test go red when this one landed, and
    # a test about THIS retirement has no business failing because the chain grew past it.
    files = [f for f, _ in entries]
    numbers = [int(pathlib.Path(f).name.split("_", 1)[0]) for f in files]
    ok(
        "the migration chain is still ordered and gapless",
        files == sorted(files) and numbers == list(range(1, len(numbers) + 1)),
        f"{files!r}",
    )
    ok("010 is in the chain", CONTRACT_FILE in files, f"{files!r}")


# ── 2 · Nothing in the module names the table any more ───────────────────────────────────


def check_no_statement_names_it() -> None:
    looked_at = 0
    guilty: list[str] = []
    for path in sorted(MODULE_DIR.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(MODULE_DIR).as_posix()
        if rel.startswith(
            ("node_modules/", ".git/", "build/", "tests/", "dist/", "docs/")
        ):
            continue
        if path.suffix not in (".sql", ".json", ".rs"):
            continue
        if rel in MAY_NAME_IT:
            continue
        looked_at += 1
        text = path.read_text(errors="ignore")
        if RETIRED in text:
            guilty.append(rel)

    # A search that finds nothing proves nothing until it has found the thing that IS there:
    # `services_service` is alive and must light up the very same sweep.
    positive = sum(
        1
        for path in sorted(MODULE_DIR.rglob("*.sql"))
        if not path.relative_to(MODULE_DIR)
        .as_posix()
        .startswith(("node_modules/", "tests/"))
        and "services_service" in path.read_text(errors="ignore")
    )
    ok(
        "the sweep detects the positive (`services_service` is alive)",
        positive > 0,
        "found 0",
    )
    ok(
        f"only the birth and the retirement name it ({looked_at} other files swept)",
        not guilty,
        f"{guilty!r}",
    )


# ── 3 · The `DROP` is translated, not executed — and no index is dropped ─────────────────


def check_the_drop_is_translated() -> None:
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
    # `DROP INDEX` is NOT translated by the guard: it would really drop. The indexes follow the
    # table through the rename on their own.
    indexes = [s for s in applied if "DROP INDEX" in strip_comments(s).upper()]
    ok(
        "no statement drops an index (the guard would not translate it)",
        not indexes,
        f"{indexes!r}",
    )
    ok(
        "the table is set aside by rename",
        any(f"RENAME TO _deprecated_{RETIRED}" in s for s in applied),
        f"{applied!r}",
    )


# ── 4 · Against a real Postgres: the rows survive, and coming back is a rename ───────────


VARIANT = "variant-long-hair"
PARENT_SERVICE = "svc-colour"


def seed_a_row_in_the_doomed_table(db: ScratchDb) -> None:
    """A hub that somehow DID get rows in — the case the retirement must not lose."""
    db.psql(
        [],
        db=db.name,
        stdin=(
            "INSERT INTO services_service (id, hub_id, name, slug, duration_minutes) "
            f"VALUES ('{PARENT_SERVICE}', '{HUB}', 'Colour', 'colour', 45);\n"
            "INSERT INTO services_variant "
            "(id, hub_id, service_id, name, price_adjustment, duration_adjustment) "
            f"VALUES ('{VARIANT}', '{HUB}', '{PARENT_SERVICE}', 'Long hair', 1500, 20);\n"
        ),
    )


def table_exists(db: ScratchDb, table: str) -> bool:
    return (
        db.scalar(
            "SELECT COUNT(*) FROM information_schema.tables "
            f"WHERE table_schema = current_schema() AND table_name = '{table}'"
        )
        == "1"
    )


def index_count(db: ScratchDb, table: str) -> str:
    return db.scalar(
        "SELECT COUNT(*) FROM pg_indexes "
        f"WHERE schemaname = current_schema() AND tablename = '{table}'"
    )


def run_against_postgres() -> None:
    db = ScratchDb("services69")
    try:
        # Everything up to (not including) the retirement — the schema a live hub has today.
        db.create(through=ADDON_CONTRACT)
        ok(
            f"`{RETIRED}` exists before the retirement",
            table_exists(db, RETIRED),
            "not created",
        )
        # PK + the two declared indexes.
        check("its indexes exist before the retirement", "3", index_count(db, RETIRED))
        seed_a_row_in_the_doomed_table(db)

        db.apply(CONTRACT_FILE)

        ok(
            f"`{RETIRED}` is gone from the live schema",
            not table_exists(db, RETIRED),
            "still there",
        )
        ok(
            f"`_deprecated_{RETIRED}` holds it instead",
            table_exists(db, f"_deprecated_{RETIRED}"),
            "the rename did not happen — the table was DESTROYED",
        )
        check(
            "the row is still there, set aside",
            "Long hair|1500",
            db.scalar(
                f"SELECT name || '|' || price_adjustment FROM _deprecated_{RETIRED} "
                f"WHERE id = '{VARIANT}'"
            ),
        )
        # The indexes were never dropped: Postgres carried them along with the table.
        check(
            "the indexes followed the rename instead of being dropped",
            "3",
            index_count(db, f"_deprecated_{RETIRED}"),
        )
        # The parent service is untouched — the FK went with the renamed child, it did not cascade.
        check(
            "the parent service is untouched",
            "Colour",
            db.scalar(
                f"SELECT name FROM services_service WHERE id = '{PARENT_SERVICE}'"
            ),
        )

        # Re-running the contract cannot break a boot that died halfway.
        db.apply(CONTRACT_FILE)
        ok("applying the retirement twice does not raise", True)

        # Reverting is a rename back — the same row, not an empty re-CREATE.
        db.psql(
            [],
            db=db.name,
            stdin=f"ALTER TABLE _deprecated_{RETIRED} RENAME TO {RETIRED};\n",
        )
        check(
            "reverting is a rename back, with the data intact",
            "Long hair",
            db.scalar(f"SELECT name FROM {RETIRED} WHERE id = '{VARIANT}'"),
        )
    except (RuntimeError, KeyError, OSError) as exc:
        failures.append(f"the retirement run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()


def run_the_catalogue_without_it() -> None:
    """Amputating is not enough: what is left has to work."""
    db = ScratchDb("services69_use")
    try:
        db.create()
        ok(
            f"a NEW hub never creates `{RETIRED}`",
            not table_exists(db, RETIRED),
            "created anyway",
        )
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
    print("services#69 — retiring services_variant\n")

    print("contract — the manifest declares it the way the runtime accepts:")
    check_declaration()
    print("\ncontract — nothing names the retired table any more:")
    check_no_statement_names_it()
    print("\ncontract — the DROP is translated into a rename, not executed:")
    check_the_drop_is_translated()

    if container_available():
        print("\npostgres — the rows survive the retirement:")
        run_against_postgres()
        print("\npostgres — the catalogue works without it:")
        run_the_catalogue_without_it()
    else:
        print(
            "\nSKIPPED — no Postgres test container (the contract half above still ran)"
        )

    print()
    if failures:
        print(f"FAILED — {len(failures)} point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — services_variant is retired, set aside rather than destroyed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
