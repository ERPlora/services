#!/usr/bin/env python3
"""services#41 — a service created by the BATCH is born sellable (it carries its tax category).

The bug: `services.services.create` has demanded `tax_category_key` since services#33 ("a service
is sold as a sale line with its VAT, so it cannot exist without knowing how it taxes"), but the
batch door skipped it: `commands/_insert_service.sql` did not even list the column, so every
service of a `services.services.bulk_create` landed with `tax_category_key = NULL` and the counter
refused to sell it — with the customer in front.

This file walks the SQL half of the fix (the handler half is the Rust `#[cfg(test)]` of
`handler/src/lib.rs`): it replays through `services._insert_service` the very param map the WASM
handler emits, and then reads the catalogue the way the till and the screen do.

Acceptance points:
  1. `services._insert_service` binds `:tax_category_key` at all (the column was missing).
  2. A batch service with its category is SELLABLE: `services.services.list` reports
     `status = 'active'`, and `services.services.get` returns the key that was sent.
  3. The symptom, reproduced: the same insert with no category lands as `unconfigured` — the
     status the list uses to mark a service that cannot be charged.
  4. The category is stored verbatim, not derived: a second batch row with `reduced` keeps
     `reduced` (nobody invents fiscal data).

Usage: tests/bulk_create.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import pathlib
import sys

from pg_harness import HUB, MODULE_DIR, ScratchDb, container_available

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


# The param map `bulk_create_services_pure` builds for every valid item, key by key.
def handler_intention(
    service_id: str, name: str, tax_category_key, price: int = 1500
) -> dict:
    params = {
        "service_id": service_id,
        "name": name,
        "slug": name.lower().replace(" ", "-"),
        "description": "",
        "short_description": "",
        "category_id": None,
        "pricing_type": "fixed",
        "price": price,
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
    if tax_category_key is not None:
        params["tax_category_key"] = tax_category_key
    return params


def status_of(db: ScratchDb, name: str):
    rows = [r for r in db.run_query("services.services.list", {}) if r["name"] == name]
    return rows[0]["status"] if rows else None


def main() -> int:
    print("1. the batch insert binds the fiscal category")
    sql = (MODULE_DIR / "commands" / "_insert_service.sql").read_text()
    check(
        ":tax_category_key is bound by _insert_service.sql",
        True,
        ":tax_category_key" in sql,
    )

    if not container_available():
        print("\nSKIPPED the database half — no Postgres test container")
        return 1 if failures else 0

    db = ScratchDb("services_bulk_create_test")
    db.create()
    try:
        print("\n2. a batch service with its category is sellable")
        db.run_command(
            "services._insert_service", handler_intention("svc-1", "Cut", "standard")
        )
        check(
            "tax_category_key persisted",
            "standard",
            db.scalar(
                f"SELECT tax_category_key FROM services_service WHERE id = 'svc-1' AND hub_id = '{HUB}'"
            ),
        )
        check("services.services.list status", "active", status_of(db, "Cut"))
        check(
            "services.services.get returns the key",
            "standard",
            db.run_query("services.services.get", {"service_id": "svc-1"})[0][
                "tax_category_key"
            ],
        )

        print("\n3. the symptom: with no category the row is unconfigured (unsellable)")
        db.run_command(
            "services._insert_service", handler_intention("svc-2", "Orphan", None)
        )
        check("services.services.list status", "unconfigured", status_of(db, "Orphan"))

        print("\n4. the key is stored verbatim, never invented")
        db.run_command(
            "services._insert_service", handler_intention("svc-3", "Dye", "reduced")
        )
        check(
            "second row keeps its own key",
            "reduced",
            db.scalar(
                f"SELECT tax_category_key FROM services_service WHERE id = 'svc-3'"
            ),
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
        "PASS — services created by the batch are born with their tax category, and sellable"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
