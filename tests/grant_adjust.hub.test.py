#!/usr/bin/env python3
"""services#118 — a courtesy on a SOLD voucher, through a real hub runtime.

`grant_adjust.postgres.test.py` proves what each statement COMPUTES in a psql mirror; only a
runtime proves what a caller RECEIVES through the door a screen, a flow or the assistant knocks on:
`services.packages.adjust_grant` → the WASM handler → the `required` read
`services.packages.adjust_check` → the private `services._adjust_grant` with its `expect_rows`.

  1. a voucher used up gets one more session on the house: the balance says 1 left — as a NUMBER
     (the runtime makes `INTEGER` a `BIGINT`, and a bare `SUM(bigint)` would come back as the
     string "1") — and the session can be spent;
  2. an expired voucher gets days: it is live again and a session can be spent;
  3. every refusal reaches the caller as its own code, with nothing written;
  4. the declared `emit` leaves the hub;
  5. the voucher's movements show the courtesy, with the amounts as numbers and the reason.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on its
own: without a runtime it fails, it does not skip.
"""

import sys

import hub_harness
from hub_harness import Hub, balance_of, catalog_service, create_package, grant, tag

# Bought long before `:now` with one day of validity: expired, and never started.
BOUGHT_LONG_AGO = "2026-06-15T10:00:00.000Z"


def test_1_a_used_up_voucher_takes_one_more_session(hub: Hub) -> None:
    print("\n1 · one more session on the house revives a voucher that was used up")
    customer = tag("cust-gift")
    package = create_package(hub, tag("Bono regalo"), max_uses=1, validity_days=None)
    grant_id = grant(hub, package, customer)
    hub.run("services.packages.redeem", {"grant_id": grant_id})
    hub.check(
        "the voucher is used up", balance_of(hub, customer, grant_id)["remaining"], 0
    )
    hub.refused(
        "…and a second session is refused",
        "services.packages.redeem",
        {"grant_id": grant_id},
        "services.package_no_uses_left",
    )

    out = hub.run(
        "services.packages.adjust_grant",
        {"grant_id": grant_id, "uses_delta": 1, "reason": "  Birthday  "},
    )
    hub.check("the command reports the courtesy", out["result"]["adjusted"], True)
    hub.check(
        "…and what was given",
        [out["result"]["uses_delta"], out["result"]["days_delta"]],
        [1, 0],
    )
    row = balance_of(hub, customer, grant_id)
    hub.check("one session left — a number, not a string", row["remaining"], 1)
    hub.check(
        "the sessions it can take are the purchase plus the gift", row["max_uses"], 2
    )
    spent = hub.run("services.packages.redeem", {"grant_id": grant_id})
    hub.check("the gifted session can be spent", spent["result"]["redeemed"], True)
    hub.check(
        "…and then it is used up again",
        balance_of(hub, customer, grant_id)["remaining"],
        0,
    )


def test_2_an_expired_voucher_takes_days(hub: Hub) -> None:
    print("\n2 · extending an expired voucher makes it live again")
    customer = tag("cust-extend")
    package = create_package(hub, tag("Bono ampliado"), max_uses=5, validity_days=1)
    grant_id = grant(hub, package, customer, granted_at=BOUGHT_LONG_AGO)
    hub.check(
        "the voucher bought long ago is expired",
        balance_of(hub, customer, grant_id)["is_expired"],
        1,
    )

    hub.run(
        "services.packages.adjust_grant",
        {"grant_id": grant_id, "days_delta": 366, "reason": "We were closed"},
    )
    hub.check(
        "it is live after the extension",
        balance_of(hub, customer, grant_id)["is_expired"],
        0,
    )
    spent = hub.run("services.packages.redeem", {"grant_id": grant_id})
    hub.check("…and a session can be spent", spent["result"]["redeemed"], True)


def test_3_every_refusal_names_its_reason(hub: Hub) -> None:
    print(
        "\n3 · a courtesy the voucher cannot take is refused by name, with nothing written"
    )
    customer = tag("cust-refuse")
    unlimited = grant(
        hub,
        create_package(hub, tag("Bono libre"), max_uses=None, validity_days=30),
        customer,
    )
    forever = grant(
        hub,
        create_package(hub, tag("Bono eterno"), max_uses=3, validity_days=None),
        customer,
    )

    hub.refused(
        "sessions on a voucher with no session limit",
        "services.packages.adjust_grant",
        {"grant_id": unlimited, "uses_delta": 1, "reason": "Gift"},
        "services.grant_unlimited",
    )
    hub.refused(
        "days on a voucher that never expires",
        "services.packages.adjust_grant",
        {"grant_id": forever, "days_delta": 10, "reason": "Closed"},
        "services.grant_no_expiry",
    )
    hub.refused(
        "an adjustment that adds nothing",
        "services.packages.adjust_grant",
        {"grant_id": forever, "uses_delta": 0, "days_delta": 0, "reason": "Nothing"},
        "services.grant_adjust_empty",
    )
    hub.refused(
        "a grant that does not exist in this hub",
        "services.packages.adjust_grant",
        {
            "grant_id": "00000000-0000-0000-0000-00000000dead",
            "uses_delta": 1,
            "reason": "Gift",
        },
        "services.grant_not_found",
    )
    hub.run(
        "services.packages.void_grant", {"grant_id": forever, "reason": "Sold twice"}
    )
    hub.refused(
        "a voided voucher",
        "services.packages.adjust_grant",
        {"grant_id": forever, "uses_delta": 1, "reason": "Gift"},
        "services.grant_already_voided",
    )
    history = hub.query(
        "services.packages.redemption_history",
        {"package_id": package_of(hub, customer, unlimited)},
    )
    hub.check(
        "the refused courtesies wrote no movement",
        [m for m in history if m.get("movement") == "adjusted"],
        [],
    )


def package_of(hub: Hub, customer: str, grant_id: str) -> str:
    return balance_of(hub, customer, grant_id)["package_id"]


def test_4_the_courtesy_is_announced_and_listed(hub: Hub) -> None:
    print("\n4 · the courtesy is announced, and the voucher's movements show it")
    customer = tag("cust-trail")
    package = create_package(hub, tag("Bono rastro"), max_uses=4, validity_days=30)
    grant_id = grant(hub, package, customer)

    before = hub.last_seen("services.package.grant_adjusted")
    hub.run(
        "services.packages.adjust_grant",
        {
            "grant_id": grant_id,
            "uses_delta": 2,
            "days_delta": 15,
            "reason": "Complaint",
        },
    )
    try:
        shape = hub.wait_for_new_event("services.package.grant_adjusted", before)
        hub.check_true(
            "the hub attributes the announcement to `services`",
            "services" in (shape.get("declared_by") or []),
            str(shape.get("declared_by")),
        )
    except AssertionError as err:
        hub.check_true("adjusting a voucher announces it", False, str(err))

    history = hub.query("services.packages.redemption_history", {"package_id": package})
    adjusted = [m for m in history if m.get("movement") == "adjusted"]
    hub.check("one courtesy movement on the voucher", len(adjusted), 1)
    if adjusted:
        m = adjusted[0]
        hub.check(
            "…with what was given, as numbers",
            [m.get("uses_delta"), m.get("days_delta")],
            [2, 15],
        )
        hub.check("…and why", m.get("adjust_reason"), "Complaint")
        hub.check("…on the grant it belongs to", m.get("grant_id"), grant_id)
        hub.check_true("…and who gave it", bool(m.get("created_by")), str(m))


def main() -> int:
    hub = Hub("grant_adjust.hub", needs=("taxes", "services"))
    print(
        f"Hub battery · grant_adjust (services#118) · {hub_harness.BASE} · hub {hub.hub_id} · user {hub.user}"
    )
    catalog_service(hub)
    test_1_a_used_up_voucher_takes_one_more_session(hub)
    test_2_an_expired_voucher_takes_days(hub)
    test_3_every_refusal_names_its_reason(hub)
    test_4_the_courtesy_is_announced_and_listed(hub)
    return hub.finish(
        "a sold voucher takes sessions and days as a movement of its own, every refusal reaches the "
        "caller as its code, and the courtesy is announced and listed"
    )


if __name__ == "__main__":
    sys.exit(main())
