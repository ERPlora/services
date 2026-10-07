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
event and no session spent. Since services#120 every door that decides on one sold voucher — hold,
redeem, void, correction — first locks that voucher's row, so on the same voucher the second till
simply waits, recounts and is refused; the index stays as the guard underneath. A second index does
the same for the checkout line: one line is covered by ONE redemption, so a double tap on «pay with
voucher» cannot charge one line to two sessions.

Both hold against raw SQL that skips the commands entirely, which is the point of putting them in
the schema rather than in a statement.

## A reserved session can be given back — until the sale is paid

At the till the redemption happens in two steps. `services.packages.hold_for_line` **reserves** the
session (it is spent from that moment: nothing else can take it), and the sale being paid **settles**
it. Between the two, `services.packages.release_hold` undoes it and the session comes back.
The sale settles only the sessions of the lines it says a voucher paid; a line it charged with money
hands its session back instead (sales#520), so the customer never pays for the service and the session.

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

## Why the session is spent when the voucher is APPLIED, and not when the sale is PAID

Reviewed in September 2026 against twelve references (services#86), because the opposite is the
reasonable thing to assume: the money moves at the payment, so why should the session not move
there too? **Do not reopen this without reading the table.**

| Product | When the session (or the unit) leaves the balance | Source |
|---|---|---|
| **Mindbody** | at BOOKING — *«a session is deducted from the reserving client's pricing option»* the moment one client reserves for another | [support](https://support.mindbodyonline.com/s/article/204255933-How-do-I-allow-my-clients-to-make-reservations-for-each-other?language=en_US) |
| **Fresha** | at BOOKING — the membership is picked and the session deducted while the appointment is being taken | [help centre](https://www.fresha.com/help-center/knowledge-base/packages-memberships-and-gift-cards/71-create-memberships) |
| **Zenoti** | at the INVOICE, open and unpaid — there is a setting for *«package redemption at the time of appointment booking»*, and a refund on an open invoice is refused once services have been redeemed from the package | [config](https://help.zenoti.com/en/configuration/packages-configurations/allow-package-redemption-during-appointment-booking.html) · [POS FAQ](https://help.zenoti.com/en/point-of-sale/point-of-sale-faqs/troubleshooting-common-refund-issues-in-pos.html) |
| **Square** (retail) | at the OPEN INVOICE — *«stock held in an open invoice is marked as committed and removed from the available to sell count»* | [product update](https://community.squareup.com/t5/Square-UK-Product-Updates/New-Committed-Inventory-for-Invoices/td-p/622865) |
| **Dynamics 365 BC** | at the ORDER — a reservation entry *«links an item to a specific demand»* and is written when the sales order is confirmed, before anything is posted | [community](https://community.dynamics.com/blogs/post/?postid=fd148072-da5b-ef11-bfe2-000d3a110b2e) |
| **WooCommerce** | at the UNPAID order — `Hold stock (minutes)` *«holds products (for unpaid orders) for X minutes»* | [docs](https://woocommerce.com/document/configuring-woocommerce-settings/products/) |
| **Shopify** | RESERVE then CLAIM — *«when payment starts, we mark items as reserved (a short hold…). Claim: when payment succeeds, we permanently deduct quantity»* | [engineering](https://shopify.engineering/scaling-inventory-reservations) |
| **Vagaro** | at the PAYMENT — the `PKG` chip applies it to the line, *«Not This Time»* takes it off, and the visit comes off the balance at Checkout | [support](https://support.vagaro.com/hc/en-us/articles/22545019040411-Redeem-a-Package-Visit-at-Checkout) |
| **Boulevard** | at the PAYMENT — Redeem zeroes the line, and taking the voucher off once the transaction has closed *«will initiate a refund»* | [support](https://support.boulevard.io/en/articles/5941364-managing-vouchers) |
| **Booksy** | at the PAYMENT — packages are sold and redeemed during checkout | [support](https://support.booksy.com/hc/en-us/articles/16487062339602-How-do-I-set-up-sell-Packages) |
| **Odoo** | at the PAYMENT / at session sync — **and that is the bug**: *«use the Gift Card as many times you want»*, the card *«stays 'Valid' … even if it has been (multiple times) redeemed»*, open since 2021 | [odoo#79235](https://github.com/odoo/odoo/issues/79235) |
| **Square** (packages) | never — there is no session tracking at all; salons keep it in customer notes and redeem with a 100 % discount | [community](https://community.squareup.com/t5/Archived-Discussions-Read-Only/tracking-sessions-used-from-packages-membership/m-p/129294) |

**The field splits, and it splits along the line that matters.** Everything with a persisted,
server-side document — an invoice, an order, a reservation entry, a payment in flight — takes the
unit when the line is APPLIED to it, and Shopify names our two steps out loud (*reserve*, then
*claim*). The camp that waits for the payment is appointment books whose ticket and whose package
ledger are **the same table**, plus the one reference with an open double-spend bug and the one
that tracks nothing at all.

**1 · «No reservation» is a reservation in somebody else's table.** In Vagaro or Boulevard,
applying the package writes a line on their ticket, and their ticket is a row in their database.
Ours is too: since services#84 the redemption **is** a line of the server-side ticket —
`checkout_ref` is the `sales_order` id and `line_ref` is the order line — so taking the line out of
the cart or voiding the ticket gives the session back within a second, by event. What the cashier
sees is exactly Zenoti's *Remove* and Vagaro's *Not This Time*, undo included and re-appliable. The
only difference is which module owns the row, and it has to be this one: `sales` knows nothing
about vouchers, and teaching it would be a hard dependency between two modules.

**2 · The guard cannot move to the payment.** Two tills, one session left: `use_index` and its
unique index are what let exactly one of them commit, and they can only do that if a row is written
when the voucher is taken. Deduct at the payment and there is nothing to collide on until then —
both tills price their ticket at zero and one of them is refused with the customer already holding
a card. That is not a hypothesis, it is Odoo#79235; `tests/voucher_tender.postgres.test.py` §F
proves ours holds under two real concurrent transactions.

**3 · Failing early is the cheap failure.** Refused when the voucher is applied, the chip is simply
not offered and the cashier reaches for another tender — nothing has been priced yet. Refused at the
payment, the line has been showing zero for several minutes and the till has to re-price in front of
the customer.

**4 · Nothing here is fiscal.** The voucher is univalent, so the record came out when it was SOLD
(art. 30 ter.1) and the redemption emits nothing, in whichever moment it happens. Moving the
deduction would not have touched the fiscal chain in either direction.

## The one-day deadline is not a setting

Same review, same answer (services#85). Of every reference above, **only WooCommerce exposes the
window as a number** — and it is e-commerce, arbitrating between concurrent strangers on a website,
with its own tracker showing the knob misbehaving (*«it stops customers from ordering regularly —
but does not clear the carts after a period of time. It just seems to persist
forever»*, [woocommerce#11388](https://github.com/woocommerce/woocommerce/issues/11388)). The
counter products do not offer it at all: they sweep at the end of the day or the shift — Toast
auto-captures at 4 a.m., Dynamics 365 Commerce has *«Void when closing shift»* — and the ones that
sweep nothing, like Square's committed inventory, are the ones whose forums are full of stock stuck
to invoices cancelled weeks ago.

And since services#84 the deadline only ever fires on a cart whose line nobody removed and whose
ticket nobody voided, which is the residual case: a tablet that died mid-sale. A control no
competitor offers, for a case that barely happens, is complexity the counter pays for and nobody
asked for. If a real business asks — a trade that leaves checkouts open for days, or a high-traffic
counter that wants the session back in hours — reopen services#85; its acceptance criteria are
already written there.

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
