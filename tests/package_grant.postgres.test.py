#!/usr/bin/env python3
"""services#73 — the ENTITLEMENT is a row, and nothing is spent without one (ADR-0386 / ADR-0390).

Until this, `services_package` was a CATALOGUE row and the relationship customer<->voucher was
materialised by the FIRST REDEMPTION. Two things followed, and both are money:

  * a customer who NEVER BOUGHT the voucher could redeem it, and `max_uses` was counted per
    customer over the catalogue package — so every customer in the hub had their own N free
    sessions;
  * the validity clock was anchored on the first use, so a voucher bought a year ago and never
    started had not expired, and there was no row saying WHEN or FOR HOW MUCH the right was sold.

The second half is what collides with ADR-0386: a voucher of N sessions is UNIVALENT, so the
fiscal record comes out WHEN THE VOUCHER IS SOLD (art. 30 ter.1 of Directive 2006/112/CE — the
supply made in exchange for the voucher «shall not be regarded as an independent transaction»).
Without a purchase row there is nothing to accrue and nothing to audit.

What is proven here, against a REAL Postgres:

  1. NO GRANT, NO SESSION — at the chair and at the till, and through RAW SQL that skips the
     commands entirely. A guard that only lives in a statement is a guard the next statement
     forgets.
  2. The grant is what is COUNTED: `max_uses` comes from the grant's snapshot, so exhausting one
     grant does not touch another.
  3. TWO GRANTS of the same voucher for the same customer COEXIST and are spent in the order of
     the tie-break of services#70 — a case that was impossible before.
  4. EXPIRY RUNS FROM THE PURCHASE, with zero uses. A voucher bought 40 days ago with 30 days of
     validity is expired even if it was never started.
  5. The grant is a SNAPSHOT: editing the catalogue voucher afterwards does not change what was
     already sold.
  6. Tenancy: the neighbour hub's grant is invisible, not merely unauthorised.
  7. The BACKFILL of migration 013 does not change a single balance of a hub that already had
     redemptions — the convivence plan the issue demands.

Usage: tests/package_grant.postgres.test.py   (exit 0 = green; SKIPPED without the container)
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
    migration_entries,
    query_sql,
    script_for,
)

failures: list[str] = []

# NOW is 2026-08-18T10:00:00Z (pg_harness). These are read against it:
FORTY_DAYS_AGO = "2026-07-09T10:00:00Z"  # with validity_days = 30 → expired, uses or not
TEN_DAYS_AGO = "2026-08-08T10:00:00Z"  # with validity_days = 30 → still valid
LONG_AGO = "2026-06-01T10:00:00Z"
# The row was WRITTEN a week after the session was redeemed (a sync, an import, a backdated fix).
# Keeping the two apart is what makes the backfill's anchor testable at all.
RECORDED_LATER = "2026-06-08T10:00:00Z"


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


def grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    hub: str = HUB,
    granted_at: str | None = None,
    sale_ref: str = "",
    amount_cents: int = 10000,
    grant_id: str | None = None,
) -> str:
    """`services.packages.grant` — the purchase row. Returns the grant id."""
    gid = grant_id or str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._grant",
            {
                "grant_id": gid,
                "package_id": package_id,
                "customer_id": customer,
                "granted_at": granted_at or NOW,
                "source": "manual",
                "sale_id": None,
                "sale_ref": sale_ref,
                "amount_cents": amount_cents,
                "net_amount_cents": amount_cents,
                "tax_amount_cents": 0,
                "note": "",
            },
            hub=hub,
        ),
    )
    return gid


def redeem(
    db: ScratchDb,
    grant_id: str,
    hub: str = HUB,
    redemption_id: str | None = None,
    now: str | None = None,
) -> str:
    """The gated statements of `services._redeem` (the chair path), as the handler runs them."""
    rid = redemption_id or str(uuid.uuid4())
    params = {
        "redemption_id": rid,
        "grant_id": grant_id,
        "appointment_id": None,
        "sale_id": None,
        "note": "",
    }
    if now:
        params["now"] = now
    db.psql([], db=db.name, stdin=script_for("services._redeem", params, hub=hub))
    return rid


def hold(
    db: ScratchDb,
    grant_id: str,
    service_id: str,
    checkout_ref: str,
    line_ref: str,
    hub: str = HUB,
    redemption_id: str | None = None,
) -> str:
    """The gated statements of `services._hold` (the till path)."""
    rid = redemption_id or str(uuid.uuid4())
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
            },
            hub=hub,
        ),
    )
    return rid


def rows(db: ScratchDb, name: str, params: dict, hub: str = HUB) -> list[dict]:
    sql = query_sql(name, params, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


# ── 1 · no grant, no session ─────────────────────────────────────────────────


def no_grant_no_session(db: ScratchDb) -> None:
    print("\n1 · a customer who never bought CANNOT spend a session")
    svc = seed_service(db, HUB, "Haircut")
    pkg = seed_package(db, HUB, "Five haircuts", 5, 30)
    seed_item(db, HUB, pkg, svc)
    stranger = "cus-never-bought"

    check(
        "tender_options offers nothing to a customer with no grant",
        [],
        rows(
            db,
            "services.packages.tender_options",
            {"customer_id": stranger, "service_id": svc},
        ),
    )
    check(
        "redeem_check refuses with no_grant",
        [{"redeemable": 0, "reason": "no_grant"}],
        [
            {"redeemable": r["redeemable"], "reason": r["reason"]}
            for r in rows(
                db,
                "services.packages.redeem_check",
                {"grant_id": str(uuid.uuid4()), "customer_id": stranger},
            )
        ],
    )
    refused("a redeem against a grant that does not exist", lambda: redeem(db, str(uuid.uuid4())))
    refused(
        "a hold against a grant that does not exist",
        lambda: hold(db, str(uuid.uuid4()), svc, "order-x", "line-x"),
    )
    check(
        "nothing was written",
        0,
        int(db.scalar("SELECT count(*) FROM services_package_redemption")),
    )
    check("the guard table is empty at rest", 0, int(db.scalar("SELECT count(*) FROM services__gate")))
    return svc, pkg


# ── 2 · the grant is what is counted ─────────────────────────────────────────


def the_grant_is_what_is_counted(db: ScratchDb, svc: str, pkg: str) -> None:
    print("\n2 · `max_uses` is the GRANT's snapshot, not the catalogue's counter per customer")
    alice = grant(db, pkg, "cus-alice")
    for _ in range(5):
        redeem(db, alice)
    check(
        "five sessions spent",
        5,
        int(db.scalar(f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{alice}' AND is_deleted = 0")),
    )
    refused("the sixth session of an exhausted grant", lambda: redeem(db, alice))

    print("  … and a SECOND customer's grant is untouched by the first's")
    bob = grant(db, pkg, "cus-bob")
    redeem(db, bob)
    check(
        "bob spent one of his own five",
        1,
        int(db.scalar(f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{bob}' AND is_deleted = 0")),
    )


# ── 3 · two grants of the same voucher coexist ───────────────────────────────


def two_grants_coexist(db: ScratchDb, svc: str, pkg: str) -> None:
    print("\n3 · two grants of the SAME voucher for the SAME customer coexist and queue")
    carol = "cus-carol"
    older = grant(db, pkg, carol, granted_at=TEN_DAYS_AGO)  # expires sooner
    newer = grant(db, pkg, carol, granted_at=NOW)
    offered = rows(
        db,
        "services.packages.tender_options",
        {"customer_id": carol, "service_id": svc},
    )
    check("both grants are offered", 2, len(offered))
    check("the candidate count says there were two", 2, offered[0]["candidate_count"])
    check("the one that EXPIRES FIRST is the default", older, offered[0]["grant_id"])
    check("and it says why", "expires_first", offered[0]["default_reason"])
    check("the runner-up carries no reason", "", offered[1]["default_reason"])

    # Spend the older one whole; the newer one keeps its own five.
    for _ in range(5):
        hold(db, older, svc, "order-c", str(uuid.uuid4()))
    refused("a sixth session of the exhausted grant", lambda: hold(db, older, svc, "order-c", "extra"))
    still = rows(
        db,
        "services.packages.tender_options",
        {"customer_id": carol, "service_id": svc},
    )
    check("only the newer grant is left", [newer], [r["grant_id"] for r in still])
    check("with its five sessions intact", 5, still[0]["remaining_before"])
    # 🔴 And it can actually be SPENT. Reading `tender_options` is not enough: that query counts per
    # grant already, so a guard that had gone back to counting over (package, customer) would still
    # offer this voucher and refuse it at the till — measured, that mutant SURVIVED until the line
    # below existed. What proves the pool is per-purchase is a session landing on the second grant
    # after the first one is exhausted.
    hold(db, newer, svc, "order-c2", str(uuid.uuid4()))
    check(
        "a session lands on the SECOND purchase, with the first one exhausted",
        1,
        int(db.scalar(f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{newer}' AND is_deleted = 0")),
    )
    # The chair path has its own guard (`_redeem_insert.sql`) and its own copy of the count, so it
    # is exercised here too rather than left to be caught sideways by another battery.
    redeem(db, newer)
    check(
        "and the two ledgers stay apart: 5 on one purchase, 2 on the other",
        [5, 2],
        [
            int(db.scalar(f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{g}' AND is_deleted = 0"))
            for g in (older, newer)
        ],
    )


# ── 4 · expiry runs from the PURCHASE ────────────────────────────────────────


def expiry_runs_from_the_purchase(db: ScratchDb, svc: str, pkg: str) -> None:
    print("\n4 · the validity clock starts at the PURCHASE, with zero uses")
    dora = "cus-dora"
    stale = grant(db, pkg, dora, granted_at=FORTY_DAYS_AGO)
    check(
        "an unstarted voucher bought 40 days ago is expired",
        [],
        rows(
            db,
            "services.packages.tender_options",
            {"customer_id": dora, "service_id": svc},
        ),
    )
    check(
        "redeem_check names it",
        "expired",
        rows(
            db,
            "services.packages.redeem_check",
            {"grant_id": stale, "customer_id": dora},
        )[0]["reason"],
    )
    refused("redeeming an expired grant", lambda: redeem(db, stale))
    # The expiry is not a stored string: it is the pair (granted_at, validity_days) snapshotted on
    # the grant, read through the same `erp_dateadd` bridge as everywhere else in this module.
    balance = [
        r for r in rows(db, "services.packages.balance", {"customer_id": dora})
        if r["grant_id"] == stale
    ]
    check("the balance names the grant", 1, len(balance))
    check("anchored on the purchase, not on a first use it never had", FORTY_DAYS_AGO, balance[0]["granted_at"])
    check("with no session spent", 0, balance[0]["used"])
    check("and reported as expired", 1, balance[0]["is_expired"])
    check(
        "the expiry is 30 days after the PURCHASE",
        "2026-08-08T10:00:00+00:00",
        balance[0]["expires_at"],
    )


# ── 5 · the grant is a SNAPSHOT ──────────────────────────────────────────────


def the_grant_is_a_snapshot(db: ScratchDb, svc: str) -> None:
    print("\n5 · editing the catalogue voucher does not change what was already sold")
    pkg = seed_package(db, HUB, "Three facials", 3, 30)
    seed_item(db, HUB, pkg, svc)
    erin = grant(db, pkg, "cus-erin")
    db.psql(
        ["-c", f"UPDATE services_package SET max_uses = 1, validity_days = 1 WHERE id = '{pkg}'"],
        db=db.name,
    )
    check(
        "the grant keeps the three sessions it was sold",
        3,
        int(db.scalar(f"SELECT max_uses FROM services_package_grant WHERE id = '{erin}'")),
    )
    for _ in range(3):
        redeem(db, erin)
    check(
        "and all three can be spent",
        3,
        int(db.scalar(f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{erin}' AND is_deleted = 0")),
    )


# ── 6 · tenancy ──────────────────────────────────────────────────────────────


def the_neighbour_is_invisible(db: ScratchDb) -> None:
    print("\n6 · the neighbour hub's grant is INVISIBLE, not merely unauthorised")
    svc = seed_service(db, OTHER_HUB, "Haircut")
    pkg = seed_package(db, OTHER_HUB, "Five haircuts", 5, 30)
    seed_item(db, OTHER_HUB, pkg, svc)
    theirs = grant(db, pkg, "cus-next-door", hub=OTHER_HUB)
    check(
        "our hub sees nothing of it",
        [],
        rows(
            db,
            "services.packages.tender_options",
            {"customer_id": "cus-next-door", "service_id": svc},
            hub=HUB,
        ),
    )
    refused("redeeming the neighbour's grant from our hub", lambda: redeem(db, theirs, hub=HUB))


# ── 7 · raw SQL cannot write a redemption without a grant ────────────────────


def raw_sql_cannot_skip_the_grant(db: ScratchDb, pkg: str) -> None:
    """The door a migration, a support script or a future command comes through.

    🔴 The package and the customer are REAL and the ordinal is free, so the ONLY thing wrong with
    this row is that no purchase stands behind it — and the positive control below proves it, by
    writing the SAME row with a grant and watching it land. Naming a made-up package here would get
    the row refused by the foreign key to `services_package`, and the check would pass while proving
    nothing: measured, with a fake package id, deleting `ck_services_redemption_grant` from the
    migration left this battery GREEN.
    """
    print("\n7 · the guard is in the SCHEMA: raw SQL cannot write a session with no grant")

    def raw(grant_id: str | None) -> None:
        column = ", grant_id" if grant_id else ""
        value = f", '{grant_id}'" if grant_id else ""
        db.psql(
            [
                "-c",
                "INSERT INTO services_package_redemption "
                f"(id, hub_id, package_id, customer_id, redeemed_at, status, use_index, is_deleted, "
                f" created_by, updated_by, created_at, updated_at{column}) VALUES "
                f"('{uuid.uuid4()}', '{HUB}', '{pkg}', 'cus-raw', '{NOW}', 'consumed', 99, 0, "
                f" '{USER}', '{USER}', '{NOW}', '{NOW}'{value})",
            ],
            db=db.name,
        )

    refused("a redemption inserted with no grant_id", lambda: raw(None))
    refused("…and one naming a grant that does not exist", lambda: raw(str(uuid.uuid4())))
    raw(grant(db, pkg, "cus-raw"))
    check(
        "…while the same row backed by a real purchase gets in",
        1,
        int(db.scalar("SELECT count(*) FROM services_package_redemption WHERE customer_id = 'cus-raw'")),
    )


# ── 8 · the sale mints the grant, and only once ──────────────────────────────


def the_sale_mints_the_grant_once(db: ScratchDb, svc: str, pkg: str) -> None:
    """The idempotence of the `sale.completed` listener, in the STATEMENTS (services#73).

    The relay is at-least-once. The handler composes one `services._grant` per unit sold, each
    carrying a `sale_ref` — `<sale_id>#<line>#<unit>` — and this is the half only the database can
    prove: the second delivery writes NOTHING and still passes the assert, so the event is marked
    delivered instead of dead-lettering forever, and the customer gets one voucher rather than two.
    """
    print("\n8 · a redelivered `sale.completed` grants the voucher ONCE")
    frank = "cus-frank"
    ref = "sale-100#0#0"
    first = grant(db, pkg, frank, sale_ref=ref, amount_cents=12100)
    check(
        "the sale granted it",
        1,
        int(db.scalar(f"SELECT count(*) FROM services_package_grant WHERE sale_ref = '{ref}'")),
    )
    # The redelivery: a DIFFERENT grant id, the SAME document. It must not write, and it must not
    # blow up either — an assert that failed here would dead-letter work that is already done.
    second = str(uuid.uuid4())
    grant(db, pkg, frank, sale_ref=ref, amount_cents=12100, grant_id=second)
    check(
        "the redelivery wrote nothing",
        1,
        int(db.scalar(f"SELECT count(*) FROM services_package_grant WHERE sale_ref = '{ref}'")),
    )
    check(
        "and the id of the retry names no row",
        0,
        int(db.scalar(f"SELECT count(*) FROM services_package_grant WHERE id = '{second}'")),
    )
    check(
        "the customer has ONE voucher, not two",
        1,
        len(rows(db, "services.packages.tender_options", {"customer_id": frank, "service_id": svc})),
    )
    check(
        "the money of the purchase is on the row, base and VAT apart",
        [12100, 12100, 0],
        json_of(db, f"SELECT json_build_array(amount_cents, net_amount_cents, tax_amount_cents) "
                    f"FROM services_package_grant WHERE id = '{first}'"),
    )
    # 🔴 The schema is the other half: the index refuses a second live grant on the same document
    # even through raw SQL, which is the door a support script or a future command comes through.
    refused(
        "a raw INSERT reusing the same sale line",
        lambda: db.psql(
            [
                "-c",
                "INSERT INTO services_package_grant "
                "(id, hub_id, package_id, customer_id, granted_at, source, sale_ref, is_deleted) "
                f"VALUES ('{uuid.uuid4()}', '{HUB}', '{pkg}', '{frank}', '{NOW}', 'sale', '{ref}', 0)",
            ],
            db=db.name,
        ),
    )


def json_of(db: ScratchDb, sql: str):
    return json.loads(db.scalar(sql))


# ── 9 · the backfill of a hub that already had redemptions ───────────────────


def the_backfill_keeps_every_balance(db_name_prefix: str) -> None:
    print("\n9 · migration 013 does not change one balance of a hub that already redeemed")
    db = ScratchDb(db_name_prefix)
    db.create(through="migrations/postgres/012_voucher_refund.sql")
    try:
        svc = seed_service(db, HUB, "Haircut")
        pkg = seed_package(db, HUB, "Five haircuts", 5, 30)
        seed_item(db, HUB, pkg, svc)
        # Two customers with history written by the OLD model: no grant existed.
        # 🔴 `created_at` is deliberately a DIFFERENT instant from `redeemed_at`. They are equal in
        # real life often enough that a backfill anchored on the wrong one would look right: with
        # both set to the same value, anchoring the legacy grant on `created_at` instead of on the
        # first USE passed this battery. The clock those rows were already being judged by is the
        # first use, so that is the one that has to survive the migration.
        for i in range(3):
            db.psql(
                [
                    "-c",
                    "INSERT INTO services_package_redemption "
                    "(id, hub_id, package_id, customer_id, redeemed_at, status, use_index, "
                    " is_deleted, created_by, updated_by, created_at, updated_at) VALUES "
                    f"('{uuid.uuid4()}', '{HUB}', '{pkg}', 'cus-old', '{LONG_AGO}', 'consumed', "
                    f" {i + 1}, 0, '{USER}', '{USER}', '{RECORDED_LATER}', '{RECORDED_LATER}')",
                ],
                db=db.name,
            )
        db.apply("migrations/postgres/013_package_grant.sql")
        # The subject of this section is 013's backfill, but the checks below ask
        # `services.packages.balance` — a query of the CURRENT module, which since services#77
        # reads `expires_at`. A hub never runs a query against a half-migrated schema (the runtime
        # applies every declared migration before serving), so the mirror must not either: EVERY
        # migration after 013 goes in (the balance reads the adjustments of services#118 too).
        entries = migration_entries()
        start = [rel for rel, _ in entries].index("migrations/postgres/013_package_grant.sql") + 1
        after = entries[start:]
        for rel, kind in after:
            db.apply(rel, kind)
        check(
            "one legacy grant was minted for the pair (voucher, customer)",
            1,
            int(db.scalar(f"SELECT count(*) FROM services_package_grant WHERE customer_id = 'cus-old'")),
        )
        check(
            "every existing redemption now points at it",
            0,
            int(db.scalar("SELECT count(*) FROM services_package_redemption WHERE grant_id IS NULL")),
        )
        check(
            "the balance is the one the hub had: 3 used of 5",
            [3, 2],
            [
                r["used"]
                for r in rows(db, "services.packages.balance", {"customer_id": "cus-old"})
            ]
            + [
                r["remaining"]
                for r in rows(db, "services.packages.balance", {"customer_id": "cus-old"})
            ],
        )
        check(
            "the legacy anchor is the FIRST USE, not today — the clock it already had",
            LONG_AGO,
            db.scalar("SELECT granted_at FROM services_package_grant WHERE customer_id = 'cus-old'"),
        )
        check(
            "and it is marked as legacy, so nobody mistakes it for a sale",
            "legacy",
            db.scalar("SELECT source FROM services_package_grant WHERE customer_id = 'cus-old'"),
        )
    finally:
        db.drop()


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_grant")
    db.create()
    try:
        svc, pkg = no_grant_no_session(db)
        the_grant_is_what_is_counted(db, svc, pkg)
        two_grants_coexist(db, svc, pkg)
        expiry_runs_from_the_purchase(db, svc, pkg)
        the_grant_is_a_snapshot(db, svc)
        the_neighbour_is_invisible(db)
        raw_sql_cannot_skip_the_grant(db, pkg)
        the_sale_mints_the_grant_once(db, svc, pkg)
    finally:
        db.drop()
    the_backfill_keeps_every_balance("services_grant_legacy")

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("✓ package_grant: the entitlement is a row, and nothing is spent without one")
    return 0


if __name__ == "__main__":
    sys.exit(main())
