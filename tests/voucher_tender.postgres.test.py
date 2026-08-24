#!/usr/bin/env python3
"""services#70 — the voucher as a TENDER that covers LINES, against a REAL Postgres (ADR-0386).

A voucher (`services_package`) is N uses of CONCRETE services, not a wallet. So it covers a
LINE — the eligible service's line, whole or not at all — and whatever it does not cover (the
shampoo) is charged with its own tender. Everything the database has to guarantee for that
lives here:

  1. `services.packages.tender_options` only offers vouchers that COVER THIS SERVICE and still
     have a session, and it previews `remaining_after` — how many sessions are left once this
     one is spent — BEFORE anything is written.
  2. The tie-break is DETERMINISTIC and leaves no tie: with two valid vouchers the query says
     which one is spent (`is_default = 1`) and why (`default_reason`).
  3. 🔴 A VOUCHER CANNOT BE SPENT TWICE, and the guard is ATOMIC — not a check-then-act. Two
     concurrent tills that both read «one session left» cannot both write: the loser is refused
     by a UNIQUE index on the use ordinal, INSIDE the database. This is the Odoo#79235 class of
     bug (open since 2021 because the card is never marked exhausted) and the same TOCTOU as
     appointments#10. It is proven three ways here: through the command, through RAW SQL that
     skips the command entirely, and with TWO REAL CONCURRENT TRANSACTIONS.
  4. One checkout line is covered by ONE redemption and no more — also by UNIQUE index.
  5. The hold can be UNDONE while the sale is not settled (and the session comes back), but NOT
     after: settling and releasing are the same conditional UPDATE, so they cannot both win.

Usage: tests/voucher_tender.postgres.test.py   (exit 0 = green; SKIPPED without the container)
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
    MODULE_DIR,
    NOW,
    OTHER_HUB,
    USER,
    ScratchDb,
    bind,
    container_available,
    lower_bridges,
    query_sql,
    script_for,
)

failures: list[str] = []

# 48 days before NOW: with validity_days = 30 a first use anchored here is long expired.
LONG_AGO = "2026-07-01T10:00:00Z"
RECENT = "2026-08-17T10:00:00Z"


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


def hold(
    db: ScratchDb,
    package_id: str,
    service_id: str,
    checkout_ref: str,
    line_ref: str,
    customer: str = "cus-1",
    redemption_id: str | None = None,
    hub: str = HUB,
) -> str:
    """The gated statements of `services._hold`, exactly as the handler's intention runs them."""
    rid = redemption_id or str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._hold",
            {
                "redemption_id": rid,
                "package_id": package_id,
                "customer_id": customer,
                "service_id": service_id,
                "checkout_ref": checkout_ref,
                "line_ref": line_ref,
                "note": "",
            },
            hub=hub,
        ),
    )
    return rid


def release(db: ScratchDb, redemption_id: str, hub: str = HUB) -> int:
    """`services.packages.release_hold` — returns the rows it touched (0 = the manifest refuses)."""
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


def _rows_touched(db: ScratchDb, command: str, params: dict, hub: str) -> int:
    """Run a manifest command and report how many rows its statements touched.

    `expect_rows` is the runtime's, not the database's: the manifest declares `min 1` and the
    dispatcher raises the domain error when the UPDATE matches nothing. What the SQL itself has
    to guarantee is exactly that count, so that is what is asserted here.
    """
    script = script_for(command, params, hub=hub)
    # `-c` per statement would open its own transaction; the script keeps the command's one.
    out = db.psql(["-e"], db=db.name, stdin=script)
    # `-e` echoes the statements too, so «UPDATE services_package_redemption» is in this stream
    # next to the command tag «UPDATE 1». Only the tag counts, and only its exact shape.
    return sum(int(m.group(1)) for m in re.finditer(r"^UPDATE (\d+)$", out, re.MULTILINE))


def residue(db: ScratchDb, package_id: str, customer: str = "cus-1") -> tuple[int, int]:
    """Live redemptions of this voucher for this customer, and rows left in the guard table."""
    live = int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE package_id = '{package_id}' AND customer_id = '{customer}' AND is_deleted = 0"
        )
    )
    return live, int(db.scalar("SELECT count(*) FROM services__gate"))


def raw_insert(
    db: ScratchDb, package_id: str, customer: str, use_index: int, **cols
) -> None:
    """A redemption written by RAW SQL, skipping the command entirely.

    This is the door a migration, a support script or a future command would come through. If
    the anti-double-spend guard lives in the statement instead of in the schema, this gets in.
    """
    values = {
        "id": str(uuid.uuid4()),
        "hub_id": HUB,
        "package_id": package_id,
        "customer_id": customer,
        "note": "raw",
        "redeemed_at": NOW,
        "is_deleted": 0,
        "status": "held",
        "use_index": use_index,
        **cols,
    }
    names = ", ".join(values)
    literals = ", ".join(
        "NULL"
        if v is None
        else (str(v) if isinstance(v, int) else "'" + str(v).replace("'", "''") + "'")
        for v in values.values()
    )
    db.psql(
        [],
        db=db.name,
        stdin=f"INSERT INTO services_package_redemption ({names}) VALUES ({literals});",
    )


# ── the race: two REAL concurrent transactions ───────────────────────────────


def concurrent_holds(
    db: ScratchDb, package_id: str, service_id: str, customer: str
) -> tuple[int, str]:
    """Two tills spend the LAST session at the same time. How many rows survive?

    Both sessions are opened for real and interleaved: A inserts and stays UNCOMMITTED while B
    inserts the same use ordinal. With the guard in the schema B blocks on the unique index and
    fails the moment A commits — one row, one session, one winner. With a check-then-act guard
    both snapshots read «one left» and BOTH rows land: the voucher is spent twice, which is
    Odoo#79235 verbatim.

    Returns `(surviving rows, B's stderr)`.
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

    def statements(checkout: str) -> str:
        return (
            script_for(
                "services._hold",
                {
                    "redemption_id": str(uuid.uuid4()),
                    "package_id": package_id,
                    "customer_id": customer,
                    "service_id": service_id,
                    "checkout_ref": checkout,
                    "line_ref": "l1",
                    "note": "",
                },
            )
            .replace("BEGIN;\n", "", 1)
            .replace("\nCOMMIT;", "", 1)
        )

    a, b = session(), session()
    try:
        a.stdin.write("BEGIN;\n" + statements("race-a") + "\n")
        a.stdin.flush()
        time.sleep(0.6)  # A holds the ordinal, uncommitted.
        b.stdin.write("BEGIN;\n" + statements("race-b") + "\n")
        b.stdin.flush()
        time.sleep(
            0.6
        )  # B is now blocked on the index (or, unguarded, already through).
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
    live = int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE package_id = '{package_id}' AND customer_id = '{customer}' AND is_deleted = 0"
        )
    )
    return live, err


# ── the run ──────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_voucher_tender_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")
        colour = seed_service(db, HUB, "Colour")

        print("A. the tender only offers what COVERS THIS LINE")
        five_cuts = seed_package(
            db, HUB, "Bono 5 cortes", max_uses=5, validity_days=None
        )
        seed_item(db, HUB, five_cuts, cut)
        rows = options(db, "cus-1", cut)
        check("one voucher covers a cut", 1, len(rows))
        check(
            "it is the cuts voucher", five_cuts, rows[0]["package_id"] if rows else None
        )
        check("sessions left now", 5, rows[0]["remaining_before"] if rows else None)
        check(
            "sessions left AFTER redeeming — the preview",
            4,
            rows[0]["remaining_after"] if rows else None,
        )
        check("it is the default", 1, rows[0]["is_default"] if rows else None)
        check("with nothing to break a tie against", "only_option", rows[0]["default_reason"] if rows else None)
        check("and it says so: one candidate", 1, rows[0]["candidate_count"] if rows else None)
        check(
            "a cuts voucher does not cover a colour", [], options(db, "cus-1", colour)
        )

        print("\nB. a voucher of another hub is not offered here")
        seed_service(db, OTHER_HUB, "Cut")
        foreign_cut = db.scalar(
            f"SELECT id FROM services_service WHERE hub_id = '{OTHER_HUB}' AND name = 'Cut'"
        )
        foreign = seed_package(
            db, OTHER_HUB, "Bono vecino", max_uses=5, validity_days=None
        )
        seed_item(db, OTHER_HUB, foreign, foreign_cut)
        check(
            "the neighbour's voucher is invisible",
            [],
            [r for r in options(db, "cus-1", cut, hub=HUB) if r["package_id"] == foreign],
        )
        check(
            "and the neighbour cannot see ours either",
            [],
            [
                r
                for r in options(db, "cus-1", foreign_cut, hub=OTHER_HUB)
                if r["package_id"] == five_cuts
            ],
        )

        print("\nC. an archived or expired voucher is NOT a tender")
        archived = seed_package(
            db, HUB, "Bono archivado", max_uses=5, validity_days=None
        )
        seed_item(db, HUB, archived, colour)
        db.psql(
            [],
            db=db.name,
            stdin=f"UPDATE services_package SET is_active = 0 WHERE id = '{archived}';",
        )
        check("an archived voucher is not offered", [], options(db, "cus-2", colour))

        expiring = seed_package(db, HUB, "Bono caduca", max_uses=None, validity_days=30)
        seed_item(db, HUB, expiring, colour)
        raw_insert(db, expiring, "cus-3", 1, status="consumed", redeemed_at=LONG_AGO)
        check("an expired voucher is not offered", [], options(db, "cus-3", colour))

        print("\nD. 🔴 the voucher cannot be spent twice — through the COMMAND")
        one_shot = seed_package(
            db, HUB, "Bono 1 sesion", max_uses=1, validity_days=None
        )
        seed_item(db, HUB, one_shot, cut)
        first = hold(db, one_shot, cut, "chk-1", "line-1")
        check("the session is held", (1, 0), residue(db, one_shot))
        check(
            "the exhausted voucher is no longer offered",
            [],
            options(db, "cus-1", cut)
            and [r for r in options(db, "cus-1", cut) if r["package_id"] == one_shot],
        )
        refused(
            "a second line covered by the same 1-session voucher",
            lambda: hold(db, one_shot, cut, "chk-1", "line-2"),
        )
        check("still exactly one row, guard empty", (1, 0), residue(db, one_shot))

        print("\nE. 🔴 …and through RAW SQL that skips the command")
        refused(
            "a raw INSERT reusing use_index 1",
            lambda: raw_insert(
                db, one_shot, "cus-1", 1, checkout_ref="chk-x", line_ref="line-x"
            ),
        )
        refused(
            "a raw INSERT covering an already covered line",
            lambda: raw_insert(
                db, one_shot, "cus-1", 2, checkout_ref="chk-1", line_ref="line-1"
            ),
        )
        check("nothing got in", (1, 0), residue(db, one_shot))

        print("\nF. 🔴 …and under TWO REAL CONCURRENT TRANSACTIONS")
        racy = seed_package(db, HUB, "Bono carrera", max_uses=1, validity_days=None)
        seed_item(db, HUB, racy, cut)
        live, err = concurrent_holds(db, racy, cut, "cus-race")
        check("only ONE till got the last session", 1, live)
        check(
            "the loser was refused by the database",
            True,
            "services_package_redemption" in err or "unique" in err.lower(),
        )

        print(
            "\nG. the hold is UNDONE while the sale is not settled — and the session comes back"
        )
        check("release touches the held row", 1, release(db, first))
        check("the session is back", (0, 0), residue(db, one_shot))
        back = [r for r in options(db, "cus-1", cut) if r["package_id"] == one_shot]
        check("the voucher is offered again", 1, len(back))
        check(
            "with its session restored",
            1,
            back[0]["remaining_before"] if back else None,
        )

        print("\nH. …but NOT after it is settled")
        again = hold(db, one_shot, cut, "chk-2", "line-1")
        check("settle marks it consumed", 1, settle(db, again, "sale-42"))
        check(
            "status and stamp",
            ["consumed", "sale-42"],
            json.loads(
                db.scalar(
                    "SELECT json_build_array(status, sale_id) FROM services_package_redemption "
                    f"WHERE id = '{again}'"
                )
            ),
        )
        check(
            "settled_at is stamped",
            1,
            int(
                db.scalar(
                    f"SELECT count(*) FROM services_package_redemption WHERE id = '{again}' AND settled_at IS NOT NULL"
                )
            ),
        )
        check("releasing a settled redemption touches NOTHING", 0, release(db, again))
        check("the session stays spent", (1, 0), residue(db, one_shot))
        check("settling twice touches NOTHING", 0, settle(db, again, "sale-99"))

        print(
            "\nI. the sale settles the holds of its checkout by event, with no caller's help"
        )
        by_event = seed_package(db, HUB, "Bono evento", max_uses=3, validity_days=None)
        seed_item(db, HUB, by_event, cut)
        h1 = hold(db, by_event, cut, "order-7", "line-1", customer="cus-ev")
        h2 = hold(db, by_event, cut, "order-7", "line-2", customer="cus-ev")
        hold(db, by_event, cut, "order-8", "line-1", customer="cus-ev")
        touched = _rows_touched(
            db,
            "services._settle_holds_for_sale",
            {"order_id": "order-7", "sale_id": "sale-7"},
            HUB,
        )
        check("both holds of that checkout settled, and only those", 2, touched)
        check(
            "the other checkout is untouched",
            "held",
            db.scalar(
                "SELECT status FROM services_package_redemption "
                f"WHERE checkout_ref = 'order-8' AND customer_id = 'cus-ev'"
            ),
        )
        check(
            "a sale with no checkout ref settles nothing",
            0,
            _rows_touched(
                db,
                "services._settle_holds_for_sale",
                {"order_id": None, "sale_id": "sale-9"},
                HUB,
            ),
        )
        check(
            "the settled ones carry the sale",
            2,
            int(
                db.scalar(
                    "SELECT count(*) FROM services_package_redemption "
                    f"WHERE id IN ('{h1}', '{h2}') AND sale_id = 'sale-7' AND settled_at IS NOT NULL"
                )
            ),
        )

        print("\nJ. two valid vouchers: the tie-break decides, and it says WHY")
        highlights = seed_service(db, HUB, "Highlights")
        soon = seed_package(db, HUB, "Bono caduca pronto", max_uses=5, validity_days=30)
        seed_item(db, HUB, soon, highlights)
        never = seed_package(db, HUB, "Bono sin caducidad", max_uses=5, validity_days=None)
        seed_item(db, HUB, never, highlights)
        raw_insert(db, soon, "cus-9", 1, status="consumed", redeemed_at=RECENT)
        raw_insert(db, never, "cus-9", 1, status="consumed", redeemed_at=RECENT)
        two = options(db, "cus-9", highlights)
        check("both are offered", 2, len(two))
        check("the one that EXPIRES is spent first", soon, two[0]["package_id"] if two else None)
        check("and it is flagged as the default", 1, two[0]["is_default"] if two else None)
        check("the reason is named, not implied", "expires_first", two[0]["default_reason"] if two else None)
        check("the operator is told there WAS a choice", 2, two[0]["candidate_count"] if two else None)
        check("the other is not the default", 0, two[1]["is_default"] if len(two) > 1 else None)
        check("only the default carries a reason", "", two[1]["default_reason"] if len(two) > 1 else None)
        check("it had already spent one session", 4, two[0]["remaining_before"] if two else None)
        check("so the preview says three are left after this one", 3, two[0]["remaining_after"] if two else None)

        print("\nJ2. a FINITE voucher is spent before an unlimited one — even if the finite one never expires")
        unlimited = seed_package(db, HUB, "Bono ilimitado", max_uses=None, validity_days=30)
        finite = seed_package(db, HUB, "Bono 3 sesiones", max_uses=3, validity_days=None)
        blowdry = seed_service(db, HUB, "Blowdry")
        seed_item(db, HUB, unlimited, blowdry)
        seed_item(db, HUB, finite, blowdry)
        vs = options(db, "cus-12", blowdry)
        check("both offered", 2, len(vs))
        check("the finite one goes first", finite, vs[0]["package_id"] if vs else None)
        check("named reason", "finite_before_unlimited", vs[0]["default_reason"] if vs else None)
        check("an unlimited voucher previews no count", None, vs[1]["remaining_after"] if len(vs) > 1 else "missing")

        print("\nK. nothing else separates them: the one with FEWER sessions left goes first")
        big = seed_package(db, HUB, "Bono 10", max_uses=10, validity_days=None)
        small = seed_package(db, HUB, "Bono 2", max_uses=2, validity_days=None)
        trim = seed_service(db, HUB, "Trim")
        seed_item(db, HUB, big, trim)
        seed_item(db, HUB, small, trim)
        pair = options(db, "cus-10", trim)
        check("both offered", 2, len(pair))
        check("the shortest one first", small, pair[0]["package_id"] if pair else None)
        check("named reason", "fewest_sessions_left", pair[0]["default_reason"] if pair else None)

        print("\nL. the order is TOTAL — identical vouchers still have one winner, always")
        twin_a = seed_package(db, HUB, "Bono gemelo A", max_uses=4, validity_days=None)
        twin_b = seed_package(db, HUB, "Bono gemelo B", max_uses=4, validity_days=None)
        wash = seed_service(db, HUB, "Wash")
        seed_item(db, HUB, twin_a, wash)
        seed_item(db, HUB, twin_b, wash)
        db.psql([], db=db.name, stdin=(
            "UPDATE services_package SET created_at = '2026-08-19T10:00:00Z' "
            f"WHERE id = '{twin_b}';"))
        older = options(db, "cus-11", wash)
        check("the older voucher wins", twin_a, older[0]["package_id"] if older else None)
        check("named reason", "oldest_voucher", older[0]["default_reason"] if older else None)

        print("\nM. …and when even the age is identical, the order is still not left to chance")
        db.psql([], db=db.name, stdin=(
            f"UPDATE services_package SET created_at = '{NOW}' WHERE id = '{twin_b}';"))
        runs = [[r["package_id"] for r in options(db, "cus-11", wash)] for _ in range(4)]
        check("no tie is left to chance", sorted([twin_a, twin_b]), runs[0])
        check("and it is stable across four looks at the same screen", [runs[0]] * 4, runs)
        check("the last resort is named too", "stable_order",
              options(db, "cus-11", wash)[0]["default_reason"])
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "PASS — the voucher covers lines, previews the spend, cannot be spent twice and undoes cleanly"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
