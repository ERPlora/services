#!/usr/bin/env python3
"""services#118 — a sold voucher can be given one more session or a later expiry, with a trail.

Until this, a grant (the purchase row of ADR-0390) kept the sessions and the expiry it was sold
with forever: «I'll give you one more session» or «I'll extend it a month because we were closed»
had no door. What is proven here, against a REAL Postgres:

  1. A GIFTED SESSION is spendable at every door that spends or offers one — the balance, the
     redemption pre-check, the till's tender options, the gated redeem and the gated hold — while
     the grant's own snapshot (`max_uses`, ADR-0390) is NOT rewritten: the gift is a MOVEMENT row
     with who, when and why.
  2. AN EXTENDED EXPIRY revives a voucher that had run out, at the same doors, and the new date is
     the one every reader prints.
  3. What cannot be adjusted is refused by the pre-check (`services.packages.adjust_check`) AND by
     the write itself (zero rows, which the runtime's `expect_rows` turns into
     `services.grant_not_adjustable`): a voided or missing grant, a blank reason, nothing to add,
     a negative amount, sessions on an unlimited voucher, days on a voucher that never expires.
  4. TENANCY: the neighbour hub cannot adjust — nor see — this hub's grant, and an adjustment row
     of the neighbour that names this grant's id moves NOTHING here.
  5. The voucher's sold list shows the totals added and whether it can still be adjusted; the
     voucher's movements show every adjustment with who, when and why.
  6. The other readers of a grant's terms (the till's holds, a sale's redemptions, the orphan
     rescue list, the refund pre-check) count the gifted sessions too.
  7. A BALANCE CORRECTION (services#119) takes sessions away as a NEGATIVE movement: never more
     than the customer has left (sessions spent and live holds are the floor; an expired hold is
     not), counted over this hub's rows only, and the snapshot is still not rewritten.

Usage: tests/grant_adjust.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import sys
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    NOW,
    OTHER_HUB,
    USER,
    ScratchDb,
    container_available,
    list_page,
    query_sql,
    script_for,
)

# 40 days after NOW: past the 30-day validity every voucher of this battery is sold with.
LATER = "2026-09-27T10:00:00Z"

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(label: str, fn) -> None:
    """The database must REFUSE — an exception is the pass; a silent success is the fail."""
    try:
        fn()
    except RuntimeError as exc:
        print(f"  ok: refused {label} ({str(exc).splitlines()[0][:90]})")
        return
    failures.append(f"{label}: it was ACCEPTED")
    print(f"  FAIL: ACCEPTED {label}")


def accepted(label: str, fn) -> None:
    """The database must ACCEPT — a refusal here is the fail, named, not a crash."""
    try:
        fn()
    except RuntimeError as exc:
        failures.append(f"{label}: it was REFUSED")
        print(f"  FAIL: REFUSED {label} ({str(exc).splitlines()[0][:90]})")
        return
    print(f"  ok: accepted {label}")


def stray(
    db: ScratchDb,
    grant_id: str,
    hub: str,
    reason: str,
    uses: int = 5,
    days: int = 365,
    is_deleted: int = 0,
) -> None:
    """A movement row written by hand, past the command: ids are opaque, so a row of ANOTHER hub
    can name this hub's grant, and a soft-deleted one exists once services#119 undoes one."""
    db.psql(
        [],
        db=db.name,
        stdin=(
            "INSERT INTO services_package_grant_adjustment "
            "(id, hub_id, grant_id, uses_delta, days_delta, reason, adjusted_at, is_deleted, "
            "created_by, updated_by, created_at, updated_at) VALUES "
            f"('{uuid.uuid4()}', '{hub}', '{grant_id}', {uses}, {days}, '{reason}', "
            f"'{NOW}', {is_deleted}, 'x', 'x', '{NOW}', '{NOW}');\n"
        ),
    )


def set_grant(db: ScratchDb, grant_id: str, assignment: str) -> None:
    """Force a grant into a state no command produces (a half-dead row, a foreign package)."""
    db.psql(
        [
            "-c",
            f"UPDATE services_package_grant SET {assignment} WHERE id = '{grant_id}'",
        ],
        db=db.name,
    )


# ── seeding ──────────────────────────────────────────────────────────────────


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


def seed_package(
    db: ScratchDb,
    hub: str,
    name: str,
    service_id: str,
    max_uses: int | None = 2,
    validity_days: int | None = 30,
) -> str:
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


# ── the doors under test ─────────────────────────────────────────────────────


def run(db: ScratchDb, command: str, params: dict, hub: str = HUB) -> str:
    return db.psql([], db=db.name, stdin=script_for(command, params, hub=hub))


def grant(db: ScratchDb, package_id: str, customer: str, hub: str = HUB) -> str:
    gid = str(uuid.uuid4())
    run(
        db,
        "services._grant",
        {
            "grant_id": gid,
            "package_id": package_id,
            "customer_id": customer,
            "granted_at": NOW,
            "source": "manual",
            "sale_id": None,
            "sale_ref": "",
            "amount_cents": 10000,
            "net_amount_cents": 8264,
            "tax_amount_cents": 1736,
            "note": "",
        },
        hub=hub,
    )
    return gid


def redeem(db: ScratchDb, grant_id: str, now: str = NOW, hub: str = HUB) -> str:
    rid = str(uuid.uuid4())
    run(
        db,
        "services._redeem",
        {
            "redemption_id": rid,
            "grant_id": grant_id,
            "appointment_id": None,
            "sale_id": None,
            "note": "",
            "now": now,
        },
        hub=hub,
    )
    return rid


def hold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout: str,
    now: str = NOW,
    hub: str = HUB,
) -> str:
    rid = str(uuid.uuid4())
    run(
        db,
        "services._hold",
        {
            "redemption_id": rid,
            "grant_id": grant_id,
            "service_id": service_id,
            "checkout_ref": checkout,
            "line_ref": "line-1",
            "note": "",
            "now": now,
        },
        hub=hub,
    )
    return rid


def settle(db: ScratchDb, redemption_id: str, sale_id: str, now: str = NOW) -> None:
    run(
        db,
        "services.packages.settle_hold",
        {"redemption_id": redemption_id, "sale_id": sale_id, "now": now},
    )


def adjust(
    db: ScratchDb,
    grant_id: str,
    uses: int = 0,
    days: int = 0,
    reason: str = "Courtesy: we were closed",
    hub: str = HUB,
    now: str = NOW,
) -> int:
    """The statement of `services._adjust_grant`, as the handler emits it. Returns rows written."""
    out = run(
        db,
        "services._adjust_grant",
        {
            "adjustment_id": str(uuid.uuid4()),
            "grant_id": grant_id,
            "uses_delta": uses,
            "days_delta": days,
            "reason": reason,
            "now": now,
        },
        hub=hub,
    )
    return sum(
        int(line.split()[2]) for line in out.splitlines() if line.startswith("INSERT ")
    )


def rows(
    db: ScratchDb, name: str, params: dict, hub: str = HUB, now: str = NOW
) -> list[dict]:
    sql = query_sql(name, {**params, "now": now}, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def adjust_check(db: ScratchDb, grant_id: str, hub: str = HUB) -> dict:
    found = rows(db, "services.packages.adjust_check", {"grant_id": grant_id}, hub=hub)
    if not found:
        return {}
    r = found[0]
    return {
        "reason": r["reason"],
        "can_add_uses": r["can_add_uses"],
        "can_extend": r["can_extend"],
    }


def balance_of(db: ScratchDb, grant_id: str, customer: str, now: str = NOW) -> dict:
    for r in rows(db, "services.packages.balance", {"customer_id": customer}, now=now):
        if r["grant_id"] == grant_id:
            return r
    return {}


def redeem_reason(db: ScratchDb, grant_id: str, now: str = NOW) -> str:
    return rows(db, "services.packages.redeem_check", {"grant_id": grant_id}, now=now)[
        0
    ]["reason"]


def offered(db: ScratchDb, customer: str, svc: str, now: str = NOW) -> list[str]:
    return [
        r["grant_id"]
        for r in rows(
            db,
            "services.packages.tender_options",
            {"customer_id": customer, "service_id": svc},
            now=now,
        )
    ]


def grant_row(db: ScratchDb, grant_id: str) -> dict:
    return json.loads(
        db.scalar(
            "SELECT row_to_json(g) FROM (SELECT max_uses, validity_days, updated_at "
            f"FROM services_package_grant WHERE id = '{grant_id}') g"
        )
    )


# ── 1 · one more session ─────────────────────────────────────────────────────


def a_gifted_session_is_spendable(db: ScratchDb, svc: str, pkg: str) -> None:
    print("\n1 · a gifted session is spendable everywhere, and the snapshot stays")
    g = grant(db, pkg, "cus-gift")
    redeem(db, g)
    redeem(db, g)
    check(
        "used up: the pre-check says no sessions left",
        "no_uses_left",
        redeem_reason(db, g),
    )
    check("used up: the till offers nothing", [], offered(db, "cus-gift", svc))
    check(
        "the pre-check says sessions can be added",
        {"reason": "", "can_add_uses": 1, "can_extend": 1},
        adjust_check(db, g),
    )

    check(
        "one adjustment written",
        1,
        adjust(db, g, uses=1, reason="  One on the house  "),
    )

    check("the balance counts the gift", 1, balance_of(db, g, "cus-gift")["remaining"])
    check("… over the new total", 3, balance_of(db, g, "cus-gift")["max_uses"])
    check("the pre-check lets it be spent", "", redeem_reason(db, g))
    check("the till offers it", [g], offered(db, "cus-gift", svc))
    hold(db, g, svc, "order-gift")
    check(
        "the hold took the gifted session",
        0,
        balance_of(db, g, "cus-gift")["remaining"],
    )
    refused("a fourth session", lambda: redeem(db, g))

    chair = grant(db, pkg, "cus-gift-chair")
    redeem(db, chair)
    redeem(db, chair)
    adjust(db, chair, uses=1)
    accepted("the gifted session spent in the chair", lambda: redeem(db, chair))
    refused("… and only that one", lambda: redeem(db, chair))

    snap = grant_row(db, g)
    check("the grant's snapshot is NOT rewritten (ADR-0390)", 2, snap["max_uses"])
    trail = json.loads(
        db.scalar(
            "SELECT row_to_json(a) FROM (SELECT hub_id, uses_delta, days_delta, reason, "
            "created_by, adjusted_at FROM services_package_grant_adjustment "
            f"WHERE grant_id = '{g}') a"
        )
    )
    check(
        "the movement says who, when, why — trimmed",
        {
            "hub_id": HUB,
            "uses_delta": 1,
            "days_delta": 0,
            "reason": "One on the house",
            "created_by": USER,
            "adjusted_at": NOW,
        },
        trail,
    )
    check(
        "the guard table is empty at rest",
        0,
        int(db.scalar("SELECT count(*) FROM services__gate")),
    )


# ── 2 · a later expiry ───────────────────────────────────────────────────────


def an_extended_expiry_revives_the_voucher(db: ScratchDb, svc: str, pkg: str) -> None:
    print("\n2 · an extended expiry revives a voucher that had run out")
    g = grant(db, pkg, "cus-late")
    check("expired: the pre-check says so", "expired", redeem_reason(db, g, now=LATER))
    check(
        "expired: the till offers nothing", [], offered(db, "cus-late", svc, now=LATER)
    )
    check(
        "expired: the balance says so",
        1,
        balance_of(db, g, "cus-late", LATER)["is_expired"],
    )
    refused("a redeem on the expired voucher", lambda: redeem(db, g, now=LATER))

    check("one adjustment written", 1, adjust(db, g, days=30))
    check("two adjustments add up", 1, adjust(db, g, days=1))

    b = balance_of(db, g, "cus-late", LATER)
    check("the balance is live again", 0, b["is_expired"])
    check(
        "… with the new date (30 + 30 + 1 days)",
        "2026-10-18",
        str(b["expires_at"])[:10],
    )
    check("the pre-check lets it be spent", "", redeem_reason(db, g, now=LATER))
    check("the till offers it", [g], offered(db, "cus-late", svc, now=LATER))
    redeem(db, g, now=LATER)
    rid = hold(db, g, svc, "order-late", now=LATER)
    check("the hold went through on the revived voucher", True, bool(rid))
    check("the snapshot is NOT rewritten", 30, grant_row(db, g)["validity_days"])


# ── 3 · what cannot be adjusted ──────────────────────────────────────────────


def what_cannot_be_adjusted(
    db: ScratchDb, pkg: str, unlimited_pkg: str, forever_pkg: str
) -> None:
    print(
        "\n3 · the pre-check names WHY an adjustment is refused, and the write refuses the same"
    )
    missing = str(uuid.uuid4())
    check(
        "a grant that does not exist",
        "grant_not_found",
        adjust_check(db, missing)["reason"],
    )
    check("… and nothing is written", 0, adjust(db, missing, uses=1))

    voided = grant(db, pkg, "cus-voided")
    run(db, "services._void_grant", {"grant_id": voided, "reason": "Wrong customer"})
    check("a voided grant", "already_voided", adjust_check(db, voided)["reason"])
    check("… is not adjusted by the write either", 0, adjust(db, voided, uses=1))

    live = grant(db, pkg, "cus-edge")
    check("a blank reason writes nothing", 0, adjust(db, live, uses=1, reason="   "))
    check("nothing to add writes nothing", 0, adjust(db, live))
    check("a negative day count writes nothing", 0, adjust(db, live, days=-1))
    check("… even hidden behind a positive one", 0, adjust(db, live, uses=2, days=-1))
    check(
        "… or behind a correction of sessions",
        0,
        adjust(db, live, uses=-1, days=-1),
    )
    # The screen promises «up to 100» sessions and «up to 366» days per adjustment; the write is
    # the authority, so a typo of 1000 sessions or ten million days (a date the till cannot even
    # compute on every later read) lands on zero rows, and the limits themselves are written.
    check("more than 100 sessions at once writes nothing", 0, adjust(db, live, uses=101))
    check("taking more than 100 sessions at once writes nothing", 0, adjust(db, live, uses=-101))
    check("more than 366 days at once writes nothing", 0, adjust(db, live, days=367))
    check(
        "… even hidden behind an amount within the limit",
        0,
        adjust(db, live, uses=1, days=10_000_000),
    )

    # The write repeats BOTH marks of a dead grant on its own: a row soft-deleted without a void
    # stamp, or stamped voided while still flagged live, is not adjusted either.
    deleted = grant(db, pkg, "cus-deleted")
    set_grant(db, deleted, "is_deleted = 1")
    check(
        "a soft-deleted grant is not adjusted by the write",
        0,
        adjust(db, deleted, uses=1),
    )
    stamped = grant(db, pkg, "cus-stamped")
    set_grant(db, stamped, f"voided_at = '{NOW}'")
    check(
        "a void-stamped grant is not adjusted by the write",
        0,
        adjust(db, stamped, uses=1),
    )

    unlimited = grant(db, unlimited_pkg, "cus-unlimited")
    check(
        "an unlimited voucher takes no sessions, but can be extended",
        {"reason": "", "can_add_uses": 0, "can_extend": 1},
        adjust_check(db, unlimited),
    )
    check("… so sessions on it write nothing", 0, adjust(db, unlimited, uses=1))
    check("… and days on it are written", 1, adjust(db, unlimited, days=10))

    forever = grant(db, forever_pkg, "cus-forever")
    check(
        "a voucher that never expires takes no days, but takes sessions",
        {"reason": "", "can_add_uses": 1, "can_extend": 0},
        adjust_check(db, forever),
    )
    check("… so days on it write nothing", 0, adjust(db, forever, days=10))
    check("… and sessions on it are written", 1, adjust(db, forever, uses=1))
    at_the_limit = grant(db, pkg, "cus-limit")
    check("exactly 100 sessions and 366 days are written", 1, adjust(db, at_the_limit, uses=100, days=366))
    check(
        "none of the refused ones left a movement",
        0,
        int(
            db.scalar(
                "SELECT count(*) FROM services_package_grant_adjustment "
                f"WHERE grant_id IN ('{missing}', '{voided}', '{live}')"
            )
        ),
    )


# ── 4 · tenancy ──────────────────────────────────────────────────────────────


def the_neighbour_cannot_adjust(
    db: ScratchDb, svc: str, pkg: str, other_pkg: str
) -> None:
    print("\n4 · the neighbour hub cannot adjust — nor see — this hub's grant")
    mine = grant(db, pkg, "cus-mine")
    redeem(db, mine)
    redeem(db, mine)
    check(
        "for the neighbour it does not exist",
        "grant_not_found",
        adjust_check(db, mine, hub=OTHER_HUB)["reason"],
    )
    check(
        "the neighbour's adjustment writes nothing",
        0,
        adjust(db, mine, uses=5, hub=OTHER_HUB),
    )
    # A movement row of the NEIGHBOUR that names THIS grant: ids are opaque, so only the hub_id
    # match in every reader keeps it from counting here. And one of THIS hub, soft-deleted: only
    # live movements count (services#119 will undo a movement that way).
    stray(db, mine, OTHER_HUB, "stray")
    stray(db, mine, HUB, "deleted-move", is_deleted=1)
    check(
        "the stray row adds no session to the balance",
        0,
        balance_of(db, mine, "cus-mine")["remaining"],
    )
    check(
        "… nor days",
        1,
        balance_of(db, mine, "cus-mine", LATER)["is_expired"],
    )
    check("the pre-check still says used up", "no_uses_left", redeem_reason(db, mine))
    check("the till still offers nothing", [], offered(db, "cus-mine", svc))
    refused("a redeem riding the stray row", lambda: redeem(db, mine))
    refused("a hold riding the stray row", lambda: hold(db, mine, svc, "order-stray"))
    grants = list_page(
        db, "services.packages.grants", {"package_id": pkg, "limit": 500}
    )
    row = next(r for r in grants["rows"] if r["grant_id"] == mine)
    check(
        "the sold list ignores it",
        [0, 0, 0],
        [row["remaining"], row["adjusted_uses"], row["adjusted_days"]],
    )
    history = list_page(
        db, "services.packages.redemption_history", {"package_id": pkg, "limit": 500}
    )
    check(
        "the movements do not list it, nor the deleted one",
        [],
        [
            r["adjust_reason"]
            for r in history["rows"]
            if r.get("adjust_reason") in ("stray", "deleted-move")
        ],
    )

    # A grant of the NEIGHBOUR naming THIS hub's package (ids are opaque), with a movement of its
    # own hub and one of this hub naming it: neither is a movement of this hub's voucher.
    theirs = grant(db, other_pkg, "cus-cross", hub=OTHER_HUB)
    set_grant(db, theirs, f"package_id = '{pkg}'")
    stray(db, theirs, OTHER_HUB, "cross-own")
    stray(db, theirs, HUB, "cross-named")
    history = list_page(
        db, "services.packages.redemption_history", {"package_id": pkg, "limit": 500}
    )
    check(
        "the movements list neither",
        [],
        [
            r["adjust_reason"]
            for r in history["rows"]
            if r.get("adjust_reason") in ("cross-own", "cross-named")
        ],
    )

    # Every other reader of a grant's terms, against the neighbour's row and a deleted one too.
    g = grant(db, pkg, "cus-stray-readers")
    sold_one = hold(db, g, svc, "order-stray-a")
    settle(db, sold_one, "sale-stray")
    hold(db, g, svc, "order-stray-b")
    stray(db, g, OTHER_HUB, "stray-readers")
    stray(db, g, HUB, "deleted-readers", is_deleted=1)
    held = rows(
        db, "services.packages.holds_for_checkout", {"checkout_ref": "order-stray-b"}
    )
    check(
        "the checkout's hold ignores it",
        [0, "2026-09-17"],
        [held[0]["remaining_after"], str(held[0]["expires_at"])[:10]],
    )
    sold = rows(db, "services.packages.redemptions_for_sale", {"sale_id": "sale-stray"})
    check(
        "the sale's redemptions ignore it",
        [2, "2026-09-17"],
        [sold[0]["max_uses"], str(sold[0]["expires_at"])[:10]],
    )
    refund = rows(db, "services.packages.refund_check", {"redemption_id": sold_one})[0]
    check(
        "the refund pre-check ignores it",
        [2, "2026-09-17"],
        [refund["max_uses"], str(refund["expires_at"])[:10]],
    )
    run(
        db,
        "services._refund",
        {
            "redemption_id": sold_one,
            "refund_ref": "ret-s",
            "refund_note": "",
            "now": LATER,
        },
    )
    check(
        "a session returned after the real expiry is flagged expired",
        1,
        int(
            db.scalar(
                f"SELECT refund_expired FROM services_package_redemption WHERE id = '{sold_one}'"
            )
        ),
    )
    run(db, "services._on_customer_deleted", {"customer_id": "cus-stray-readers"})
    orphan = next(
        r
        for r in rows(db, "services.packages.orphans", {}, now=LATER)
        if r["grant_id"] == g
    )
    check(
        "the rescue list ignores it",
        [2, 1],
        [orphan["max_uses"], orphan["is_expired"]],
    )


# ── 5 · the sold list and the movements ──────────────────────────────────────


def the_trail_is_visible(db: ScratchDb, pkg: str, other_pkg: str) -> None:
    print("\n5 · the sold list shows the totals; the movements show every adjustment")
    page = list_page(db, "services.packages.grants", {"package_id": pkg, "limit": 500})
    by_customer = {r["customer_id"]: r for r in page["rows"]}
    gift = by_customer["cus-gift"]
    check("sessions added to the gifted voucher", 1, gift["adjusted_uses"])
    check("… its total counts them", 3, gift["max_uses"])
    late = by_customer["cus-late"]
    check("days added to the extended voucher", 31, late["adjusted_days"])
    check("… its expiry is the new one", "2026-10-18", str(late["expires_at"])[:10])
    check("a live voucher can be adjusted", 1, late["can_adjust"])
    check("a voided one cannot", 0, by_customer["cus-voided"]["can_adjust"])

    history = list_page(
        db,
        "services.packages.redemption_history",
        {"package_id": pkg, "f_movement": "adjusted", "limit": 500},
    )
    mine = [r for r in history["rows"] if r["customer_id"] == "cus-gift"]
    check("the gift is one movement", 1, len(mine))
    m = mine[0]
    check(
        "… with its amount, reason, author and date",
        [1, 0, "One on the house", USER, NOW, "adjusted"],
        [
            m["uses_delta"],
            m["days_delta"],
            m["adjust_reason"],
            m["created_by"],
            m["redeemed_at"],
            m["movement"],
        ],
    )
    check("… and the grant it belongs to", gift["grant_id"], m["grant_id"])
    check(
        "the extension is two movements",
        [1, 30],
        sorted(
            r["days_delta"] for r in history["rows"] if r["customer_id"] == "cus-late"
        ),
    )
    everything = list_page(
        db, "services.packages.redemption_history", {"package_id": pkg, "limit": 500}
    )
    spent = [r for r in everything["rows"] if r["movement"] != "adjusted"]
    check(
        "a session movement carries no adjustment",
        {0},
        {r["uses_delta"] for r in spent},
    )
    theirs = grant(db, other_pkg, "cus-theirs", hub=OTHER_HUB)
    adjust(db, theirs, uses=1, reason="their gift", hub=OTHER_HUB)
    check(
        "the neighbour's adjustment is not in this hub's movements",
        False,
        any(
            r.get("adjust_reason") == "their gift"
            for r in list_page(
                db,
                "services.packages.redemption_history",
                {"package_id": pkg, "limit": 500},
            )["rows"]
        ),
    )
    check(
        "… and it is in its own",
        ["their gift"],
        [
            r["adjust_reason"]
            for r in list_page(
                db,
                "services.packages.redemption_history",
                {"package_id": other_pkg, "f_movement": "adjusted"},
                hub=OTHER_HUB,
            )["rows"]
        ],
    )


# ── 6 · the other readers of a grant's terms ─────────────────────────────────


def the_other_readers_count_it(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n6 · the till's holds, a sale's redemptions, the rescue list and the refund count it"
    )
    g = grant(db, pkg, "cus-readers")
    first = hold(db, g, svc, "order-r1")
    settle(db, first, "sale-r1")
    redeem(db, g)
    adjust(db, g, uses=2, days=30)
    extra = hold(db, g, svc, "order-r2")
    held = rows(
        db, "services.packages.holds_for_checkout", {"checkout_ref": "order-r2"}
    )
    check(
        "the checkout's hold shows what is left after it", 1, held[0]["remaining_after"]
    )
    check("… and the new expiry", "2026-10-17", str(held[0]["expires_at"])[:10])
    sold = rows(db, "services.packages.redemptions_for_sale", {"sale_id": "sale-r1"})
    check("the sale's redemption shows the total", 4, sold[0]["max_uses"])
    check("… and the new expiry", "2026-10-17", str(sold[0]["expires_at"])[:10])
    refund = rows(db, "services.packages.refund_check", {"redemption_id": first})[0]
    check("the refund pre-check counts the gift", 4, refund["max_uses"])
    check("… and the new expiry", "2026-10-17", str(refund["expires_at"])[:10])
    run(
        db,
        "services._refund",
        {
            "redemption_id": first,
            "refund_ref": "ret-1",
            "refund_note": "",
            "now": LATER,
        },
    )
    check(
        "a session returned while the extension is live is not flagged expired",
        0,
        int(
            db.scalar(
                f"SELECT refund_expired FROM services_package_redemption WHERE id = '{first}'"
            )
        ),
    )
    run(db, "services._on_customer_deleted", {"customer_id": "cus-readers"})
    orphan = next(
        r for r in rows(db, "services.packages.orphans", {}) if r["grant_id"] == g
    )
    check(
        "the rescue list counts the gift",
        [4, 2],
        [orphan["max_uses"], orphan["remaining"]],
    )
    check("… and the new expiry", "2026-10-17", str(orphan["expires_at"])[:10])
    late = next(
        r
        for r in rows(db, "services.packages.orphans", {}, now=LATER)
        if r["grant_id"] == g
    )
    check("… so it is not expired 40 days in", 0, late["is_expired"])
    check("the extra hold stands", True, bool(extra))


# ── 7 · the balance correction (services#119) ────────────────────────────────


def uses_left(db: ScratchDb, grant_id: str, hub: str = HUB, now: str = NOW):
    found = rows(db, "services.packages.adjust_check", {"grant_id": grant_id}, hub=hub, now=now)
    return found[0]["uses_left"] if found else "missing"


def stray_redemption(db: ScratchDb, grant_id: str, hub: str, is_deleted: int = 0) -> None:
    """A spent session written by hand: of ANOTHER hub naming this grant, or soft-deleted."""
    db.psql(
        [],
        db=db.name,
        stdin=(
            "INSERT INTO services_package_redemption "
            "(id, hub_id, grant_id, package_id, customer_id, note, redeemed_at, status, "
            "use_index, is_deleted, created_at, updated_at) "
            f"SELECT '{uuid.uuid4()}', '{hub}', id, package_id, customer_id, '', '{NOW}', "
            f"'consumed', 900 + (random() * 1000)::int, {is_deleted}, '{NOW}', '{NOW}' "
            f"FROM services_package_grant WHERE id = '{grant_id}';\n"
        ),
    )


def a_correction_takes_sessions_away(
    db: ScratchDb, svc: str, pkg: str, unlimited_pkg: str
) -> None:
    print("\n7 · a correction takes sessions away, never below what was spent")
    g = grant(db, pkg, "cus-fix")
    redeem(db, g)
    check("the pre-check says what is left", 1, uses_left(db, g))
    check("taking more than is left writes nothing", 0, adjust(db, g, uses=-2, reason="Oops"))
    check(
        "taking what is left is one movement",
        1,
        adjust(db, g, uses=-1, reason="  Spent twice by mistake  "),
    )
    b = balance_of(db, g, "cus-fix")
    check("the balance drops to what is really left", [0, 1, 1], [b["remaining"], b["max_uses"], b["used"]])
    check("the grant's snapshot is NOT rewritten (ADR-0390)", 2, grant_row(db, g)["max_uses"])
    check("the pre-check says used up", "no_uses_left", redeem_reason(db, g))
    check("the till offers nothing", [], offered(db, "cus-fix", svc))
    refused("a redeem past the correction", lambda: redeem(db, g))
    refused("a hold past the correction", lambda: hold(db, g, svc, "order-fix"))
    check("nothing left to take", 0, uses_left(db, g))
    check("… so another correction writes nothing", 0, adjust(db, g, uses=-1, reason="Again"))
    trail = json.loads(
        db.scalar(
            "SELECT row_to_json(a) FROM (SELECT hub_id, uses_delta, days_delta, reason, "
            "created_by, adjusted_at FROM services_package_grant_adjustment "
            f"WHERE grant_id = '{g}') a"
        )
    )
    check(
        "the movement is negative, with who, when and why — trimmed",
        {
            "hub_id": HUB,
            "uses_delta": -1,
            "days_delta": 0,
            "reason": "Spent twice by mistake",
            "created_by": USER,
            "adjusted_at": NOW,
        },
        trail,
    )
    check("a gift after the correction is written", 1, adjust(db, g, uses=1, reason="Sorry"))
    check("… and spendable again", 1, balance_of(db, g, "cus-fix")["remaining"])
    page = list_page(db, "services.packages.grants", {"package_id": pkg, "limit": 500})
    row = next(r for r in page["rows"] if r["grant_id"] == g)
    check("the sold list nets the movements", [0, 2, 1], [row["adjusted_uses"], row["max_uses"], row["remaining"]])
    history = list_page(
        db,
        "services.packages.redemption_history",
        {"package_id": pkg, "f_movement": "adjusted", "limit": 500},
    )
    check(
        "the movements list the correction and the gift",
        [(-1, "Spent twice by mistake"), (1, "Sorry")],
        sorted(
            (r["uses_delta"], r["adjust_reason"])
            for r in history["rows"]
            if r["grant_id"] == g
        ),
    )

    held = grant(db, pkg, "cus-fix-held")
    hold(db, held, svc, "order-fix-held")
    check("a live hold is spent: one left", 1, uses_left(db, held))
    check("… so taking two writes nothing", 0, adjust(db, held, uses=-2))
    tomorrow_plus = "2026-08-20T10:00:00Z"
    check(
        "an EXPIRED hold is not spent: two left once its deadline passed",
        2,
        uses_left(db, held, now=tomorrow_plus),
    )
    check(
        "… and the write agrees",
        1,
        adjust(db, held, uses=-2, reason="Imported wrong", now=tomorrow_plus),
    )

    big = grant(db, pkg, "cus-fix-big")
    adjust(db, big, uses=100)
    check("exactly 100 sessions can be taken at once", 1, adjust(db, big, uses=-100))

    unlimited = grant(db, unlimited_pkg, "cus-fix-unlimited")
    check("an unlimited voucher has no count to correct", None, uses_left(db, unlimited))
    check("… so a correction on it writes nothing", 0, adjust(db, unlimited, uses=-1))

    # TENANCY and live rows only: a spent session and a gift of the NEIGHBOUR naming this grant, and
    # a deleted spent session and a deleted gift of this hub, move neither the floor nor the ceiling.
    mine = grant(db, pkg, "cus-fix-mine")
    stray_redemption(db, mine, OTHER_HUB)
    stray_redemption(db, mine, HUB, is_deleted=1)
    stray(db, mine, OTHER_HUB, "stray-gift", uses=5, days=0)
    stray(db, mine, HUB, "deleted-gift", uses=5, days=0, is_deleted=1)
    check("the stray rows do not change what is left", 2, uses_left(db, mine))
    check("… for the neighbour it does not exist", None, uses_left(db, mine, hub=OTHER_HUB))
    check("taking three writes nothing", 0, adjust(db, mine, uses=-3))
    check("the neighbour's correction writes nothing", 0, adjust(db, mine, uses=-1, hub=OTHER_HUB))
    check("taking both is written", 1, adjust(db, mine, uses=-2))


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_grant_adjust")
    db.create()
    try:
        svc = seed_service(db, HUB, "Haircut")
        pkg = seed_package(db, HUB, "Two haircuts", svc)
        unlimited_pkg = seed_package(db, HUB, "Unlimited haircuts", svc, max_uses=None)
        forever_pkg = seed_package(db, HUB, "Haircuts forever", svc, validity_days=None)
        other_svc = seed_service(db, OTHER_HUB, "Haircut")
        other_pkg = seed_package(db, OTHER_HUB, "Two haircuts", other_svc)
        a_gifted_session_is_spendable(db, svc, pkg)
        an_extended_expiry_revives_the_voucher(db, svc, pkg)
        what_cannot_be_adjusted(db, pkg, unlimited_pkg, forever_pkg)
        the_neighbour_cannot_adjust(db, svc, pkg, other_pkg)
        the_trail_is_visible(db, pkg, other_pkg)
        readers_pkg = seed_package(db, HUB, "Two more haircuts", svc)
        the_other_readers_count_it(db, svc, readers_pkg)
        fix_pkg = seed_package(db, HUB, "Two corrected haircuts", svc)
        a_correction_takes_sessions_away(db, svc, fix_pkg, unlimited_pkg)
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ grant_adjust: a sold voucher takes a gifted session or a later expiry, with its trail"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
