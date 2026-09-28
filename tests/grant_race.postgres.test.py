#!/usr/bin/env python3
"""services#120 — a void (or a balance correction) racing a till on the SAME voucher: only one wins.

Every door that decides on a grant re-checks its rule inside its own transaction — the void's «no
session spent or held», the correction's floor «never below what is spent», the hold's and the
redeem's «sessions left, not voided». Under READ COMMITTED those re-checks read a snapshot, and
the two sides of each pair write DIFFERENT rows: the till inserts a redemption, the void updates
the grant, the correction inserts a movement. Nothing makes the second one wait for the first, so
each reads the world before the other committed and BOTH land — a write skew:

  * a voided voucher with a session held or spent at the till;
  * a corrected voucher whose sessions left are fewer than the sessions already spent.

What is proven here, with TWO REAL CONCURRENT SESSIONS against Postgres: the first door is left
UNCOMMITTED, the second one is started, then the first commits and then the second. For every
pair, in both orders:

  1. the second door WAITS for the first (it is blocked on the voucher's row, observed in
     `pg_stat_activity`) — the doors are queued per voucher;
  2. only ONE of the two effects survives, and it is the first one's: the late door reads what
     the first one committed and refuses.

Usage: tests/grant_race.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import subprocess
import sys
import time
import uuid

from pg_harness import (
    CONTAINER,
    HUB,
    OTHER_HUB,
    ScratchDb,
    container_available,
    script_for,
)

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


def seed_service(db: ScratchDb) -> str:
    db.run_command(
        "services.services.create",
        {
            "name": "Corte",
            "price": 2500,
            "duration_minutes": 30,
            "tax_category_key": "standard",
        },
    )
    return db.scalar(
        f"SELECT id FROM services_service WHERE hub_id = '{HUB}' AND name = 'Corte'"
    )


def seed_package(db: ScratchDb, name: str, service_id: str, max_uses: int) -> str:
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
    )
    return package_id


def seed_grant(db: ScratchDb, package_id: str, customer: str) -> str:
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
                "granted_at": "2026-08-18T09:00:00Z",
                "source": "manual",
                "sale_id": None,
                "sale_ref": "",
                "amount_cents": 10000,
                "net_amount_cents": 8264,
                "tax_amount_cents": 1736,
                "note": "",
            },
        ),
    )
    return grant_id


# ── the doors, as the dispatcher runs them ───────────────────────────────────


def void_body(grant_id: str) -> tuple[str, dict]:
    return "services._void_grant", {"grant_id": grant_id, "reason": "Sold twice"}


def hold_body(grant_id: str, service_id: str) -> tuple[str, dict]:
    return "services._hold", {
        "redemption_id": str(uuid.uuid4()),
        "grant_id": grant_id,
        "service_id": service_id,
        "checkout_ref": f"chk-{uuid.uuid4().hex[:6]}",
        "line_ref": "l1",
        "note": "",
    }


def redeem_body(grant_id: str) -> tuple[str, dict]:
    return "services._redeem", {
        "redemption_id": str(uuid.uuid4()),
        "grant_id": grant_id,
        "appointment_id": None,
        "sale_id": None,
        "note": "",
    }


def correction_body(grant_id: str, uses_delta: int) -> tuple[str, dict]:
    return "services._adjust_grant", {
        "adjustment_id": str(uuid.uuid4()),
        "grant_id": grant_id,
        "uses_delta": uses_delta,
        "days_delta": 0,
        "reason": "Spent twice by mistake",
    }


def statements(door: tuple[str, dict]) -> str:
    """The command's `sql[]` without its BEGIN/COMMIT: the race opens and closes it by hand."""
    name, params = door
    return (
        script_for(name, params).replace("BEGIN;\n", "", 1).replace("\nCOMMIT;", "", 1)
    )


def waiting_on_a_lock(db: ScratchDb) -> int:
    """Backends of THIS scratch database blocked on a heavyweight lock right now."""
    return int(
        db.scalar(
            "SELECT count(*) FROM pg_stat_activity "
            f"WHERE datname = '{db.name}' AND wait_event_type = 'Lock'"
        )
    )


def settle(db: ScratchDb, sessions: int) -> None:
    """Wait until `sessions` backends of THIS scratch database are parked: done with what they were
    sent (idle inside their open transaction) or blocked on a lock.

    🔴 Not a fixed sleep: under a loaded machine `docker exec` can take longer than any sleep to
    start psql, the second door then locks the voucher FIRST and the first one waits on it — the
    race is inverted and the harness deadlocks on its own COMMIT order (seen once at load 27)."""
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        parked = int(
            db.scalar(
                "SELECT count(*) FROM pg_stat_activity "
                f"WHERE datname = '{db.name}' AND pid <> pg_backend_pid() "
                "AND (state LIKE 'idle in transaction%' OR wait_event_type = 'Lock')"
            )
        )
        if parked >= sessions:
            return
        time.sleep(0.1)
    raise TimeoutError(f"{sessions} session(s) never settled in {db.name}")


def race(db: ScratchDb, first: tuple[str, dict], second: tuple[str, dict]) -> bool:
    """First door runs and stays UNCOMMITTED; the second starts; then first commits, then second.

    Returns whether the second door was WAITING on the first when the first committed. A door that
    fails inside its transaction (the `services__gate` CHECK of a refused hold) turns its COMMIT
    into a ROLLBACK, exactly like the runtime's transaction."""

    def session():
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

    a, b = session(), session()
    try:
        a.stdin.write("BEGIN;\n" + statements(first) + "\n")
        a.stdin.flush()
        settle(db, 1)  # A has done its work and holds whatever it locked, uncommitted.
        b.stdin.write("BEGIN;\n" + statements(second) + "\n")
        b.stdin.flush()
        settle(db, 2)  # B is now blocked behind A — or, unqueued, already through.
        blocked = waiting_on_a_lock(db) > 0
        a.stdin.write("COMMIT;\n")
        a.stdin.flush()
        a.stdin.close()
        a.wait(timeout=20)
        b.stdin.write("COMMIT;\n")
        b.stdin.flush()
        b.stdin.close()
        b.wait(timeout=20)
    finally:
        for p in (a, b):
            if p.poll() is None:
                p.kill()
    return blocked


# ── what survived ────────────────────────────────────────────────────────────


def voided(db: ScratchDb, grant_id: str) -> bool:
    return (
        db.scalar(
            "SELECT count(*) FROM services_package_grant "
            f"WHERE id = '{grant_id}' AND is_deleted = 1 AND voided_at IS NOT NULL"
        )
        == "1"
    )


def live_sessions(db: ScratchDb, grant_id: str) -> int:
    return int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )


def movements(db: ScratchDb, grant_id: str) -> int:
    return int(
        db.scalar(
            "SELECT count(*) FROM services_package_grant_adjustment "
            f"WHERE grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )


# ── the races ────────────────────────────────────────────────────────────────


def a_till_first_then_the_void(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n1 · a till holds a session, the void arrives before it commits → the void loses"
    )
    g = seed_grant(db, pkg, "cus-hold-void")
    check(
        "the void WAITED for the till", True, race(db, hold_body(g, svc), void_body(g))
    )
    check("the session stays held", 1, live_sessions(db, g))
    check("…and the voucher is NOT voided", False, voided(db, g))

    print(
        "\n2 · a till spends a session at the chair, the void arrives before it commits"
    )
    g = seed_grant(db, pkg, "cus-redeem-void")
    check(
        "the void WAITED for the redeem", True, race(db, redeem_body(g), void_body(g))
    )
    check("the session stays spent", 1, live_sessions(db, g))
    check("…and the voucher is NOT voided", False, voided(db, g))


def the_void_first_then_a_till(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n3 · the void runs first, a till tries to hold before it commits → the till loses"
    )
    g = seed_grant(db, pkg, "cus-void-hold")
    check(
        "the till WAITED for the void", True, race(db, void_body(g), hold_body(g, svc))
    )
    check("the voucher is voided", True, voided(db, g))
    check("…and no session was held on it", 0, live_sessions(db, g))

    print(
        "\n4 · the void runs first, a till tries to spend at the chair before it commits"
    )
    g = seed_grant(db, pkg, "cus-void-redeem")
    check(
        "the redeem WAITED for the void", True, race(db, void_body(g), redeem_body(g))
    )
    check("the voucher is voided", True, voided(db, g))
    check("…and no session was spent on it", 0, live_sessions(db, g))


def a_correction_racing_a_till(db: ScratchDb, svc: str, two: str) -> None:
    # A voucher of 2 sessions with 1 already spent: ONE left. The till takes it, the correction
    # takes it away — each alone is fine, both together leave 1 session for 2 spent.
    print(
        "\n5 · a till holds the last session, a correction of −1 arrives before it commits"
    )
    g = seed_grant(db, two, "cus-hold-fix")
    db.psql([], db=db.name, stdin=script_for(*redeem_body(g)))
    check(
        "the correction WAITED for the till",
        True,
        race(db, hold_body(g, svc), correction_body(g, -1)),
    )
    check("both sessions are spent", 2, live_sessions(db, g))
    check("…and the correction was NOT written", 0, movements(db, g))

    print("\n6 · a correction of −1 runs first, a till tries to spend the last session")
    g = seed_grant(db, two, "cus-fix-redeem")
    db.psql([], db=db.name, stdin=script_for(*redeem_body(g)))
    check(
        "the redeem WAITED for the correction",
        True,
        race(db, correction_body(g, -1), redeem_body(g)),
    )
    check("the correction was written", 1, movements(db, g))
    check("…and the till did NOT spend past it", 1, live_sessions(db, g))

    print("\n7 · a correction of −1 runs first, a till tries to HOLD the last session")
    g = seed_grant(db, two, "cus-fix-hold")
    db.psql([], db=db.name, stdin=script_for(*redeem_body(g)))
    check(
        "the hold WAITED for the correction",
        True,
        race(db, correction_body(g, -1), hold_body(g, svc)),
    )
    check("the correction was written", 1, movements(db, g))
    check("…and the till did NOT hold past it", 1, live_sessions(db, g))

    print(
        "\n8 · a till spends the last session at the chair, a correction of −1 arrives"
    )
    g = seed_grant(db, two, "cus-redeem-fix")
    db.psql([], db=db.name, stdin=script_for(*redeem_body(g)))
    check(
        "the correction WAITED for the redeem",
        True,
        race(db, redeem_body(g), correction_body(g, -1)),
    )
    check("both sessions are spent", 2, live_sessions(db, g))
    check("…and the correction was NOT written", 0, movements(db, g))


def another_hub_never_queues_behind_this_one(db: ScratchDb, svc: str, pkg: str) -> None:
    # The lock is per voucher AND per hub: a door of another hub carrying this voucher's id (a
    # forged or stale id) locks nothing here. If it did, one hub could stall another's till.
    print(
        "\n9 · a till of this hub holds a session, ANOTHER hub voids the same id → it does not wait"
    )
    g = seed_grant(db, pkg, "cus-tenancy")
    name, params = void_body(g)
    check(
        "the other hub's void did NOT wait on this hub's voucher",
        False,
        race(db, hold_body(g, svc), (name, {**params, "hub_id": OTHER_HUB})),
    )
    check("the session stays held", 1, live_sessions(db, g))
    check("…and this hub's voucher is NOT voided", False, voided(db, g))


def main() -> int:
    if not container_available():
        print(f"SKIPPED: container {CONTAINER} not available")
        return 0
    db = ScratchDb("services_grant_race")
    db.create()
    try:
        svc = seed_service(db)
        five = seed_package(db, "Bono cinco", svc, max_uses=5)
        two = seed_package(db, "Bono dos", svc, max_uses=2)
        a_till_first_then_the_void(db, svc, five)
        the_void_first_then_a_till(db, svc, five)
        a_correction_racing_a_till(db, svc, two)
        another_hub_never_queues_behind_this_one(db, svc, five)
    finally:
        db.drop()

    if failures:
        print(f"\n✗ {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "\n✓ a void or a correction racing a till on the same voucher: one wins, never both"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
