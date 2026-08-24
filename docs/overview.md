# Services — Overview

## What this module does

Services is the catalogue of what you sell when what you sell is not a physical thing: a haircut, a
consultation, a repair. Each service carries its price, its **duration**, how many people it can
take at once, and whether it can be booked. Services are organised into **hierarchical categories**
and can be bundled into **packages** — a discounted bundle that a customer buys once and redeems
several times.

It is the catalogue that `appointments` books against, and the counterpart of `inventory` for things
with no stock.

## What this module does NOT do

- **It does not book anything.** The diary is `appointments`.
- **It does not sell anything.** The till is `sales`.
- **It does not compute tax.** A service stores which **tax category** it belongs to; the rate lives
  in `taxes`.
- **It does not track stock.** A service has no units in the back room.
- **It does not move a voucher between customers.** A grant belongs to ONE person, and that is the
  market's default (Mindbody, Vagaro and Boulevard all keep sharing behind an explicit opt-in;
  Boulevard forbids it for packages outright). Transferring or sharing one is its own feature.
- **It has no variants or add-ons.** Both schemas were retired — add-ons in services#67 (the priced
  option belongs to `modifiers`, ADR-0376) and variants in services#69 — because neither ever had a
  query, a command or a screen.
- **It does not charge money and it does not issue an invoice.** A voucher redemption moves a
  balance; the fiscal record came out when the voucher was SOLD.

## Modules it connects to

**Depends on `taxes`** — installing Services installs it automatically. Every service points at a
`tax_category_key`, validated against `taxes` before it is written.

**Used by `appointments`** — the diary reads this catalogue to know a service's name, price and
**duration**, which is what makes an appointment have a length at all.

**Events it emits**

| Event | When |
|---|---|
| `services.service.created` / `.updated` / `.deleted` | a service changes |
| `services.package.created` / `.updated` / `.deleted` | a package changes |
| `services.package.granted` | a customer BUYS a voucher: the entitlement now exists |
| `services.package.redeemed` | one use of a customer's package is consumed (at the chair) |
| `services.package.held` | one session is reserved to cover a checkout line |
| `services.package.hold_released` | a reserved session is given back because the redemption was undone |
| `services.package.settled` | a reserved session becomes final because the sale was paid |
| `services.package.refunded` | a paid session goes back to the voucher because the sale was returned |

**Events it listens to**

| Event | What it does |
|---|---|
| `sale.completed` (from `sales`) | two things, in one transaction. **Settles** every voucher session held against that checkout, so a session already delivered can no longer be undone (a quick sale with no `order_id` settles nothing here and goes through `services.packages.settle_hold` instead). And **grants** every voucher the ticket SOLD: a line whose `product_id` is one of this hub's packages is a voucher sale, so the customer walks out owning it. One grant per unit, idempotent by `<sale_id>#<line>#<unit>`, so a redelivered event cannot mint it twice. A ticket that sold a voucher with **no customer** grants nothing and says so — an entitlement needs an owner. |

## Packages, in one paragraph

A package bundles several services with a discount, an optional maximum number of uses and an
optional validity in days — that is the **catalogue**. When a customer **buys** one, a **grant** is
written: who owns it, when they bought it, in which sale and for how much, with the sessions and the
validity **snapshotted** so a later edit of the catalogue cannot shorten what they paid for. When
they use it, a **redemption** is written to an append-only ledger against that grant. Remaining uses
are the grant's maximum minus what has been spent **on that grant**, and the expiry clock starts at
the **purchase**.

Buying the same voucher twice gives two grants, each with its own balance and its own deadline, and
the till spends the one that expires first — saying so before it does (services#70).

## The voucher as a tender (ADR-0386)

A voucher is N uses of **concrete services**, not a wallet, so at the till it covers a **LINE** —
the eligible service's line, whole or not at all — and whatever it does not cover (the shampoo) is
charged with its own tender. Partial authorisation, where the tender covers what it can and passes
the rest on, belongs to a **gift card** (money in euros), which is a different family and is not
this.

The redemption is **explicit and previewed**: `services.packages.tender_options` says which vouchers
cover the line, how many sessions are left now and how many are left **after**, which one will be
spent and **why**. `services.packages.hold_for_line` reserves it, `release_hold` undoes it while the
sale is not paid, and `settle_hold` — or `sale.completed` — makes it final.

## Returning a sale gives the session back (services#71)

Once the sale is paid the hold can no longer be released — the customer had the service. What can
still happen is that the **sale is returned**, and then the session goes back to the voucher through
its own audited door, `services.packages.refund_redemption`. The redemption row survives with who
returned it, when, and against which return document, so the movement is a **movement** and not a
counter going up: `services.packages.redemption_history` lists every one of them from the voucher's
sheet.

It is **idempotent by `refund_ref`**: the same return document arriving twice writes nothing and
returns one session, while a different document over the same session is refused with
`services.redemption_already_refunded`. Neither is decided by an `if` — the conditional UPDATE and
the gate settle it inside the transaction, so two tills cannot both win.

🔴 **An expired voucher does not block the return.** Every other guard here weighs validity against
`now`, which is right for a live sale and a category error when rectifying a ticket from three weeks
ago. So expiry is **reported, never enforced**: `services.packages.refund_check` answers
`voucher_expired` before the operator confirms and the refund records it on the row. Validity is
neither extended nor reset. What does move — correctly — is the anchor: the clock runs from the
customer's first **live** use, so returning the use that started it un-starts it.

🔴 **Redeeming issues no fiscal document.** A voucher of N sessions is *univalent*: the record came
out when the voucher was **sold**, with the service's VAT. Art. 30 ter.1 of Directive 2006/112/CE
says the supply made in exchange for the voucher «shall not be regarded as an independent
transaction», so a second document here would be double taxation. Vouchers are not in the Spanish
LIVA — Directive 2016/1065 was never transposed — so what governs is the Directive plus the DGT
Resolution of 28/12/2018.

## Where its numbers come from

- **Prices are integer cents** (ADR-0123): `price`, `min_price`, `max_price`, `cost`, the fixed price
  of a package and its fixed discount amount.
- **A percentage discount is an integer of basis points** (`discount_percent_bp`: `1050` is
  10,50 %); a fixed discount is cents. They are two separate, typed fields — never one polymorphic
  value, and neither of them is a float: a decimal in a payload changes the type of the bind
  underneath the statement, and the statement has no way to notice (services#55).
- **Quantities inside a package are fixed-point integers scaled by 1 000 000** (ADR-0147):
  `2000000` means two sessions. That is a count of sessions, not money.
- **Durations are whole minutes.**
