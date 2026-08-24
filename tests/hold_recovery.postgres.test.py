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
# A day past MUCH_LATER, and half an hour after it. Section L needs a grant holding a STALE session
# and a FRESH one at the same instant, which only exists when the two were taken at different
# moments — so it needs two clocks that are one day apart and one that sits between their deadlines.
HALF_HOUR_ON = "2026-08-19T10:30:00Z"
EVEN_LATER = "2026-08-20T10:00:00Z"


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


def redeem_check(db: ScratchDb, grant_id: str, hub: str = HUB, now: str = NOW) -> dict:
    """The pre-check the two spending commands preload. It has to answer what they will decide."""
    return rows_of(
        db, query_sql("services.packages.redeem_check", {"grant_id": grant_id, "now": now}, hub=hub)
    )[0]


def balance(db: ScratchDb, customer: str, hub: str = HUB, now: str = NOW):
    return rows_of(
        db,
        query_sql(
            "services.packages.balance", {"customer_id": customer, "now": now}, hub=hub
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
        # The FOURTH reader, and the one that decides the refusal MESSAGE. `redeem_check` is
        # preloaded by the handlers of `hold_for_line` and `redeem`, so if it still counted the
        # stale hold the cashier would be told «no sessions left» about a voucher the very next
        # statement is about to spend happily — a refusal reason that is not true is worse than no
        # reason. This voucher has ONE session, so the answer flips on that predicate alone.
        check(
            "before the deadline the pre-check says the voucher is spent",
            [0, "no_uses_left"],
            [redeem_check(db, abandoned_grant)[k] for k in ("redeemable", "reason")],
        )
        check(
            "past it the pre-check says it is spendable again",
            [1, ""],
            [redeem_check(db, abandoned_grant, now=MUCH_LATER)[k] for k in ("redeemable", "reason")],
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

        print("\nK. an UNLIMITED voucher recovers without inventing a countdown")
        # The screen renders a counter or the word «unlimited» depending on whether
        # `remaining_after` is NULL, and it takes that straight from here rather than re-deriving
        # it from `is_unlimited`. So this is where the two have to agree: both come from the same
        # `max_uses IS NULL`, and a component branch second-guessing it would be a branch no test
        # could tell apart (a mutant that removed it survived, which is how this section exists).
        endless = seed_package(db, HUB, "Bono ilimitado", max_uses=None)
        seed_item(db, HUB, endless, cut)
        endless_grant = seed_grant(db, endless, "cus-6")
        hold(db, endless_grant, cut, "chk-endless", "l1")
        row = recover_after_reload(db, "chk-endless")[0]
        check("it is flagged unlimited", 1, row["is_unlimited"])
        check("and it previews NO count, rather than a wrong one", None, row["remaining_after"])
        check("max_uses travels as NULL too", None, row["max_uses"])
        # …and the two really are one question: a FINITE voucher answers both the other way. Held
        # fresh here rather than reusing an earlier checkout — section J released those, and
        # asserting over an empty list would have passed for the wrong reason.
        hold(db, line_grant, cut, "chk-finite", "l1", now=MUCH_LATER)
        finite_row = recover_after_reload(db, "chk-finite", now=MUCH_LATER)
        check("a finite voucher is not flagged unlimited", [0], [r["is_unlimited"] for r in finite_row])
        check("and it does carry a count: 3 sold, 1 held, 2 left", [2], [r["remaining_after"] for r in finite_row])

        print("\nL. the recovered counter ignores the grant's OWN stale holds")
        # 🔴 The number the cashier reads off this screen has to be the number the till is about to
        # charge against — the same one `tender_options` and `balance` give. So `remaining_after`
        # counts the grant's live uses EXCLUDING the ones whose deadline has passed, exactly like
        # they do. Without that predicate the screen would quietly under-count a voucher by however
        # many abandoned checkouts it is still carrying, and the cashier would refuse a session the
        # customer actually has.
        #
        # Building the case needs two clocks a day apart: a session held on Tuesday is stale by
        # Thursday while one held on Wednesday is not, and NEITHER has been swept, because nothing
        # has tried to spend from this voucher in between. A mutant that dropped this predicate
        # survived every other section — they all had at most one hold per grant.
        mixed_grant = seed_grant(db, many, "cus-7")
        stale = hold(db, mixed_grant, cut, "chk-stale", "l1", now=MUCH_LATER)
        fresh = hold(db, mixed_grant, cut, "chk-still-open", "l2", now=HALF_HOUR_ON)
        check(
            "both are live in the table",
            2,
            int(
                db.scalar(
                    "SELECT count(*) FROM services_package_redemption "
                    f"WHERE id IN ('{stale}', '{fresh}') AND is_deleted = 0 AND status = 'held'"
                )
            ),
        )
        open_now = recover_after_reload(db, "chk-still-open", now=EVEN_LATER)
        check("only the fresh checkout is recovered", [fresh], [r["redemption_id"] for r in open_now])
        check(
            "and its counter ignores the stale sibling: 3 sold, 1 live, 2 left",
            [2],
            [r["remaining_after"] for r in open_now],
        )
        check(
            "the till agrees, which is the whole point of them sharing the predicate",
            [2],
            [
                r["remaining_before"]
                for r in options(db, "cus-7", cut, now=EVEN_LATER)
                if r["grant_id"] == mixed_grant
            ],
        )
        # The customer's own balance screen is the THIRD reader of that number, and a salon that
        # tells the customer «1 left» while the till charges against 2 has a complaint on its hands.
        # It carries the same predicate, so it has to be held to it here too — a mutant that removed
        # it from `balance` alone survived everything else.
        mine_balance = [r for r in balance(db, "cus-7", now=EVEN_LATER) if r["grant_id"] == mixed_grant]
        check("the balance screen counts one use, not two", [1], [r["used"] for r in mine_balance])
        check("so it says two are left, like the other two readers", [2], [r["remaining"] for r in mine_balance])
        check(
            "…and the stale one is STILL live: no sweep has run, this is the clock",
            1,
            int(
                db.scalar(
                    "SELECT count(*) FROM services_package_redemption "
                    f"WHERE id = '{stale}' AND is_deleted = 0"
                )
            ),
        )
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
