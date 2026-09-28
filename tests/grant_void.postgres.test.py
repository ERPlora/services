#!/usr/bin/env python3
"""services#82 — a voucher sold BY MISTAKE can be voided, and the void leaves a trail.

Until this, a grant (the purchase row of ADR-0390) was written once and never touched: the wrong
voucher, the wrong customer or the same voucher rung up twice stayed there with every session
spendable. What is proven here, against a REAL Postgres:

  1. VOIDING AN UNUSED GRANT takes it out of every door that spends or offers a session — the
     balance, the till's tender options, the redemption pre-check and the gated redeem itself —
     while the row STAYS, stamped with who voided it, when and why.
  2. The pre-check (`services.packages.void_check`) names the reason a void is refused:
     `grant_not_found`, `already_voided`, `in_use` (a session was already held or spent).
  3. The void statement itself refuses the same cases (zero rows touched), so a race between the
     read and the write cannot void a grant somebody is spending — the runtime's `expect_rows`
     turns that zero into `services.grant_not_voidable`.
  4. TENANCY: the neighbour hub cannot void — nor even see — this hub's grant.
  5. A REDELIVERED `sale.completed` does not mint the voided voucher again: the sale reference
     stays the idempotence key even after the void.
  6. The voucher's list of sold grants (`services.packages.grants`) shows the voided one with its
     trail, and only this hub's.

Usage: tests/grant_void.postgres.test.py   (exit 0 = green; SKIPPED without the container)
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
    list_page,
    query_sql,
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


def seed_package(db: ScratchDb, hub: str, name: str, service_id: str) -> str:
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


# ── the doors under test ─────────────────────────────────────────────────────


def grant(
    db: ScratchDb,
    package_id: str,
    customer: str,
    hub: str = HUB,
    sale_ref: str = "",
    grant_id: str | None = None,
) -> str:
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
                "granted_at": NOW,
                "source": "sale" if sale_ref else "manual",
                "sale_id": "sale-1" if sale_ref else None,
                "sale_ref": sale_ref,
                "amount_cents": 10000,
                "net_amount_cents": 8264,
                "tax_amount_cents": 1736,
                "note": "",
            },
            hub=hub,
        ),
    )
    return gid


def redeem(db: ScratchDb, grant_id: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._redeem",
            {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": grant_id,
                "appointment_id": None,
                "sale_id": None,
                "note": "",
            },
            hub=hub,
        ),
    )


def hold(db: ScratchDb, grant_id: str, service_id: str, hub: str = HUB) -> None:
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._hold",
            {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": grant_id,
                "service_id": service_id,
                "checkout_ref": "order-1",
                "line_ref": "line-1",
                "note": "",
            },
            hub=hub,
        ),
    )


def void(
    db: ScratchDb,
    grant_id: str,
    reason: str = "Sold to the wrong customer",
    hub: str = HUB,
) -> int:
    """The statements of `services._void_grant`, as the handler emits them. Returns rows voided."""
    out = db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._void_grant", {"grant_id": grant_id, "reason": reason}, hub=hub
        ),
    )
    return sum(
        int(line.split()[1]) for line in out.splitlines() if line.startswith("UPDATE ")
    )


def rows(db: ScratchDb, name: str, params: dict, hub: str = HUB) -> list[dict]:
    sql = query_sql(name, params, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def void_check(db: ScratchDb, grant_id: str, hub: str = HUB) -> dict:
    found = rows(db, "services.packages.void_check", {"grant_id": grant_id}, hub=hub)
    return (
        {"voidable": found[0]["voidable"], "reason": found[0]["reason"]}
        if found
        else {}
    )


def live_grants(db: ScratchDb, customer: str, hub: str = HUB) -> list[str]:
    return [
        r["grant_id"]
        for r in rows(
            db, "services.packages.balance", {"customer_id": customer}, hub=hub
        )
    ]


# ── 1 · voiding an unused grant ──────────────────────────────────────────────


def void_an_unused_grant(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n1 · an UNUSED grant is voided: out of every door, and the row keeps the trail"
    )
    wrong = grant(db, pkg, "cus-wrong")
    check(
        "the pre-check says it can be voided",
        {"voidable": 1, "reason": ""},
        void_check(db, wrong),
    )
    check("one grant voided", 1, void(db, wrong, "  Sold to the wrong customer  "))

    trail = json.loads(
        db.scalar(
            "SELECT row_to_json(g) FROM (SELECT is_deleted, voided_at, voided_by, void_reason, "
            f"deleted_at FROM services_package_grant WHERE id = '{wrong}') g"
        )
    )
    check("the row STAYS (soft-deleted, not removed)", 1, trail["is_deleted"])
    check("who voided it", USER, trail["voided_by"])
    check("when", NOW, trail["voided_at"])
    check(
        "why — trimmed, never empty", "Sold to the wrong customer", trail["void_reason"]
    )
    check("the balance no longer lists it", [], live_grants(db, "cus-wrong"))
    check(
        "the till does not offer it",
        [],
        rows(
            db,
            "services.packages.tender_options",
            {"customer_id": "cus-wrong", "service_id": svc},
        ),
    )
    # services#128: refused AS VOIDED. It answered `no_grant` until then — «nobody sold it to this
    # customer» — which sends the cashier to sell the voucher again instead of telling them why.
    check(
        "the redemption pre-check refuses it as voided",
        "voided",
        rows(db, "services.packages.redeem_check", {"grant_id": wrong})[0]["reason"],
    )
    refused("a redeem against the voided grant", lambda: redeem(db, wrong))
    refused("a hold against the voided grant", lambda: hold(db, wrong, svc))
    check(
        "the guard table is empty at rest",
        0,
        int(db.scalar("SELECT count(*) FROM services__gate")),
    )


# ── 2 + 3 · what cannot be voided, by the read and by the write ─────────────


def what_cannot_be_voided(db: ScratchDb, svc: str, pkg: str) -> None:
    print(
        "\n2 · the pre-check names WHY a void is refused, and the write refuses the same"
    )
    missing = str(uuid.uuid4())
    check(
        "a grant that does not exist",
        {"voidable": 0, "reason": "grant_not_found"},
        void_check(db, missing),
    )
    check("… and nothing is voided", 0, void(db, missing))

    twice = grant(db, pkg, "cus-twice")
    void(db, twice)
    check(
        "a grant already voided",
        {"voidable": 0, "reason": "already_voided"},
        void_check(db, twice),
    )
    before = db.scalar(
        f"SELECT void_reason FROM services_package_grant WHERE id = '{twice}'"
    )
    check("… a second void touches nothing", 0, void(db, twice, "another reason"))
    check(
        "… and the first trail is not re-stamped",
        before,
        db.scalar(
            f"SELECT void_reason FROM services_package_grant WHERE id = '{twice}'"
        ),
    )

    spent = grant(db, pkg, "cus-spent")
    redeem(db, spent)
    check(
        "a grant with a session SPENT",
        {"voidable": 0, "reason": "in_use"},
        void_check(db, spent),
    )
    check("… is not voided by the write either", 0, void(db, spent))
    check("… and it is still spendable", [spent], live_grants(db, "cus-spent"))

    held = grant(db, pkg, "cus-held")
    hold(db, held, svc)
    check(
        "a grant with a session HELD at the till",
        {"voidable": 0, "reason": "in_use"},
        void_check(db, held),
    )
    check("… is not voided by the write either", 0, void(db, held))

    blank = grant(db, pkg, "cus-blank")
    check("a void with a blank reason touches nothing", 0, void(db, blank, "   "))
    check("… so the grant is still live", [blank], live_grants(db, "cus-blank"))


# ── 4 · tenancy ─────────────────────────────────────────────────────────────


def the_neighbour_cannot_void(db: ScratchDb, pkg: str) -> None:
    print("\n4 · the neighbour hub cannot void — nor see — this hub's grant")
    mine = grant(db, pkg, "cus-mine")
    check(
        "for the neighbour it does not exist",
        {"voidable": 0, "reason": "grant_not_found"},
        void_check(db, mine, hub=OTHER_HUB),
    )
    check("the neighbour's void touches nothing", 0, void(db, mine, hub=OTHER_HUB))
    check("the grant is still live here", [mine], live_grants(db, "cus-mine"))
    check(
        "and carries no trail",
        "",
        db.scalar(
            f"SELECT COALESCE(voided_at, '') FROM services_package_grant WHERE id = '{mine}'"
        ),
    )


# ── 5 · a redelivered sale does not mint it again ───────────────────────────


def the_sale_does_not_mint_it_again(db: ScratchDb, pkg: str) -> None:
    print("\n5 · a redelivered `sale.completed` does not bring the voided voucher back")
    sold = grant(db, pkg, "cus-sold", sale_ref="sale-1:line-1:1")
    void(db, sold, "Rung up twice by mistake")
    grant(
        db, pkg, "cus-sold", sale_ref="sale-1:line-1:1"
    )  # the redelivery: must not raise
    check(
        "still exactly one grant for that sale line, and it is the voided one",
        [[sold, 1]],
        [
            [r["id"], r["is_deleted"]]
            for r in json.loads(
                db.scalar(
                    "SELECT COALESCE(json_agg(g), '[]'::json) FROM (SELECT id, is_deleted "
                    "FROM services_package_grant WHERE sale_ref = 'sale-1:line-1:1') g"
                )
            )
        ],
    )
    check("the customer has nothing to spend", [], live_grants(db, "cus-sold"))


# ── 6 · the voucher's list of sold grants ───────────────────────────────────


def the_sold_list_shows_the_trail(db: ScratchDb, pkg: str, other_pkg: str) -> None:
    print(
        "\n6 · the list of sold grants shows the voided one with its trail, only this hub's"
    )
    # A row of the NEIGHBOUR that names THIS hub's package id: ids are opaque, so only the hub_id
    # filter keeps it out — a `package_id` filter alone would let it through.
    stray = grant(db, other_pkg, "cus-stray", hub=OTHER_HUB)
    db.psql(
        [],
        db=db.name,
        stdin=f"UPDATE services_package_grant SET package_id = '{pkg}' WHERE id = '{stray}';\n",
    )
    page = list_page(db, "services.packages.grants", {"package_id": pkg, "limit": 500})
    by_customer = {r["customer_id"]: r for r in page["rows"]}
    check(
        "a neighbour's row pointing at this package id is not in this hub's list",
        False,
        "cus-stray" in by_customer,
    )
    voided = by_customer["cus-wrong"]
    check("the voided grant is listed", "voided", voided["status"])
    check("with its reason", "Sold to the wrong customer", voided["void_reason"])
    check("and who voided it", USER, voided["voided_by"])
    check("a voided grant offers no void", 0, voided["can_void"])
    check("an unused live grant offers it", 1, by_customer["cus-blank"]["can_void"])
    check("a live grant is active", "active", by_customer["cus-blank"]["status"])
    check("a spent grant does not offer it", 0, by_customer["cus-spent"]["can_void"])
    check("… and says how many were used", 1, by_customer["cus-spent"]["used"])
    check("… and how many remain", 4, by_customer["cus-spent"]["remaining"])
    check(
        "the neighbour's grant is not in this hub's list",
        False,
        "cus-theirs" in by_customer,
    )
    check(
        "the neighbour sees only its own",
        ["cus-theirs"],
        [
            r["customer_id"]
            for r in list_page(
                db, "services.packages.grants", {"package_id": other_pkg}, hub=OTHER_HUB
            )["rows"]
        ],
    )
    check(
        "filtering by status keeps only the voided",
        {"voided"},
        {
            r["status"]
            for r in list_page(
                db,
                "services.packages.grants",
                {"package_id": pkg, "f_status": "voided"},
            )["rows"]
        },
    )


# ── main ─────────────────────────────────────────────────────────────────────


def main() -> int:
    if not container_available():
        print(f"SKIPPED: no Postgres in container {CONTAINER}")
        return 0
    db = ScratchDb("services_grant_void")
    db.create()
    try:
        svc = seed_service(db, HUB, "Haircut")
        pkg = seed_package(db, HUB, "Five haircuts", svc)
        other_svc = seed_service(db, OTHER_HUB, "Haircut")
        other_pkg = seed_package(db, OTHER_HUB, "Five haircuts", other_svc)
        grant(db, other_pkg, "cus-theirs", hub=OTHER_HUB)
        void_an_unused_grant(db, svc, pkg)
        what_cannot_be_voided(db, svc, pkg)
        the_neighbour_cannot_void(db, pkg)
        the_sale_does_not_mint_it_again(db, pkg)
        the_sold_list_shows_the_trail(db, pkg, other_pkg)
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED ({len(failures)}):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "✓ grant_void: a voucher sold by mistake is voided, with its trail, only in its own hub"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
