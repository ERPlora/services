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
- **It does not grant a package to a customer when they buy it.** It can **redeem** a use; creating
  the entitlement in the first place is the checkout's job.
- **It has no screens for variants or add-ons.** Both exist in the data model but have no query or
  command declared. <!-- TODO: verify -->

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
| `services.package.redeemed` | one use of a customer's package is consumed |

**Events it listens to** — none.

## Packages, in one paragraph

A package bundles several services with a discount, an optional maximum number of uses and an
optional validity in days. When a customer uses one, a **redemption** is written to an append-only
ledger. Remaining uses are the maximum minus what has been used, and the expiry clock starts at the
**first** redemption, not at purchase.

## Where its numbers come from

- **Prices are integer cents** (ADR-0123): `price`, `min_price`, `max_price`, `cost`, the fixed price
  of a package and its fixed discount amount.
- **A percentage discount is a percentage**; a fixed discount is cents. They are two separate,
  typed fields — never one polymorphic value.
- **Quantities inside a package are fixed-point integers scaled by 1 000 000** (ADR-0147):
  `2000000` means two sessions. That is a count of sessions, not money.
- **Durations are whole minutes.**
