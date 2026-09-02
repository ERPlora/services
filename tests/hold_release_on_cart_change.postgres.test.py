#!/usr/bin/env python3
"""services#84 — taking a covered line out of the cart gives the session back ON THE SPOT.

THE BUG THIS REPRODUCES. The cashier applies a voucher to the haircut line and then removes that
line from the cart. `sales` stops discounting it from the amount (it fails on the safe side: the
money is charged correctly), but the redemption is left ORPHANED in `services`: the session stays
spent. Since services#77 that is no longer «forever» — the deadline sweep gives it back within a
day — but the market gives it back immediately: in Zenoti, `Remove` on the line reopens the package
there and then, and Vagaro's «Not This Time» does the same.

WHY IT ARRIVES BY EVENT, and not by a command the screen calls. `erp-services-voucher-tender` is
mounted PER LINE, so it is torn down WITH the line and cannot let go of anything — and it cannot
tell that tear-down apart from the one that happens when the payment sheet closes, where the hold
must survive. What does know is the server: `sales.order.remove_line` and `sales.order.void` are
where the fact happens. So `sales` emits it and `services` listens, which is the same channel
`sale.completed` → `services._on_sale_completed` already uses to settle: no hard dependency in
either direction, and it works when no filler is mounted at all — a cart cleared from another
device, a tablet that died, a ticket voided with the sheet closed. The relay ticks every second
(`crates/server/src/boot.rs`), so «on the spot» is a second, not a day.

WHAT EACH SECTION PROVES:

  A. the premise, reproduced FIRST: with the line gone, today nothing frees the session before the
     deadline — and the deadline is a day away;
  B. 🔴 the line's own session comes back, and ONLY that one: the other covered line of the same
     checkout is untouched;
  C. it is ONE conditional UPDATE, so it is idempotent and there is no check-then-act: delivering
     the same event twice (the outbox is at-least-once) cannot move the counter twice;
  D. a SETTLED session is not touched. The sale was paid and giving it back is a refund, which has
     its own audited door — the same guard `release_hold` writes into its WHERE;
  E. the neighbouring hub keeps its session, with its rows LIVE and holding the SAME checkout and
     line references. A tenancy test against an empty table proves nothing;
  F. voiding the ticket frees the WHOLE checkout — the `keep_lines = []` case of the issue — and
     nothing outside it;
  G. the ledger seals it as a DECISION (`released`), never as a timeout (`expired`): removing a
     line is the cashier choosing, and migration 014 added `release_reason` to tell them apart;
  H. the wiring itself: both events are declared in `events.listen`, they point at commands that
     exist, and each command's SQL binds nothing the event payload cannot carry — a listener that
     asks for a parameter the event does not have binds NULL and silently matches nothing.

Usage: tests/hold_release_on_cart_change.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import re
import sys
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    MANIFEST,
    MODULE_DIR,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
    query_sql,
    script_for,
)

failures: list[str] = []

ORDER = "order-7"
OTHER_ORDER = "order-9"

# The two events `sales` raises where the fact happens, and the listener each one runs here.
LISTENERS = {
    "sales.order.line_removed": "services._on_order_line_removed",
    "sales.order.voided": "services._on_order_voided",
}
# What travels in each event's payload: the bound params of the `sales` command that emitted it
# (`crates/runtime/src/commands.rs` writes `bound` into the outbox row), plus the system params the
# runtime injects into every command.
PAYLOAD = {
    "sales.order.line_removed": {"order_id", "line_id"},
    "sales.order.voided": {"order_id"},
}
SYSTEM_PARAMS = {
    "hub_id",
    "current_user_id",
    "now",
    "new_id",
    "business_tax_id",
    "business_legal_name",
    "business_address",
    "has_certificate",
    "is_demo_hub",
    "timezone",
    "caller_lang",
    "approved_by",
}


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


def seed_package(db: ScratchDb, hub: str, name: str, max_uses: int = 5) -> str:
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
            "service_id": seed_service.cache[hub],
            "quantity": 1_000_000,
            "sort_order": 0,
        },
        hub=hub,
    )
    return package_id


def seed_grant(db: ScratchDb, package_id: str, customer: str, hub: str = HUB) -> str:
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
        ),
    )
    return grant_id


def hold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout: str,
    line: str,
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
                "checkout_ref": checkout,
                "line_ref": line,
                "note": "",
            },
            hub=hub,
        ),
    )
    return rid


def deliver(db: ScratchDb, event: str, payload: dict, hub: str = HUB) -> None:
    """The relay delivering one event: it runs the declared listener with the event's payload.

    `commands::execute_at(..., Origin::Internal)` — which is why an `_`-prefixed listener runs at
    all — with the outbox row's payload as its params.
    """
    db.psql([], db=db.name, stdin=script_for(LISTENERS[event], payload, hub=hub))


def state_of(db: ScratchDb, rid: str) -> tuple[int, str]:
    row = db.scalar(
        "SELECT is_deleted || '/' || release_reason FROM services_package_redemption "
        f"WHERE id = '{rid}'"
    )
    deleted, _, reason = row.partition("/")
    return int(deleted), reason


def live(db: ScratchDb, grant_id: str, hub: str = HUB) -> int:
    """Sessions the grant has SPENT — the count every guard in this module reads."""
    return int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE hub_id = '{hub}' AND grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )


def binds_of(sql_path: str) -> set[str]:
    text = (MODULE_DIR / sql_path).read_text()
    return set(re.findall(r"(?<!:):([a-z_][a-z0-9_]*)", text))


# ── the battery ─────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED — the Postgres container `{CONTAINER}` is not running.")
        return 0

    print("H. the wiring: the events are listened to, and the listeners can be fed")
    listen = MANIFEST.get("events", {}).get("listen", {})
    for event, command in LISTENERS.items():
        check(
            f"`{event}` is listened to", command, listen.get(event, {}).get("command")
        )
        cmd = MANIFEST["commands"].get(command)
        check(f"`{command}` exists", True, cmd is not None)
        if not cmd:
            continue
        # A listener that fires on every cart change and touches nothing MOST of the time must not
        # declare `expect_rows`: the dispatcher would raise, the relay would retry, and a perfectly
        # ordinary «that line had no voucher on it» would end up in the dead-letter queue.
        check(
            f"`{command}` does not treat a no-op as a failure",
            False,
            "expect_rows" in cmd,
        )
        needed: set[str] = set()
        for rel in cmd["sql"]:
            needed |= binds_of(rel)
        unfeedable = needed - PAYLOAD[event] - SYSTEM_PARAMS
        check(f"`{command}` binds nothing `{event}` cannot carry", set(), unfeedable)

    db = ScratchDb("services_hold_release_cart")
    db.create()
    try:
        print()
        print("0. two lines of one checkout, both covered by the same voucher")
        seed_service.cache = {}
        seed_service.cache[HUB] = seed_service(db, HUB, "Corte")
        seed_service.cache[OTHER_HUB] = seed_service(db, OTHER_HUB, "Corte")
        package = seed_package(db, HUB, "Bono cortes")
        grant = seed_grant(db, package, "cus-1")
        removed = hold(db, grant, seed_service.cache[HUB], ORDER, "line-1")
        kept = hold(db, grant, seed_service.cache[HUB], ORDER, "line-2")
        elsewhere = hold(db, grant, seed_service.cache[HUB], OTHER_ORDER, "line-1")
        check("sessions spent by the three holds", 3, live(db, grant))

        # The neighbouring hub, ALIVE, on the SAME checkout and line references.
        other_package = seed_package(db, OTHER_HUB, "Bono cortes")
        other_grant = seed_grant(db, other_package, "cus-1", hub=OTHER_HUB)
        neighbour = hold(
            db,
            other_grant,
            seed_service.cache[OTHER_HUB],
            ORDER,
            "line-1",
            hub=OTHER_HUB,
        )

        print(
            "A. the premise: the deadline is a day away, so nothing else frees it in time"
        )
        check(
            "the removed line's session is still spent", (0, ""), state_of(db, removed)
        )
        check(
            "and it would not come back until tomorrow",
            "2026-08-19",
            db.scalar(
                f"SELECT expires_at FROM services_package_redemption WHERE id = '{removed}'"
            )[:10],
        )

        print("B. the line leaves the cart and ITS session comes back — only its own")
        deliver(
            db, "sales.order.line_removed", {"order_id": ORDER, "line_id": "line-1"}
        )
        check(
            "the removed line's session is back", (1, "released"), state_of(db, removed)
        )
        check(
            "the line still on the ticket keeps its session",
            (0, ""),
            state_of(db, kept),
        )
        check("and so does the other checkout", (0, ""), state_of(db, elsewhere))
        check("sessions still spent", 2, live(db, grant))

        print("C. the same event delivered twice cannot give the session back twice")
        deliver(
            db, "sales.order.line_removed", {"order_id": ORDER, "line_id": "line-1"}
        )
        check("sessions still spent after the redelivery", 2, live(db, grant))
        check(
            "and the stamp was not rewritten",
            NOW,
            db.scalar(
                f"SELECT deleted_at FROM services_package_redemption WHERE id = '{removed}'"
            ),
        )

        print("D. a session that was PAID is not touched: giving it back is a refund")
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services.packages.settle_hold",
                {"redemption_id": kept, "sale_id": "sale-1"},
                hub=HUB,
            ),
        )
        deliver(
            db, "sales.order.line_removed", {"order_id": ORDER, "line_id": "line-2"}
        )
        check("the paid session stays spent", (0, ""), state_of(db, kept))

        print("E. the neighbouring hub keeps its session")
        check("their identical hold is untouched", (0, ""), state_of(db, neighbour))
        check("their session is still spent", 1, live(db, other_grant, hub=OTHER_HUB))

        print("F. voiding the ticket frees the WHOLE checkout, and nothing outside it")
        again = hold(db, grant, seed_service.cache[HUB], ORDER, "line-3")
        # Live now: the settled one, the other checkout's, and this new one.
        check("a new session on the same ticket", 3, live(db, grant))
        deliver(db, "sales.order.voided", {"order_id": OTHER_ORDER})
        check(
            "the other checkout's session came back",
            (1, "released"),
            state_of(db, elsewhere),
        )
        check("this ticket's did not", (0, ""), state_of(db, again))
        deliver(db, "sales.order.voided", {"order_id": ORDER})
        check("and now it did", (1, "released"), state_of(db, again))
        check("the paid one survived the void too", (0, ""), state_of(db, kept))
        check("their hub is still untouched", (0, ""), state_of(db, neighbour))

        print("G. the ledger says the cashier DECIDED, not that the day ended")
        sql = query_sql(
            "services.packages.redemption_history", {"package_id": package}, hub=HUB
        )
        movements = dict(
            line.split("|")
            for line in db.psql(
                ["-tAc", f"SELECT redemption_id || '|' || movement FROM ({sql}) h"],
                db=db.name,
            ).splitlines()
            if line
        )
        check("the line taken out of the cart", "released", movements.get(removed))
        check("the voided ticket's session", "released", movements.get(again))
        check("the one that was paid", "consumed", movements.get(kept))
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
