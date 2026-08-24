#!/usr/bin/env python3
"""services#71 — returning a paid voucher session TO the voucher, against a REAL Postgres (ADR-0386).

services#70 made the voucher a tender that covers lines: the session is HELD while the checkout is
open and SETTLED when the sale is paid. From the settle onwards `release_hold` refuses, and that is
correct — the customer had the haircut. What was missing is the other door: the sale gets RETURNED,
and the session has to go back to the voucher.

The failure this closes is the market's, not a hypothetical: **Mindbody** leaves the visit attached
to a voucher that was already refunded — «it will remain attached to the returned Pricing Option as
if it were still paid» — so the customer loses the session AND the voucher. **Fresha** makes it
irreversible outright: «no changes can be made once the payment has been processed».

What the DATABASE has to guarantee, and therefore what is proven here:

  1. Refunding a settled session GIVES IT BACK — the voucher can be spent again — and the row
     SURVIVES as the audit trail: who, when, and against which return document.
  2. 🔴 IDEMPOTENCE, in the schema and not in an `if`. The same return document may arrive twice
     (a retry, a double tap): the second lands on ZERO rows and changes NOTHING. A DIFFERENT
     document trying to return the same session is REFUSED — one session, one refund.
  3. 🔴 …and under TWO REAL CONCURRENT TRANSACTIONS. Two tills refunding the same session at once
     is a check-then-act away from returning it twice; that TOCTOU is Odoo#79235's shape and the
     one appointments#10 already paid for.
  4. EXPIRY NEVER BLOCKS A REFUND, and it is not silent either. Today's guards weigh validity
     against `:now`, which is right for a live sale and WRONG when rectifying yesterday's ticket.
     A refund is an undo of a past act: it always goes through, it RECORDS that the voucher was
     already expired, and the pre-check says so BEFORE the operator confirms.
  5. The anchor moves with the truth: expiry is anchored on the customer's FIRST LIVE use, so
     refunding the use that started the clock un-starts it. A use that was returned is not a use.
  6. It is auditable and CONSULTABLE: `services.packages.redemption_history` lists every movement
     of the voucher — held, consumed, released, refunded — including the soft-deleted ones, which
     is where the refunds live.

Usage: tests/voucher_refund.postgres.test.py   (exit 0 = green; SKIPPED without the container)
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

failures: list[str] = []

# 48 days before NOW: with validity_days = 30 a first use anchored here is long expired.
LONG_AGO = "2026-07-01T10:00:00Z"


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(label: str, fn, by: str | None = None) -> None:
    """The database must REFUSE — an exception is the pass; a silent success is the fail.

    `by` names WHICH guard has to do the refusing, and it is not pedantry: the refund is guarded
    twice on purpose — the conditional UPDATE declines to move the row, and the schema's CHECK
    refuses to hold a forged trail. Without naming the guard, deleting half of the command's WHERE
    leaves this battery GREEN, because the CHECK catches the write the command should never have
    attempted. Measured: that exact mutant SURVIVED until this argument existed.
    """
    try:
        fn()
    except RuntimeError as exc:
        text = str(exc)
        if by is not None and by not in text:
            failures.append(f"{label}: refused, but not by {by} — {text.splitlines()[0][:120]}")
            print(f"  FAIL: {label} was refused by the WRONG guard (expected {by})")
            return
        print(f"  ok: refused {label} ({text.splitlines()[0][:90]})")
        return
    failures.append(f"{label}: it was ACCEPTED")
    print(f"  FAIL: ACCEPTED {label}")


# ── seeding (same doors as services#70's battery) ────────────────────────────


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


# ── the doors under test ─────────────────────────────────────────────────────


def _run(db: ScratchDb, command: str, params: dict, hub: str) -> str:
    return db.psql(["-e"], db=db.name, stdin=script_for(command, params, hub=hub))


def _updates(out: str) -> int:
    """Rows touched by the UPDATEs of a command script (`-e` echoes the SQL too; only tags count)."""
    return sum(
        int(m.group(1)) for m in re.finditer(r"^UPDATE (\d+)$", out, re.MULTILINE)
    )


# Which grant a (voucher, customer, hub) triple is spending, minted on first use.
#
# services#73 put a PURCHASE row between the catalogue and the ledger: a session is now spent
# against a grant, not against a package plus a customer id. This test is about REFUNDS, so the
# purchase is scenery — it is created on demand and memoised, and every `hold` below reads exactly
# as it did before. A test that had to spell out the purchase in twenty places would be testing
# the seeding, not the refund.
GRANTS: dict[tuple[str, str, str], str] = {}


def grant_for(db: ScratchDb, package_id: str, customer: str, hub: str) -> str:
    key = (hub, package_id, customer)
    if key not in GRANTS:
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
        GRANTS[key] = grant_id
    return GRANTS[key]


def hold(
    db: ScratchDb,
    package_id: str,
    service_id: str,
    checkout_ref: str,
    line_ref: str,
    customer: str = "cus-1",
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
                "grant_id": grant_for(db, package_id, customer, hub),
                "service_id": service_id,
                "checkout_ref": checkout_ref,
                "line_ref": line_ref,
                "note": "",
            },
            hub=hub,
        ),
    )
    return rid


def settle(db: ScratchDb, redemption_id: str, sale_id: str, hub: str = HUB) -> int:
    return _updates(
        _run(
            db,
            "services.packages.settle_hold",
            {"redemption_id": redemption_id, "sale_id": sale_id},
            hub,
        )
    )


def sold_session(
    db: ScratchDb,
    package_id: str,
    service_id: str,
    checkout: str,
    line: str,
    sale: str,
    customer: str = "cus-1",
    hub: str = HUB,
) -> str:
    """A session the customer already had and paid for: held, then settled."""
    rid = hold(db, package_id, service_id, checkout, line, customer=customer, hub=hub)
    settle(db, rid, sale, hub=hub)
    return rid


def refund(
    db: ScratchDb,
    redemption_id: str,
    refund_ref: str,
    note: str = "",
    hub: str = HUB,
) -> int:
    """`services._refund` — the gated statements, exactly as the handler's intention runs them."""
    return _updates(
        _run(
            db,
            "services._refund",
            {
                "redemption_id": redemption_id,
                "refund_ref": refund_ref,
                "refund_note": note,
            },
            hub,
        )
    )


def refund_check(db: ScratchDb, redemption_id: str, hub: str = HUB) -> dict:
    sql = query_sql(
        "services.packages.refund_check", {"redemption_id": redemption_id}, hub=hub
    )
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    rows = json.loads(out.strip() or "[]")
    return rows[0] if rows else {}


def history(db: ScratchDb, package_id: str, hub: str = HUB) -> list[dict]:
    sql = query_sql(
        "services.packages.redemption_history", {"package_id": package_id}, hub=hub
    )
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def options(
    db: ScratchDb, customer: str, service_id: str, hub: str = HUB
) -> list[dict]:
    sql = query_sql(
        "services.packages.tender_options",
        {"customer_id": customer, "service_id": service_id},
        hub=hub,
    )
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def balance_of(db: ScratchDb, package_id: str, customer: str, hub: str = HUB) -> dict:
    """The customer's balance ON THAT VOUCHER, through the module's own door.

    `services.packages.balance` answers one row per GRANT (services#73). The tests here never buy
    the same voucher twice, so «the grant of this voucher» is unambiguous — and asking through the
    query rather than counting rows is what makes an expired voucher's balance readable at all: it
    is absent from `tender_options` precisely because it is expired.
    """
    sql = query_sql("services.packages.balance", {"customer_id": customer}, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    rows = [r for r in json.loads(out.strip() or "[]") if r["package_id"] == package_id]
    return rows[0] if rows else {}


def live(db: ScratchDb, package_id: str, customer: str = "cus-1") -> int:
    return int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE package_id = '{package_id}' AND customer_id = '{customer}' AND is_deleted = 0"
        )
    )


def gate_rows(db: ScratchDb) -> int:
    return int(db.scalar("SELECT count(*) FROM services__gate"))


def row(db: ScratchDb, redemption_id: str, columns: str) -> list:
    return json.loads(
        db.scalar(
            f"SELECT json_build_array({columns}) FROM services_package_redemption "
            f"WHERE id = '{redemption_id}'"
        )
    )


# ── the race: two REAL concurrent transactions ───────────────────────────────


def concurrent_refunds(db: ScratchDb, redemption_id: str) -> tuple[list, str]:
    """Two returns of the SAME session, each with its OWN document, interleaved for real.

    A refunds and stays UNCOMMITTED while B refunds the same row. With the guard in the schema B
    blocks on A's row and, the moment A commits, B's conditional UPDATE re-reads a row that is no
    longer refundable, touches nothing, and its assert refuses — the whole transaction rolls back.
    With a check-then-act guard both snapshots read «settled and not refunded» and the session is
    marked as returned TWICE, against two different documents, which is a second refund nobody can
    reconcile.

    Returns `(the row's refund stamp, B's stderr)`.
    """

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

    def statements(ref: str) -> str:
        return (
            script_for(
                "services._refund",
                {
                    "redemption_id": redemption_id,
                    "refund_ref": ref,
                    "refund_note": "",
                },
            )
            .replace("BEGIN;\n", "", 1)
            .replace("\nCOMMIT;", "", 1)
        )

    a, b = session(), session()
    try:
        a.stdin.write("BEGIN;\n" + statements("return-a") + "\n")
        a.stdin.flush()
        time.sleep(0.6)  # A holds the row, uncommitted.
        b.stdin.write("BEGIN;\n" + statements("return-b") + "\n")
        b.stdin.flush()
        time.sleep(0.6)  # B is blocked on the row (or, unguarded, already through).
        a.stdin.write("COMMIT;\n")
        a.stdin.flush()
        a.stdin.close()
        a.wait(timeout=20)
        b.stdin.write("COMMIT;\n")
        b.stdin.flush()
        b.stdin.close()
        b.wait(timeout=20)
        err = (b.stderr.read() or "").strip()
    finally:
        for p in (a, b):
            if p.poll() is None:
                p.kill()
    return row(db, redemption_id, "is_deleted, refund_ref"), err


# ── the run ──────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_voucher_refund_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")

        print(
            "A. a paid session goes BACK to the voucher, and the row survives as the trail"
        )
        five = seed_package(db, HUB, "Bono 5 cortes", max_uses=5, validity_days=None)
        seed_item(db, HUB, five, cut)
        sold = sold_session(db, five, cut, "chk-1", "line-1", "sale-1")
        check("the session was spent", 1, live(db, five))
        before = refund_check(db, sold)
        check("the pre-check says it can go back", 1, before.get("refundable"))
        check("with no reason to refuse", "", before.get("reason"))
        check("4 sessions left before the return", 4, before.get("remaining_before"))
        check("5 after it", 5, before.get("remaining_after"))
        check("and the voucher is not expired", 0, before.get("voucher_expired"))
        check(
            "the refund touches the row",
            1,
            refund(db, sold, "return-1", "customer changed her mind"),
        )
        check("the session is back", 0, live(db, five))
        check("the guard table is clean", 0, gate_rows(db))
        check(
            "the trail says who, when and against which document",
            [1, NOW, USER, "return-1", "customer changed her mind", 0],
            row(
                db,
                sold,
                "is_deleted, refunded_at, refunded_by, refund_ref, refund_note, refund_expired",
            ),
        )
        check(
            "and it still says which sale it came from",
            ["sale-1", "chk-1", "line-1", "consumed"],
            row(db, sold, "sale_id, checkout_ref, line_ref, status"),
        )

        print("\nB. the returned session is really SPENDABLE again")
        check(
            "the voucher offers five sessions again",
            5,
            (options(db, "cus-1", cut) or [{}])[0].get("remaining_before"),
        )
        again = hold(db, five, cut, "chk-2", "line-1")
        check("a new hold gets in on the freed ordinal", 1, live(db, five))
        # 🔴 And it REUSES the freed ordinal, which is the point of `MAX(use_index) + 1` over the
        # LIVE rows rather than `COUNT + 1`. The unique index is partial on `is_deleted = 0`, so the
        # returned session's ordinal is outside it and the next hold may take it. Had the ordinal
        # stayed reserved, a voucher would lose one session for good every time one came back.
        check(
            "the returned session's ordinal is free again",
            row(db, sold, "use_index"),
            row(db, again, "use_index"),
        )

        print("\nC. 🔴 IDEMPOTENCE — the same return document twice changes NOTHING")
        twin = seed_package(db, HUB, "Bono idempotente", max_uses=3, validity_days=None)
        seed_item(db, HUB, twin, cut)
        once = sold_session(
            db, twin, cut, "chk-3", "line-1", "sale-3", customer="cus-2"
        )
        check("the session is spent", 1, live(db, twin, "cus-2"))
        check("the first return touches the row", 1, refund(db, once, "return-3"))
        stamp = row(db, once, "refunded_at, refunded_by, refund_ref, is_deleted")
        check("the RETRY touches nothing", 0, refund(db, once, "return-3"))
        check(
            "the stamp is untouched",
            stamp,
            row(db, once, "refunded_at, refunded_by, refund_ref, is_deleted"),
        )
        check("exactly one session came back, not two", 0, live(db, twin, "cus-2"))
        check("guard clean", 0, gate_rows(db))
        check(
            "and the pre-check names it, instead of pretending it is refundable",
            [0, "already_refunded", 1],
            [
                refund_check(db, once).get("refundable"),
                refund_check(db, once).get("reason"),
                refund_check(db, once).get("already_refunded"),
            ],
        )

        print("\nD. 🔴 …but a DIFFERENT document cannot return the same session again")
        refused(
            "a second return of an already returned session",
            lambda: refund(db, once, "return-OTHER"),
            by="services__gate",
        )
        check(
            "the original stamp survived",
            stamp,
            row(db, once, "refunded_at, refunded_by, refund_ref, is_deleted"),
        )
        check("still one session back, not two", 0, live(db, twin, "cus-2"))
        check("guard clean", 0, gate_rows(db))

        print("\nE. 🔴 …and under TWO REAL CONCURRENT TRANSACTIONS")
        racy = seed_package(db, HUB, "Bono carrera", max_uses=2, validity_days=None)
        seed_item(db, HUB, racy, cut)
        contested = sold_session(
            db, racy, cut, "chk-race", "line-1", "sale-race", customer="cus-race"
        )
        stamped, err = concurrent_refunds(db, contested)
        check("the session came back exactly once", [1, "return-a"], stamped)
        check(
            "the loser was refused by the database",
            True,
            "services__gate" in err or "check constraint" in err.lower(),
        )
        check("no session was returned twice", 0, live(db, racy, "cus-race"))

        print("\nF. what is NOT refundable, and WHY — named, never a raw CHECK")
        open_hold = hold(db, five, cut, "chk-open", "line-9", customer="cus-3")
        pending = refund_check(db, open_hold)
        check(
            "a session that was never paid cannot be returned",
            0,
            pending.get("refundable"),
        )
        check("and it says so", "not_settled", pending.get("reason"))
        refused(
            "returning an unpaid session",
            lambda: refund(db, open_hold, "return-x"),
            by="services__gate",
        )
        unknown = refund_check(db, "no-such-redemption")
        check("an unknown id answers ONE row, not none", 0, unknown.get("refundable"))
        check("with its own reason", "redemption_not_found", unknown.get("reason"))
        refused(
            "returning an id that does not exist",
            lambda: refund(db, "no-such-redemption", "return-x"),
            by="services__gate",
        )

        # 🔴 A session spent AT THE CHAIR (`services.packages.redeem`) is born `consumed` with no
        # checkout and no sale behind it, so `status = 'consumed'` alone does NOT mean «paid». This
        # door returns a session to the voucher because a SALE was returned; a chair redemption has
        # no sale to return, and undoing it is a correction, not a refund. Without this case the
        # `settled_at IS NOT NULL` half of the command's guard can be deleted and the battery stays
        # green — measured: that mutant SURVIVED until this section existed.
        chair = str(uuid.uuid4())
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services._redeem",
                {
                    "redemption_id": chair,
                    "grant_id": grant_for(db, five, "cus-chair", HUB),
                    "appointment_id": None,
                    "sale_id": None,
                    "note": "",
                },
            ),
        )
        check("the chair spent a session", 1, live(db, five, "cus-chair"))
        at_chair = refund_check(db, chair)
        check("a session spent at the chair is not returnable here", 0, at_chair.get("refundable"))
        check("and it says why", "not_settled", at_chair.get("reason"))
        refused(
            "returning a session that was never part of a sale",
            lambda: refund(db, chair, "return-chair"),
            by="services__gate",
        )
        check("the chair's session stays spent", 1, live(db, five, "cus-chair"))

        print("\nG. a session of ANOTHER hub is not returnable from here")
        foreign_cut = seed_service(db, OTHER_HUB, "Cut")
        foreign = seed_package(
            db, OTHER_HUB, "Bono vecino", max_uses=5, validity_days=None
        )
        seed_item(db, OTHER_HUB, foreign, foreign_cut)
        theirs = sold_session(
            db,
            foreign,
            foreign_cut,
            "chk-n",
            "line-1",
            "sale-n",
            customer="cus-n",
            hub=OTHER_HUB,
        )
        check(
            "the neighbour's row is invisible to the pre-check",
            "redemption_not_found",
            refund_check(db, theirs, hub=HUB).get("reason"),
        )
        refused(
            "returning the neighbour's session",
            lambda: refund(db, theirs, "return-x", hub=HUB),
            by="services__gate",
        )
        check("and it is untouched next door", 1, live(db, foreign, "cus-n"))

        print("\nH. 🔴 EXPIRY does not block a refund — it is RECORDED and announced")
        expiring = seed_package(db, HUB, "Bono caducado", max_uses=5, validity_days=30)
        seed_item(db, HUB, expiring, cut)
        # Bought 48 days before NOW with 30 days of validity, so at NOW the voucher is 18 days
        # past its expiry. Rectifying yesterday's ticket must still work. Since services#73 the
        # clock hangs off the PURCHASE, so this is the grant's date and not the sessions'.
        first = sold_session(
            db, expiring, cut, "chk-e1", "line-1", "sale-e1", customer="cus-e"
        )
        second = sold_session(
            db, expiring, cut, "chk-e2", "line-2", "sale-e2", customer="cus-e"
        )
        db.psql(
            [],
            db=db.name,
            stdin=(
                "UPDATE services_package_grant SET granted_at = "
                f"'{LONG_AGO}' WHERE id = '{grant_for(db, expiring, "cus-e", HUB)}';"
            ),
        )
        warned = refund_check(db, second)
        check("the pre-check still allows it", 1, warned.get("refundable"))
        check(
            "…and WARNS that the voucher is expired, before confirming",
            1,
            warned.get("voucher_expired"),
        )
        check("the refund goes through anyway", 1, refund(db, second, "return-e"))
        check(
            "and the row records that the session came back into an expired voucher",
            1,
            int(row(db, second, "refund_expired")[0]),
        )
        check("the session is back on the books", 1, live(db, expiring, "cus-e"))
        check(
            "the expired voucher is still not spendable — the refund did not resurrect it",
            [],
            [r for r in options(db, "cus-e", cut) if r["package_id"] == expiring],
        )

        # 🔴 services#73 CLOSED a loophole here, and this is where it used to be. While the clock
        # was anchored on the FIRST LIVE USE, refunding that use un-started it: spend a session on
        # day one, return it, and the 30 days began again — an extension nobody bought, handed out
        # by the undo button. The anchor is now the PURCHASE, which no refund can move, so the
        # sessions come back and the deadline stays exactly where it was.
        print("\nI. …and refunding a use does NOT restart the clock — a refund is not an extension")
        check("the second use goes back too", 1, refund(db, first, "return-e2"))
        check("no live use is left", 0, live(db, expiring, "cus-e"))
        check(
            "every session is back on the voucher",
            5,
            int(balance_of(db, expiring, "cus-e")["remaining"]),
        )
        check(
            "…and it is STILL expired: the refund gave sessions back, not time",
            [],
            [r for r in options(db, "cus-e", cut) if r["package_id"] == expiring],
        )
        check(
            "and this refund knew the voucher was expired AT THAT MOMENT too",
            1,
            int(row(db, first, "refund_expired")[0]),
        )

        print("\nJ. an ARCHIVED voucher still takes its session back")
        archived = seed_package(
            db, HUB, "Bono archivado", max_uses=2, validity_days=None
        )
        seed_item(db, HUB, archived, cut)
        boxed = sold_session(
            db, archived, cut, "chk-a", "line-1", "sale-a", customer="cus-a"
        )
        db.psql(
            [],
            db=db.name,
            stdin=f"UPDATE services_package SET is_active = 0, is_deleted = 1 WHERE id = '{archived}';",
        )
        check("archiving does not trap the refund", 1, refund(db, boxed, "return-a1"))
        check("the session is back", 0, live(db, archived, "cus-a"))

        print(
            "\nK. 🔴 the trail cannot be forged: a refund stamp on a live or unpaid row is REFUSED"
        )
        alive = hold(db, five, cut, "chk-forge", "line-1", customer="cus-f")
        refused(
            "stamping a refund on a row that is still live",
            lambda: db.psql(
                [],
                db=db.name,
                stdin=(
                    "UPDATE services_package_redemption SET refunded_at = "
                    f"'{NOW}', refunded_by = '{USER}', refund_ref = 'x' WHERE id = '{alive}';"
                ),
            ),
            by="ck_services_redemption_refund",
        )
        undocumented = sold_session(
            db, five, cut, "chk-forge2", "line-2", "sale-forge", customer="cus-f"
        )
        refused(
            "a refund with no document behind it",
            lambda: db.psql(
                [],
                db=db.name,
                stdin=(
                    "UPDATE services_package_redemption SET is_deleted = 1, refunded_at = "
                    f"'{NOW}', refunded_by = '{USER}' WHERE id = '{undocumented}';"
                ),
            ),
            by="ck_services_redemption_refund",
        )
        refused(
            "a refund with no author",
            lambda: db.psql(
                [],
                db=db.name,
                stdin=(
                    "UPDATE services_package_redemption SET is_deleted = 1, refunded_at = "
                    f"'{NOW}', refund_ref = 'return-forged' WHERE id = '{undocumented}';"
                ),
            ),
            by="ck_services_redemption_refund",
        )

        print("\nL. the movements are CONSULTABLE from the voucher — refunds included")
        moves = history(db, five)
        by_id = {m["redemption_id"]: m for m in moves}
        check(
            "the refunded session is listed, not hidden by the soft-delete",
            "refunded",
            by_id.get(sold, {}).get("movement"),
        )
        check(
            "the open hold is listed as held",
            "held",
            by_id.get(open_hold, {}).get("movement"),
        )
        check(
            "and the reopened hold as held", "held", by_id.get(again, {}).get("movement")
        )
        check(
            "the trail carries who returned it",
            USER,
            by_id.get(sold, {}).get("refunded_by"),
        )
        check("and the document", "return-1", by_id.get(sold, {}).get("refund_ref"))
        check(
            "the service each session paid for is named",
            "Cut",
            by_id.get(sold, {}).get("service_name"),
        )
        check(
            "the neighbour's movements are not in our history",
            [],
            history(db, foreign, hub=HUB),
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
        "PASS — a returned session goes back to its voucher, once, auditable, expiry and all"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
