#!/usr/bin/env python3
"""services#52 — the three business reasons behind the gate, against a REAL Postgres.

The runtime halves of the fix live elsewhere: the reason→code mapping is the WASM handler's
(unit-tested in `handler/src/lib.rs`), and the manifest wiring is
`tests/redeem_reasons.contract.test.py`. What only the database can prove is the OTHER half of
the issue's acceptance criteria:

  1. `services.packages.redeem_check` — the read the handler now refuses with — answers the
     RIGHT reason for each scenario: no grant at all, exhausted, expired, archived voucher (and
     an other-hub grant is unknown, not "yours"). Since services#73 the question is asked about a
     GRANT — the customer's purchase — so `no_grant` is the first and most common refusal: it is
     what a customer who never bought the voucher gets, where the old model handed them five free
     sessions.
  2. The gated statements (`services._redeem`: conditional INSERT + assert + clear) still refuse
     and ROLL BACK in every one of those scenarios — the read is advisory, the gate stays the
     transactional authority, so a race between the read and the write still aborts.
  3. After a refusal NOTHING is left behind: no redemption row, no row in the guard table.
  4. The happy path still writes the ledger row and leaves the guard table empty in repose.

Usage: tests/redeem_reasons.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import re
import sys
import uuid

from pg_harness import HUB, MODULE_DIR, OTHER_HUB, ScratchDb, container_available, script_for

failures: list[str] = []

# `pg_harness.NOW` — the harness binds every :now to this instant.
NOW = "2026-08-18T10:00:00Z"
# 48 days before NOW: with validity_days = 30, a voucher BOUGHT here is long expired — and it is
# expired with zero uses, which is the whole point of moving the anchor to the purchase.
BOUGHT_LONG_AGO = "2026-07-01T10:00:00Z"

# The hub's db layer lowers the `erp_*` SQL bridges (ADR-0007) to native Postgres before PREPARE;
# this miniature does the same for the ONLY two this module uses (`erp_dt`, `erp_dateadd`), the
# same way `appointments/tests/availability.postgres.test.py` shims its larger set.
BRIDGES = ("erp_dt", "erp_dateadd")


def lower_bridge(name: str, args: list[str]) -> str | None:
    if name == "erp_dt" and len(args) == 1:
        return f"(({args[0]})::timestamptz)"
    if name == "erp_dateadd" and len(args) == 3:
        return f"(({args[0]})::timestamptz + (({args[1]}) || ' ' || {args[2]})::interval)"
    return None


def lower_bridges(sql: str) -> str:
    """Rewrite every `erp_*(…)` call to its native Postgres expression (args may nest)."""
    if not any(f in sql for f in BRIDGES):
        return sql
    call = re.compile(r"\b(erp_dt|erp_dateadd)\s*\(", re.IGNORECASE)
    while True:
        m = call.search(sql)
        if not m:
            return sql
        depth, i = 1, m.end()
        while i < len(sql) and depth:
            if sql[i] == "(":
                depth += 1
            elif sql[i] == ")":
                depth -= 1
            i += 1
        inner, args, depth, start = sql[m.end() : i - 1], [], 0, 0
        for j, c in enumerate(inner):
            if c == "(":
                depth += 1
            elif c == ")":
                depth -= 1
            elif c == "," and depth == 0:
                args.append(inner[start:j])
                start = j + 1
        args.append(inner[start:])
        native = lower_bridge(m.group(1).lower(), [a.strip() for a in args])
        if native is None:
            raise RuntimeError(f"cannot lower the bridge call {sql[m.start():i]!r}")
        sql = sql[: m.start()] + native + sql[i:]


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(db: ScratchDb, label: str, fn, named: str | None = None) -> None:
    """The gated statements must REFUSE — an exception is the pass; a silent success is the fail.

    `named` is the index the refusal has to name (services#128): the runtime renames it to the
    domain code the caller reads (`on_unique`, hub#2081), so a refusal by any other constraint —
    the generic `package_redeemable` CHECK — reaches the till as the kernel's bare `db`."""
    try:
        fn()
    except RuntimeError as exc:
        first = str(exc).splitlines()[0][:140]
        if named is None or f'constraint "{named}"' in first:
            print(f"  ok: refused {label} ({first})")
        else:
            failures.append(f"{label}: refused, but not by `{named}` ({first})")
            print(f"  FAIL: refused {label} by the wrong constraint ({first}; expected {named})")
        return
    failures.append(f"{label}: the gate ACCEPTED it")
    print(f"  FAIL: the gate ACCEPTED {label}")


def seed_service(db: ScratchDb, hub: str, name: str) -> str:
    db.run_command(
        "services.services.create",
        {"name": name, "price": 1000, "duration_minutes": 30, "tax_category_key": "standard"},
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
            "slug": name.lower(),
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


def seed_grant(
    db: ScratchDb,
    package_id: str,
    customer: str = "cus-1",
    hub: str = HUB,
    granted_at: str = NOW,
) -> str:
    """The PURCHASE row (services#73): without one there is nothing to redeem."""
    from pg_harness import USER, bind

    grant_id = str(uuid.uuid4())
    params = {
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
        "hub_id": hub,
        "current_user_id": USER,
        "now": NOW,
    }
    script = ["BEGIN;"]
    for rel in ("commands/_grant_insert.sql", "commands/_grant_assert.sql", "commands/_gate_clear.sql"):
        script.append(lower_bridges(bind((MODULE_DIR / rel).read_text(), params)))
    script.append("COMMIT;")
    db.psql([], db=db.name, stdin="\n".join(script))
    return grant_id


def redeem(db: ScratchDb, grant_id: str, hub: str = HUB) -> None:
    """One use consumed through the gated statements, the way the handler's intention runs:
    the manifest's own `services._redeem`, every statement of it, in its order."""
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._redeem",
            {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": grant_id,
                "service_id": None,
                "appointment_id": None,
                "sale_id": None,
                "note": "",
            },
            hub=hub,
        ),
    )


def hold(db: ScratchDb, grant_id: str, service_id: str, hub: str = HUB) -> None:
    """One session held for a till line through the manifest's `services._hold`."""
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._hold",
            {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": grant_id,
                "service_id": service_id,
                "checkout_ref": f"chk-{uuid.uuid4().hex[:6]}",
                "line_ref": "l1",
                "note": "",
            },
            hub=hub,
        ),
    )


def reason_of(db: ScratchDb, grant_id: str) -> dict:
    from pg_harness import bind

    sql = (MODULE_DIR / "queries/package_redeem_check.sql").read_text().rstrip().rstrip(";")
    lowered = lower_bridges(bind(sql, {"hub_id": HUB, "now": NOW, "grant_id": grant_id}))
    out = db.psql(["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({lowered}) t"], db=db.name)
    rows = json.loads(out.strip() or "[]")
    return rows[0] if rows else {}


def check_reason(db: ScratchDb, label: str, expected_reason: str, grant_id: str) -> None:
    row = reason_of(db, grant_id)
    check(f"redeem_check reason · {label}", expected_reason, row.get("reason"))
    check(f"redeem_check redeemable · {label}", 0, row.get("redeemable"))


def residue(db: ScratchDb, grant_id: str) -> tuple[int, int]:
    redemptions = int(
        db.scalar(
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )
    gate = int(db.scalar("SELECT count(*) FROM services__gate"))
    return redemptions, gate


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_redeem_reasons_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")
        print("A. exhausted — the 3rd use of a 2-use voucher")
        capped = seed_package(db, HUB, "Bono 2 usos", max_uses=2, validity_days=None)
        capped_grant = seed_grant(db, capped)
        redeem(db, capped_grant)
        redeem(db, capped_grant)
        check("two uses consumed", 2, residue(db, capped_grant)[0])
        check_reason(db, "exhausted", "no_uses_left", capped_grant)
        refused(db, "the 3rd use", lambda: redeem(db, capped_grant), "services_redeem_no_uses_left")
        check("no redemption row was left behind", (2, 0), residue(db, capped_grant))

        print("\nB. expired — validity_days ran out since the PURCHASE, with zero uses")
        expiring = seed_package(db, HUB, "Bono caduca", max_uses=None, validity_days=30)
        stale = seed_grant(db, expiring, granted_at=BOUGHT_LONG_AGO)
        check_reason(db, "expired", "expired", stale)
        refused(db, "a use past the deadline", lambda: redeem(db, stale), "services_redeem_expired")
        check("nothing was written", (0, 0), residue(db, stale))

        print("\nC. NO GRANT — the customer never bought that voucher (services#73)")
        ghost = str(uuid.uuid4())
        check_reason(db, "a grant that does not exist", "no_grant", ghost)
        refused(db, "a redemption with no purchase behind it", lambda: redeem(db, ghost), "services_redeem_no_grant")
        check("no residue at all", (0, 0), residue(db, ghost))

        print("\nD. archived voucher — the grant is real, the template is gone")
        archived = seed_package(db, HUB, "Bono retirado", max_uses=2, validity_days=None)
        archived_grant = seed_grant(db, archived)
        db.psql(["-c", f"UPDATE services_package SET is_active = 0 WHERE id = '{archived}'"], db=db.name)
        check_reason(db, "archived voucher", "package_not_found", archived_grant)
        refused(db, "a use of an archived voucher", lambda: redeem(db, archived_grant), "services_redeem_package_not_found")
        check("nothing was written", (0, 0), residue(db, archived_grant))

        print("\nE. another hub's GRANT is UNKNOWN here, not shared")
        seed_service(db, OTHER_HUB, "Cut")
        foreign_pkg = seed_package(db, OTHER_HUB, "Bono 2 usos", max_uses=2, validity_days=None)
        foreign = seed_grant(db, foreign_pkg, customer="cus-next-door", hub=OTHER_HUB)
        check_reason(db, "other hub's grant", "no_grant", foreign)
        refused(db, "a cross-hub redemption", lambda: redeem(db, foreign), "services_redeem_no_grant")
        check("the other hub's ledger is untouched", (0, 0), residue(db, foreign))

        print("\nF. the happy path still writes the ledger and empties the guard")
        fresh = seed_package(db, HUB, "Bono abierto", max_uses=None, validity_days=None)
        fresh_grant = seed_grant(db, fresh)
        check("redeem_check redeemable", 1, reason_of(db, fresh_grant).get("redeemable"))
        redeem(db, fresh_grant)
        check("one use consumed, gate empty in repose", (1, 0), residue(db, fresh_grant))

        print("\nG. VOIDED — the voucher was sold, then voided: it says so (services#128)")
        voided_pkg = seed_package(db, HUB, "Bono anulado", max_uses=5, validity_days=None)
        voided_grant = seed_grant(db, voided_pkg)
        db.psql(
            [],
            db=db.name,
            stdin=script_for(
                "services._void_grant", {"grant_id": voided_grant, "reason": "Sold twice"}
            ),
        )
        check_reason(db, "a voided voucher", "voided", voided_grant)
        refused(db, "a use of a voided voucher", lambda: redeem(db, voided_grant), "services_redeem_voided")
        refused(db, "a hold on a voided voucher", lambda: hold(db, voided_grant, cut), "services_redeem_voided")
        check("nothing was written", (0, 0), residue(db, voided_grant))

        print("\nH. the TILL's statement names the same reasons, and one more of its own")
        refused(db, "a hold on an exhausted voucher", lambda: hold(db, capped_grant, cut), "services_redeem_no_uses_left")
        refused(db, "a hold past the deadline", lambda: hold(db, stale, cut), "services_redeem_expired")
        refused(db, "a hold with no purchase behind it", lambda: hold(db, ghost, cut), "services_redeem_no_grant")
        # `fresh` has sessions and no deadline, but no item: it covers no service at all.
        refused(db, "a hold on a line the voucher does not cover", lambda: hold(db, fresh_grant, cut), "services_redeem_does_not_cover_service")
        check("the refusals left no row behind", "0", db.scalar("SELECT count(*) FROM services__redeem_gate"))

        print("\nI. the refusal statement on its own: a refusal NO rule explains still has a code")
        # A live voucher with sessions, no deadline, covering `cut` — every rule says yes, yet the
        # INSERT «wrote nothing» (the statement runs alone). The closed fallback names it, and at
        # the chair (`service_id` NULL) coverage is not what is wrong with it.
        covered = seed_package(db, HUB, "Bono cubierto", max_uses=None, validity_days=None)
        db.run_command(
            "services._insert_package_item",
            {"item_id": str(uuid.uuid4()), "package_id": covered, "service_id": cut,
             "quantity": 1_000_000, "sort_order": 0},
        )
        covered_grant = seed_grant(db, covered)
        other = seed_service(db, HUB, "Tinte")

        def refusal_alone(service_id, grant_id=covered_grant):
            from pg_harness import USER, bind

            sql = (MODULE_DIR / "commands/_redeem_refusal.sql").read_text()
            params = {"redemption_id": str(uuid.uuid4()), "grant_id": grant_id,
                      "service_id": service_id, "hub_id": HUB, "current_user_id": USER, "now": NOW}
            db.psql([], db=db.name, stdin="BEGIN;\n" + lower_bridges(bind(sql, params)) + "\nROLLBACK;")

        refused(db, "an unexplained refusal at the chair", lambda: refusal_alone(None), "services_redeem_not_redeemable")
        refused(db, "an unexplained refusal of a covered line", lambda: refusal_alone(cut), "services_redeem_not_redeemable")
        refused(db, "a line of a service the voucher does not cover", lambda: refusal_alone(other), "services_redeem_does_not_cover_service")

        # A session given back (a released hold is soft-deleted) is a session left: a voucher of 1
        # whose only use was released is NOT exhausted.
        one = seed_package(db, HUB, "Bono uno", max_uses=1, validity_days=None)
        released = seed_grant(db, one)
        redeem(db, released)
        db.psql(["-c", f"UPDATE services_package_redemption SET is_deleted = 1 WHERE grant_id = '{released}'"], db=db.name)
        refused(db, "a voucher whose only session was given back", lambda: refusal_alone(None, released), "services_redeem_not_redeemable")

        # The last instant of validity is still valid (the INSERT's own `<=`): bought exactly
        # `validity_days` ago is not expired yet.
        edge = seed_package(db, HUB, "Bono un día", max_uses=None, validity_days=1)
        last_day = seed_grant(db, edge, granted_at="2026-08-17T10:00:00Z")
        refused(db, "a voucher on its very last instant", lambda: refusal_alone(None, last_day), "services_redeem_not_redeemable")

        print("\nJ. the NEIGHBOUR's rows never change the reason given here (tenancy)")
        # Every row below lives in OTHER_HUB but points at an id of HUB — the only way a reason
        # read without `hub_id` would answer differently from the one read with it.
        # A voided voucher next door is still a voucher this hub does not have.
        db.psql([], db=db.name, stdin=script_for(
            "services._void_grant", {"grant_id": foreign, "reason": "Sold twice"}, hub=OTHER_HUB))
        check_reason(db, "other hub's VOIDED grant", "no_grant", foreign)

        # Sessions the neighbour spent are not this voucher's: 0 of 1 used here, and expired.
        lapsed_pkg = seed_package(db, HUB, "Bono vencido", max_uses=1, validity_days=30)
        lapsed = seed_grant(db, lapsed_pkg, granted_at=BOUGHT_LONG_AGO)
        spent_next_door = seed_grant(db, foreign_pkg, customer="cus-next-door-2", hub=OTHER_HUB)
        redeem(db, spent_next_door, hub=OTHER_HUB)
        db.psql(["-c", "UPDATE services_package_redemption SET grant_id = "
                 f"'{lapsed}' WHERE hub_id = '{OTHER_HUB}' AND grant_id = '{spent_next_door}'"], db=db.name)
        refused(db, "an expired voucher the neighbour «spent»", lambda: redeem(db, lapsed), "services_redeem_expired")

        # A correction next door does not give this voucher sessions back: 1 of 1 used here.
        single_pkg = seed_package(db, HUB, "Bono una sesión", max_uses=1, validity_days=None)
        single = seed_grant(db, single_pkg)
        redeem(db, single)
        db.psql(["-c", "INSERT INTO services_package_grant_adjustment "
                 "(id, hub_id, grant_id, uses_delta, days_delta, reason, adjusted_at, is_deleted) VALUES "
                 f"('{uuid.uuid4()}', '{OTHER_HUB}', '{single}', 5, 0, 'next door', '{NOW}', 0)"], db=db.name)
        refused(db, "a used-up voucher the neighbour «topped up»", lambda: redeem(db, single), "services_redeem_no_uses_left")

        # A line of the neighbour's catalogue does not make this voucher cover a service. Written
        # by hand: `_insert_package_item` itself refuses a package of another hub.
        db.psql(["-c", "INSERT INTO services_packageitem "
                 "(id, hub_id, package_id, service_id, quantity, sort_order, is_deleted) VALUES "
                 f"('{uuid.uuid4()}', '{OTHER_HUB}', '{covered}', '{other}', 1, 0, 0)"], db=db.name)
        check("the neighbour's line is there", "1", db.scalar(
            f"SELECT count(*) FROM services_packageitem WHERE hub_id = '{OTHER_HUB}' AND package_id = '{covered}'"))
        refused(db, "a line the neighbour's item «covers»", lambda: hold(db, covered_grant, other), "services_redeem_does_not_cover_service")

        # A grant whose voucher only exists next door has no voucher here.
        moved_pkg = seed_package(db, HUB, "Bono movido", max_uses=None, validity_days=None)
        moved = seed_grant(db, moved_pkg)
        db.psql(["-c", f"UPDATE services_package_grant SET package_id = '{foreign_pkg}' WHERE id = '{moved}'"], db=db.name)
        refused(db, "a voucher whose template lives next door", lambda: redeem(db, moved), "services_redeem_package_not_found")
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — the gate refuses for the right reason and leaves nothing behind")
    return 0


if __name__ == "__main__":
    sys.exit(main())
