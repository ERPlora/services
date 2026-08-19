#!/usr/bin/env python3
"""services#44 — an archived service can be SEEN and REACTIVATED, without moving the diary's floor.

Since services#2 the screen archives (soft-delete + `is_active = 0`) but nothing brought a service
back: `queries/services_list.sql` filters `is_active = 1` **and** `is_deleted = 0`, and
`services.services.update` demands `is_deleted = 0`, so an archived service was invisible AND
unreachable — the only way back was the database.

The default of the list is NOT negotiable: `appointments` consumes this very query as its selector
of bookable services, and every reference of the market (Square, Fresha, Vagaro, Treatwell, Odoo,
Shopify, Lightspeed, Toast, Mindbody, 10/10) hides archived items by default. So the archived ones
come in through an EXPLICIT scope param, `include_archived`, and the catalogue screen is the only
caller that sends it.

Acceptance points:
  1. Archiving hides the service from the default list (the diary's selector is untouched).
  2. With `include_archived = 1` it shows up, and its `status` is `inactive` — the third word of the
     vocabulary, which until now never came out.
  3. `services.services.restore` brings it back: `is_deleted = 0`, `is_active = 1`, `deleted_at`
     cleared, audit stamped — and it is in the DEFAULT list again, as `active`.
  4. The diary's selector never changed: the default call returns exactly the live services, before
     and after, and never the archived one.
  5. Tenancy: a hub cannot restore its neighbour's service (`hub_id` is not negotiable).
  6. Restoring something that is not archived changes nothing, and the manifest declares
     `expect_rows` so the runtime turns those 0 rows into a business rejection, not a silent OK.

Usage: tests/restore.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import sys

from pg_harness import HUB, MANIFEST, OTHER_HUB, USER, ScratchDb, container_available

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
            "price": 1200,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
        hub=hub,
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{hub}' AND name = '{name}'"
    )


def listed(db: ScratchDb, hub: str = HUB, **params) -> dict[str, str]:
    """`{name: status}` of what `services.services.list` answers with these params."""
    rows = db.run_query("services.services.list", params, hub=hub)
    return {r["name"]: r["status"] for r in rows}


def main() -> int:
    print("1. the command exists and gates its 0 rows")
    restore = MANIFEST["commands"].get("services.services.restore")
    if not restore:
        print("  FAIL: services.services.restore is not declared in the manifest")
        failures.append("services.services.restore is not declared")
        return 1
    check(
        "restore declares expect_rows",
        "min",
        (restore.get("expect_rows") or {}).get("op"),
    )
    check(
        "restore is a WRITE gated by change_service",
        "services.change_service",
        restore.get("permission"),
    )

    if not container_available():
        print("\nSKIPPED the database half — no Postgres test container")
        return 1 if failures else 0

    db = ScratchDb("services_restore_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Corte")
        seed_service(db, HUB, "Tinte")
        neighbour = seed_service(db, OTHER_HUB, "Corte")

        print("\n2. archiving hides it from the DEFAULT list (the diary's selector)")
        db.run_command("services.services.delete", {"service_id": cut})
        check("default list", {"Tinte": "active"}, listed(db))

        print("\n3. with the explicit scope it shows up, as `inactive`")
        check(
            "list with include_archived",
            {"Corte": "inactive", "Tinte": "active"},
            listed(db, include_archived=1),
        )

        print("\n4. restore brings it back")
        db.run_command("services.services.restore", {"service_id": cut})
        check(
            "row flags",
            "0|1|",
            db.scalar(
                f"SELECT is_deleted || '|' || is_active || '|' || COALESCE(deleted_at::text, '') "
                f"FROM services_service WHERE id = '{cut}'"
            ),
        )
        check(
            "audit stamped",
            USER,
            db.scalar(f"SELECT updated_by FROM services_service WHERE id = '{cut}'"),
        )
        check(
            "back in the DEFAULT list, sellable again",
            {"Corte": "active", "Tinte": "active"},
            listed(db),
        )

        print("\n5. the neighbour's service is out of reach")
        db.run_command(
            "services.services.delete", {"service_id": neighbour}, hub=OTHER_HUB
        )
        db.run_command(
            "services.services.restore", {"service_id": neighbour}
        )  # from HUB
        check(
            "neighbour still archived",
            "1",
            db.scalar(
                f"SELECT is_deleted FROM services_service WHERE id = '{neighbour}'"
            ),
        )
        check(
            "and invisible to us even with the scope on",
            {"Corte": "active", "Tinte": "active"},
            listed(db, include_archived=1),
        )

        print("\n6. restoring a live service changes nothing")
        before = db.scalar(
            f"SELECT updated_at FROM services_service WHERE id = '{cut}'"
        )
        db.run_command("services.services.restore", {"service_id": cut})
        check(
            "untouched (the runtime turns 0 rows into services.service_not_archived)",
            before,
            db.scalar(f"SELECT updated_at FROM services_service WHERE id = '{cut}'"),
        )
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
    print(
        "PASS — archived services can be seen and restored, and the diary's selector is intact"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
