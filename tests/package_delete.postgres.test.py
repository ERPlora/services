#!/usr/bin/env python3
"""services#3 — deleting a package soft-deletes its lines too, in the SAME transaction.

The bug: `services.packages.delete` declared only `commands/package_delete.sql` (the header), while
`commands/package_delete_items.sql` existed with a comment claiming it ran "in the same
transaction" — and nothing referenced it. After a delete, `services.packages.list` hid the header
and `services.package_items.list({package_id})` kept returning the lines alive.

Acceptance points:
  1. After `services.packages.delete`, every live line of the package is `is_deleted = 1`, with
     `deleted_at`/`updated_by` stamped — and it is a soft-delete: the rows are still there.
  2. `services.package_items.list` returns nothing for the deleted package (belt and braces: the
     lines query also demands a LIVE header of THIS hub).
  3. Lines of a DIFFERENT package of the same hub are untouched.
  4. A package with the SAME id-shaped attack from ANOTHER hub is untouched (the cascade is scoped
     by `hub_id`, not just by `package_id`).
  5. Deleting again is a no-op (idempotent retry): no error, counts unchanged.

The header and lines are seeded through the module's own private commands
(`services._insert_package`, `services._insert_package_item`) — the same SQL the WASM handler's
intentions run — so what is tested is the persisted shape the runtime really produces.

Usage: tests/package_delete.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import sys
import uuid

from pg_harness import HUB, OTHER_HUB, USER, ScratchDb, container_available

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def seed_service(db: ScratchDb, hub: str, name: str) -> str:
    db.run_command(
        "services.services.create",
        {
            "name": name,
            "price": 1000,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
        hub=hub,
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{hub}' AND name = '{name}'"
    )


def seed_package(db: ScratchDb, hub: str, name: str, service_ids: list[str]) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": name.lower(),
            "description": "",
            "discount_type": "percentage",
            "discount_percent_bp": 1000,
            "discount_amount_cents": 0,
            "fixed_price": None,
            "validity_days": None,
            "max_uses": None,
            "sort_order": 0,
            "is_active": 1,
            "is_featured": 0,
        },
        hub=hub,
    )
    for idx, service_id in enumerate(service_ids):
        db.run_command(
            "services._insert_package_item",
            {
                "item_id": str(uuid.uuid4()),
                "package_id": package_id,
                "service_id": service_id,
                "quantity": 1_000_000,
                "sort_order": idx,
            },
            hub=hub,
        )
    return package_id


def live_lines(db: ScratchDb, package_id: str) -> int:
    return int(
        db.scalar(
            f"SELECT count(*) FROM services_packageitem WHERE package_id = '{package_id}' AND is_deleted = 0"
        )
    )


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_pkg_delete_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")
        dye = seed_service(db, HUB, "Dye")
        target = seed_package(db, HUB, "Bundle", [cut, dye])
        sibling = seed_package(db, HUB, "Sibling", [cut])
        foreign_service = seed_service(db, OTHER_HUB, "Cut")
        foreign = seed_package(db, OTHER_HUB, "Bundle", [foreign_service])
        check("seeded: two live lines on the target", 2, live_lines(db, target))

        print("\n1. delete the package ⇒ header AND lines soft-deleted")
        db.run_command("services.packages.delete", {"package_id": target})
        check(
            "header is_deleted",
            "1",
            db.scalar(f"SELECT is_deleted FROM services_package WHERE id = '{target}'"),
        )
        check("live lines left", 0, live_lines(db, target))
        check(
            "rows still exist (soft-delete, not a purge)",
            "2",
            db.scalar(
                f"SELECT count(*) FROM services_packageitem WHERE package_id = '{target}'"
            ),
        )
        check(
            "lines stamped with deleted_at and updated_by",
            "2",
            db.scalar(
                f"SELECT count(*) FROM services_packageitem WHERE package_id = '{target}' "
                f"AND is_deleted = 1 AND deleted_at IS NOT NULL AND updated_by = '{USER}'"
            ),
        )

        print("\n2. the lines query answers nothing for a deleted package")
        check(
            "package_items.list rows",
            [],
            db.run_query("services.package_items.list", {"package_id": target}),
        )

        print("\n3. a sibling package of the same hub keeps its lines")
        check("sibling live lines", 1, live_lines(db, sibling))
        check(
            "sibling still listed",
            1,
            len(db.run_query("services.package_items.list", {"package_id": sibling})),
        )

        print("\n4. another hub's package is out of reach")
        db.run_command(
            "services.packages.delete", {"package_id": foreign}
        )  # from HUB, not OTHER_HUB
        check(
            "foreign header untouched",
            "0",
            db.scalar(
                f"SELECT is_deleted FROM services_package WHERE id = '{foreign}'"
            ),
        )
        check("foreign live lines", 1, live_lines(db, foreign))

        print("\n5. deleting again is a harmless retry")
        db.run_command("services.packages.delete", {"package_id": target})
        check("still zero live lines, no error", 0, live_lines(db, target))
    except (RuntimeError, KeyError) as exc:
        failures.append(f"the run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} acceptance point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — deleting a package soft-deletes its lines atomically, scoped by hub")
    return 0


if __name__ == "__main__":
    sys.exit(main())
