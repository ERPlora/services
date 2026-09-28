"""services#107 — two LIVE service categories of the same hub cannot share a name.

The owner created «Peinados de fiesta» twice and the second one went in without a word; from then
on the category picker of the service form showed two identical entries. The market refuses it at
save time (Square: «A category with this name already exists»), and so does this module now:

  1. Migration `017_category_name_gate.sql` is declared and applies on top of the previous ones.
  2. `services.categories.create` refuses a name another live category of the same hub already
     carries — compared trimmed, case-insensitive and with inner runs of spaces collapsed — and
     the refusal is the UNIQUE violation of `services_category_name_taken`, the index the
     command's `on_unique` renames to `services.category_name_taken` in the runtime (hub#2081).
     The whole command rolls back: no second row.
  3. `services.categories.update` refuses renaming a category onto another's name, and keeps
     accepting an edit of a category that keeps its OWN name (no self-collision).
  4. Scope: another hub may use the name (tenancy), and a DELETED category frees it.
  5. Legacy duplicates written before the guard are never touched and never block an unrelated
     write — the guard only looks at the row the command itself wrote.
  6. The gate table never keeps a row.

Usage: tests/category_unique_name.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import sys
import uuid

from pg_harness import (
    HUB,
    MANIFEST,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
)

MIGRATION = "migrations/postgres/017_category_name_gate.sql"
INDEX = "services_category_name_taken"

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused_by_gate(label: str, fn) -> None:
    """The command must fail with the unique violation of the name gate — nothing else counts."""
    try:
        fn()
    except RuntimeError as exc:
        text = str(exc)
        if INDEX in text:
            print(f"  ok: refused {label} ({text.splitlines()[0][:100]})")
        else:
            failures.append(
                f"{label}: refused for another reason: {text.splitlines()[0]}"
            )
            print(f"  FAIL: {label} refused for another reason: {text.splitlines()[0]}")
        return
    failures.append(f"{label}: the command was ACCEPTED")
    print(f"  FAIL: {label} was ACCEPTED")


def accepted(label: str, fn) -> None:
    try:
        fn()
        print(f"  ok: accepted {label}")
    except RuntimeError as exc:
        failures.append(f"{label}: refused: {str(exc).splitlines()[0]}")
        print(f"  FAIL: {label} refused: {str(exc).splitlines()[0]}")


def create(db: ScratchDb, name: str, hub: str = HUB, now: str = NOW) -> None:
    db.run_command("services.categories.create", {"name": name, "now": now}, hub=hub)


def update(
    db: ScratchDb, category_id: str, name: str, sort_order: int = 0, now: str = NOW
) -> None:
    db.run_command(
        "services.categories.update",
        {
            "category_id": category_id,
            "name": name,
            "slug": f"cat-{category_id}",
            "description": "",
            "parent_id": None,
            "icon": "",
            "color": "",
            "sort_order": sort_order,
            "is_active": 1,
            "now": now,
        },
    )


def count(db: ScratchDb, name: str, hub: str = HUB) -> int:
    safe = name.replace("'", "''")
    return int(
        db.scalar(
            f"SELECT COUNT(*) FROM services_category WHERE hub_id = '{hub}' "
            f"AND name = '{safe}' AND is_deleted = 0"
        )
    )


def id_of(db: ScratchDb, name: str, hub: str = HUB) -> str:
    safe = name.replace("'", "''")
    return db.scalar(
        f"SELECT id FROM services_category WHERE hub_id = '{hub}' AND name = '{safe}' "
        f"AND is_deleted = 0 ORDER BY created_at LIMIT 1"
    )


def insert_legacy(db: ScratchDb, name: str) -> None:
    """A row as a hub that ran the module BEFORE the guard left it (no command, no assert)."""
    cid = str(uuid.uuid4())
    db.psql(
        [
            "-c",
            "INSERT INTO services_category (id, hub_id, name, slug, created_at, updated_at) "
            f"VALUES ('{cid}', '{HUB}', '{name}', 'legacy-{cid}', '2026-01-01T00:00:00Z', "
            "'2026-01-01T00:00:00Z')",
        ],
        db=db.name,
    )


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    print("1. migration 017 is declared and both commands run the name assert")
    declared = [
        e if isinstance(e, str) else e["file"]
        for e in MANIFEST["migrations"]["postgres"]
    ]
    # Declared and on top of 016 — not «the last one»: every later migration
    # (018_grant_void, services#82) would otherwise break this battery.
    check("017 is declared", True, MIGRATION in declared)
    check(
        "017 comes right after 016",
        "migrations/postgres/016_named_gate_constraints.sql",
        declared[declared.index(MIGRATION) - 1] if MIGRATION in declared else None,
    )
    for name in ("services.categories.create", "services.categories.update"):
        cmd = MANIFEST["commands"][name]
        check(
            f"{name} runs the name assert last",
            "commands/_category_name_assert.sql",
            cmd["sql"][-1],
        )
        check(
            f"{name} renames the gate's violation",
            {INDEX: "services.category_name_taken"},
            cmd.get("on_unique"),
        )

    db = ScratchDb("svc_cat_unique")
    try:
        db.create()

        print("2. create refuses a name already taken in the hub")
        accepted(
            "the first «Peinados de fiesta»", lambda: create(db, "Peinados de fiesta")
        )
        refused_by_gate(
            "the same name again",
            lambda: create(db, "Peinados de fiesta", now="2026-08-18T10:00:01Z"),
        )
        refused_by_gate(
            "another case + outer spaces",
            lambda: create(db, "  peinados DE fiesta ", now="2026-08-18T10:00:02Z"),
        )
        refused_by_gate(
            "inner double space",
            lambda: create(db, "Peinados  de fiesta", now="2026-08-18T10:00:03Z"),
        )
        check(
            "live «peinados de fiesta» rows in the hub",
            "1",
            db.scalar(
                f"SELECT COUNT(*) FROM services_category WHERE hub_id = '{HUB}' AND is_deleted = 0 "
                "AND lower(name) LIKE '%peinados%'"
            ),
        )

        print(
            "3. update refuses a rename onto another's name, not an edit keeping its own"
        )
        accepted("«Color»", lambda: create(db, "Color", now="2026-08-18T10:01:00Z"))
        color = id_of(db, "Color")
        refused_by_gate(
            "renaming «Color» to «PEINADOS de fiesta»",
            lambda: update(db, color, "PEINADOS de fiesta", now="2026-08-18T10:01:01Z"),
        )
        check("«Color» kept its name", 1, count(db, "Color"))
        accepted(
            "re-saving «Color» with a new sort order",
            lambda: update(db, color, "Color", 5, now="2026-08-18T10:01:02Z"),
        )
        check(
            "«Color» sort order saved",
            "5",
            db.scalar(f"SELECT sort_order FROM services_category WHERE id = '{color}'"),
        )
        accepted(
            "renaming «Color» to a free name",
            lambda: update(db, color, "Coloración", now="2026-08-18T10:01:03Z"),
        )

        print("4. scope: another hub may use the name; a deleted category frees it")
        accepted(
            "«Peinados de fiesta» in the hub next door",
            lambda: create(
                db, "Peinados de fiesta", hub=OTHER_HUB, now="2026-08-18T10:02:00Z"
            ),
        )
        check(
            "the hub next door has its own",
            1,
            count(db, "Peinados de fiesta", hub=OTHER_HUB),
        )
        refused_by_gate(
            "a second one in the hub next door",
            lambda: create(
                db, "peinados de fiesta", hub=OTHER_HUB, now="2026-08-18T10:02:01Z"
            ),
        )
        first = id_of(db, "Peinados de fiesta")
        db.run_command(
            "services.categories.delete",
            {"category_id": first, "now": "2026-08-18T10:02:02Z"},
        )
        accepted(
            "the name again once the first is deleted",
            lambda: create(db, "Peinados de fiesta", now="2026-08-18T10:02:03Z"),
        )

        print("5. legacy duplicates are left alone and do not block unrelated writes")
        insert_legacy(db, "Uñas")
        insert_legacy(db, "Uñas")
        accepted(
            "an unrelated «Maquillaje»",
            lambda: create(db, "Maquillaje", now="2026-08-18T10:03:00Z"),
        )
        maquillaje = id_of(db, "Maquillaje")
        accepted(
            "an unrelated edit",
            lambda: update(db, maquillaje, "Maquillaje", 2, now="2026-08-18T10:03:01Z"),
        )
        check("both legacy «Uñas» still there", 2, count(db, "Uñas"))
        refused_by_gate(
            "a third «Uñas»", lambda: create(db, "Uñas", now="2026-08-18T10:03:02Z")
        )

        print(
            "5b. another hub's twins written at the SAME instant never block this hub"
        )
        instant = "2026-08-18T10:04:00Z"
        for _ in range(2):
            cid = str(uuid.uuid4())
            db.psql(
                [
                    "-c",
                    "INSERT INTO services_category (id, hub_id, name, slug, created_at, updated_at) "
                    f"VALUES ('{cid}', '{OTHER_HUB}', 'Barbería', 'legacy-{cid}', '{instant}', '{instant}')",
                ],
                db=db.name,
            )
        accepted(
            "«Pestañas» in this hub at that instant",
            lambda: create(db, "Pestañas", now=instant),
        )

        print("6. the gate table never keeps a row")
        check(
            "rows in services__name_gate",
            "0",
            db.scalar("SELECT COUNT(*) FROM services__name_gate"),
        )
    finally:
        db.drop()

    if failures:
        print(f"\nFAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nOK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
