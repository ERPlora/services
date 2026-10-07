#!/usr/bin/env python3
"""services#154, services#157 — refunding IN FULL the sale that sold a voucher voids that voucher,
used or not, statement by statement.

`sales.refund` gives money back, not lines (SALES-F31): its `sale.refunded` says how much went
back and whether the sale is now refunded IN FULL (`fully_refunded`), never which line. So the only
refund that says «the voucher went back» is the one that returns the WHOLE ticket — then it is the
same as voiding it (SERVICES-F27), and the voucher sold on it goes the same way. A partial refund
cannot name the voucher's line, so it leaves the voucher alone.

`tests/sale_void.hub.test.py` proves the wiring against the real kernel (`sales`' own
`sale.refunded` reaches `services._on_sale_refunded`). This battery proves each guard against a
REAL Postgres:

  1. A FULL refund voids every voucher sold on that sale, used or not (services#157): the money
     goes back, so the voucher goes with it — what was already used stays used (its sessions are
     not touched, a session held at a till right now included) and what was left is lost. Stamped
     with who refunded it, when and the refund's reason — and nothing else is voided: not a manual
     grant that names the sale, not one sold on another sale, not one already voided (its trail is
     not re-stamped), not the neighbour hub's.
  2. A PARTIAL refund (or an event that does not say) voids nothing.
  3. A voucher with a session settled on the very sale being refunded is voided — and so is one
     also spent on another visit or at the chair; the listener does NOT give a session back itself —
     that is the return window's job (SERVICES-F26), which would otherwise answer «already
     returned».
  4. A redelivered `sale.refunded` touches nothing; a blank signer falls back to the caller.
  5. RACE: a till holding a session of the sold voucher at the same instant makes the refund
     WAIT; it then voids the voucher and leaves the till's session where the till put it.

Usage: tests/sale_refund.postgres.test.py   (exit 0 = green; SKIPPED without the container)
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

MANAGER = "u-manager"  # who refunds the sale, as `sale.refunded` carries it
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


def chair_session(
    db: ScratchDb, grant_id: str, sale_id: str | None, hub: str = HUB
) -> str:
    """A session spent at the chair (`services._redeem`), never settled with a sale."""
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
        hub=hub,
    )
    return rid


def refund_body(
    sale_id: str,
    *,
    fully_refunded=True,
    refunded_by: str = MANAGER,
    reason: str = "  Changed her mind  ",
):
    """`sale.refunded` as `sales` emits it; the listener binds the payload's fields by name."""
    body = {
        "sender": "sales",
        "sale_id": sale_id,
        "sale_number": "T-0001",
        "refund_id": f"ref-{uuid.uuid4().hex[:6]}",
        "refund_ref": "ref-x",
        "total": 10000,
        "reason": reason,
        "refunded_by": refunded_by,
        "refunded_at": NOW,
        "document_type": "ticket",
        "order_id": "order-x",
        "payments": [],
    }
    if fully_refunded is not None:
        body["fully_refunded"] = fully_refunded
    return "services._on_sale_refunded", body


def refund_sale(db: ScratchDb, sale_id: str, hub: str = HUB, **kw) -> int:
    name, params = refund_body(sale_id, **kw)
    return run(db, name, params, hub=hub)


def session(db: ScratchDb, rid: str) -> dict:
    return json.loads(
        db.scalar(
            "SELECT row_to_json(r) FROM (SELECT is_deleted, status, refunded_at, refund_ref "
            f"FROM services_package_redemption WHERE id = '{rid}') r"
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


# ── 1 · a full refund voids the intact vouchers it sold, and only those ───────


def full_refund_voids(
    db: ScratchDb, svc: str, pkg: str, other_svc: str, other_pkg: str
) -> None:
    print(
        "\n1 · a FULL refund voids the vouchers sold on that sale, used or not, and only those"
    )
    sale = "sale-r"
    intact = grant(db, pkg, "cus-r1", sale_id=sale)
    used = grant(db, pkg, "cus-r2", sale_id=sale)
    used_session = chair_session(db, used, "sale-later")
    held = grant(db, pkg, "cus-r3", sale_id=sale)
    held_session = hold(db, held, svc)
    stale = grant(db, pkg, "cus-r4", sale_id=sale)
    stale_hold = hold(db, stale, svc)
    released = grant(db, pkg, "cus-r8", sale_id=sale)
    run(
        db,
        "services.packages.release_hold",
        {"redemption_id": hold(db, released, svc)},
    )
    manual = grant(db, pkg, "cus-r5", sale_id=sale, source="manual")
    other = grant(db, pkg, "cus-r6", sale_id="sale-s")
    already = grant(db, pkg, "cus-r7", sale_id=sale)
    run(db, "services._void_grant", {"grant_id": already, "reason": "Wrong customer"})
    first_trail = grant_trail(db, already)
    # Rows no door writes, one per guard: deleted but never voided, and voided but not deleted.
    half_deleted = grant(db, pkg, "cus-r10", sale_id=sale)
    half_voided = grant(db, pkg, "cus-r11", sale_id=sale)
    db.psql(
        [],
        db=db.name,
        stdin=f"UPDATE services_package_grant SET is_deleted = 1 WHERE id = '{half_deleted}';\n"
        "UPDATE services_package_grant SET voided_at = '2026-08-01T00:00:00Z', voided_by = 'u-old', "
        f"void_reason = 'Old' WHERE id = '{half_voided}';\n",
    )
    half_trails = [grant_trail(db, half_deleted), grant_trail(db, half_voided)]
    theirs = grant(db, other_pkg, "cus-r1", sale_id=sale, hub=OTHER_HUB)
    # An intact voucher of this hub that a session of the NEIGHBOUR names by id: only the hub_id
    # of the in-use check keeps that foreign session from counting as a use.
    named = grant(db, pkg, "cus-r9", sale_id=sale)
    foreign_g = grant(db, other_pkg, "cus-r9", source="manual", hub=OTHER_HUB)
    foreign = chair_session(db, foreign_g, None, hub=OTHER_HUB)
    # A voucher of THIS hub whose session was spent at the neighbour on the same sale id: the
    # neighbour's settled row must not pass for a session of this refund.
    crossed = grant(db, pkg, "cus-r10", sale_id=sale)
    crossed_g = grant(db, other_pkg, "cus-r10", source="manual", hub=OTHER_HUB)
    crossed_s = spent_on(db, crossed_g, other_svc, sale, hub=OTHER_HUB)
    # The hold lapses AFTER every other hold above (each one sweeps lapsed holds first), so the
    # refund is what reads a hold that is still live in the table but past its deadline.
    db.psql(
        [],
        db=db.name,
        stdin="UPDATE services_package_redemption SET expires_at = '2026-08-17T10:00:00Z' "
        f"WHERE id = '{stale_hold}';\n"
        f"UPDATE services_package_redemption SET grant_id = '{named}' WHERE id = '{foreign}';\n"
        f"UPDATE services_package_redemption SET grant_id = '{crossed}' WHERE id = '{crossed_s}';\n",
    )

    touched = refund_sale(db, sale)
    trail = grant_trail(db, intact)
    check(
        "the intact voucher is voided (soft-deleted, the row stays)",
        1,
        trail["is_deleted"],
    )
    check("… stamped when", NOW, trail["voided_at"])
    check("… signed by whoever refunded the sale", MANAGER, trail["voided_by"])
    check(
        "… with the refund's reason, trimmed", "Changed her mind", trail["void_reason"]
    )
    check("… and nothing left to spend", None, remaining(db, "cus-r1", intact))
    used_trail = grant_trail(db, used)
    check(
        "a voucher already USED is voided with its sale's full refund too (services#157)",
        [1, NOW, MANAGER, "Changed her mind"],
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
    check("… with nothing left to spend", None, remaining(db, "cus-r2", used))
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
        "a voucher whose hold was undone at the till counts as intact and is voided",
        1,
        grant_trail(db, released)["is_deleted"],
    )
    check(
        "a neighbour's session naming this voucher's id does not make it used",
        1,
        grant_trail(db, named)["is_deleted"],
    )
    check(
        "a neighbour's session settled on the same sale id does not pass for this refund's",
        1,
        grant_trail(db, crossed)["is_deleted"],
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
        "a row deleted but not voided, or voided but not deleted, is not re-stamped",
        half_trails,
        [grant_trail(db, half_deleted), grant_trail(db, half_voided)],
    )
    check(
        "the neighbour hub's voucher on the same sale id stays live",
        0,
        grant_trail(db, theirs)["is_deleted"],
    )
    check("exactly the seven vouchers sold on this sale and still live were touched", 7, touched)

    print("\n1b · a redelivered `sale.refunded` touches nothing")
    check("the second delivery updates no row", 0, refund_sale(db, sale))
    check("… and the first trail stays as it was", trail, grant_trail(db, intact))



# ── 2 · a partial refund voids nothing ────────────────────────────────────────


def partial_refund_leaves_it(db: ScratchDb, pkg: str) -> None:
    print("\n2 · a PARTIAL refund cannot name the voucher's line: it voids nothing")
    sale = "sale-p"
    g = grant(db, pkg, "cus-p", sale_id=sale)
    check(
        "a partial refund updates no row",
        0,
        refund_sale(db, sale, fully_refunded=False),
    )
    check("… and the voucher stays live", 0, grant_trail(db, g)["is_deleted"])
    check("… with all its sessions", 5, remaining(db, "cus-p", g))
    check(
        "an event that does not say whether it is full voids nothing either",
        0,
        refund_sale(db, sale, fully_refunded=None),
    )
    check(
        "the refund that returns the last cent voids it",
        1,
        refund_sale(db, sale, fully_refunded=True),
    )
    check("… and now it is voided", 1, grant_trail(db, g)["is_deleted"])


# ── 3 · sold and spent on the same ticket ─────────────────────────────────────


def sold_and_spent_on_the_same_sale(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n3 · a voucher whose only session was spent on the very sale refunded is voided too"
    )
    # A session settled by the API on the very sale that sold the voucher (the till cannot: the
    # voucher is minted when the sale completes). Refunding that ticket in full returns both, as
    # the void does; counting that session as a use would leave her the money AND four sessions.
    sale = "sale-same"
    g = grant(db, pkg, "cus-same", sale_id=sale)
    rid = spent_on(db, g, svc, sale)
    refund_sale(db, sale)
    check(
        "the voucher is voided with its sale's full refund",
        1,
        grant_trail(db, g)["is_deleted"],
    )
    s = session(db, rid)
    check(
        "the session itself is left to the return window (SERVICES-F26), not given back here",
        [0, "consumed", None],
        [s["is_deleted"], s["status"], s["refunded_at"]],
    )

    print("\n3b · … and one also spent on another visit is voided as well")
    sale2 = "sale-same-2"
    g2 = grant(db, pkg, "cus-same-2", sale_id=sale2)
    spent_on(db, g2, svc, sale2)
    spent_on(db, g2, svc, "sale-next-visit")
    refund_sale(db, sale2)
    check(
        "a voucher also spent on ANOTHER sale is voided with its sale's full refund",
        1,
        grant_trail(db, g2)["is_deleted"],
    )

    print(
        "\n3c · … and so is one spent at the chair that only names the sale"
    )
    sale3 = "sale-same-3"
    g3 = grant(db, pkg, "cus-same-3", sale_id=sale3)
    chair_session(db, g3, sale3)
    refund_sale(db, sale3)
    check(
        "a voucher spent at the chair (never settled) is voided too",
        1,
        grant_trail(db, g3)["is_deleted"],
    )


# ── 4 · the signer ───────────────────────────────────────────────────────────


def unsigned(db: ScratchDb, pkg: str) -> None:
    print("\n4 · a refund without its operator is signed by the caller")
    sale = "sale-u"
    g = grant(db, pkg, "cus-u", sale_id=sale)
    refund_sale(db, sale, refunded_by="   ", reason="Gone")
    check("signed by the caller", USER, grant_trail(db, g)["voided_by"])


# ── 5 · the race with a till ─────────────────────────────────────────────────


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
        "\n5 · a till holding a session of the sold voucher at the same instant: the refund waits"
    )
    gid = grant(db, pkg, "cus-race", sale_id="sale-race")
    waited = race(db, hold_body(gid, svc), refund_body("sale-race"))
    check("the refund waited for the till", True, waited)
    check(
        "… and then voided the voucher with its sale",
        1,
        grant_trail(db, gid)["is_deleted"],
    )


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_sale_refund")
    db.create()
    try:
        svc = seed_service(db, HUB)
        pkg = seed_package(db, HUB, svc)
        other_svc = seed_service(db, OTHER_HUB)
        other_pkg = seed_package(db, OTHER_HUB, other_svc)
        full_refund_voids(db, svc, pkg, other_svc, other_pkg)
        partial_refund_leaves_it(db, pkg)
        sold_and_spent_on_the_same_sale(db, svc, pkg)
        unsigned(db, pkg)
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
        "✓ sale_refund: a full refund voids the vouchers sold on the sale, used or not, nothing else"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
