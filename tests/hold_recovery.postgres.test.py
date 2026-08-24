#!/usr/bin/env python3
"""services#77 — a taken voucher hold SURVIVES a reload, and an abandoned one frees itself.

Against a REAL Postgres, through the manifest's own SQL.

THE BUG THIS REPRODUCES. `services.packages.hold_for_line` spends the session the instant the
cashier taps «pay with voucher»: the row lands as `held` and counts against `max_uses` from that
moment. The `redemption_id` it hands back is the ONLY key that can undo it — and until this issue
it lived nowhere but the component's memory. So a reload (the wifi drops and the shell restarts,
the cashier hits F5, Android kills the tab, the shift moves to another device) left the salon with
no way out at all:

  * charging now bills the FULL price — the host does not know the line is covered — so the
    customer pays for the haircut AND loses the session;
  * redeeming again is refused by `uq_services_redemption_line`, which is exactly the guard that
    must be there;
  * undoing is impossible, because `services.packages.release_hold` needs the `redemption_id` the
    reload took with it.

That is Mindbody's failure by the other door: the session is stuck to something nobody can let go
of. The test below reproduces it with the only four values a remounted component actually has —
`customer_id`, `service_id`, `checkout_ref`, `line_ref` — and proves that no DECLARED read turns
them back into a hold.

WHAT THE FIX HAS TO GUARANTEE, and what each section proves:

  A. the session really is spent by the hold (the premise, reproduced before anything is fixed);
  B. 🔴 the reload RECOVERS it: `services.packages.holds_for_checkout` enumerates the live holds
     of an open checkout, so the screen comes back with its «undo» and its counter;
  C. the recovered id undoes the hold for real and the session comes back;
  D. it is scoped to THIS hub, with a LIVE neighbour holding the same checkout ref — a tenancy
     test against an empty table proves nothing;
  E. a settled hold does NOT come back (the sale was paid; undoing it is a refund and has its own
     door), and neither does a released one;
  F. a checkout with no holds answers an empty list, never an error;
  G. 🔴 the ABANDONED hold frees itself: it carries a server-set deadline, and once it passes the
     session is given back — soft-deleted and stamped `expired`, so the ledger tells «nobody came
     back» apart from «somebody decided»;
  H. 🔴 the reclaim does NOT depend on the scheduler running: the hold command expires the stale
     rows of the hub in its OWN transaction, before it counts. A cron that never fires is the
     WooCommerce failure this module refuses to inherit;
  I. idempotence and atomicity: expiring twice, releasing twice, or recovering twice cannot move
     the counter, and the whole thing is conditional UPDATEs — never check-then-act.

Usage: tests/hold_recovery.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import re
import sys
import uuid

from pg_harness import (
    HUB,
    MANIFEST,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
    lower_bridges,
    query_sql,
    script_for,
)

failures: list[str] = []

# The checkout that gets abandoned. `NOW` is 2026-08-18T10:00:00Z.
LATER = "2026-08-18T10:20:00Z"
MUCH_LATER = "2026-08-19T10:00:00Z"


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


# ── seeding (same shapes as tests/voucher_tender.postgres.test.py) ────────────


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
    db: ScratchDb, hub: str, name: str, max_uses, validity_days=None
) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": f"{name.lower().replace(' ', '-')}-{package_id[:8]}",
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
    db: ScratchDb, package_id: str, customer: str, hub: str = HUB, granted_at: str = NOW
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


# ── the doors under test ─────────────────────────────────────────────────────


def rows_of(db: ScratchDb, sql: str) -> list[dict]:
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def options(
    db: ScratchDb, customer: str, service_id: str, hub: str = HUB, now: str = NOW
):
    return rows_of(
        db,
        query_sql(
            "services.packages.tender_options",
            {"customer_id": customer, "service_id": service_id, "now": now},
            hub=hub,
        ),
    )


def hold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout_ref: str,
    line_ref: str,
    hub: str = HUB,
    now: str = NOW,
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
                "now": now,
            },
            hub=hub,
        ),
    )
    return rid


def _rows_touched(db: ScratchDb, command: str, params: dict, hub: str = HUB) -> int:
    """Run a manifest command and report how many rows its statements touched.

    `expect_rows` is the runtime's, not the database's: what the SQL itself has to guarantee is
    exactly this count, so that is what is asserted.
    """
    out = db.psql(["-e"], db=db.name, stdin=script_for(command, params, hub=hub))
    return sum(
        int(m.group(1)) for m in re.finditer(r"^UPDATE (\d+)$", out, re.MULTILINE)
    )


def release(db: ScratchDb, redemption_id: str, hub: str = HUB) -> int:
    return _rows_touched(
        db, "services.packages.release_hold", {"redemption_id": redemption_id}, hub
    )


def settle(db: ScratchDb, redemption_id: str, sale_id: str, hub: str = HUB) -> int:
    return _rows_touched(
        db,
        "services.packages.settle_hold",
        {"redemption_id": redemption_id, "sale_id": sale_id},
        hub,
    )


def expire_holds(db: ScratchDb, now: str, hub: str = HUB) -> int:
    """The sweep. It TIDIES the table; the hold command reclaims on its own (section H)."""
    return _rows_touched(db, "services.packages.expire_holds", {"now": now}, hub)


# ── the reload, reproduced ───────────────────────────────────────────────────

# What a remounted `erp-services-voucher-tender` actually has. Four strings the host re-emits on
# every mount (the slot contract of `sales`) and NOTHING else: the `redemption_id` went with the
# component's memory.
SLOT_PROPS = ("customer_id", "service_id", "checkout_ref", "line_ref")


def recover_after_reload(
    db: ScratchDb, checkout_ref: str, hub: str = HUB, now: str = NOW
) -> list[dict]:
    """Every live hold of an open checkout, through a DECLARED read and nothing else.

    🔴 This is the reproduction, and it is deliberately not a `grep` over the manifest: it asks the
    module the only question a reloaded screen can ask — «what did I already hold on this
    checkout?» — using only the props the host hands back. Before services#77 no declared query
    took `checkout_ref` at all, so the answer did not exist and the session was stuck.
    """
    name = "services.packages.holds_for_checkout"
    query = MANIFEST["queries"].get(name)
    if query is None:
        raise RuntimeError(
            f"no declared read answers «which holds does {checkout_ref} already have?»: "
            f"the reloaded screen only has {', '.join(SLOT_PROPS)} and none of the "
            f"{len(MANIFEST['queries'])} queries takes checkout_ref"
        )
    return rows_of(db, query_sql(name, {"checkout_ref": checkout_ref, "now": now}, hub=hub))


def live_uses(db: ScratchDb, grant_id: str) -> int:
    return int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )


def guard_residue(db: ScratchDb) -> int:
    return int(db.scalar("SELECT count(*) FROM services__gate"))


# ── the run ──────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_hold_recovery_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")

        print("A. the premise: the hold SPENDS the session there and then")
        one = seed_package(db, HUB, "Bono 1 corte", max_uses=1)
        seed_item(db, HUB, one, cut)
        grant = seed_grant(db, one, "cus-1")
        check(
            "the voucher is offered before anything is held",
            1,
            len(options(db, "cus-1", cut)),
        )
        taken = hold(db, grant, cut, "chk-1", "l1")
        check("the session is spent", 1, live_uses(db, grant))
        check("and the voucher is no longer offered", [], options(db, "cus-1", cut))

        print(
            "\nB. 🔴 THE RELOAD — the screen comes back with only the four slot props"
        )
        del (
            taken
        )  # the `redemption_id` left with the component's memory. This is the bug.
        recovered = recover_after_reload(db, "chk-1")
        check("the hold is found again", 1, len(recovered))
        row = recovered[0] if recovered else {}
        check("it names the line it covers", "l1", row.get("line_ref"))
        check("and the service", cut, row.get("service_id"))
        check(
            "it hands back the key that undoes it", True, bool(row.get("redemption_id"))
        )
        check(
            "with the voucher's name, so the screen can say WHICH",
            "Bono 1 corte",
            row.get("package_name"),
        )
        check("the grant it is spending", grant, row.get("grant_id"))
        check(
            "and the counter the cashier was looking at", 0, row.get("remaining_after")
        )

        print("\nC. the recovered id UNDOES the hold, and the session comes back")
        rid = row.get("redemption_id")
        check("release touches the recovered row", 1, release(db, rid))
        check("the session is back", 0, live_uses(db, grant))
        check("the voucher is offered again", 1, len(options(db, "cus-1", cut)))
        check(
            "and the checkout has nothing left to recover",
            [],
            recover_after_reload(db, "chk-1"),
        )

        print(
            "\nD. it is scoped to THIS hub — with a LIVE neighbour on the same checkout ref"
        )
        foreign_cut = seed_service(db, OTHER_HUB, "Cut")
        foreign_pkg = seed_package(db, OTHER_HUB, "Bono vecino", max_uses=5)
        seed_item(db, OTHER_HUB, foreign_pkg, foreign_cut)
        foreign_grant = seed_grant(db, foreign_pkg, "cus-1", hub=OTHER_HUB)
        # The SAME checkout ref and the SAME line ref, held for real next door. An isolation check
        # against an empty table proves nothing (the lesson of the tenancy tests that did not).
        hold(db, foreign_grant, foreign_cut, "chk-9", "l1", hub=OTHER_HUB)
        mine = hold(db, grant, cut, "chk-9", "l1")
        check("the neighbour holds one too", 1, live_uses(db, foreign_grant))
        ours = recover_after_reload(db, "chk-9", hub=HUB)
        theirs = recover_after_reload(db, "chk-9", hub=OTHER_HUB)
        check("we see exactly ours", [mine], [r["redemption_id"] for r in ours])
        check("they see exactly theirs", 1, len(theirs))
        check("and not ours", [], [r for r in theirs if r["redemption_id"] == mine])

        print(
            "\nE. a SETTLED hold does not come back — undoing it is a refund, another door"
        )
        check("settle marks it consumed", 1, settle(db, mine, "sale-1"))
        check(
            "the settled hold is NOT recovered", [], recover_after_reload(db, "chk-9")
        )
        check("releasing it touches nothing", 0, release(db, mine))
        released_only = hold(db, seed_grant(db, one, "cus-2"), cut, "chk-2", "l1")
        check("release works", 1, release(db, released_only))
        check(
            "a released hold is NOT recovered either",
            [],
            recover_after_reload(db, "chk-2"),
        )

        print("\nF. a checkout with no holds answers an empty list, not an error")
        check("unknown checkout", [], recover_after_reload(db, "chk-never-existed"))

        print("\nG. 🔴 the ABANDONED hold frees itself — and the CLOCK is what frees it")
        many = seed_package(db, HUB, "Bono 3 sesiones", max_uses=3)
        seed_item(db, HUB, many, cut)
        # A ONE-session voucher, so «is it offered?» is a sharp question: the only thing that can
        # put it back on the till is the stale hold ceasing to count. With a three-session voucher
        # it would be offered either way and the assertion would pass without proving anything.
        solo = seed_package(db, HUB, "Bono 1 sesion abandonada", max_uses=1)
        seed_item(db, HUB, solo, cut)
        abandoned_grant = seed_grant(db, solo, "cus-3")
        abandoned = hold(db, abandoned_grant, cut, "chk-abandoned", "l1")
        deadline = db.scalar(
            f"SELECT COALESCE(expires_at, '') FROM services_package_redemption WHERE id = '{abandoned}'"
        )
        check("the hold carries a deadline the caller never sent", True, deadline != "")
        check("and it is in the future at the moment it is taken", True, deadline > NOW)
        check("before the deadline it is still recovered", 1, len(recover_after_reload(db, "chk-abandoned")))
        check("it still counts against the voucher", 1, live_uses(db, abandoned_grant))
        check("so the till does not offer it", [], options(db, "cus-3", cut))

        # 🔴 THE READS DECIDE, NOT THE SWEEP. Everything below happens with NO sweep run and the row
        # still LIVE in the table — which is the only way to prove the exclusion comes from the
        # clock and not from the soft-delete that would later mask it. A first pass of this battery
        # asserted all of this AFTER the sweep, and a mutant that deleted the deadline predicate
        # from the read survived: the assertions were being carried by `is_deleted = 1`.
        check(
            "past the deadline the screen no longer sees the hold — no sweep has run",
            [],
            recover_after_reload(db, "chk-abandoned", now=MUCH_LATER),
        )
        check(
            "and the till offers the voucher again on the clock alone",
            [abandoned_grant],
            [r["grant_id"] for r in options(db, "cus-3", cut, now=MUCH_LATER)],
        )
        check(
            "…while the row is still LIVE: this is the clock, not a soft-delete",
            1,
            int(
                db.scalar(
                    "SELECT count(*) FROM services_package_redemption "
                    f"WHERE id = '{abandoned}' AND is_deleted = 0 AND status = 'held'"
                )
            ),
        )

        check("the sweep finds nothing before the deadline", 0, expire_holds(db, LATER))
        check("past the deadline the sweep reclaims it", 1, expire_holds(db, MUCH_LATER))
        check("the session is back on the voucher", 0, live_uses(db, abandoned_grant))
        check("and it is gone from the checkout", [], recover_after_reload(db, "chk-abandoned"))
        check(
            "the ledger says the TIME ran out, not that somebody decided",
            ["expired", 1],
            json.loads(
                db.scalar(
                    "SELECT json_build_array(release_reason, is_deleted) "
                    f"FROM services_package_redemption WHERE id = '{abandoned}'"
                )
            ),
        )
        check(
            "a hold the cashier released says so instead",
            "released",
            db.scalar(
                f"SELECT release_reason FROM services_package_redemption WHERE id = '{released_only}'"
            ),
        )

        print("\nH. 🔴 …and the reclaim does NOT wait for the scheduler")
        # WooCommerce frees held stock from a cron at the same interval as the hold, so when the
        # cron does not run — loopback blocked, a classic — the stock is blocked FOREVER. The hold
        # command expires the hub's stale rows in its own transaction, so the session is reclaimed
        # by the very act of trying to use it, with no worker in the picture.
        stuck_grant = seed_grant(db, one, "cus-4")
        stuck = hold(db, stuck_grant, cut, "chk-stuck", "l1")
        check("the last session is held", 1, live_uses(db, stuck_grant))
        # No sweep runs. The cashier simply comes back the next day and taps «pay with voucher».
        again = hold(db, stuck_grant, cut, "chk-fresh", "l1", now=MUCH_LATER)
        check("the new hold got in without any cron", 1, live_uses(db, stuck_grant))
        check(
            "and it is the new one",
            [again],
            [r["redemption_id"] for r in recover_after_reload(db, "chk-fresh")],
        )
        check(
            "the stale one was reclaimed in the same transaction",
            [],
            recover_after_reload(db, "chk-stuck"),
        )
        check(
            "stamped as expired, never as a decision",
            "expired",
            db.scalar(
                f"SELECT release_reason FROM services_package_redemption WHERE id = '{stuck}'"
            ),
        )
        check("the guard table is left empty", 0, guard_residue(db))

        print("\nI. the same line can be held AGAIN once its hold expired")
        # 🔴 `uq_services_redemption_line` is partial on `is_deleted = 0`, so an expired hold left
        # LIVE would refuse the retry — the cashier would be locked out of the very line they are
        # standing in front of, which is this bug wearing a different hat. The expiry soft-deletes,
        # and that is what frees the index.
        #
        # The voucher here deliberately has THREE sessions. With a one-session one the retry would
        # be refused for the honest reason «none left» and would never reach the index this section
        # is about — an assertion that passes for the wrong reason proves nothing, and this one did
        # exactly that on its first run.
        line_grant = seed_grant(db, many, "cus-5")
        first_try = hold(db, line_grant, cut, "chk-line", "l1")
        check("held, and recoverable while it lives", 1, len(recover_after_reload(db, "chk-line")))
        # Nobody comes back. A day later the cashier is in front of that same line again.
        retry = hold(db, line_grant, cut, "chk-line", "l1", now=MUCH_LATER)
        check("…and it is a NEW redemption, not the resurrected one", True, retry != first_try)
        check(
            "the abandoned line is holdable again",
            [retry],
            [r["redemption_id"] for r in recover_after_reload(db, "chk-line", now=MUCH_LATER)],
        )
        check("still exactly one live use — the retry, never both", 1, live_uses(db, line_grant))
        check(
            "and the abandoned one is stamped as expired",
            "expired",
            db.scalar(
                f"SELECT release_reason FROM services_package_redemption WHERE id = '{first_try}'"
            ),
        )
        refused(
            "…but the SAME line twice while the hold is alive",
            lambda: hold(db, line_grant, cut, "chk-line", "l1", now=MUCH_LATER),
        )
        check("the refusal left nothing behind", 1, live_uses(db, line_grant))

        print("\nJ. idempotence: nothing here can be applied twice")
        check("sweeping again touches nothing", 0, expire_holds(db, MUCH_LATER))
        check("the counter did not move", 1, live_uses(db, line_grant))
        check("releasing the retry", 1, release(db, retry))
        check("releasing it again touches nothing", 0, release(db, retry))
        check("and the session stayed back exactly once", 0, live_uses(db, line_grant))
        check(
            "a released hold is not re-stamped by a later sweep",
            "released",
            db.scalar(
                f"SELECT release_reason FROM services_package_redemption WHERE id = '{retry}'"
            ),
        )
        check(
            "recovering twice is a read and moves nothing",
            [],
            recover_after_reload(db, "chk-line", now=MUCH_LATER),
        )
        check("guard table still empty", 0, guard_residue(db))
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "PASS — a taken hold survives the reload, and an abandoned one gives the session back"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
