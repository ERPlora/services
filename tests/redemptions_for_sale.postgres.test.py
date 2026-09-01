#!/usr/bin/env python3
"""services#88 — the sessions a SALE spent, read back from the sale (`redemptions_for_sale`).

WHY THIS READ HAS TO EXIST. `sales`' return screen cedes the hole `sales.refund.tender` and hands
the filler four strings: `saleId`, `lineRef` (a `sales_sale_item.id`), `serviceId` and `lineIndex`.
Not one of them is a `redemption_id`, and `services.packages.refund_check` — the only door that
says whether a session goes back — takes exactly that. The three reads already published cannot
bridge it:

  * `services.packages.holds_for_checkout` answers only what can still be UNDONE (live, `held`,
    unsettled). At return time the session is `consumed` + settled, so it is never in there;
  * `services.packages.redemption_history` is keyed by `package_id`, which is the thing nobody at
    the return screen knows;
  * `checkout_ref` is the ORDER id, not the `sale_id` — and on a counter sale there is no order.

What IS stable is that settling writes `sale_id` on the row (`commands/hold_settle.sql` and
`commands/settle_holds_for_sale.sql`). So this query asks the one question the screen can ask:
«which sessions did THIS sale spend, and does each one go back?».

WHAT IS PROVEN HERE

  1. One row per SETTLED redemption of the sale, and ALWAYS one — a session that cannot go back is
     a row carrying its reason, never a missing row. This is the criterion `refund_check` already
     writes down: with the row gone, «no rows» and «not refundable» are the same answer to a screen
     that has to explain itself, and the hole would go silent over a session the salon owes.
  2. The answer is `refund_check`'s answer, field for field, for the same redemption. Two doors
     that disagree about whether a session is refundable is how a screen offers a button the
     runtime then refuses.
  3. 🔴 A STABLE ORDER, because that is the whole of the twins contract. A mother and her daughter
     get the same haircut on one ticket: two covered lines, two sessions, and the host tells each
     hole its 0-based `lineIndex` among the covered lines of the SAME service. If this query
     answered in an arbitrary order the nth hole would refund an arbitrary session — or both holes
     would claim the same one and the second session would never come back.
  4. What is NOT the sale's is not in it: another sale's sessions, the neighbouring hub's, an open
     hold nobody paid for, a hold that was released.
  5. Expiry WARNS and never refuses (ADR-0386), exactly as `refund_check` does: a ticket from three
     weeks ago is being undone today, and refusing would cost the customer the session AND the
     money path with it.

Usage: tests/redemptions_for_sale.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
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

# 48 days before NOW: a grant made here with validity_days = 30 is long expired.
LONG_AGO = "2026-07-01T10:00:00Z"


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


# ── seeding (the same doors the other batteries use) ─────────────────────────


def seed_service(db: ScratchDb, hub: str, name: str) -> str:
    db.run_command(
        "services.services.create",
        {
            "name": name,
            "price": 2500,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
        hub=hub,
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{hub}' AND name = '{name}'"
    )


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


def seed_item(db: ScratchDb, hub: str, package_id: str, service_id: str) -> None:
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


def seed_grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    hub: str = HUB,
    granted_at: str = NOW,
) -> str:
    grant_id = str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._grant",
            {
                "grant_id": grant_id,
                "package_id": package_id,
                "customer_id": customer,
                "granted_at": granted_at,
                "source": "manual",
                "sale_id": None,
                "sale_ref": "",
                "amount_cents": 0,
                "net_amount_cents": 0,
                "tax_amount_cents": 0,
                "note": "",
            },
            hub=hub,
        ),
    )
    return grant_id


def hold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout_ref: str,
    line_ref: str,
    hub: str = HUB,
) -> str:
    rid = str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._hold",
            {
                "redemption_id": rid,
                "grant_id": grant_id,
                "service_id": service_id,
                "checkout_ref": checkout_ref,
                "line_ref": line_ref,
                "note": "",
            },
            hub=hub,
        ),
    )
    return rid


def settle(db: ScratchDb, redemption_id: str, sale_id: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services.packages.settle_hold",
            {"redemption_id": redemption_id, "sale_id": sale_id},
            hub=hub,
        ),
    )


def sold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout: str,
    line: str,
    sale: str,
    hub: str = HUB,
) -> str:
    rid = hold(db, grant_id, service_id, checkout, line, hub=hub)
    settle(db, rid, sale, hub=hub)
    return rid


def release(db: ScratchDb, redemption_id: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services.packages.release_hold",
            {"redemption_id": redemption_id},
            hub=hub,
        ),
    )


def refund(db: ScratchDb, redemption_id: str, refund_ref: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._refund",
            {
                "redemption_id": redemption_id,
                "refund_ref": refund_ref,
                "refund_note": "",
            },
            hub=hub,
        ),
    )


# ── the doors under test ─────────────────────────────────────────────────────


def rows_of(db: ScratchDb, name: str, params: dict, hub: str = HUB) -> list[dict]:
    sql = query_sql(name, params, hub=hub)
    out = db.psql(
        [
            "-tAc",
            f"SELECT COALESCE(json_agg(t ORDER BY ord), '[]'::json) FROM ("
            f"SELECT row_number() OVER () AS ord, * FROM ({sql}) q) t",
        ],
        db=db.name,
    )
    return json.loads(out.strip() or "[]")


def for_sale(db: ScratchDb, sale_id: str, hub: str = HUB) -> list[dict]:
    return rows_of(
        db, "services.packages.redemptions_for_sale", {"sale_id": sale_id}, hub=hub
    )


def refund_check(db: ScratchDb, redemption_id: str, hub: str = HUB) -> dict:
    rows = rows_of(
        db, "services.packages.refund_check", {"redemption_id": redemption_id}, hub=hub
    )
    return rows[0] if rows else {}


# ── the battery ──────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED — container {CONTAINER} is not running")
        return 0

    db = ScratchDb("services_redemptions_for_sale")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")
        colour = seed_service(db, HUB, "Colour")
        pack = seed_package(db, HUB, "Bono 5", max_uses=5, validity_days=30)
        seed_item(db, HUB, pack, cut)
        seed_item(db, HUB, pack, colour)
        grant = seed_grant(db, pack, "cus-1")

        print("\nA. the sessions THIS sale spent, one row each")
        # The twins: two covered lines of the same service on one ticket, plus a third line of
        # another service. Held in this order, which is the order the answer has to keep.
        first_cut = sold(db, grant, cut, "order-1", "line-1", "sale-1")
        second_cut = sold(db, grant, cut, "order-1", "line-2", "sale-1")
        one_colour = sold(db, grant, colour, "order-1", "line-3", "sale-1")
        rows = for_sale(db, "sale-1")
        check("three sessions were spent on this sale", 3, len(rows))
        check(
            "and they come back in the order they were taken",
            [first_cut, second_cut, one_colour],
            [r["redemption_id"] for r in rows],
        )
        check(
            "each row names the service it paid for",
            [cut, cut, colour],
            [r["service_id"] for r in rows],
        )
        check(
            "and the cart line it covered",
            ["line-1", "line-2", "line-3"],
            [r["line_ref"] for r in rows],
        )
        check(
            "the voucher is named, not just its id",
            ["Bono 5"] * 3,
            [r["package_name"] for r in rows],
        )
        check(
            "and the purchase the session came out of",
            [grant] * 3,
            [r["grant_id"] for r in rows],
        )
        check("with its catalogue row", [pack] * 3, [r["package_id"] for r in rows])

        print(
            "\nB. 🔴 the twins keep their ORDER — the nth hole must find the nth session"
        )
        # The whole point of `lineIndex`. Read twice: an unstable ORDER BY shows up here.
        again = for_sale(db, "sale-1")
        check(
            "the same order on a second read",
            [r["redemption_id"] for r in rows],
            [r["redemption_id"] for r in again],
        )
        twins = [r["redemption_id"] for r in rows if r["service_id"] == cut]
        check(
            "the two haircuts are two sessions, in hold order",
            [first_cut, second_cut],
            twins,
        )

        print("\nC. every session is refundable, and the counter previews the return")
        check("all three go back", [1, 1, 1], [r["refundable"] for r in rows])
        check("with no reason to show", ["", "", ""], [r["reason"] for r in rows])
        check(
            "none has been returned yet",
            [0, 0, 0],
            [r["already_refunded"] for r in rows],
        )
        # 5 sessions, 3 spent: 2 left, and returning any ONE of them leaves 3.
        check(
            "two sessions are left on the voucher",
            [2, 2, 2],
            [r["remaining_before"] for r in rows],
        )
        check(
            "and returning this one would leave three",
            [3, 3, 3],
            [r["remaining_after"] for r in rows],
        )
        check(
            "a live voucher is not flagged as expired",
            [0, 0, 0],
            [r["voucher_expired"] for r in rows],
        )

        print("\nD. 🔴 it is the SAME answer `refund_check` gives, field for field")
        # Two doors that disagree is how a screen offers a button the runtime then refuses.
        shared = [
            "grant_id",
            "package_id",
            "service_id",
            "line_ref",
            "refundable",
            "reason",
            "already_refunded",
            "remaining_before",
            "remaining_after",
            "expires_at",
            "voucher_expired",
        ]
        for rid in (first_cut, second_cut, one_colour):
            mine = next(r for r in rows if r["redemption_id"] == rid)
            theirs = refund_check(db, rid)
            check(
                f"…for {rid[:8]}",
                {k: theirs.get(k) for k in shared},
                {k: mine.get(k) for k in shared},
            )

        print("\nE. 🔴 a session already returned is STILL a row, carrying its reason")
        # If it vanished, «no rows» and «not refundable» would be the same answer, and the hole
        # would have no way to say «this one already came back».
        refund(db, second_cut, "return-1")
        after = for_sale(db, "sale-1")
        check("the sale still answers three rows", 3, len(after))
        check(
            "and the order did not move under the returned one",
            [first_cut, second_cut, one_colour],
            [r["redemption_id"] for r in after],
        )
        done = next(r for r in after if r["redemption_id"] == second_cut)
        check("it cannot go back twice", 0, done["refundable"])
        check("and it says why, as a code", "already_refunded", done["reason"])
        check("the flag is up too", 1, done["already_refunded"])
        check("the document it went back on is named", "return-1", done["refund_ref"])
        # The soft-delete of the refund freed a session: 3 left, and returning another leaves 4.
        live = next(r for r in after if r["redemption_id"] == first_cut)
        check("the returned session is back on the books", 3, live["remaining_before"])
        check("and returning another would leave four", 4, live["remaining_after"])

        print("\nF. what the sale did NOT spend is not in the answer")
        other_sale = sold(db, grant, cut, "order-2", "line-9", "sale-2")
        open_hold = hold(db, grant, cut, "order-3", "line-7")
        abandoned = hold(db, grant, colour, "order-4", "line-8")
        release(db, abandoned)
        ours = [r["redemption_id"] for r in for_sale(db, "sale-1")]
        check("another sale's session is not ours", False, other_sale in ours)
        check("an open hold nobody paid for is not in it", False, open_hold in ours)
        check("and neither is a hold that was released", False, abandoned in ours)
        # …and the control finds the positive: that other session IS readable, by its own sale.
        check(
            "…the check would have caught them: sale-2 answers its own session",
            [other_sale],
            [r["redemption_id"] for r in for_sale(db, "sale-2")],
        )

        print(
            "\nG. 🔴 the neighbouring hub's session is INVISIBLE, not merely unauthorised"
        )
        n_cut = seed_service(db, OTHER_HUB, "Cut")
        n_pack = seed_package(db, OTHER_HUB, "Bono 5", max_uses=5, validity_days=30)
        seed_item(db, OTHER_HUB, n_pack, n_cut)
        n_grant = seed_grant(db, n_pack, "cus-1", hub=OTHER_HUB)
        # The SAME sale id next door — the collision that a missing `hub_id` would leak through.
        n_rid = sold(db, n_grant, n_cut, "order-1", "line-1", "sale-1", hub=OTHER_HUB)
        check(
            "our answer does not carry the neighbour's session",
            False,
            n_rid in [r["redemption_id"] for r in for_sale(db, "sale-1")],
        )
        check(
            "…and the control detects the positive: next door reads its own",
            [n_rid],
            [r["redemption_id"] for r in for_sale(db, "sale-1", hub=OTHER_HUB)],
        )

        print("\nH. expiry WARNS and never refuses (ADR-0386)")
        old_grant = seed_grant(db, pack, "cus-2", granted_at=LONG_AGO)
        # The hold is taken as of LONG_AGO — a live sale back then — and settled the same day.
        old_rid = str(uuid.uuid4())
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services._hold",
                {
                    "redemption_id": old_rid,
                    "grant_id": old_grant,
                    "service_id": cut,
                    "checkout_ref": "order-old",
                    "line_ref": "line-old",
                    "note": "",
                    "now": LONG_AGO,
                },
            ),
        )
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services.packages.settle_hold",
                {"redemption_id": old_rid, "sale_id": "sale-old", "now": LONG_AGO},
            ),
        )
        old = for_sale(db, "sale-old")
        check("the old ticket answers its session", 1, len(old))
        check(
            "🔴 and it CAN go back — expiry is not a refusal", 1, old[0]["refundable"]
        )
        check("with no business reason against it", "", old[0]["reason"])
        check(
            "but the operator is warned the voucher expired",
            1,
            old[0]["voucher_expired"],
        )
        check("and told when", "2026-07-31T10:00:00+00:00", old[0]["expires_at"])

        print("\nI. a sale that spent no session answers an empty list, never an error")
        check("nothing to give back here", [], for_sale(db, "sale-that-never-existed"))

    finally:
        db.drop()

    print()
    if failures:
        print(f"FAIL — {len(failures)} check(s) failed")
        for f in failures:
            print(f"  · {f}")
        return 1
    print(
        "PASS — a sale can name the sessions it spent, in a stable order, with their reasons"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
