#!/usr/bin/env python3
"""Spending a session of a voucher, against a REAL kernel — the hub's own
`services_package_redeem_e2e.rs` (ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5,
slice: services).

The hub was the only place this path was exercised end to end, and it had no business being there:
what those four tests asserted is `services` behaviour, so the kernel was pinning the topology of
somebody else's module and going red for the whole fleet whenever `services` published. It moves
here whole.

What the Postgres batteries next door CANNOT prove, and this one does — the reason the battery
speaks HTTP instead of binding SQL itself:

  * `services.packages.redeem` is not a statement, it is an INTENTION. The dispatcher pre-loads the
    `reads` (`services.packages.redeem_check`, `required`) the WASM handler fails closed without,
    the handler translates the gate's reason into a namespaced domain code, and the host mints the
    `:redemption_id` the statements then verify. `redeem_reasons.postgres.test.py` proves what each
    guard COMPUTES; only a runtime proves what a caller RECEIVES.
  * The refusal reaches the wire as an `error.code` (HTTP 409), not as
    `violates check constraint "services__gate_ok_check"` (services#52) and not as the redacted
    «the request could not be completed» a WASM trap would become (hub#1074). Measured, not
    assumed: breaking a check in `queries/package_redeem_check.sql` turns every refusal below into
    `{"code": "db"}` with HTTP 400 — which IS the regression services#52 fixed.
  * A refused redemption leaves NOTHING — no ledger row, no session spent. Every refusal below
    re-reads the balance to say so.
  * The declared `emit` actually leaves: `services.package.redeemed` is announced with the grant it
    spent, which is what any listener downstream is wired to.

Which door each refusal comes out of, stated exactly so nobody reads more into a green than is
there: the answer a caller receives is the PRE-CHECK's (`services.packages.redeem_check`, pre-loaded
by the dispatcher as a `required` read) mapped to a code by the handler. The conditional INSERT in
`commands/_redeem_insert.sql` re-evaluates the same rules INSIDE the transaction and the
`services__gate` CHECK aborts it — defence in depth against the race between the read and the write,
and unreachable from here because nothing over HTTP can win that race on purpose (removing guard 1
from the statement leaves this battery green, verified). That gate is
`redeem_reasons.postgres.test.py` §2's, which binds directly and can. This battery owns the door the
till actually knocks on.

What is NOT ported, and why it is not a gap: the hub test's `install_registers_redeem_capabilities`
introspected `registry()` — that installing a module registers every surface it declares (and that a
declared `emit` reaches the outbox) is a KERNEL guarantee, and the KCS already pins it against the
kernel's own fixture module
(`kernel_conformance_install::installing_registers_every_declared_surface_hub1238`,
`kernel_conformance_events::a_declared_emit_travels_through_the_outbox_to_its_listener_hub1238`).
What is `services`' own — that IT declares the redeem/balance pair and announces
`services.package.redeemed` — is asserted here the way a caller sees it: by using both doors and
reading the event the hub recorded (§4). A battery cannot read `listeners_for`, and does not need to.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on its
own: without a runtime it fails, it does not skip.
"""

import sys

import hub_harness
from hub_harness import Hub, balance_of, catalog_service, create_package, grant, tag

# 🔴 A voucher bought this long before `:now`, with one day of validity, is expired AND was never
# started. That pairing is the whole point of services#73: before it, the clock was anchored on the
# FIRST USE, so an unstarted voucher had no clock at all and one bought a year ago had not expired
# and never would. It is a fixed instant in the past, not `now - 10 days`, so the assertion does not
# move with the machine's clock.
BOUGHT_LONG_AGO = "2026-06-15T10:00:00.000Z"


def test_1_a_voucher_nobody_sold_cannot_be_spent(hub: Hub) -> None:
    print("\n1 · no purchase, no session — and the refusal says WHICH thing is missing")
    customer = tag("cust-never-bought")
    package = create_package(
        hub, tag("Bono sin vender"), max_uses=3, validity_days=None
    )

    hub.refused(
        "an id that is no grant of this hub",
        "services.packages.redeem",
        {"grant_id": "does-not-exist"},
        "services.package_no_grant",
    )
    # 🔴 The catalogue row is NOT an entitlement. Naming the package where the grant goes is the
    # exact mistake services#73 removed — under the old model that call succeeded and handed three
    # free sessions to a customer who had bought nothing — and it must now be refused as what it is:
    # nobody sold this. `package_no_grant` and `package_not_found` are deliberately different codes
    # (`handler/src/lib.rs::refusal_for`): only one of them is fixed by selling the voucher.
    hub.refused(
        "the CATALOGUE id passed off as a purchase",
        "services.packages.redeem",
        {"grant_id": package},
        "services.package_no_grant",
    )

    hub.check(
        "a customer who bought nothing has no balance at all",
        hub.query("services.packages.balance", {"customer_id": customer}),
        [],
    )


def test_2_sessions_decrement_and_max_uses_blocks(hub: Hub) -> None:
    print(
        "\n2 · a bought voucher spends exactly the sessions it was sold, and not one more"
    )
    customer = tag("cust-three")
    package = create_package(hub, tag("Bono 3 cortes"), max_uses=3, validity_days=None)
    grant_id = grant(hub, package, customer)

    opened = balance_of(hub, customer, grant_id)
    hub.check("the purchase opens with nothing spent", opened["used"], 0)
    hub.check("…and the three sessions it was sold", opened["remaining"], 3)
    hub.check("…and it is not expired", opened["is_expired"], 0)

    redemptions = []
    for i in range(1, 4):
        out = hub.run("services.packages.redeem", {"grant_id": grant_id})
        hub.check(
            f"redemption #{i} reports the grant it spent",
            out["result"]["grant_id"],
            grant_id,
        )
        redemptions.append(out["result"]["redemption_id"])
    # The host mints one id per intention and the statements verify THAT id (`_redeem_assert.sql`),
    # so three redemptions are three distinct rows — not one row written three times.
    hub.check("three redemptions, three ids", len(set(redemptions)), 3)

    spent = balance_of(hub, customer, grant_id)
    hub.check("the ledger counts the three sessions", spent["used"], 3)
    hub.check("nothing is left", spent["remaining"], 0)

    hub.refused(
        "the fourth session of a three-session voucher",
        "services.packages.redeem",
        {"grant_id": grant_id},
        "services.package_no_uses_left",
    )
    # The refusal is not merely a message on the way out: there is no fourth row for a report that
    # counts differently to find later.
    hub.check(
        "the refused session left nothing behind",
        balance_of(hub, customer, grant_id)["used"],
        3,
    )


def test_3_the_validity_clock_starts_at_the_purchase(hub: Hub) -> None:
    print(
        "\n3 · the clock runs from the PURCHASE, and two purchases of the same voucher coexist"
    )
    customer = tag("cust-two-grants")
    package = create_package(hub, tag("Bono caduco"), max_uses=100, validity_days=1)

    fresh = grant(hub, package, customer)
    stale = grant(hub, package, customer, granted_at=BOUGHT_LONG_AGO)

    # One row per PURCHASE — the case that was impossible before services#73, when the balance only
    # existed once something had been redeemed and could not tell two purchases apart.
    rows = hub.query("services.packages.balance", {"customer_id": customer})
    hub.check(
        "the customer's two purchases of the same voucher are two rows",
        sorted(r["grant_id"] for r in rows),
        sorted([fresh, stale]),
    )
    hub.check(
        "the one bought today is live",
        balance_of(hub, customer, fresh)["is_expired"],
        0,
    )
    hub.check(
        "the one bought long ago is expired",
        balance_of(hub, customer, stale)["is_expired"],
        1,
    )

    out = hub.run("services.packages.redeem", {"grant_id": fresh})
    hub.check(
        "a session of the live purchase is spent", out["result"]["redeemed"], True
    )
    hub.check("…and only of that one", balance_of(hub, customer, fresh)["used"], 1)

    # 🔴 The expired purchase was NEVER started, and it is refused anyway. Under the pre-services#73
    # anchor (first use) it had no clock, so it would have been redeemable forever — this assertion
    # is the one the hub e2e could only reach by UPDATEing `granted_at` behind the module's back.
    hub.refused(
        "a session of a purchase whose validity ran out unused",
        "services.packages.redeem",
        {"grant_id": stale},
        "services.package_expired",
    )
    hub.check(
        "the expired purchase records nothing",
        balance_of(hub, customer, stale)["used"],
        0,
    )
    hub.check(
        "…and the live purchase is untouched by its neighbour's refusal",
        balance_of(hub, customer, fresh)["used"],
        1,
    )


def test_4_spending_a_session_announces_it(hub: Hub) -> None:
    print("\n4 · the declared `emit` leaves the hub, and the payload names the purchase")
    customer = tag("cust-emit")
    package = create_package(hub, tag("Bono emisor"), max_uses=1, validity_days=None)
    grant_id = grant(hub, package, customer)

    # Read the clock BEFORE: earlier tests in this run already spent sessions, so the event is
    # already known to the hub and «it exists» would prove nothing about THIS redemption.
    before = hub.last_seen("services.package.redeemed")
    hub.run("services.packages.redeem", {"grant_id": grant_id})

    # A module that stopped declaring the emit times out here — recorded as a failure rather than
    # raised, so the checks below still run and a red names everything that broke, not only the
    # first thing.
    shape = None
    try:
        shape = hub.wait_for_new_event("services.package.redeemed", before)
        hub.check_true("spending a session announces it", True)
    except AssertionError as err:
        hub.check_true("spending a session announces it", False, str(err))

    hub.check_true(
        "the hub attributes the event to `services`",
        shape is not None and "services" in (shape.get("declared_by") or []),
        str(shape and shape.get("declared_by")),
    )
    # The payload carries the purchase a listener downstream needs to know which entitlement moved.
    # Asserted as the FIELD and not as its sample: the hub withholds the example of ~1 UUID in 9
    # (hub#1358), so `sample == grant_id` would be red on ~11 % of runs for a reason outside this
    # module. `hub_id` is not checked for the same class of reason — the runtime always withholds it.
    field = hub.event_field("services.package.redeemed", "grant_id")
    hub.check_true(
        "the announcement names the grant whose session was spent",
        field is not None and field.get("type") == "string",
        str(field),
    )
    hub.check_true(
        "…and it is not withheld as somebody's data — a purchase id is not personal",
        field is not None and field.get("sample") in (grant_id, None),
        f"sample was {field and field.get('sample')!r}, expected {grant_id!r} "
        "(or nothing at all, hub#1358)",
    )


def test_5_a_sold_voucher_outlives_its_catalogue_row(hub: Hub) -> None:
    print(
        "\n5 · deleting a voucher from the catalogue stops SELLING it, not spending it (services#153)"
    )
    customer = tag("cust-retired")
    service = catalog_service(hub)
    name = tag("Bono retirado")
    package = create_package(hub, name, max_uses=3, validity_days=None, service_id=service)
    grant_id = grant(hub, package, customer)

    hub.run("services.packages.delete", {"package_id": package})

    # The till's door: the hold of a session against a checkout line, through the WASM handler
    # that checks the grant against `tender_options` before the gated statements run.
    held = hub.run(
        "services.packages.hold_for_line",
        {
            "grant_id": grant_id,
            "customer_id": customer,
            "service_id": service,
            "checkout_ref": tag("chk-retired"),
            "line_ref": "l1",
        },
    )
    hub.check_true(
        "the till holds a session of the deleted voucher",
        bool((held.get("result") or {}).get("redemption_id")),
        f"{held}",
    )
    # The chair's door.
    out = hub.run("services.packages.redeem", {"grant_id": grant_id})
    hub.check("a use at the chair goes through", out["result"]["grant_id"], grant_id)
    left = balance_of(hub, customer, grant_id)
    hub.check("…and the balance counts both", (left["used"], left["remaining"]), (2, 1))

    # Selling it again is what retiring stops.
    status, body = hub.command(
        "services.packages.grant", {"package_id": package, "customer_id": tag("cust-new")}
    )
    hub.check_true(
        "a new sale of the deleted voucher is refused",
        status != 200 or not (body or {}).get("ok"),
        f"{status}: {body}",
    )

    # The catalogue keeps the row «Bonos vendidos» and «Movimientos» hang from — only when asked.
    by_default = [r for r in hub.query("services.packages.list") if r.get("id") == package]
    hub.check("the default catalogue no longer lists it", by_default, [])
    retired = [
        r
        for r in hub.query("services.packages.list", {"include_retired": 1})
        if r.get("id") == package
    ]
    hub.check(
        "asked for, it is listed as retired with the line it was sold with",
        [(r.get("status"), r.get("items")) for r in retired],
        [("retired", 1)],
    )


def main() -> int:
    hub = Hub("package_redeem.hub", needs=("taxes", "services"))
    print(
        f"Hub battery · package_redeem (hub#1264 ← services_package_redeem_e2e.rs) · "
        f"{hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    # One shared service on every voucher line, resolved once: `packages.create` reads the catalogue
    # and refuses a line that is not in it, so this is a precondition of the whole battery.
    catalog_service(hub)
    test_1_a_voucher_nobody_sold_cannot_be_spent(hub)
    test_2_sessions_decrement_and_max_uses_blocks(hub)
    test_3_the_validity_clock_starts_at_the_purchase(hub)
    test_4_spending_a_session_announces_it(hub)
    test_5_a_sold_voucher_outlives_its_catalogue_row(hub)
    return hub.finish(
        "a session is spent only against a purchase that has one left and has not run out, "
        "and every refusal reaches the caller as its own code with nothing written"
    )


if __name__ == "__main__":
    sys.exit(main())
