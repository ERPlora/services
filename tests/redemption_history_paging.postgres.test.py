#!/usr/bin/env python3
"""services#76 — the voucher's ledger is served a PAGE at a time, through the runtime's list engine.

WHY. `services.packages.redemption_history` was a plain query: every movement of the voucher in one
answer, with no `LIMIT`, and the sheet asked for them with `queryAll`. For a voucher created last
week that is invisible. For the star voucher of a salon after two years — N customers × `max_uses`
sessions, plus the releases and the refunds, which count too because the query includes the
soft-deleted rows on purpose — it is hundreds or thousands of rows in a single response, on a
tablet. It is not a correctness bug; it is a ceiling nobody sees until the business has been
running a while, which is exactly when it hurts most.

WHAT IS PROVEN HERE, and why each part would otherwise break silently:

  1. THE PAGE IS A PAGE. The first page brings exactly `page_size` rows and the `total` is the
     REAL size of the set, not the size of the page. A `total` that counted the page would make
     the pager say «1 of 1» over a ledger with fifty more movements.
  2. THE PAGES TILE THE SET. Page after page, every movement appears EXACTLY ONCE. This is the
     assertion that catches an unstable ORDER BY: the list engine sorts by ONE column, so two rows
     that tie on it can swap between two queries and the reader gets one movement twice and never
     sees another. The seed ties them ON PURPOSE — the same instant for several sessions is what a
     bulk grant or an import produces.
  3. THE FILTER ON `movement` STILL SEES THE SOFT-DELETED ROWS. That is the whole point of this
     query and the thing most likely to be lost when it moves engine: a refund IS a soft-delete
     with a reason, so filtering «show me the refunds» over a set filtered on `is_deleted = 0`
     would answer «there are none» about the movements the auditor came for.
  4. `released` AND `expired` ARE DIFFERENT MOVEMENTS. Migration 014 added `release_reason`
     precisely so the ledger could tell an operator's undo from a checkout nobody came back to,
     and said so in writing about THIS query. The `CASE` collapsed both into `released`, so the
     filter this issue asks for would have handed an auditor the timeouts along with the choices.
  5. THE NEIGHBOUR HUB IS NOT IN THE PAGE, with its rows LIVE in the same table — the wrapper adds
     its own WHERE and an engine that composed it wrong would leak them under a green base query.

Usage: tests/redemption_history_paging.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import sys
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    NOW,
    OTHER_HUB,
    MANIFEST,
    ScratchDb,
    container_available,
    list_page,
    script_for,
)

failures: list[str] = []

# One full page and a bit: enough that a query with no LIMIT and one with a LIMIT cannot answer
# the same thing. `PAGE_SIZE` is read from the manifest so the battery follows the module, not a
# number copied into a test.
PAGE_SIZE = MANIFEST["queries"]["services.packages.redemption_history"]["list"][
    "page_size"
]
SESSIONS = PAGE_SIZE + 7


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


# ── seeding, through the module's own doors ─────────────────────────────────


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


def seed_package(db: ScratchDb, hub: str, name: str) -> str:
    """A voucher with no session ceiling and no expiry: the ledger is what is under test here."""
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
            "validity_days": None,
            "max_uses": None,
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


def grant_script(package_id: str, customer: str, hub: str) -> tuple[str, str]:
    grant_id = str(uuid.uuid4())
    return grant_id, script_for(
        "services._grant",
        {
            "grant_id": grant_id,
            "package_id": package_id,
            "customer_id": customer,
            "granted_at": NOW,
            "source": "manual",
            "sale_id": None,
            "sale_ref": "",
            "amount_cents": 0,
            "net_amount_cents": 0,
            "tax_amount_cents": 0,
            "note": "",
        },
        hub=hub,
    )


def hold_script(
    grant_id: str, service_id: str, checkout: str, line: str, when: str, hub: str
) -> tuple[str, str]:
    rid = str(uuid.uuid4())
    return rid, script_for(
        "services._hold",
        {
            "redemption_id": rid,
            "grant_id": grant_id,
            "service_id": service_id,
            "checkout_ref": checkout,
            "line_ref": line,
            "note": "",
            "now": when,
        },
        hub=hub,
    )


def stamp(minute: int) -> str:
    """A movement's instant. Two sessions share one on purpose — see assertion 2."""
    return f"2026-08-18T{10 + minute // 60:02d}:{minute % 60:02d}:00Z"


# ── the battery ─────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED — the Postgres container `{CONTAINER}` is not running.")
        return 0

    db = ScratchDb("services_history_paging")
    db.create()
    try:
        print("0. seeding a voucher with a long ledger")
        service = seed_service(db, HUB, "Corte")
        package = seed_package(db, HUB, "Bono cortes")
        seed_item(db, HUB, package, service)

        script: list[str] = []
        # Two customers, so the `customer_id` filter has something to separate.
        grants: dict[str, str] = {}
        for customer in ("cus-1", "cus-2"):
            grant_id, sql = grant_script(package, customer, HUB)
            grants[customer] = grant_id
            script.append(sql)

        held: list[tuple[str, str]] = []  # (redemption_id, customer)
        for i in range(SESSIONS):
            customer = "cus-1" if i % 2 == 0 else "cus-2"
            # 🔴 The instants TIE in pairs (i // 2): the ledger of a bulk grant or of an import is
            # full of movements written in the same instant, and that is the shape that makes an
            # unstable sort lose a row between two pages.
            rid, sql = hold_script(
                grants[customer],
                service,
                f"order-{i}",
                f"line-{i}",
                stamp(i // 2),
                HUB,
            )
            held.append((rid, customer))
            script.append(sql)

        # The neighbouring hub, ALIVE: its own voucher, its own grant, its own session. A scope
        # test against an empty table proves nothing.
        other_service = seed_service(db, OTHER_HUB, "Corte")
        other_package = seed_package(db, OTHER_HUB, "Bono cortes")
        seed_item(db, OTHER_HUB, other_package, other_service)
        other_grant, sql = grant_script(other_package, "cus-1", OTHER_HUB)
        script.append(sql)
        _, sql = hold_script(
            other_grant, other_service, "order-x", "line-x", stamp(0), OTHER_HUB
        )
        script.append(sql)

        db.psql([], db=db.name, stdin="\n".join(script))
        check(
            "sessions written",
            SESSIONS,
            int(
                db.scalar(
                    f"SELECT count(*) FROM services_package_redemption WHERE hub_id = '{HUB}'"
                )
            ),
        )

        print("1. the first page is a PAGE, and the total is the whole set")
        first = list_page(
            db, "services.packages.redemption_history", {"package_id": package}
        )
        check("rows on the first page", PAGE_SIZE, len(first["rows"]))
        check("total announced", SESSIONS, first["total"])

        print("2. the pages TILE the set: every movement exactly once")
        seen: list[str] = []
        offset = 0
        while offset < first["total"]:
            page = list_page(
                db,
                "services.packages.redemption_history",
                {"package_id": package, "offset": offset},
            )
            if not page["rows"]:
                break
            seen.extend(r["redemption_id"] for r in page["rows"])
            offset += len(page["rows"])
        check("movements collected", SESSIONS, len(seen))
        check("movements collected TWICE", 0, len(seen) - len(set(seen)))
        check("every session is in some page", set(r for r, _ in held), set(seen))

        # 🔴 …and the reason it tiles, which is the part walking the pages CANNOT prove. Two rows
        # that tie on the sort column may come back in either order, and whether they actually do
        # is up to the planner: the walk above passes over a tied ledger on this data and this
        # Postgres, and would start dropping rows the day the plan changes. What holds regardless
        # is that the ORDER IS TOTAL — no two movements share the sort key — so this asserts that
        # instead. Point `default_sort` at `redeemed_at` and this check fails, which is exactly
        # what it is here to catch.
        whole = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "limit": 500},
        )
        sort_key = MANIFEST["queries"]["services.packages.redemption_history"]["list"][
            "default_sort"
        ]
        keys = [r[sort_key] for r in whole["rows"]]
        check(
            f"movements sharing the `{sort_key}` they are ordered by",
            0,
            len(keys) - len(set(keys)),
        )

        print(
            "3. the newest movement comes first, and the caller can ask for the oldest"
        )
        newest = first["rows"][0]["redeemed_at"]
        check("newest first", stamp((SESSIONS - 1) // 2), newest)
        ascending = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "dir": "asc"},
        )
        check("oldest first when asked", stamp(0), ascending["rows"][0]["redeemed_at"])

        print("4. the filter on the customer answers about that customer only")
        mine = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "f_customer_id": "cus-1", "limit": 500},
        )
        check(
            "sessions of cus-1",
            len([1 for _, c in held if c == "cus-1"]),
            mine["total"],
        )
        check(
            "no other customer in the page",
            {"cus-1"},
            {r["customer_id"] for r in mine["rows"]},
        )

        print("5. a refund is still in the ledger, and the filter finds it")
        # A refund undoes a session that was DELIVERED and PAID (`_refund_update.sql` refuses
        # anything else), so the sale is settled first — which is also what leaves a `consumed`
        # movement in the ledger for the next assertion.
        refunded_id = held[0][0]
        for rid, sale in ((refunded_id, "sale-0"), (held[2][0], "sale-1")):
            db.psql(
                [],
                db=db.name,
                stdin=script_for(
                    "services.packages.settle_hold",
                    {"redemption_id": rid, "sale_id": sale},
                    hub=HUB,
                ),
            )
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services._refund",
                {
                    "redemption_id": refunded_id,
                    "refund_ref": "return-1",
                    "refund_note": "",
                },
                hub=HUB,
            ),
        )
        refunds = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "f_movement": "refunded", "limit": 500},
        )
        check("refunds found", 1, refunds["total"])
        check(
            "and it is the soft-deleted row",
            [refunded_id, 1],
            [
                refunds["rows"][0]["redemption_id"],
                int(refunds["rows"][0]["is_deleted"]),
            ],
        )

        print("6. a released session and an expired one are DIFFERENT movements")
        released_id = held[4][0]
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services.packages.release_hold",
                {"redemption_id": released_id},
                hub=HUB,
            ),
        )
        # Nobody came back: the janitor sweeps the checkout a day later.
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services.packages.expire_holds",
                {"now": "2026-08-25T10:00:00Z"},
                hub=HUB,
            ),
        )
        everything = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "limit": 500},
        )
        by_id = {r["redemption_id"]: r for r in everything["rows"]}
        check("the cashier's undo", "released", by_id[released_id]["movement"])
        check("the refund", "refunded", by_id[refunded_id]["movement"])
        check("the delivered session", "consumed", by_id[held[2][0]]["movement"])
        expired = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": package, "f_movement": "expired", "limit": 500},
        )
        check(
            "the ones nobody came back for",
            SESSIONS
            - 3,  # every hold but the refunded, the settled and the released one
            expired["total"],
        )

        print("7. the range on `redeemed_at` cuts the ledger by date")
        window = list_page(
            db,
            "services.packages.redemption_history",
            {
                "package_id": package,
                "f_redeemed_at_from": stamp(1),
                "f_redeemed_at_to": stamp(2),
                "limit": 500,
            },
        )
        check(
            "movements in the window",
            len([1 for i in range(SESSIONS) if 1 <= i // 2 <= 2]),
            window["total"],
        )

        print("8. the neighbouring hub is not in the page")
        check(
            "neighbour rows are alive in the table",
            1,
            int(
                db.scalar(
                    f"SELECT count(*) FROM services_package_redemption WHERE hub_id = '{OTHER_HUB}'"
                )
            ),
        )
        neighbour = list_page(
            db,
            "services.packages.redemption_history",
            {"package_id": other_package, "limit": 500},
        )
        check("asking for THEIR voucher from OUR hub", 0, neighbour["total"])
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  · {f}")
        return 1
    print("PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
