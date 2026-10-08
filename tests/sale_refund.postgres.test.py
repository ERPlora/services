#!/usr/bin/env python3
"""services#154, services#157, services#158 — refunding the sale that sold a voucher voids that
voucher, used or not, statement by statement: when the WHOLE sale goes back, or when the refund
names the voucher's line.

`sale.refunded` says how much went back, whether the sale is now refunded IN FULL
(`fully_refunded`) and which lines went back with the money (`lines`, SALES-F31). A full refund is
the same as voiding the sale (SERVICES-F27): every voucher sold on it goes. A partial refund voids
the vouchers of the lines it names — and only as many as went back — and one that names no line
(money only) leaves them alone.

`tests/sale_void.hub.test.py` proves the wiring against the real kernel (`sales`' own
`sale.refunded` reaches `services._on_sale_refunded`). This battery proves each guard against a
REAL Postgres:

  1. A FULL refund voids every voucher sold on that sale, used or not (services#157): the money
     goes back, so the voucher goes with it — what was already used stays used (its sessions are
     not touched, a session held at a till right now included) and what was left is lost. Stamped
     with who refunded it, when and the refund's reason — and nothing else is voided: not a manual
     grant that names the sale, not one sold on another sale, not one already voided (its trail is
     not re-stamped), not the neighbour hub's.
  2. A PARTIAL refund that names no line (or an event that does not say) voids nothing.
  3. A voucher with a session settled on the very sale being refunded is voided — and so is one
     also spent on another visit or at the chair; the listener does NOT give a session back itself —
     that is the return window's job (SERVICES-F26), which would otherwise answer «already
     returned».
  4. A redelivered `sale.refunded` touches nothing; a blank signer falls back to the caller.
  5. RACE: a till holding a session of the sold voucher at the same instant makes the refund
     WAIT; it then voids the voucher and leaves the till's session where the till put it.
  6. A PARTIAL refund that names the voucher's line voids that voucher (services#158): as many as
     units went back, the intact ones before a used one, never one of another line, package, sale or
     hub, never a manual grant; a redelivery voids nothing more, and a later refund of the other
     line of the same package takes the NEXT voucher, not the one already voided.

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


def seed_package(
    db: ScratchDb, hub: str, service_id: str, name: str = "Five haircuts"
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
    lines: list | None = None,
    refund_id: str | None = None,
):
    """`sale.refunded` as `sales` emits it; the listener binds the payload's fields by name."""
    body = {
        "sender": "sales",
        "sale_id": sale_id,
        "sale_number": "T-0001",
        "refund_id": refund_id or f"ref-{uuid.uuid4().hex[:6]}",
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
    if lines is not None:
        # The kernel binds a JSON array as its JSON text.
        body["lines"] = json.dumps(lines)
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
        [
            session(db, used_session)["is_deleted"],
            session(db, used_session)["refunded_at"],
        ],
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
        [
            session(db, held_session)["is_deleted"],
            session(db, held_session)["refunded_at"],
        ],
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
    check(
        "exactly the seven vouchers sold on this sale and still live were touched",
        7,
        touched,
    )

    print("\n1b · a redelivered `sale.refunded` touches nothing")
    check("the second delivery updates no row", 0, refund_sale(db, sale))
    check("… and the first trail stays as it was", trail, grant_trail(db, intact))


# ── 2 · a partial refund voids nothing ────────────────────────────────────────


def partial_refund_leaves_it(db: ScratchDb, pkg: str) -> None:
    print("\n2 · a PARTIAL refund that names no line voids nothing")
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

    print("\n3c · … and so is one spent at the chair that only names the sale")
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


# ── 6 · a partial refund that names the voucher's line ────────────────────────


def line(line_id: str, product_id: str, units: int = 1) -> dict:
    """One entry of `sale.refunded.lines`, as `sales` emits it (quantity in 10⁶ fixed point)."""
    return {"line_id": line_id, "product_id": product_id, "quantity": units * 1_000_000}


def live(db: ScratchDb, gids: list[str]) -> list[int]:
    return [grant_trail(db, g)["is_deleted"] for g in gids]


def returned_line_voids_its_voucher(
    db: ScratchDb, svc: str, pkg: str, other_pkg: str
) -> None:
    print(
        "\n6 · a PARTIAL refund that names the voucher's line voids that voucher (services#158)"
    )
    pkg_b = seed_package(db, HUB, svc, name="Three colours")
    sale = "sale-line"
    voucher = grant(db, pkg, "cus-line", sale_id=sale)
    kept = grant(db, pkg_b, "cus-line", sale_id=sale)
    manual = grant(db, pkg, "cus-line", sale_id=sale, source="manual")
    elsewhere = grant(db, pkg, "cus-line", sale_id="sale-line-other")
    neighbour = grant(db, other_pkg, "cus-line", sale_id=sale, hub=OTHER_HUB)
    ref = "ref-line-1"
    body_lines = [line("li-cut", svc), line("li-voucher", pkg)]
    check(
        "returning the voucher's line (and a haircut) voids exactly one voucher",
        1,
        refund_sale(db, sale, fully_refunded=False, lines=body_lines, refund_id=ref),
    )
    trail = grant_trail(db, voucher)
    check(
        "the voucher of that line is voided, stamped like the full refund",
        [1, MANAGER, "Changed her mind"],
        [trail["is_deleted"], trail["voided_by"], trail["void_reason"]],
    )
    check(
        "… and nothing else: not the other line's voucher, the manual grant, another sale's",
        [0, 0, 0],
        live(db, [kept, manual, elsewhere]),
    )
    check(
        "… nor the neighbour hub's",
        0,
        grant_trail(db, neighbour)["is_deleted"],
    )
    print("\n6b · a redelivered refund voids nothing more")
    check(
        "the same refund delivered again updates no row",
        0,
        refund_sale(db, sale, fully_refunded=False, lines=body_lines, refund_id=ref),
    )
    check("… and its trail stays as it was", trail, grant_trail(db, voucher))

    print(
        "\n6c · a line of N units voids N vouchers; two lines of one package, two vouchers"
    )
    sale2 = "sale-line-2"
    g = [grant(db, pkg, "cus-line-2", sale_id=sale2) for _ in range(5)]
    check(
        "a line of two units voids two vouchers",
        2,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-two", pkg, units=2)],
            refund_id="ref-line-2a",
        ),
    )
    check(
        "… and redelivering it, with three vouchers still live, voids none of them",
        0,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-two", pkg, units=2)],
            refund_id="ref-line-2a",
        ),
    )
    check(
        "two lines of the same package in one refund void two DIFFERENT vouchers",
        2,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-a", pkg), line("li-b", pkg)],
            refund_id="ref-line-2b",
        ),
    )
    check(
        "… each of its lines answered by its own voucher",
        "li-a,li-b",
        db.scalar(
            "SELECT string_agg(void_sale_item_id, ',' ORDER BY void_sale_item_id) "
            "FROM services_package_grant WHERE void_refund_id = 'ref-line-2b'"
        ),
    )
    check(
        "… so redelivering that two-line refund voids none of the live ones",
        0,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-a", pkg), line("li-b", pkg)],
            refund_id="ref-line-2b",
        ),
    )
    check(
        "a later refund of another line takes the next voucher, not one already voided",
        1,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-c", pkg)],
            refund_id="ref-line-2c",
        ),
    )
    check("… five lines back, five vouchers gone", [1, 1, 1, 1, 1], live(db, g))
    check(
        "a line with nothing left to void is not an error",
        0,
        refund_sale(
            db,
            sale2,
            fully_refunded=False,
            lines=[line("li-d", pkg)],
            refund_id="ref-line-2d",
        ),
    )

    print(
        "\n6d · of two identical vouchers, the intact one goes back, not the used one"
    )
    sale3 = "sale-line-3"
    used = grant(db, pkg, "cus-line-3", sale_id=sale3)
    spent_on(db, used, svc, "sale-next-visit-3")
    intact = grant(db, pkg, "cus-line-3", sale_id=sale3)
    refund_sale(
        db,
        sale3,
        fully_refunded=False,
        lines=[line("li-one", pkg)],
        refund_id="ref-line-3",
    )
    check(
        "the intact voucher is voided, the used one stays",
        [0, 1],
        live(db, [used, intact]),
    )
    print("\n6e · … and a used one is voided too when it is the one that went back")
    refund_sale(
        db,
        sale3,
        fully_refunded=False,
        lines=[line("li-two", pkg)],
        refund_id="ref-line-3b",
    )
    check(
        "the used voucher is voided, used or not (services#157)",
        1,
        grant_trail(db, used)["is_deleted"],
    )

    print("\n6f · the neighbour hub's voucher of the named package is never touched")
    sale4 = "sale-line-4"
    theirs = grant(db, other_pkg, "cus-line-4", sale_id=sale4, hub=OTHER_HUB)
    check(
        "a refund in this hub naming the neighbour's package voids nothing",
        0,
        refund_sale(
            db,
            sale4,
            fully_refunded=False,
            lines=[line("li-x", other_pkg)],
            refund_id="ref-line-4",
        ),
    )
    check("… and their voucher stays live", 0, grant_trail(db, theirs)["is_deleted"])

    print(
        "\n6f-bis · … not even a neighbour's row that names this hub's package and sorts first"
    )
    # Only a row written by hand can name another hub's package (the package id is the table's
    # key and `_grant` checks the package's hub). This one also sorts before this hub's voucher, so
    # it would take the first slot of the line if the candidates were not read from this hub only.
    sale5 = "sale-line-cross"
    ours = grant(db, pkg, "cus-line-cross", sale_id=sale5)
    stray = grant(db, other_pkg, "cus-line-cross", sale_id=sale5, hub=OTHER_HUB)
    db.psql(
        [
            "-c",
            f"UPDATE services_package_grant SET package_id = '{pkg}', "
            f"granted_at = '2000-01-01T00:00:00+00:00' WHERE id = '{stray}'",
        ],
        db=db.name,
    )
    check(
        "the refund voids this hub's voucher of the line",
        1,
        refund_sale(
            db,
            sale5,
            fully_refunded=False,
            lines=[line("li-cross", pkg)],
            refund_id="ref-line-cross",
        ),
    )
    check(
        "… this hub's, not the neighbour's stray row",
        [1, 0],
        [grant_trail(db, ours)["is_deleted"], grant_trail(db, stray)["is_deleted"]],
    )
    print(
        "\n6g · the neighbour hub answering the same refund line does not stop this hub's void"
    )
    sale6 = "sale-line-twin"
    mine = grant(db, pkg, "cus-line-twin", sale_id=sale6)
    twin = grant(db, other_pkg, "cus-line-twin", sale_id=sale6, hub=OTHER_HUB)
    twin_lines = [line("li-twin", other_pkg)]
    run(
        db,
        *refund_body(
            sale6, fully_refunded=False, lines=twin_lines, refund_id="ref-twin"
        ),
        hub=OTHER_HUB,
    )
    check(
        "the neighbour's voucher is voided in its own hub",
        1,
        grant_trail(db, twin)["is_deleted"],
    )
    check(
        "… and this hub's refund with the same ids still voids its own",
        1,
        refund_sale(
            db,
            sale6,
            fully_refunded=False,
            lines=[line("li-twin", pkg)],
            refund_id="ref-twin",
        ),
    )
    check("… so this hub's voucher is voided", 1, grant_trail(db, mine)["is_deleted"])

    print(
        "\n6h · a returned line that names no line id voids nothing: it could not be answered once"
    )
    sale7 = "sale-line-noid"
    anonymous = grant(db, pkg, "cus-line-noid", sale_id=sale7)
    check(
        "a line without its id voids nothing",
        0,
        refund_sale(
            db,
            sale7,
            fully_refunded=False,
            lines=[{"product_id": pkg, "quantity": 1_000_000}],
            refund_id="ref-noid",
        ),
    )
    check("… and the voucher stays live", 0, grant_trail(db, anonymous)["is_deleted"])

    print(
        "\n6i · a till holding a session of that voucher at the same instant: the refund waits"
    )
    sale5 = "sale-line-race"
    raced = grant(db, pkg, "cus-line-race", sale_id=sale5)
    waited = race(
        db,
        hold_body(raced, svc),
        refund_body(
            sale5,
            fully_refunded=False,
            lines=[line("li-race", pkg)],
            refund_id="ref-line-race",
        ),
    )
    check("the line refund waited for the till", True, waited)
    check(
        "… and then voided the voucher of the line",
        1,
        grant_trail(db, raced)["is_deleted"],
    )

    print(
        "\n6j · two vouchers of the line, a till holding a session of the first at the same instant:"
        " the refund picks AFTER the till, so the intact one goes"
    )
    sale6 = "sale-line-race-2"
    pair = [grant(db, pkg, "cus-line-race-2", sale_id=sale6) for _ in range(2)]
    first = db.scalar(
        "SELECT id FROM services_package_grant "
        f"WHERE sale_id = '{sale6}' ORDER BY granted_at, sale_ref, id LIMIT 1"
    )
    other = next(g for g in pair if g != first)
    waited = race(
        db,
        hold_body(first, svc),
        refund_body(
            sale6,
            fully_refunded=False,
            lines=[line("li-race-2", pkg)],
            refund_id="ref-line-race-2",
        ),
    )
    check("the line refund waited for the till", True, waited)
    check(
        "… and voided the intact voucher, not the one the till just used",
        [0, 1],
        live(db, [first, other]),
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
        returned_line_voids_its_voucher(db, svc, pkg, other_pkg)
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ sale_refund: a full refund, or the refund of a voucher's line, voids that voucher, used or"
        " not, nothing else"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
