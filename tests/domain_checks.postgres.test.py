#!/usr/bin/env python3
"""services#9 — the domain rules hold in the DATABASE too (defence in depth behind the schemas).

The JSON Schemas (`tests/schemas.contract.test.py`) refuse a bad payload before the DB is touched.
This file proves the second line, against a REAL Postgres built from the module's migrations:

  1. Migration `007_domain_checks.sql` applies on top of the previous six (append-only, `NOT
     VALID`) — and it is declared in the manifest, so the deploy's `migrate` runs it.
  2. The CHECKs refuse what the schemas refuse — through a private `_insert_*` door, where no
     schema stands: pricing_type outside the enum, negative money, duration 0, capacity 0,
     percentage > 100, max_uses 0, quantity 0 — and the ONE rule only the DB can express:
     `min_price <= max_price`.
  3. Legit rows still go in (a CHECK that refuses the happy path is worse than none).
  4. Cross-row rules of the statements: a category cannot take another hub's category (or a
     deleted one, or itself) as parent — the statement affects 0 rows, which `expect_rows` turns
     into `services.parent_category_unavailable` / `services.category_update_rejected` in the
     runtime; a category can be created with only a name (slug derived, defaults resolved).
  5. `min_price`/`max_price` are actually PERSISTED by create/update (they were accepted and
     silently dropped before services#9).

Usage: tests/domain_checks.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import sys
import uuid

from pg_harness import (
    HUB,
    MANIFEST,
    MODULE_DIR,
    OTHER_HUB,
    ScratchDb,
    container_available,
)

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(db: ScratchDb, label: str, fn) -> None:
    """The DB must REFUSE — an exception is the pass; a silent success is the failure."""
    try:
        fn()
    except RuntimeError as exc:
        print(f"  ok: refused {label} ({str(exc).splitlines()[0][:90]})")
        return
    failures.append(f"{label}: the database ACCEPTED it")
    print(f"  FAIL: the database ACCEPTED {label}")


SVC_ROW = {
    "name": "X",
    "slug": None,
    "description": "",
    "short_description": "",
    "category_id": None,
    "pricing_type": "fixed",
    "price": 100,
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
}


def insert_service(db: ScratchDb, **over) -> None:
    row = dict(SVC_ROW, **over)
    row["service_id"] = str(uuid.uuid4())
    row["slug"] = row["slug"] or f"s-{row['service_id']}"
    db.run_command("services._insert_service", row)


PKG_ROW = {
    "name": "P",
    "description": "",
    "discount_type": "percentage",
    "discount_percent": 0,
    "discount_amount_cents": 0,
    "fixed_price": None,
    "validity_days": None,
    "max_uses": None,
    "sort_order": 0,
    "is_active": 1,
    "is_featured": 0,
}


def insert_package(db: ScratchDb, **over) -> str:
    row = dict(PKG_ROW, **over)
    row["package_id"] = str(uuid.uuid4())
    row["slug"] = f"p-{row['package_id']}"
    db.run_command("services._insert_package", row)
    return row["package_id"]


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    print("1. migration 007 is declared and applies on top of the previous ones")
    check(
        "last postgres migration",
        "migrations/postgres/007_domain_checks.sql",
        MANIFEST["migrations"]["postgres"][-1],
    )
    db = ScratchDb("services_domain_checks_test")
    db.create()  # raises if any migration fails
    try:
        check(
            "CHECK constraints on services_service",
            "4",
            db.scalar(
                "SELECT count(*) FROM pg_constraint WHERE conrelid = 'services_service'::regclass AND contype = 'c'"
            ),
        )

        print(
            "\n2. the CHECKs refuse through a door with no schema (`services._insert_service`)"
        )
        refused(
            db,
            "pricing_type outside the enum",
            lambda: insert_service(db, pricing_type="nonsense"),
        )
        refused(db, "a negative price", lambda: insert_service(db, price=-1))
        refused(db, "a negative cost", lambda: insert_service(db, cost=-1))
        refused(db, "duration 0", lambda: insert_service(db, duration_minutes=0))
        refused(db, "a negative buffer", lambda: insert_service(db, buffer_after=-1))
        refused(db, "capacity 0", lambda: insert_service(db, max_capacity=0))
        refused(db, "a flag of 2", lambda: insert_service(db, is_bookable=2))
        refused(
            db, "a percentage of 150", lambda: insert_package(db, discount_percent=150)
        )
        refused(
            db,
            "a negative fixed discount",
            lambda: insert_package(db, discount_type="fixed", discount_amount_cents=-5),
        )
        refused(
            db,
            "discount_type outside the enum",
            lambda: insert_package(db, discount_type="coupon"),
        )
        refused(db, "max_uses 0", lambda: insert_package(db, max_uses=0))
        refused(db, "validity_days 0", lambda: insert_package(db, validity_days=0))
        refused(
            db,
            "min_price > max_price (the rule only the DB can express)",
            lambda: db.run_command(
                "services.services.create",
                {
                    "name": "Range",
                    "tax_category_key": "standard",
                    "pricing_type": "from",
                    "min_price": 2000,
                    "max_price": 1000,
                },
            ),
        )
        pkg = insert_package(db, name="Live")
        svc_for_line = None
        db.run_command(
            "services.services.create",
            {"name": "Cut", "tax_category_key": "standard", "price": 1000},
        )
        svc_for_line = db.scalar(
            f"SELECT id FROM services_service WHERE hub_id = '{HUB}' AND name = 'Cut'"
        )
        refused(
            db,
            "a package line with quantity 0",
            lambda: db.run_command(
                "services._insert_package_item",
                {
                    "item_id": str(uuid.uuid4()),
                    "package_id": pkg,
                    "service_id": svc_for_line,
                    "quantity": 0,
                    "sort_order": 0,
                },
            ),
        )
        refused(
            db,
            "a category that is its own parent",
            lambda: db.psql(
                [],
                db=db.name,
                stdin=f"INSERT INTO services_category (id, hub_id, name, slug, parent_id) VALUES ('self', '{HUB}', 'Self', 'self', 'self');",
            ),
        )

        print("\n3. legit rows still go in")
        insert_service(db, name="Fine", pricing_type="from", price=0)
        check(
            "a `from` service at price 0",
            "1",
            db.scalar("SELECT count(*) FROM services_service WHERE name = 'Fine'"),
        )
        insert_package(
            db, name="Voucher", discount_percent=100, max_uses=10, validity_days=365
        )
        check(
            "a 100% voucher with uses and validity",
            "1",
            db.scalar("SELECT count(*) FROM services_package WHERE name = 'Voucher'"),
        )

        print("\n4. categories: parent scoping and defaults in the statements")
        db.run_command("services.categories.create", {"name": "Hair"})
        root = db.scalar(
            f"SELECT id FROM services_category WHERE hub_id = '{HUB}' AND name = 'Hair'"
        )
        check(
            "a category with only a name gets a slug",
            "cat-" + root,
            db.scalar(f"SELECT slug FROM services_category WHERE id = '{root}'"),
        )
        check(
            "…and the column defaults",
            "|||0|1",
            db.scalar(
                f"SELECT description || '|' || icon || '|' || color || '|' || sort_order || '|' || is_active FROM services_category WHERE id = '{root}'"
            ),
        )
        db.run_command(
            "services.categories.create", {"name": "Colour", "parent_id": root}
        )
        check(
            "a child of a live parent of this hub",
            "1",
            db.scalar(
                f"SELECT count(*) FROM services_category WHERE name = 'Colour' AND parent_id = '{root}'"
            ),
        )
        db.run_command(
            "services.categories.create", {"name": "Foreign root"}, hub=OTHER_HUB
        )
        foreign = db.scalar(
            f"SELECT id FROM services_category WHERE hub_id = '{OTHER_HUB}'"
        )
        db.run_command(
            "services.categories.create", {"name": "Intruder", "parent_id": foreign}
        )
        check(
            "a child of ANOTHER hub's category is not created (0 rows → expect_rows)",
            "0",
            db.scalar("SELECT count(*) FROM services_category WHERE name = 'Intruder'"),
        )
        db.run_command("services.categories.delete", {"category_id": root})
        db.run_command(
            "services.categories.create", {"name": "Orphan", "parent_id": root}
        )
        check(
            "a child of a DELETED parent is not created",
            "0",
            db.scalar("SELECT count(*) FROM services_category WHERE name = 'Orphan'"),
        )
        colour = db.scalar("SELECT id FROM services_category WHERE name = 'Colour'")
        upd = {
            "category_id": colour,
            "name": "Colour",
            "slug": "colour",
            "description": "",
            "icon": "",
            "color": "",
            "sort_order": 0,
            "is_active": 1,
        }
        db.run_command("services.categories.update", dict(upd, parent_id=colour))
        check(
            "update: a category cannot become its own parent (0 rows)",
            root,
            db.scalar(f"SELECT parent_id FROM services_category WHERE id = '{colour}'"),
        )
        db.run_command("services.categories.update", dict(upd, parent_id=foreign))
        check(
            "update: nor take another hub's parent (0 rows)",
            root,
            db.scalar(f"SELECT parent_id FROM services_category WHERE id = '{colour}'"),
        )
        db.run_command(
            "services.categories.update",
            dict(upd, parent_id=None, name="Colour (root)"),
        )
        check(
            "update: to root, with a rename",
            "Colour (root)|",
            db.scalar(
                f"SELECT name || '|' || COALESCE(parent_id, '') FROM services_category WHERE id = '{colour}'"
            ),
        )

        print("\n5. min_price/max_price are persisted by create and update")
        db.run_command(
            "services.services.create",
            {
                "name": "Massage",
                "tax_category_key": "standard",
                "pricing_type": "from",
                "min_price": 3000,
                "max_price": 6000,
            },
        )
        massage = db.scalar(
            f"SELECT id FROM services_service WHERE hub_id = '{HUB}' AND name = 'Massage'"
        )
        check(
            "create persists the range",
            "3000|6000",
            db.scalar(
                f"SELECT min_price || '|' || max_price FROM services_service WHERE id = '{massage}'"
            ),
        )
        db.run_command(
            "services.services.update",
            {
                "service_id": massage,
                "name": "Massage",
                "slug": "massage",
                "description": "",
                "category_id": None,
                "pricing_type": "from",
                "price": 0,
                "min_price": 3500,
                "max_price": 6000,
                "cost": 0,
                "duration_minutes": 60,
                "is_bookable": 1,
                "is_active": 1,
                "sort_order": 0,
                "tax_category_key": "standard",
            },
        )
        check(
            "update persists the range",
            "3500|6000",
            db.scalar(
                f"SELECT min_price || '|' || max_price FROM services_service WHERE id = '{massage}'"
            ),
        )
    except (RuntimeError, KeyError) as exc:
        failures.append(f"the run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the domain rules hold in the database, behind the schemas")
    return 0


if __name__ == "__main__":
    sys.exit(main())
