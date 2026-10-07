#!/usr/bin/env python3
"""services#157 — what the till tells the operator BEFORE voiding or refunding the sale of a voucher
(`services.packages.sold_on_sale`).

Voiding a sale, or refunding it in full, voids the vouchers sold on it, used or not
(`sale_void_grants.sql`, `sale_refund_grants.sql`): the money goes back, so the voucher goes with
it — the sessions already used stay used and what was left is lost. The operator has to read that
before confirming, so the void and refund windows of `sales` cede the hole `sales.reversal.notice`
and this module fills it with one warning per voucher, read from here.

WHAT IS PROVEN HERE

  1. One row per voucher SOLD on that sale and still live, with the name of its catalogue voucher,
     the sessions used and the sessions that will be lost:
       * used counts what the balance counts — a spent session, a session held live at a till —
         and not a hold that lapsed or was undone;
       * a session settled on THIS very sale is not a use: voiding the sale gives it back before
         the voucher is judged (`sale_void_return_sessions.sql`);
       * remaining includes what was given or corrected later (`Ajustar`), and is NULL for an
         unlimited voucher (it has no count to lose).
  2. Nothing else is listed: not a manual grant that names the sale, not one sold on another sale,
     not one already voided (there is nothing left to warn about), not the neighbour hub's voucher
     on the same sale id.
  3. A sale that sold no voucher answers an empty list, never an error.

Usage: tests/sold_on_sale.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import re
import sys
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
    query_sql,
    script_for,
)

failures: list[str] = []
SALE = "sale-sold"


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


# ── seeding (the same doors the other batteries use) ─────────────────────────


def run(db: ScratchDb, command: str, params: dict, hub: str = HUB) -> str:
    return db.psql(["-e"], db=db.name, stdin=script_for(command, params, hub=hub))


def seed_service(db: ScratchDb, hub: str) -> str:
    db.run_command(
        "services.services.create",
        {
            "name": "Haircut",
            "price": 2500,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
        hub=hub,
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{hub}' AND name = 'Haircut'"
    )


def seed_package(
    db: ScratchDb, hub: str, service_id: str, name: str, max_uses: int | None
) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": re.sub(r"[^a-z0-9]+", "-", name.lower()),
            "description": "",
            "discount_type": "percentage",
            "discount_percent_bp": 0,
            "discount_amount_cents": 0,
            "fixed_price": None,
            "validity_days": None,
            "max_uses": max_uses,
            "sort_order": 0,
            "is_active": 1,
            "is_featured": 0,
        },
        hub=hub,
    )
    db.run_command(
        "services._insert_package_item",
        {
            "item_id": str(uuid.uuid4()),
            "package_id": package_id,
            "service_id": service_id,
            "quantity": 1_000_000,
            "sort_order": 0,
        },
        hub=hub,
    )
    return package_id


def grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    *,
    sale_id: str | None = SALE,
    source: str = "sale",
    hub: str = HUB,
) -> str:
    gid = str(uuid.uuid4())
    run(
        db,
        "services._grant",
        {
            "grant_id": gid,
            "package_id": package_id,
            "customer_id": customer,
            "granted_at": NOW,
            "source": source,
            "sale_id": sale_id,
            "sale_ref": f"{sale_id}:{gid}" if source == "sale" else "",
            "amount_cents": 10000,
            "net_amount_cents": 8264,
            "tax_amount_cents": 1736,
            "note": "",
        },
        hub=hub,
    )
    return gid


def hold(db: ScratchDb, grant_id: str, service_id: str, hub: str = HUB) -> str:
    rid = str(uuid.uuid4())
    run(
        db,
        "services._hold",
        {
            "redemption_id": rid,
            "grant_id": grant_id,
            "service_id": service_id,
            "checkout_ref": f"order-{uuid.uuid4().hex[:6]}",
            "line_ref": f"line-{uuid.uuid4().hex[:6]}",
            "note": "",
        },
        hub=hub,
    )
    return rid


def spent_on(db: ScratchDb, grant_id: str, service_id: str, sale_id: str) -> str:
    rid = hold(db, grant_id, service_id)
    run(
        db,
        "services.packages.settle_hold",
        {"redemption_id": rid, "sale_id": sale_id},
    )
    return rid


def chair_session(db: ScratchDb, grant_id: str, sale_id: str | None) -> None:
    run(
        db,
        "services._redeem",
        {
            "redemption_id": str(uuid.uuid4()),
            "grant_id": grant_id,
            "appointment_id": None,
            "sale_id": sale_id,
            "note": "",
        },
    )


def adjust(db: ScratchDb, grant_id: str, uses: int) -> None:
    run(
        db,
        "services._adjust_grant",
        {
            "adjustment_id": str(uuid.uuid4()),
            "grant_id": grant_id,
            "uses_delta": uses,
            "days_delta": 0,
            "reason": "On the house",
            "now": NOW,
        },
    )


def sold_on(db: ScratchDb, sale_id: str, hub: str = HUB) -> list[dict]:
    sql = query_sql("services.packages.sold_on_sale", {"sale_id": sale_id}, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"],
        db=db.name,
    )
    return json.loads(out.strip() or "[]")


# ── the battery ──────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_sold_on_sale")
    db.create()
    try:
        svc = seed_service(db, HUB)
        five = seed_package(db, HUB, svc, "Five haircuts", 5)
        open_ended = seed_package(db, HUB, svc, "Unlimited haircuts", None)
        other_svc = seed_service(db, OTHER_HUB)
        theirs = seed_package(db, OTHER_HUB, other_svc, "Their haircuts", 5)

        intact = grant(db, five, "cus-1")
        used = grant(db, five, "cus-2")
        chair_session(db, used, "sale-later")
        held = grant(db, five, "cus-3")
        hold(db, held, svc)
        lapsed = grant(db, five, "cus-4")
        lapsed_hold = hold(db, lapsed, svc)
        undone = grant(db, five, "cus-5")
        run(
            db,
            "services.packages.release_hold",
            {"redemption_id": hold(db, undone, svc)},
        )
        topped = grant(db, five, "cus-6")
        adjust(db, topped, 2)
        chair_session(db, topped, None)
        same = grant(db, five, "cus-7")
        spent_on(db, same, svc, SALE)
        unlimited = grant(db, open_ended, "cus-8")
        chair_session(db, unlimited, None)
        manual = grant(db, five, "cus-9", source="manual")
        elsewhere = grant(db, five, "cus-10", sale_id="sale-other")
        voided = grant(db, five, "cus-11")
        run(
            db, "services._void_grant", {"grant_id": voided, "reason": "Wrong customer"}
        )
        grant(db, theirs, "cus-1", hub=OTHER_HUB)
        # The hold lapses after every other hold above (each one sweeps the lapsed ones first).
        db.psql(
            [],
            db=db.name,
            stdin="UPDATE services_package_redemption SET expires_at = '2026-08-17T10:00:00Z' "
            f"WHERE id = '{lapsed_hold}';\n",
        )

        print("\n1 · one row per voucher sold on the sale and still live")
        rows = {r["grant_id"]: r for r in sold_on(db, SALE)}
        view = lambda gid: (  # noqa: E731
            [rows[gid]["package_name"], rows[gid]["used"], rows[gid]["remaining"]]
            if gid in rows
            else None
        )
        check(
            "an untouched voucher: nothing used, five to lose",
            ["Five haircuts", 0, 5],
            view(intact),
        )
        check(
            "a voucher spent at the chair: one used, four to lose",
            ["Five haircuts", 1, 4],
            view(used),
        )
        check(
            "a session held live at a till counts as used",
            ["Five haircuts", 1, 4],
            view(held),
        )
        check("a hold that lapsed does not", ["Five haircuts", 0, 5], view(lapsed))
        check(
            "a hold undone at the till does not", ["Five haircuts", 0, 5], view(undone)
        )
        check(
            "two sessions given later count in what is lost",
            ["Five haircuts", 1, 6],
            view(topped),
        )
        check(
            "a session settled on THIS sale is not a use (the void gives it back first)",
            ["Five haircuts", 0, 5],
            view(same),
        )
        check(
            "an unlimited voucher has no count to lose (NULL)",
            ["Unlimited haircuts", 1, None],
            view(unlimited),
        )

        print("\n2 · nothing else is listed")
        check("a manual grant naming the sale is not listed", None, view(manual))
        check("a voucher sold on another sale is not listed", None, view(elsewhere))
        check("a voucher already voided is not listed", None, view(voided))
        check(
            "exactly the eight live vouchers of this hub's sale, not the neighbour's",
            8,
            len(rows),
        )
        check(
            "the neighbour hub reads only its own voucher on the same sale id",
            ["Their haircuts"],
            [r["package_name"] for r in sold_on(db, SALE, hub=OTHER_HUB)],
        )

        print("\n3 · a sale that sold no voucher")
        check("answers an empty list", [], sold_on(db, "sale-without-vouchers"))
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ sold_on_sale: the till reads what a void or a full refund would void, nothing else"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
