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
- **The grant (the entitlement)** — that a given customer has one. It is a ROW
  (`services_package_grant`) and it comes into existence when they **buy** it: who, which voucher,
  when, in which sale, for how much, with the sessions and the validity frozen as sold.
- **The redemption** — one use being consumed. It is a row in an **append-only ledger**.

Remaining uses = **the grant's** maximum uses − redemptions recorded **against that grant**. Nothing
is decremented in place; the count is derived from the ledger, which is why the history of who used
what and when is always intact.

Buy the same voucher twice and you own two grants. They do not pool: each has its own five sessions
and its own deadline, and the till spends the one that expires first.

## The validity clock starts at the PURCHASE

A package with 30 days validity expires 30 days after it was **bought**. A voucher bought in January
and never touched is expired in February.

It used to start at the first redemption, and that was wrong twice over: an unstarted voucher had no
clock at all, so one bought a year ago and never used had not expired and never would — and
refunding the session that started the clock **un-started it**, handing out an extension nobody
bought. It is also what the market does: Vagaro, Square (with a hard one-year ceiling), Boulevard,
Zenoti and Acuity all anchor on the purchase; only Mindbody and WellnessLiving offer first-use at
all, and Mindbody's own knowledge base documents the two failures above.

⚠️ **In Spain, an expiry on a prepaid voucher is legally contested.** Consumer authorities hold that
*«los vales o bonos emitidos… no pueden tener una fecha de caducidad, ya que eso es una práctica
ilegal»*, and there are live complaints over expired prepaid session packs. `validity_days` is
**optional and empty by default**: leave it empty unless you have taken advice.

## Selling a package DOES create the entitlement (services#73)

It did not use to, and that was the bug: the relationship customer↔voucher was materialised by the
**first redemption**, so every customer of the hub owned N free sessions of every voucher without
anyone having sold them one, and the customer who *had* bought it got another N next month.

Now there are two doors and both write the same row:

- **the till** — `services` listens to `sale.completed` and grants every voucher the ticket sold. A
  line whose `product_id` is one of this hub's packages IS a voucher sale, so `sales` needs to know
  nothing about vouchers. One grant per unit, and a redelivered event cannot mint it twice;
- **by hand** — `services.packages.grant`, for a voucher handed over outside the till.

Without a grant nothing can be spent: the chair, the till and even raw SQL are refused, and the
refusal has its own name (`services.package_no_grant`).

**A voucher sold with no customer on the ticket grants nothing**, and the till is told so rather
than left to discover it at the customer's next visit. An entitlement needs an owner — the same
answer Mindbody gives (*«when a service is sold, the item needs to be associated with an existing
client profile»*), Square, Vagaro, Phorest, Fresha, Boulevard and WellnessLiving included.

## Selling a voucher issues the fiscal record; redeeming it issues nothing

A voucher of N sessions is **univalent**: art. 30 ter.1 of Directive 2006/112/CE says the supply made
in exchange for it *«shall not be regarded as an independent transaction»*. So the record comes out
when the voucher is **SOLD**, with the service's VAT, and the redemption is a movement of balance —
a second document at the chair would be double taxation. That is why the grant carries the amount,
the base and the VAT: it is the row an inspection reconciles the redemptions against.

(Vouchers are **not** in the Spanish LIVA — Directive 2016/1065 was never transposed — so what
governs is the Directive plus the **DGT Resolution of 28/12/2018**.)

## A voucher cannot be spent twice, and that is enforced by the database

The rule «this voucher has N sessions» is a count, and a count is a check-then-act against a SECOND
till: under Postgres's default isolation both transactions read the same snapshot, both see «one
session left», and both write. That is the bug Odoo has had open since 2021 (#79235) — the card is
never marked exhausted — and it is the reason the guard is not an `IF`.

Every redemption carries a **use ordinal** (`use_index`), unique per hub, voucher and customer among
the live rows. Two tills redeeming at the same time compute the same ordinal and the unique index
lets exactly one of them commit; the loser's whole transaction rolls back, so there is no row, no
event and no session spent. A second index does the same for the checkout line: one line is covered
by ONE redemption, so a double tap on «pay with voucher» cannot charge one line to two sessions.

Both hold against raw SQL that skips the commands entirely, which is the point of putting them in
the schema rather than in a statement.

## A reserved session can be given back — until the sale is paid

At the till the redemption happens in two steps. `services.packages.hold_for_line` **reserves** the
session (it is spent from that moment: nothing else can take it), and the sale being paid **settles**
it. Between the two, `services.packages.release_hold` undoes it and the session comes back.

After settling, it refuses: `services.hold_not_releasable`. Giving that session back is a **refund**,
not an undo, and it goes through its own audited door. Release and settle are the same conditional
UPDATE over the same row, so they can never both win.

**And the cart giving up on the line frees it too, on the spot** (services#84). Take a covered line
out of the cart, or cancel the whole ticket, and the session comes back within a second — not when
the deadline sweeps it a day later. It arrives by EVENT, never by a button: the tender component is
mounted per line, so it is torn down *with* the line and cannot let go of anything, and it could not
tell that tear-down apart from the one that happens when the payment sheet closes, where the hold
must survive. What knows is the server, so `sales` raises `sales.order.line_removed` and
`sales.order.voided` where the fact happens and `services` listens — the same channel
`sale.completed` already uses to settle, and the reason it works with no screen mounted at all: a
cart cleared from another device, a tablet that died, a ticket voided with the sheet closed. Both
listeners are one conditional UPDATE, so a redelivered event cannot move the counter twice, and both
stamp `release_reason = 'released'`: removing the line is the cashier **deciding**, which the ledger
has to tell apart from a checkout nobody came back to.

## …and a PAID session can be given back when the sale is returned

`services.packages.refund_redemption` is that door. It soft-deletes the redemption — which is what
gives the session back, because every count here reads live rows only — and stamps the row with who
returned it, when, against which return document (`refund_ref`) and whether the voucher was already
expired at that moment. The row is the audit trail; `services.packages.redemption_history` is where
it is read, soft-deleted rows included.

`refund_ref` is also the idempotence key: the same document twice is a no-op that still reports
success, a different document over the same session is refused, and the schema refuses outright to
hold a refund stamp on a row that is live, unpaid, or names neither an author nor a document.

A session spent **at the chair** (`services.packages.redeem`) is not returnable here: it has no sale
behind it, so `refund_check` answers `not_settled`. Undoing that is a correction, not a refund.

**Expiry never refuses a return.** It is reported (`voucher_expired`) and recorded, never enforced —
a return undoes a past act, and the act was valid when it happened. Nothing extends the voucher.

## A refused redemption rolls everything back

Redeeming checks three things and refuses if any fails:

- the package does not exist or is inactive → `package_not_found`;
- the maximum uses are already consumed → `no_uses_left`;
- the validity window has passed → `expired`;
- and, at the till, the voucher does not cover that line's service → `package_does_not_cover_service`.

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
