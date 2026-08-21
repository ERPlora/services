# Services — Concepts

The things people get wrong on their first day.

## A service is a product with a duration and no stock

It behaves like a catalogue item — name, price, tax category — but two things differ and both matter:

- **It has a duration.** That is what lets `appointments` know how long a booking lasts. Without a
  service there is no window to check availability against.
- **It has no stock, ever.** Nothing is decremented when you sell it.

## The price is not always one number

`pricing_type` says how to read the price:

| Type | Meaning |
|---|---|
| `fixed` | One price, always |
| `hourly` | Priced by time |
| `from` | A starting price — the real one is decided at the counter |
| `variable` | Between a minimum and a maximum |
| `free` | No charge |

`min_price` and `max_price` only make sense for `from` and `variable`. Everything is in **integer
cents** (ADR-0123).

## A package is a bundle; a redemption is one use of it

Three separate ideas people mix up:

- **The package** — the definition: which services, in what quantity, with what discount, how many
  uses and for how long.
- **The entitlement** — that a given customer has one. It comes into existence when they buy it.
- **The redemption** — one use being consumed. It is a row in an **append-only ledger**.

Remaining uses = maximum uses − redemptions recorded. Nothing is decremented in place; the count is
derived from the ledger, which is why the history of who used what and when is always intact.

## The validity clock starts at the first use, not at purchase

A package with 30 days validity expires 30 days after its **first redemption**. A voucher bought in
January and first used in June expires in July.

This is a deliberate choice and worth stating to a customer up front, because they will assume
otherwise.

## Selling a package does not create the entitlement — redeeming is all this module does

`services.packages.redeem` consumes one use. **Granting** the package to a customer when they buy it
is the checkout's job, not this module's. Services offers the contract; it never edits `sales`.

So if a customer "has a voucher" that this module does not know about, the grant step is missing.

## A refused redemption rolls everything back

Redeeming checks three things and refuses if any fails:

- the package does not exist or is inactive → `package_not_found`;
- the maximum uses are already consumed → `no_uses_left`;
- the validity window has passed → `expired`.

The refusal is a **rollback**, not a partial write. Use the check command first if you want the
reason without attempting the write.

## Percentage and fixed discounts are two different fields

`discount_percent_bp` is a percentage; `discount_amount_cents` is money in cents. They are typed
separately on purpose — a single polymorphic "discount value" used to exist and was removed, because
nobody could tell whether `20` meant twenty percent or twenty cents.

**Both are integers.** The percentage is counted in **basis points**: `1050` is 10,50 %, `10000` is
100 %. It reads like an odd unit for a percentage until you look at what the alternative costs. The
runtime types a bound parameter from the VALUE it is given, so a field declared `number` arrives as
`int8` when the caller writes `10` and as `float8` when the caller writes `10.5` — the same slot of
the same statement, two different types. Prepared statements are cached by their SQL text, so the
first payload to reach a pooled connection decides the type for every payload after it, and both
types are eight bytes wide, so the swap cannot be detected: the bytes are simply read as the other
type. Basis points keep both decimals and give the field a single shape on the wire. The screen
converts on the way in and on the way out; nothing between it and the column does arithmetic on it.

A **fixed price** on the package overrides the discount entirely.

## Quantities inside a package are scaled by 1 000 000

A package line's quantity is a fixed-point integer: `2000000` means two sessions (ADR-0147). It is a
count of sessions, **not money**, so the cents rule does not apply to it.

## Tax lives in `taxes`; the service only points at it

A service stores `tax_category_key` — a stable string like `service.generic` — never a percentage.
The hub validates that key against `taxes` before saving, which is what replaces a cross-module
foreign key.

Leave it empty and the service falls back to the hub's **default tax category** from the settings.

## Categories are a tree, and deleting a parent takes the children

Every category can have a parent. Deleting one **cascades** to its descendants. A service whose
category is deleted is not deleted — it simply loses its category.

Slugs are unique per hub, for both categories and services.

## Two write refusals name their real cause

- `services.category_unavailable` — you tried to attach a category **belonging to another hub**. An
  empty category is legitimate; a foreign one is not.
- `services.service_update_rejected` — the update matched nothing, and the message names **both**
  possible causes: the service does not exist in this hub, **or** the category is foreign. It does
  not guess.

## Deleting is a soft delete

Services, categories and packages are marked deleted, never erased, so history and past sales stay
readable.

Note a known gap: deleting a package does not currently cascade the soft-delete to its lines.

## Variants and add-ons exist in the data, not in the product

The schema has service variants (a price and duration adjustment) and reusable add-ons. **Neither has
a query or a command declared**, so nothing in the UI or the API reaches them today.
