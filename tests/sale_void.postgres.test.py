#!/usr/bin/env python3
"""services#151 — voiding a PAID sale gives back what `services` took for it, statement by statement.

`tests/sale_void.hub.test.py` proves the wiring (the kernel delivers `sales`' own `sale.voided` to
`services._on_sale_voided`). This battery proves the three statements of that listener against a
REAL Postgres, one guard at a time, because each guard keeps a session or a voucher that is NOT
this sale's out of the reach of a void:

  1. SESSIONS SPENT ON THE VOIDED SALE come back (SERVICES-F27), written exactly as a return writes
     them (`refunded_by`, `refund_ref`, `refund_note`, `refund_expired`) — and nothing else does:
     not a session of another sale, not a session spent at the chair that merely names the sale
     (never settled: the refund CHECK would abort the whole void), not a session another return
     already gave back, not a row of the neighbour hub carrying the same sale id.
  2. VOUCHERS SOLD ON THE VOIDED SALE are voided with it, used or not (services#157): the money
     goes back, so the voucher goes with it — what was already used stays used (its sessions are
     not touched, a session held at a till right now included) and what was left is lost. Nothing
     else is voided: not a manual grant that names the sale, not one sold on another sale, not one
     already voided (its trail is not re-stamped), not the neighbour's. The sessions spent on the
     voided sale itself come back first, as always.
  3. A redelivered `sale.voided` touches nothing.
  4. RACE: a till holding a session of a voucher sold on the sale, at the same instant, makes the
     void WAIT; it then voids the voucher and leaves the till's session where the till put it.

Usage: tests/sale_void.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import re
import subprocess
import sys
import time
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    NOW,
    OTHER_HUB,
    USER,
    ScratchDb,
    container_available,
    query_sql,
    script_for,
)

MANAGER = "u-manager"  # who voids the sale at the till, as `sale.voided` carries it
failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


# ── seeding ──────────────────────────────────────────────────────────────────


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


def seed_package(db: ScratchDb, hub: str, service_id: str) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": "Five haircuts",
            "slug": "five-haircuts",
            "description": "",
            "discount_type": "percentage",
            "discount_percent_bp": 0,
            "discount_amount_cents": 0,
            "fixed_price": None,
            "validity_days": 30,
            "max_uses": 5,
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


def run(db: ScratchDb, command: str, params: dict, hub: str = HUB) -> int:
    """Run a manifest command as the dispatcher does; answers the rows its UPDATEs touched."""
    out = db.psql(["-e"], db=db.name, stdin=script_for(command, params, hub=hub))
    return sum(
        int(m.group(1)) for m in re.finditer(r"^UPDATE (\d+)$", out, re.MULTILINE)
    )


def grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    *,
    sale_id: str | None = None,
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


def hold_body(grant_id: str, service_id: str) -> tuple[str, dict]:
    return "services._hold", {
        "redemption_id": str(uuid.uuid4()),
        "grant_id": grant_id,
        "service_id": service_id,
        "checkout_ref": f"order-{uuid.uuid4().hex[:6]}",
        "line_ref": f"line-{uuid.uuid4().hex[:6]}",
        "note": "",
    }


def hold(db: ScratchDb, grant_id: str, service_id: str, hub: str = HUB) -> str:
    name, params = hold_body(grant_id, service_id)
    run(db, name, params, hub=hub)
    return params["redemption_id"]


def spent_on(
    db: ScratchDb, grant_id: str, service_id: str, sale_id: str, hub: str = HUB
) -> str:
    """A session held at the till and settled with the sale — what `sale.completed` leaves."""
    rid = hold(db, grant_id, service_id, hub=hub)
    run(
        db,
        "services.packages.settle_hold",
        {"redemption_id": rid, "sale_id": sale_id},
        hub=hub,
    )
    return rid


def chair_session(db: ScratchDb, grant_id: str, sale_id: str) -> str:
    """A session spent at the chair (`services._redeem`) that names the sale but was never
    settled with it."""
    rid = str(uuid.uuid4())
    run(
        db,
        "services._redeem",
        {
            "redemption_id": rid,
            "grant_id": grant_id,
            "appointment_id": None,
            "sale_id": sale_id,
            "note": "",
        },
    )
    return rid


def void_body(
    sale_id: str, voided_by: str = MANAGER, reason: str = "  Charged by mistake  "
):
    """`sale.voided` as `sales` emits it; the listener binds the payload's fields by name."""
    return "services._on_sale_voided", {
        "sender": "sales",
        "sale_id": sale_id,
        "sale_number": "T-0001",
        "reason": reason,
        "voided_by": voided_by,
        "voided_at": NOW,
        "total": 2500,
        "payment_method_name": "Card",
        "order_id": "order-x",
        "document_type": "ticket",
    }


def void_sale(db: ScratchDb, sale_id: str, hub: str = HUB, **kw) -> int:
    name, params = void_body(sale_id, **kw)
    return run(db, name, params, hub=hub)


def session(db: ScratchDb, rid: str) -> dict:
    return json.loads(
        db.scalar(
            "SELECT row_to_json(r) FROM (SELECT is_deleted, status, refunded_at, refunded_by, "
            "refund_ref, refund_note, refund_expired FROM services_package_redemption "
            f"WHERE id = '{rid}') r"
        )
    )


def grant_trail(db: ScratchDb, gid: str) -> dict:
    return json.loads(
        db.scalar(
            "SELECT row_to_json(g) FROM (SELECT is_deleted, voided_at, voided_by, void_reason "
            f"FROM services_package_grant WHERE id = '{gid}') g"
        )
    )


def remaining(db: ScratchDb, customer: str, gid: str, hub: str = HUB) -> int | None:
    sql = query_sql("services.packages.balance", {"customer_id": customer}, hub=hub)
    rows = json.loads(
        db.psql(
            ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"],
            db=db.name,
        ).strip()
        or "[]"
    )
    row = next((r for r in rows if r["grant_id"] == gid), None)
    return row["remaining"] if row else None


UNTOUCHED = {"is_deleted": 0, "refunded_at": None, "refunded_by": None}


def live(s: dict) -> dict:
    return {k: s[k] for k in UNTOUCHED}


# ── 1 · the sessions ─────────────────────────────────────────────────────────


def sessions_come_back(
    db: ScratchDb, svc: str, pkg: str, other_svc: str, other_pkg: str
) -> None:
    print("\n1 · the sessions spent on the voided sale come back, and only those")
    sale, other_sale = "sale-1", "sale-2"
    g = grant(db, pkg, "cus-a", source="manual")
    mine = spent_on(db, g, svc, sale)
    second = spent_on(db, g, svc, sale)  # two cuts on one ticket: both come back
    elsewhere = spent_on(db, g, svc, other_sale)
    chair = chair_session(db, g, sale)
    returned = spent_on(db, g, svc, sale)
    run(
        db,
        "services._refund",
        {"redemption_id": returned, "refund_ref": "ret-1", "refund_note": "earlier"},
    )
    theirs_g = grant(db, other_pkg, "cus-a", source="manual", hub=OTHER_HUB)
    theirs = spent_on(db, theirs_g, other_svc, sale, hub=OTHER_HUB)
    check(
        "before the void, five spent and one returned leave one",
        1,
        remaining(db, "cus-a", g),
    )

    touched = void_sale(db, sale)
    back = session(db, mine)
    check(
        "the sale's session is out of the live set (given back)", 1, back["is_deleted"]
    )
    check("… stamped when", NOW, back["refunded_at"])
    check("… signed by whoever voided the sale", MANAGER, back["refunded_by"])
    check("… pointing at the voided sale", sale, back["refund_ref"])
    check(
        "… with the void's reason, trimmed", "Charged by mistake", back["refund_note"]
    )
    check("… on a voucher that had not expired", 0, back["refund_expired"])
    check(
        "the second cut of the same ticket comes back too",
        1,
        session(db, second)["is_deleted"],
    )
    check(
        "a session of ANOTHER sale stays spent", UNTOUCHED, live(session(db, elsewhere))
    )
    check(
        "a session spent at the chair that names the sale (never settled) stays spent",
        UNTOUCHED,
        live(session(db, chair)),
    )
    earlier = session(db, returned)
    check(
        "a session another return gave back keeps THAT return",
        ["ret-1", "earlier"],
        [earlier["refund_ref"], earlier["refund_note"]],
    )
    check(
        "the neighbour hub's session on the same sale id stays spent",
        UNTOUCHED,
        live(session(db, theirs)),
    )
    check("exactly the two sessions of the sale were touched", 2, touched)
    check("the two sessions are back in the balance", 3, remaining(db, "cus-a", g))
    history = json.loads(
        db.psql(
            [
                "-tAc",
                "SELECT COALESCE(json_agg(t), '[]'::json) FROM ("
                + query_sql("services.packages.redemption_history", {"package_id": pkg})
                + ") t",
            ],
            db=db.name,
        ).strip()
    )
    check(
        "the ledger reads it as given back",
        "refunded",
        next(r["movement"] for r in history if r["redemption_id"] == mine),
    )

    print("\n3 · a redelivered `sale.voided` touches nothing")
    check("the second delivery updates no row", 0, void_sale(db, sale, reason="again"))
    check(
        "… and the first give-back is not re-stamped",
        "Charged by mistake",
        session(db, mine)["refund_note"],
    )


def expired_and_unsigned(
    db: ScratchDb, svc: str, pkg: str, other_svc: str, other_pkg: str
) -> None:
    print(
        "\n1b · an expired voucher still gets its session back; an unsigned void falls back"
    )
    g = grant(db, pkg, "cus-old", source="manual")
    rid = spent_on(db, g, svc, "sale-old")
    # The voucher was bought 40 days ago and lasts 30: it expired after the session was spent.
    db.psql(
        [],
        db=db.name,
        stdin=f"UPDATE services_package_grant SET granted_at = '2026-07-09T10:00:00Z' WHERE id = '{g}';\n",
    )
    # Neither a WITHDRAWN extension nor the neighbour's extension that names this voucher's id
    # (ids are opaque: only the hub_id keeps it out) makes it unexpired.
    adjust = {"uses_delta": 0, "days_delta": 30, "reason": "Closed for holidays"}
    withdrawn = str(uuid.uuid4())
    run(
        db,
        "services._adjust_grant",
        {"adjustment_id": withdrawn, "grant_id": g, **adjust},
    )
    theirs_g = grant(db, other_pkg, "cus-old", source="manual", hub=OTHER_HUB)
    stray = str(uuid.uuid4())
    run(
        db,
        "services._adjust_grant",
        {"adjustment_id": stray, "grant_id": theirs_g, **adjust},
        hub=OTHER_HUB,
    )
    db.psql(
        [],
        db=db.name,
        stdin=f"UPDATE services_package_grant_adjustment SET is_deleted = 1 WHERE id = '{withdrawn}';\n"
        f"UPDATE services_package_grant_adjustment SET grant_id = '{g}' WHERE id = '{stray}';\n",
    )
    # Same age, but the manager added 30 days with **Ajustar**: it has NOT expired.
    extended = grant(db, pkg, "cus-ext", source="manual")
    rid_ext = spent_on(db, extended, svc, "sale-old")
    run(
        db,
        "services._adjust_grant",
        {
            "adjustment_id": str(uuid.uuid4()),
            "grant_id": extended,
            "uses_delta": 0,
            "days_delta": 30,
            "reason": "Closed for holidays",
        },
    )
    db.psql(
        [],
        db=db.name,
        stdin=f"UPDATE services_package_grant SET granted_at = '2026-07-09T10:00:00Z' WHERE id = '{extended}';\n",
    )
    void_sale(db, "sale-old")
    check(
        "the session comes back flagged as on an expired voucher",
        1,
        session(db, rid)["refund_expired"],
    )
    check(
        "a voucher extended by 30 days is not expired: its session comes back unflagged",
        0,
        session(db, rid_ext)["refund_expired"],
    )

    g2 = grant(db, pkg, "cus-blank", source="manual")
    rid2 = spent_on(db, g2, svc, "sale-blank")
    sold_blank = grant(db, pkg, "cus-blank2", sale_id="sale-blank")
    void_sale(db, "sale-blank", voided_by="  ")
    check(
        "a void without its operator is signed by the caller, never left empty",
        USER,
        session(db, rid2)["refunded_by"],
    )
    check(
        "… and so is the voucher it voids",
        USER,
        grant_trail(db, sold_blank)["voided_by"],
    )


# ── 2 · the vouchers sold on the sale ────────────────────────────────────────


def vouchers_sold_on_it(db: ScratchDb, svc: str, pkg: str, other_pkg: str) -> None:
    print(
        "\n2 · the vouchers sold on the voided sale are voided with it, used or not, and only those"
    )
    sale = "sale-v"
    intact = grant(db, pkg, "cus-v1", sale_id=sale)
    used = grant(db, pkg, "cus-v2", sale_id=sale)
    used_session = chair_session(db, used, "sale-later")
    held = grant(db, pkg, "cus-v3", sale_id=sale)
    held_session = hold(db, held, svc)
    stale = grant(db, pkg, "cus-v4", sale_id=sale)
    stale_hold = hold(db, stale, svc)
    released = grant(db, pkg, "cus-v8", sale_id=sale)
    run(
        db,
        "services.packages.release_hold",
        {"redemption_id": hold(db, released, svc)},
    )
    manual = grant(db, pkg, "cus-v5", sale_id=sale, source="manual")
    other = grant(db, pkg, "cus-v6", sale_id="sale-w")
    already = grant(db, pkg, "cus-v7", sale_id=sale)
    run(db, "services._void_grant", {"grant_id": already, "reason": "Wrong customer"})
    first_trail = grant_trail(db, already)
    theirs = grant(db, other_pkg, "cus-v1", sale_id=sale, hub=OTHER_HUB)
    # An intact voucher of this hub that a session of the NEIGHBOUR names by id: only the hub_id
    # of the in-use check keeps that foreign session from counting as a use.
    named = grant(db, pkg, "cus-v9", sale_id=sale)
    foreign_g = grant(db, other_pkg, "cus-v9", source="manual", hub=OTHER_HUB)
    foreign = str(uuid.uuid4())
    run(
        db,
        "services._redeem",
        {
            "redemption_id": foreign,
            "grant_id": foreign_g,
            "appointment_id": None,
            "sale_id": None,
            "note": "",
        },
        hub=OTHER_HUB,
    )
    # The hold lapses AFTER every other hold above (each one sweeps lapsed holds first), so the
    # void is what reads a hold that is still live in the table but past its deadline.
    db.psql(
        [],
        db=db.name,
        stdin="UPDATE services_package_redemption SET expires_at = '2026-08-17T10:00:00Z' "
        f"WHERE id = '{stale_hold}';\n"
        f"UPDATE services_package_redemption SET grant_id = '{named}' WHERE id = '{foreign}';\n",
    )

    void_sale(db, sale, reason="  Sold by mistake  ")
    trail = grant_trail(db, intact)
    check(
        "the intact voucher is voided (soft-deleted, the row stays)",
        1,
        trail["is_deleted"],
    )
    check("… stamped when", NOW, trail["voided_at"])
    check("… signed by whoever voided the sale", MANAGER, trail["voided_by"])
    check("… with the void's reason, trimmed", "Sold by mistake", trail["void_reason"])
    check("… and nothing left to spend", None, remaining(db, "cus-v1", intact))
    used_trail = grant_trail(db, used)
    check(
        "a voucher already USED is voided with its sale too (services#157)",
        [1, NOW, MANAGER, "Sold by mistake"],
        [
            used_trail["is_deleted"],
            used_trail["voided_at"],
            used_trail["voided_by"],
            used_trail["void_reason"],
        ],
    )
    check(
        "… and its session spent on another visit stays spent",
        [0, None],
        [session(db, used_session)["is_deleted"], session(db, used_session)["refunded_at"]],
    )
    check("… with nothing left to spend", None, remaining(db, "cus-v2", used))
    check(
        "a voucher with a session HELD at a till is voided too",
        1,
        grant_trail(db, held)["is_deleted"],
    )
    check(
        "… and the till's session stays held on it",
        [0, None],
        [session(db, held_session)["is_deleted"], session(db, held_session)["refunded_at"]],
    )
    check(
        "a voucher whose only hold has lapsed counts as intact and is voided",
        1,
        grant_trail(db, stale)["is_deleted"],
    )
    check(
        "a neighbour's session naming this voucher's id does not make it used",
        1,
        grant_trail(db, named)["is_deleted"],
    )
    check(
        "a voucher whose hold was undone at the till counts as intact and is voided",
        1,
        grant_trail(db, released)["is_deleted"],
    )
    check(
        "a MANUAL grant that names the sale stays live",
        0,
        grant_trail(db, manual)["is_deleted"],
    )
    check(
        "a voucher sold on ANOTHER sale stays live",
        0,
        grant_trail(db, other)["is_deleted"],
    )
    check(
        "a voucher already voided keeps its first trail",
        first_trail,
        grant_trail(db, already),
    )
    check(
        "the neighbour hub's voucher on the same sale id stays live",
        0,
        grant_trail(db, theirs)["is_deleted"],
    )


def sold_and_spent_on_the_same_sale(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n2b · a voucher whose only session was spent on the very sale that sold it is voided too"
    )
    # The void reverses the WHOLE ticket, so the sessions come back FIRST and the in-use check of
    # the voucher reads what is left: nothing. With the two statements the other way round the
    # voucher would still count its own session as a use and stay live — the customer would get
    # the money back and keep the voucher. The order in the manifest is the rule this pins.
    sale = "sale-same"
    g = grant(db, pkg, "cus-same", sale_id=sale)
    rid = spent_on(db, g, svc, sale)
    void_sale(db, sale)
    check(
        "the session spent on the voided sale comes back",
        [1, sale],
        [session(db, rid)["is_deleted"], session(db, rid)["refund_ref"]],
    )
    check(
        "… and the voucher, intact again, is voided with its sale",
        1,
        grant_trail(db, g)["is_deleted"],
    )


# ── 4 · the race with a till ─────────────────────────────────────────────────


def statements(door: tuple[str, dict]) -> str:
    name, params = door
    return (
        script_for(name, params).replace("BEGIN;\n", "", 1).replace("\nCOMMIT;", "", 1)
    )


def parked(db: ScratchDb, sessions: int) -> None:
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        n = int(
            db.scalar(
                "SELECT count(*) FROM pg_stat_activity "
                f"WHERE datname = '{db.name}' AND pid <> pg_backend_pid() "
                "AND (state LIKE 'idle in transaction%' OR wait_event_type = 'Lock')"
            )
        )
        if n >= sessions:
            return
        time.sleep(0.1)
    raise TimeoutError(f"{sessions} session(s) never settled in {db.name}")


def race(db: ScratchDb, first: tuple[str, dict], second: tuple[str, dict]) -> bool:
    """First door runs UNCOMMITTED, the second starts, then both commit in order. Answers whether
    the second was waiting on a lock when the first committed."""

    def psql():
        return subprocess.Popen(
            [
                "docker",
                "exec",
                "-i",
                CONTAINER,
                "psql",
                "-U",
                "postgres",
                "-d",
                db.name,
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    a, b = psql(), psql()
    try:
        a.stdin.write("BEGIN;\n" + statements(first) + "\n")
        a.stdin.flush()
        parked(db, 1)
        b.stdin.write("BEGIN;\n" + statements(second) + "\n")
        b.stdin.flush()
        parked(db, 2)
        blocked = (
            int(
                db.scalar(
                    "SELECT count(*) FROM pg_stat_activity "
                    f"WHERE datname = '{db.name}' AND wait_event_type = 'Lock'"
                )
            )
            > 0
        )
        for p in (a, b):
            p.stdin.write("COMMIT;\n")
            p.stdin.flush()
            p.stdin.close()
            p.wait(timeout=20)
    finally:
        for p in (a, b):
            if p.poll() is None:
                p.kill()
    return blocked


def the_till_wins_the_race(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n4 · a till holding a session of the sold voucher at the same instant: the void waits"
    )
    gid = grant(db, pkg, "cus-race", sale_id="sale-race")
    waited = race(db, hold_body(gid, svc), void_body("sale-race"))
    check("the void waited for the till", True, waited)
    check(
        "… and then voided the voucher with its sale",
        1,
        grant_trail(db, gid)["is_deleted"],
    )
    check(
        "… with the till's session still held on it",
        1,
        int(
            db.scalar(
                "SELECT count(*) FROM services_package_redemption "
                f"WHERE grant_id = '{gid}' AND is_deleted = 0"
            )
        ),
    )


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_sale_void")
    db.create()
    try:
        svc = seed_service(db, HUB)
        pkg = seed_package(db, HUB, svc)
        other_svc = seed_service(db, OTHER_HUB)
        other_pkg = seed_package(db, OTHER_HUB, other_svc)
        sessions_come_back(db, svc, pkg, other_svc, other_pkg)
        expired_and_unsigned(db, svc, pkg, other_svc, other_pkg)
        vouchers_sold_on_it(db, svc, pkg, other_pkg)
        sold_and_spent_on_the_same_sale(db, svc, pkg)
        the_till_wins_the_race(db, svc, pkg)
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ sale_void: voiding a paid sale gives back its sessions and voids the vouchers it sold, nothing else"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
