#!/usr/bin/env python3
"""services#153 — a voucher already SOLD outlives the catalogue row it was sold from.

The bug: deleting a voucher from **Bonos y paquetes** (or deactivating it through the API) left
every customer who had bought it unable to spend it. The till stopped offering it, a hold or a use
at the chair was refused with «that package does not exist in this business», and the catalogue
lost the row the «Bonos vendidos» and «Movimientos» sheets hang from — while the delete prompt
promised that «vouchers already sold keep their balance».

The market agrees with the prompt, not with the code (Square, Fresha, Booksy, Mindbody, Vagaro:
retiring a package stops SELLING it; what was sold is still the customer's, until it runs out or
expires). The rule this battery pins:

  A. a sold voucher of a DELETED package is still offered at the till for the services it covers,
     the pre-check says it is redeemable, and a hold and a use at the chair go through;
  B. it still covers ONLY what it was sold with: the lines deleted with the package keep covering,
     and a service it never included is refused for that reason;
  C. the same holds for a package DEACTIVATED (is_active = 0) without being deleted;
  D. retiring stops the SALE: a new grant of a deleted or deactivated package is refused;
  E. `services.packages.list` answers retired packages only when the catalogue asks for them
     (`include_retired`), with `status = 'retired'`, and only those with something sold — the
     `sale.completed` listener reads this very query with no params and must not see them;
  F. the «Bonos vendidos» and «Movimientos» of a retired package still answer;
  G. none of it crosses hubs;
  H. the refusal statement on its own names a retired package's covered line as covered: if a
     hold of it is ever refused, the reason is not «does not cover this service».

Usage: tests/retired_package.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import sys
import uuid

from pg_harness import (
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


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def refused(label: str, fn, needle: str) -> None:
    """The statement must FAIL, and for the reason named — not for any reason."""
    try:
        fn()
    except RuntimeError as exc:
        hit = needle in str(exc)
        print(
            f"  {'ok' if hit else 'FAIL'}: {label} refused"
            + ("" if hit else f" for another reason: {exc}")
        )
        if not hit:
            failures.append(f"{label}: refused without `{needle}`: {exc}")
        return
    print(f"  FAIL: {label} went through")
    failures.append(f"{label}: expected a refusal with `{needle}`, it went through")


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
    db: ScratchDb, hub: str, name: str, service_ids: list[str], max_uses=5
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
            "validity_days": None,
            "max_uses": max_uses,
            "sort_order": 0,
            "is_active": 1,
            "is_featured": 0,
        },
        hub=hub,
    )
    for idx, service_id in enumerate(service_ids):
        db.run_command(
            "services._insert_package_item",
            {
                "item_id": str(uuid.uuid4()),
                "package_id": package_id,
                "service_id": service_id,
                "quantity": 1_000_000,
                "sort_order": idx,
            },
            hub=hub,
        )
    return package_id


def sell(db: ScratchDb, package_id: str, customer: str, hub: str = HUB) -> str:
    """The PURCHASE, through the manifest's own `services._grant` (what both the till's
    `sale.completed` listener and the manual grant run)."""
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
                "granted_at": None,
                "source": "manual",
                "sale_id": None,
                "sale_ref": "",
                "amount_cents": 5000,
                "net_amount_cents": 4132,
                "tax_amount_cents": 868,
                "note": "",
            },
            hub=hub,
        ),
    )
    return grant_id


def delete_package(db: ScratchDb, package_id: str, hub: str = HUB) -> None:
    db.run_command("services.packages.delete", {"package_id": package_id}, hub=hub)


def deactivate(db: ScratchDb, package_id: str) -> None:
    db.psql(
        ["-c", f"UPDATE services_package SET is_active = 0 WHERE id = '{package_id}'"],
        db=db.name,
    )


def rows_of(db: ScratchDb, name: str, params: dict, hub: str = HUB) -> list[dict]:
    sql = query_sql(name, params, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def offered(db: ScratchDb, customer: str, service_id: str, hub: str = HUB) -> list[str]:
    rows = rows_of(
        db,
        "services.packages.tender_options",
        {"customer_id": customer, "service_id": service_id},
        hub,
    )
    return [r["grant_id"] for r in rows]


def precheck(db: ScratchDb, grant_id: str, hub: str = HUB) -> tuple:
    row = rows_of(db, "services.packages.redeem_check", {"grant_id": grant_id}, hub)[0]
    return (row["redeemable"], row["reason"])


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
                "checkout_ref": f"chk-{uuid.uuid4().hex[:6]}",
                "line_ref": "l1",
                "note": "",
            },
            hub=hub,
        ),
    )


def redeem(db: ScratchDb, grant_id: str, hub: str = HUB) -> None:
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


def spent(db: ScratchDb, grant_id: str) -> int:
    return int(
        db.scalar(
            f"SELECT count(*) FROM services_package_redemption WHERE grant_id = '{grant_id}' AND is_deleted = 0"
        )
    )


def catalogue(db: ScratchDb, hub: str = HUB, **params) -> dict[str, str]:
    """`{name: status}` of what `services.packages.list` answers with these params."""
    return {
        r["name"]: r.get("status")
        for r in db.run_query("services.packages.list", params, hub=hub)
    }


def main() -> int:
    if not container_available():
        print("SKIPPED — no Postgres test container")
        return 0

    db = ScratchDb("services_retired_package_test")
    db.create()
    try:
        cut = seed_service(db, HUB, "Cut")
        colour = seed_service(db, HUB, "Colour")

        print("A. a sold voucher of a DELETED package is still spent")
        deleted = seed_package(db, HUB, "Bono 5 cortes", [cut])
        alice = sell(db, deleted, "cus-alice")
        delete_package(db, deleted)
        check(
            "the package is deleted",
            "1",
            db.scalar(
                f"SELECT is_deleted FROM services_package WHERE id = '{deleted}'"
            ),
        )
        check(
            "the till still offers it for the cut",
            [alice],
            offered(db, "cus-alice", cut),
        )
        check("the pre-check says it is redeemable", (1, ""), precheck(db, alice))
        hold(db, alice, cut)
        check("a hold at the till goes through", 1, spent(db, alice))
        redeem(db, alice)
        check("a use at the chair goes through", 2, spent(db, alice))

        print("\nB. it still covers ONLY what it was sold with")
        check(
            "the till does not offer it for a colour",
            [],
            offered(db, "cus-alice", colour),
        )
        refused(
            "a hold for a service it never included",
            lambda: hold(db, alice, colour),
            "services_redeem_does_not_cover_service",
        )
        check("the refused hold left nothing", 2, spent(db, alice))

        print("\nC. a DEACTIVATED (not deleted) package: the same")
        inactive = seed_package(db, HUB, "Bono desactivado", [cut])
        bob = sell(db, inactive, "cus-bob")
        deactivate(db, inactive)
        check("the till still offers it", [bob], offered(db, "cus-bob", cut))
        check("the pre-check says it is redeemable", (1, ""), precheck(db, bob))
        hold(db, bob, cut)
        redeem(db, bob)
        check("a hold and a use go through", 2, spent(db, bob))

        print("\nD. retiring stops the SALE")
        refused(
            "selling a deleted package",
            lambda: sell(db, deleted, "cus-new"),
            "services__gate",
        )
        refused(
            "selling a deactivated package",
            lambda: sell(db, inactive, "cus-new"),
            "services__gate",
        )
        check(
            "no grant was minted",
            "0",
            db.scalar(
                "SELECT count(*) FROM services_package_grant WHERE customer_id = 'cus-new'"
            ),
        )

        print(
            "\nE. the catalogue shows retired packages only when asked, and only if sold"
        )
        live = seed_package(db, HUB, "Bono vivo", [cut])
        never_sold = seed_package(db, HUB, "Bono nunca vendido", [cut])
        delete_package(db, never_sold)
        check(
            "by default (the sale.completed listener's read): live and inactive only",
            {"Bono vivo": "active", "Bono desactivado": "inactive"},
            catalogue(db),
        )
        check(
            "with include_retired: the deleted one that was sold, as retired",
            {
                "Bono vivo": "active",
                "Bono desactivado": "inactive",
                "Bono 5 cortes": "retired",
            },
            catalogue(db, include_retired=1),
        )
        check(
            "include_retired as the string a <select> sends",
            "retired",
            catalogue(db, include_retired="1").get("Bono 5 cortes"),
        )
        _ = live

        print(
            "\nF. «Bonos vendidos» and «Movimientos» of a retired package still answer"
        )
        sold = rows_of(db, "services.packages.grants", {"package_id": deleted})
        check(
            "Bonos vendidos lists the purchase", [alice], [r["grant_id"] for r in sold]
        )
        check("…with what is left", 3, sold[0]["remaining"])
        moves = rows_of(
            db, "services.packages.redemption_history", {"package_id": deleted}
        )
        check("Movimientos lists the two sessions", 2, len(moves))

        print("\nG. none of it crosses hubs")
        foreign_cut = seed_service(db, OTHER_HUB, "Cut")
        foreign = seed_package(db, OTHER_HUB, "Bono vecino", [foreign_cut])
        neighbour = sell(db, foreign, "cus-alice", hub=OTHER_HUB)
        delete_package(db, foreign, hub=OTHER_HUB)
        check(
            "the neighbour's retired package is not in this catalogue",
            None,
            catalogue(db, include_retired=1).get("Bono vecino", None),
        )
        check(
            "…and is in its own",
            "retired",
            catalogue(db, hub=OTHER_HUB, include_retired=1).get("Bono vecino"),
        )
        check(
            "the neighbour's voucher is not offered here",
            [],
            offered(db, "cus-alice", foreign_cut),
        )
        check("…nor redeemable from here", (0, "no_grant"), precheck(db, neighbour))

        print("\nH. the refusal statement on its own: a retired package's line still covers")
        # `alice` has sessions left, no deadline passed and her package's lines were deleted with
        # it. Every rule says yes, yet the statement runs alone (the INSERT «wrote nothing»): the
        # closed fallback names it. Reading coverage through the DELETED lines as missing would
        # tell the cashier «this voucher does not cover the cut» about a voucher of cuts.
        def refusal_alone(service_id: str) -> None:
            sql = (MODULE_DIR / "commands/_redeem_refusal.sql").read_text()
            params = {
                "redemption_id": str(uuid.uuid4()),
                "grant_id": alice,
                "service_id": service_id,
                "hub_id": HUB,
                "current_user_id": USER,
                "now": NOW,
            }
            db.psql(
                [],
                db=db.name,
                stdin="BEGIN;\n" + lower_bridges(bind(sql, params)) + "\nROLLBACK;",
            )

        refused(
            "an unexplained refusal of the cut it was sold with",
            lambda: refusal_alone(cut),
            "services_redeem_not_redeemable",
        )
        refused(
            "…while a colour it never included is still «does not cover»",
            lambda: refusal_alone(colour),
            "services_redeem_does_not_cover_service",
        )
    except (RuntimeError, KeyError, IndexError) as exc:
        failures.append(f"the run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} check(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        "PASS — retiring a voucher stops selling it; what was sold is still spent, covered and visible"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
