#!/usr/bin/env python3
"""Voiding a PAID sale in `sales` gives back what `services` took for it — against a REAL kernel
with `sales` installed next to `services` (services#151, SERVICES-F27 and SERVICES-F14).

The till's void (`sales.void`) is the only door that undoes a completed sale without a return
document: it refuses a sale that already has refunds and a sale with a full invoice, so whatever
it voids reverses the WHOLE ticket. Until services#151 nothing in this module heard it:

  * a session of a voucher spent on that ticket stayed **Delivered** for ever — and a voided sale
    cannot be returned, so it came back through no screen but **Adjust**;
  * a voucher SOLD on that ticket stayed alive: the customer kept the sessions of a purchase that,
    for the shop, never happened.

The market this module adopted (Mindbody, Vagaro, Boulevard, Fresha) treats the void as the full
return of the ticket, and this module's own rule says what is charged only comes back through a
return. So:

  1. a session spent on the voided sale goes back to its voucher, recorded as given back with the
     void's reason (a movement anyone can read in the ledger, not a silent counter);
  2. a voucher sold on the voided sale is voided too, with who and why;
  3. so is one that has ALREADY been used elsewhere (services#157): the money goes back, so the
     voucher goes with it. The sessions it delivered happened and stay spent; what was left is
     lost. (Leaving it live gave the customer the money back AND the sessions.)

And the other end of the same ticket (sales#520): a paid sale spends the held session only of the
line the sale says the voucher paid. A line the till charged with money — what it did after a reload
or a resumed check, when it lost the «covered» mark — gives its session back:

  4. hold a session on the line, charge the line at its price → the sale is 25,00 € and the session
     is **Released**, not **Delivered**: the customer pays once.

What only a runtime can prove, and the reason this speaks HTTP: the event is `sales`' own
(`sale.voided`, emitted by its WASM handler after its own transaction), the listener runs with the
module's authority through the outbox relay, and the effect is read back through the same public
queries the screens use. A Postgres battery binding the statements by hand would prove the SQL
and nothing about the wiring.

Refunding the sale IN FULL (services#154, SERVICES-F14) is the same for the voucher it sold:
`sales.refund` gives money back, not lines, and its `sale.refunded` only says whether the sale is
now refunded in full. So:

  5. a partial refund leaves the voucher sold on that sale live (it cannot name the voucher's
     line); the refund that gives back the last cent voids it, with who and why;
  6. a voucher sold on that sale that has ALREADY been used is voided too, as with the void.

The sessions spent on a refunded sale are not this listener's: they come back through the return
window (SERVICES-F26). The refund cases live here, not in a battery of their own, because they
reuse this bench (`sales` next to `services`) and the lock of the void.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]`. Never on its own: without a
runtime it fails, it does not skip.
"""

import sys
import time
import uuid

from hub_harness import (
    ONE,
    Hub,
    balance_of,
    catalog_service,
    create_package,
    grant,
    tag,
)

PRICE = 2500  # 25,00 € — a ladies' cut
TAX_CATEGORY = "service.generic"


def ensure_business_identity(hub: Hub) -> None:
    """The kernel's fiscal precondition (ADR-0203): without it the `sale.completed` chain cannot
    run and a sale never settles. Same write the fiscal setup wizard makes."""
    status, body = hub._request(
        "PUT",
        "/api/settings",
        {"business_tax_id": "B12345674", "business_legal_name": "Mi Empresa SL"},
    )
    if status != 200:
        print(f"{hub.battery}: PUT /api/settings answered {status}: {body}")
        sys.exit(1)


def card_method_id(hub: Hub) -> str:
    rows = hub.query("sales.payment_methods")
    card = next((r for r in rows if r.get("type") == "card"), None)
    if card is None:
        raise AssertionError(
            f"the hub's catalogue must carry the `card` method: {rows}"
        )
    return card["id"]


def wait_until(read, ok, timeout: float = 15.0, interval: float = 0.2):
    """Polls `read()` until `ok(value)`; on timeout answers the LAST value seen, never raises, so
    every caller feeds it straight into a `check` and a listener that never ran is reported as the
    value it left behind. Listeners arrive through the outbox relay, which ticks once a second."""
    deadline = time.monotonic() + timeout
    seen = read()
    while not ok(seen) and time.monotonic() < deadline:
        time.sleep(interval)
        seen = read()
    return seen


def sale_line(product_id: str, name: str, price: int, *, is_service: bool) -> dict:
    """A line exactly as the till builds it."""
    return {
        "product_id": product_id,
        "product_name": name,
        "product_sku": "",
        "price": price,
        "quantity": ONE,
        "is_gift": False,
        "gift_reason": "",
        "is_service": is_service,
        "tax_category_key": TAX_CATEGORY,
        "cost": 0,
        "category_id": None,
        "discount": 0,
        "staff_id": None,
        "notes": "",
        "modifiers": [],
    }


def charge(
    hub: Hub, line: dict, customer_id: str, *, covered: bool = False
) -> tuple[str, str, dict]:
    """Opens a check with `line` and answers `(order_id, order_line_id, complete_sale payload)`,
    charged by card. `covered` marks the line as paid by the voucher tender (ADR-0386): it stays on
    the ticket at 0, and the caller holds the session on that very line before completing."""
    order_id = hub.run("sales.order.open", {"items": [line]})["new_ids"][0]
    order_line = hub.query("sales.order.lines", {"order_id": order_id})[0]
    charged = {
        **{
            k: v for k, v in line.items() if k not in ("notes", "modifiers", "staff_id")
        },
        "tax_rate": 21,
        "order_item_id": order_line["id"],
        "unit_code": "ud",
        "factor_num": 1,
        "factor_den": 1,
        "increment_value": ONE,
        "price_quantity_value": ONE,
        "pricing_unit_code": "ud",
        "pricing_factor_num": 1,
        "pricing_factor_den": 1,
    }
    if covered:
        charged["covered"] = True
    payload = {
        "items": [charged],
        "discount_percent": 0,
        "idempotency_key": f"services-151-{uuid.uuid4().hex[:8]}",
        "line_ids": None,
        "keep_order_open": False,
        "tax_included": True,
        "payment_method_id": card_method_id(hub),
        "payment_method_name": "Card",
        "channel": "pos",
        "source_module": "pos",
        "order_id": order_id,
        "appointment_id": None,
        "staff_id": None,
        "customer_id": customer_id,
        "customer_name": "Clienta",
        "customer_tax_id": "",
        "customer_address": "",
        "customer_country": "",
        "customer_id_type": "",
        "document_type": "ticket",
    }
    return order_id, order_line["id"], payload


def complete(hub: Hub, payload: dict) -> str:
    return hub.run("sales.complete_sale", payload)["new_ids"][0]


def refund(hub: Hub, sale_id: str, amount: int, reason: str) -> None:
    """`sales.refund` of `amount` cents back to the card leg it was charged on (SALES-F31)."""
    legs = hub.query("sales.refund_options", {"sale_id": sale_id})
    if not legs:
        raise AssertionError(f"sale {sale_id} has no leg to refund")
    hub.run(
        "sales.refund",
        {
            "sale_id": sale_id,
            "reason": reason,
            "idempotency_key": f"services-154-{uuid.uuid4().hex[:8]}",
            "allocations": [{"payment_id": legs[0]["payment_id"], "amount": amount}],
        },
    )


def grant_row(hub: Hub, package_id: str, grant_id: str) -> dict | None:
    rows = hub.query("services.packages.grants", {"package_id": package_id})
    return next((r for r in rows if r.get("grant_id") == grant_id), None)


def movement_of(hub: Hub, package_id: str, redemption_id: str) -> dict | None:
    rows = hub.query(
        "services.packages.redemption_history", {"package_id": package_id, "limit": 200}
    )
    return next((r for r in rows if r.get("redemption_id") == redemption_id), None)


def main() -> int:
    hub = Hub("sale_void", needs=("taxes", "sales", "services"))
    ensure_business_identity(hub)
    run = uuid.uuid4().hex[:6]
    service_id = catalog_service(hub, f"Corte {run}")
    service_name = f"Corte {run}"

    print(
        "1 · a session spent on a sale comes back when that sale is voided (SERVICES-F27)"
    )
    customer = tag("cust-void")
    package_id = create_package(
        hub,
        f"Bono 3 cortes {run}",
        max_uses=3,
        validity_days=None,
        service_id=service_id,
    )
    grant_id = grant(hub, package_id, customer)
    line = sale_line(service_id, service_name, PRICE, is_service=True)
    order_id, line_id, payload = charge(hub, line, customer, covered=True)
    held = hub.run(
        "services.packages.hold_for_line",
        {
            "grant_id": grant_id,
            "customer_id": customer,
            "service_id": service_id,
            "checkout_ref": order_id,
            "line_ref": line_id,
        },
    )
    redemption_id = (held.get("result") or {}).get("redemption_id")
    hub.check_true(
        "the till held a session for the line", bool(redemption_id), f"{held}"
    )
    sale_id = complete(hub, payload)
    settled = wait_until(
        lambda: movement_of(hub, package_id, redemption_id) or {},
        lambda m: m.get("status") == "consumed" and m.get("sale_id") == sale_id,
    )
    hub.check(
        "the session is delivered with the sale", settled.get("status"), "consumed"
    )
    hub.check("the delivered session names the sale", settled.get("sale_id"), sale_id)
    hub.check(
        "remaining after the charge",
        balance_of(hub, customer, grant_id).get("remaining"),
        2,
    )

    reason = f"Cobrado por error {run}"
    hub.run("sales.void", {"sale_id": sale_id, "reason": reason})
    back = wait_until(
        lambda: movement_of(hub, package_id, redemption_id) or {},
        lambda m: m.get("movement") == "refunded",
    )
    hub.check(
        "the voided sale's session is given back", back.get("movement"), "refunded"
    )
    hub.check(
        "the give-back records the void's reason", back.get("refund_note"), reason
    )
    hub.check(
        "the give-back points at the voided sale", back.get("refund_ref"), sale_id
    )
    hub.check(
        "the give-back is signed by whoever voided the sale, not by the listener",
        back.get("refunded_by"),
        hub.user,
    )
    hub.check(
        "remaining after the void",
        balance_of(hub, customer, grant_id).get("remaining"),
        3,
    )

    print(
        "2 · a voucher sold on a sale is voided with that sale (SERVICES-F14)"
    )
    buyer = tag("cust-buy")
    sold_package = create_package(
        hub,
        f"Bono vendido {run}",
        max_uses=5,
        validity_days=None,
        service_id=service_id,
    )
    _, _, sell = charge(
        hub,
        sale_line(sold_package, f"Bono vendido {run}", 10000, is_service=True),
        buyer,
    )
    sold_sale = complete(hub, sell)
    minted = wait_until(
        lambda: [
            r
            for r in hub.query("services.packages.grants", {"package_id": sold_package})
            if r.get("sale_id") == sold_sale
        ],
        lambda rows: len(rows) == 1,
    )
    hub.check("the sale minted the voucher", len(minted), 1)
    sold_grant = minted[0]["grant_id"] if minted else ""
    void_reason = f"Bono equivocado {run}"
    hub.run("sales.void", {"sale_id": sold_sale, "reason": void_reason})
    voided = wait_until(
        lambda: grant_row(hub, sold_package, sold_grant) or {},
        lambda g: g.get("status") == "voided",
    )
    hub.check(
        "the voucher sold on the voided sale is voided", voided.get("status"), "voided"
    )
    hub.check(
        "its void carries the sale's reason", voided.get("void_reason"), void_reason
    )
    hub.check(
        "its void is signed by whoever voided the sale, not by the listener",
        voided.get("voided_by"),
        hub.user,
    )
    hub.check_true(
        "the voided voucher cannot be spent any more",
        not any(
            r.get("grant_id") == sold_grant
            for r in hub.query(
                "services.packages.tender_options",
                {"customer_id": buyer, "service_id": service_id},
            )
        ),
    )

    print("3 · a voucher sold on a voided sale that was ALREADY used is voided too (services#157)")
    used_buyer = tag("cust-used")
    used_package = create_package(
        hub, f"Bono usado {run}", max_uses=5, validity_days=None, service_id=service_id
    )
    _, _, sell_used = charge(
        hub,
        sale_line(used_package, f"Bono usado {run}", 10000, is_service=True),
        used_buyer,
    )
    used_sale = complete(hub, sell_used)
    used_rows = wait_until(
        lambda: [
            r
            for r in hub.query("services.packages.grants", {"package_id": used_package})
            if r.get("sale_id") == used_sale
        ],
        lambda rows: len(rows) == 1,
    )
    used_grant = used_rows[0]["grant_id"] if used_rows else ""
    hub.run(
        "services.packages.redeem",
        {"grant_id": used_grant},
    )
    hub.run("sales.void", {"sale_id": used_sale, "reason": f"Anulada {run}"})
    still = wait_until(
        lambda: grant_row(hub, used_package, used_grant) or {},
        lambda g: g.get("status") == "voided",
    )
    hub.check(
        "a voucher already used is voided by its sale's void",
        still.get("status"),
        "voided",
    )
    hub.check(
        "… with the void's reason", still.get("void_reason"), f"Anulada {run}"
    )
    hub.check(
        "its spent session stays spent (Sold vouchers still counts it)",
        still.get("used"),
        1,
    )

    print(
        "4 · a held line the till charged WITH MONEY gives its session back (sales#520, SERVICES-F24)"
    )
    # What a till does after a reload or a resumed check: the voucher slot still shows the session
    # as spent, but the till lost the «covered» mark and charges the cut at its price. Until
    # sales#520 the sale then spent the session as well, and the customer paid twice.
    reloaded = tag("cust-reload")
    reload_package = create_package(
        hub,
        f"Bono recarga {run}",
        max_uses=3,
        validity_days=None,
        service_id=service_id,
    )
    reload_grant = grant(hub, reload_package, reloaded)
    reload_order, reload_line, reload_payload = charge(
        hub, sale_line(service_id, service_name, PRICE, is_service=True), reloaded
    )
    reload_held = hub.run(
        "services.packages.hold_for_line",
        {
            "grant_id": reload_grant,
            "customer_id": reloaded,
            "service_id": service_id,
            "checkout_ref": reload_order,
            "line_ref": reload_line,
        },
    )
    reload_redemption = (reload_held.get("result") or {}).get("redemption_id")
    hub.check_true(
        "the slot held a session for the line",
        bool(reload_redemption),
        f"{reload_held}",
    )
    reload_sale = complete(hub, reload_payload)
    header = hub.query("sales.get", {"sale_id": reload_sale})
    hub.check(
        "the line is charged at its price",
        int(round(float(header[0].get("total")))) if header else None,
        PRICE,
    )
    handed_back = wait_until(
        lambda: movement_of(hub, reload_package, reload_redemption) or {},
        lambda m: m.get("movement") == "released",
    )
    hub.check(
        "the session of a line paid with money goes back to the voucher",
        handed_back.get("movement"),
        "released",
    )
    hub.check(
        "it is not tied to the sale that charged the money",
        handed_back.get("sale_id") or "",
        "",
    )
    hub.check(
        "remaining after a sale that charged the cut",
        balance_of(hub, reloaded, reload_grant).get("remaining"),
        3,
    )

    print(
        "5 · refunding the sale of a voucher: a partial refund leaves it, the last cent voids it"
        " (services#154)"
    )
    refund_buyer = tag("cust-refund")
    refund_package = create_package(
        hub,
        f"Bono devuelto {run}",
        max_uses=5,
        validity_days=None,
        service_id=service_id,
    )
    _, _, sell_refund = charge(
        hub,
        sale_line(refund_package, f"Bono devuelto {run}", 10000, is_service=True),
        refund_buyer,
    )
    refund_sale_id = complete(hub, sell_refund)
    refund_rows = wait_until(
        lambda: [
            r
            for r in hub.query(
                "services.packages.grants", {"package_id": refund_package}
            )
            if r.get("sale_id") == refund_sale_id
        ],
        lambda rows: len(rows) == 1,
    )
    hub.check("the sale minted the voucher to refund", len(refund_rows), 1)
    refund_grant = refund_rows[0]["grant_id"] if refund_rows else ""
    refund(hub, refund_sale_id, 3000, f"Parte {run}")
    # A negative never resolves by waiting: give the relay its ticks, then read it outright.
    time.sleep(3)
    hub.check(
        "a PARTIAL refund cannot name the voucher's line: the voucher stays live",
        (grant_row(hub, refund_package, refund_grant) or {}).get("status"),
        "active",
    )
    refund_reason = f"Se arrepiente {run}"
    refund(hub, refund_sale_id, 7000, refund_reason)
    refunded = wait_until(
        lambda: grant_row(hub, refund_package, refund_grant) or {},
        lambda g: g.get("status") == "voided",
    )
    hub.check(
        "the refund that returns the last cent voids the voucher sold on that sale",
        refunded.get("status"),
        "voided",
    )
    hub.check(
        "its void carries the refund's reason",
        refunded.get("void_reason"),
        refund_reason,
    )
    hub.check(
        "its void is signed by whoever refunded the sale, not by the listener",
        refunded.get("voided_by"),
        hub.user,
    )
    hub.check_true(
        "the refunded voucher cannot be spent any more",
        not any(
            r.get("grant_id") == refund_grant
            for r in hub.query(
                "services.packages.tender_options",
                {"customer_id": refund_buyer, "service_id": service_id},
            )
        ),
    )

    print(
        "6 · a voucher refunded in full whose session was already spent elsewhere is voided too"
    )
    kept_buyer = tag("cust-kept")
    kept_package = create_package(
        hub, f"Bono gastado {run}", max_uses=5, validity_days=None, service_id=service_id
    )
    _, _, sell_kept = charge(
        hub,
        sale_line(kept_package, f"Bono gastado {run}", 10000, is_service=True),
        kept_buyer,
    )
    kept_sale = complete(hub, sell_kept)
    kept_rows = wait_until(
        lambda: [
            r
            for r in hub.query("services.packages.grants", {"package_id": kept_package})
            if r.get("sale_id") == kept_sale
        ],
        lambda rows: len(rows) == 1,
    )
    kept_grant = kept_rows[0]["grant_id"] if kept_rows else ""
    hub.run("services.packages.redeem", {"grant_id": kept_grant})
    refund(hub, kept_sale, 10000, f"Devuelta {run}")
    kept = wait_until(
        lambda: grant_row(hub, kept_package, kept_grant) or {},
        lambda g: g.get("status") == "voided",
    )
    hub.check(
        "a voucher already used is voided by its sale's full refund",
        kept.get("status"),
        "voided",
    )
    hub.check(
        "… with the refund's reason", kept.get("void_reason"), f"Devuelta {run}"
    )

    return hub.finish(
        "a paid sale spends only the sessions of the lines the voucher paid; voiding it gives them"
        " back and voids the vouchers it sold, used or not; refunding it in full voids them too"
    )


if __name__ == "__main__":
    sys.exit(main())
