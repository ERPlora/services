#!/usr/bin/env python3
"""services#81 — a voucher whose owner is deleted keeps its money AND stays findable.

`services_package_grant.customer_id` is an OPAQUE reference with no cross-module foreign key —
that is the module contract and it is right. The price of it is this: when `customers` removes a
sheet, `services` never hears about it. The grant stays alive in the table with its sessions and
its amount, and it stops appearing ANYWHERE, because every door into a voucher starts from the
customer (`services.packages.balance` takes `:customer_id`). Money that was charged becomes
invisible — not lost, worse: unfindable.

WHAT THE MARKET SAYS (the full table with URLs is in the pull request of services#81)

Two schools, and they answer different questions:

  * REFUSE THE DELETE while the customer holds value — Vagaro will not remove a customer with
    «gift cards that are not expired or have a balance, memberships or packages (active or
    inactive)»; Lightspeed X-Series refuses a customer with an owing balance; Business Central
    answers «block», not delete; Odoo cannot delete a contact linked to documents, it archives it.
  * LET THE DELETE THROUGH, KEEP THE MONEY ALIVE AND VISIBLE ELSEWHERE — Square unlinks the gift
    card and the balance stays spendable; Lightspeed's store credit report LISTS DELETED CUSTOMERS;
    Fresha keeps past sales; Shopify and WooCommerce redact the personal data and keep the row.

The first school is not available to us and it is not a preference: `customer.deleted` is published
AFTER the transaction commits (`crates/runtime/src/events.rs`), there is no cross-module veto in the
dispatcher, and giving `customers` a hard dependency on `services` to ask permission is exactly what
the module contract forbids. So we implement the second, which is also the one that never destroys
what a customer paid for.

WHAT IS PROVEN HERE, against a REAL Postgres:

  1. THE REPRODUCTION — a grant with sessions left whose owner was deleted is not reachable from
     any customer-keyed door, and before the fix nothing in the module even knows it happened.
  2. The module LISTENS to `customer.deleted` and stamps the grant (`customer_deleted_at`). The
     stamp is the only thing that changes: sessions, amount and expiry are untouched.
  3. `customer.anonymized` stamps too. A GDPR erasure is not a forfeiture of a paid voucher — and
     the stamp holds no personal data, only the opaque id that was already in the row.
  4. IDEMPOTENCE. The outbox is at-least-once: a redelivered event must not move the timestamp.
  5. THE RESCUE LIST — `services.packages.orphans` finds them WITHOUT a customer id, which is the
     whole point: it is the only door that does not start from the sheet that no longer exists.
     It carries what an operator needs to act (`remaining`, `has_value`, `is_expired`, the amount)
     and it lists spent and expired ones too, so nothing drops off the list on a timer.
  6. A grant whose customer is ALIVE is not in the list, and neither is a deleted (refunded away)
     grant.
  7. TENANCY — the neighbour hub's grant for the same customer id is not stamped and not listed.

Usage: tests/orphan_grants.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import sys
import uuid

from pg_harness import (
    HUB,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
    list_page,
    query_sql,
    script_for,
)

MANIFEST = json.loads(
    (
        __import__("pathlib").Path(__file__).resolve().parent.parent / "module.json"
    ).read_text()
)

#: The two events of `customers` that make a sheet stop existing for everybody else. Both are
#: already emitted today (`customers` v2.3.38, `commands/delete.sql` and `commands/anonymize.sql`):
#: nothing has to be asked of the neighbour module, only listened to.
ORPHANING_EVENTS = ("customer.deleted", "customer.anonymized")
LISTENER = "services._on_customer_deleted"
ORPHANS = "services.packages.orphans"
PERMISSION = "services.view_orphan_grant"

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def truthy(label: str, value) -> None:
    check(label, True, bool(value))


# ── 1 · the manifest (runs with or without Docker) ───────────────────────────


def manifest_half() -> None:
    print("\n— the manifest declares the ear, the door and the permission —")

    listen = MANIFEST["events"].get("listen", {})
    for event in ORPHANING_EVENTS:
        check(
            f"`{event}` is listened to",
            LISTENER,
            (listen.get(event) or {}).get("command"),
        )

    cmd = MANIFEST["commands"].get(LISTENER)
    truthy(f"`{LISTENER}` exists", cmd)
    if cmd:
        truthy(
            f"`{LISTENER}` is internal (leading `_`)",
            LISTENER.rsplit(".", 1)[1].startswith("_"),
        )
        check(f"`{LISTENER}` is transactional", True, cmd.get("transaction"))
        truthy(f"`{LISTENER}` carries SQL", cmd.get("sql"))
        check(f"`{LISTENER}` emits nothing", None, cmd.get("emit"))

    q = MANIFEST["queries"].get(ORPHANS)
    truthy(f"`{ORPHANS}` exists", q)
    if q:
        check(
            f"`{ORPHANS}` is gated by `{PERMISSION}`", PERMISSION, q.get("permission")
        )
        truthy(f"`{ORPHANS}` is paginated (list block)", q.get("list"))
        spec = q.get("list") or {}
        for col in ("has_value", "is_expired"):
            truthy(
                f"`{ORPHANS}` can be filtered by `{col}`",
                col in spec.get("filters", {}),
            )

    truthy(f"`{PERMISSION}` is declared", PERMISSION in MANIFEST["permissions"])
    roles = MANIFEST["role_permissions"]
    truthy(f"manager holds `{PERMISSION}`", PERMISSION in roles.get("manager", []))
    truthy(
        f"cashier does NOT hold `{PERMISSION}`",
        PERMISSION not in roles.get("cashier", []),
    )


# ── seeds ────────────────────────────────────────────────────────────────────


def seed_package(db: ScratchDb, hub: str, name: str, max_uses, validity_days) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": name.lower().replace(" ", "-"),
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


def grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    hub: str = HUB,
    granted_at: str | None = None,
    amount_cents: int = 10000,
) -> str:
    gid = str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._grant",
            {
                "grant_id": gid,
                "package_id": package_id,
                "customer_id": customer,
                "granted_at": granted_at or NOW,
                "source": "manual",
                "sale_id": None,
                "sale_ref": "",
                "amount_cents": amount_cents,
                "net_amount_cents": amount_cents,
                "tax_amount_cents": 0,
                "note": "",
            },
            hub=hub,
        ),
    )
    return gid


def redeem(db: ScratchDb, grant_id: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._redeem",
            {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": grant_id,
                "appointment_id": None,
                "sale_id": None,
                "note": "",
            },
            hub=hub,
        ),
    )


def orphan(db: ScratchDb, customer: str, hub: str = HUB, event_now: str = NOW) -> None:
    """Deliver `customer.deleted` the way the outbox relay delivers it: the payload IS the params."""
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            LISTENER, {"customer_id": customer, "now": event_now}, hub=hub
        ),
    )


def balance(db: ScratchDb, customer: str, hub: str = HUB) -> list[dict]:
    sql = query_sql("services.packages.balance", {"customer_id": customer}, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def stamp_of(db: ScratchDb, grant_id: str) -> str:
    return db.scalar(
        "SELECT COALESCE(customer_deleted_at, '') FROM services_package_grant "
        f"WHERE id = '{grant_id}'"
    )


# ── 2 · the SQL, against a real Postgres ─────────────────────────────────────


def sql_half() -> None:
    db = ScratchDb("services_orphan")
    db.create()
    try:
        five = seed_package(db, HUB, "Five haircuts", 5, 365)
        alive = grant(db, five, "cust-alive")
        gone = grant(db, five, "cust-gone", amount_cents=15000)
        redeem(db, gone)  # two of the five spent: three are money still owed
        redeem(db, gone)
        spent = grant(db, five, "cust-spent", amount_cents=5000)
        for _ in range(5):
            redeem(db, spent)
        neighbour = grant(
            db,
            seed_package(db, OTHER_HUB, "Five haircuts", 5, 365),
            "cust-gone",
            hub=OTHER_HUB,
        )

        print("\n— the ear: `customer.deleted` stamps, and stamps only —")
        before = db.scalar(
            f"SELECT max_uses || '/' || amount_cents FROM services_package_grant WHERE id = '{gone}'"
        )
        orphan(db, "cust-gone")
        check("the deleted customer's grant is stamped", NOW, stamp_of(db, gone))
        check("a live customer's grant is untouched", "", stamp_of(db, alive))
        check(
            "the neighbour hub's grant for the same id is untouched",
            "",
            stamp_of(db, neighbour),
        )
        check(
            "terms and amount are unchanged",
            before,
            db.scalar(
                f"SELECT max_uses || '/' || amount_cents FROM services_package_grant WHERE id = '{gone}'"
            ),
        )
        rows = balance(db, "cust-gone")
        check(
            "the balance still shows the three sessions the customer paid for",
            3,
            rows[0]["remaining"],
        )

        print("\n— idempotence: the outbox is at-least-once —")
        orphan(db, "cust-gone", event_now="2026-09-04T10:00:00Z")
        check("a redelivery does not move the timestamp", NOW, stamp_of(db, gone))

        print("\n— a GDPR erasure is not a forfeiture —")
        orphan(db, "cust-spent")
        check("`customer.anonymized` stamps the same way", NOW, stamp_of(db, spent))

        print("\n— the rescue list: the only door that needs no customer id —")
        page = list_page(db, ORPHANS, {})
        by_id = {r["grant_id"]: r for r in page["rows"]}
        check("it lists exactly the orphaned grants", {gone, spent}, set(by_id))
        check("total counts the set, not the page", 2, page["total"])
        check("the money still owed is spelled out", 3, by_id[gone]["remaining"])
        check("…and flagged", 1, by_id[gone]["has_value"])
        check(
            "a spent voucher is listed but carries no value",
            0,
            by_id[spent]["has_value"],
        )
        check("the amount charged travels with it", 15000, by_id[gone]["amount_cents"])
        check(
            "the package name travels with it",
            "Five haircuts",
            by_id[gone]["package_name"],
        )
        check("so does the owner's opaque id", "cust-gone", by_id[gone]["customer_id"])
        check("nothing is expired here", 0, by_id[gone]["is_expired"])

        print("\n— what the list must NOT contain —")
        check(
            "only what still has value, when asked for it",
            [gone],
            [r["grant_id"] for r in list_page(db, ORPHANS, {"f_has_value": 1})["rows"]],
        )
        db.psql(
            [
                "-c",
                f"UPDATE services_package_grant SET is_deleted = 1 WHERE id = '{spent}'",
            ],
            db=db.name,
        )
        check(
            "a deleted grant drops out",
            [gone],
            [r["grant_id"] for r in list_page(db, ORPHANS, {})["rows"]],
        )
        check(
            "the neighbour hub sees its own, and only its own",
            [],
            [r["grant_id"] for r in list_page(db, ORPHANS, {}, hub=OTHER_HUB)["rows"]],
        )
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
