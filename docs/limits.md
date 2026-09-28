# Services — Limits and troubleshooting

## Known gaps you should know about

- **Variants and add-ons are unreachable.** They exist in the database but have no query or command,
  so no screen and no API touch them.
- **Archiving a service warns about its upcoming appointments, it does not block.** The Services
  screen asks `appointments` how many pending/confirmed appointments still use the service and
  shows the count before you confirm; the appointments keep their booking, price and duration. If
  `appointments` is not installed the dialog simply has no such line. Nothing stops an API caller
  from archiving a booked service — by design (Fresha, Square and Vagaro archive and warn too).
- **A voucher cannot be transferred or shared.** A grant belongs to ONE customer. Sharing it with a
  family member, or moving it to the daughter it was bought for, has no door yet — the market keeps
  both behind an explicit opt-in and they are their own feature (services#79 transfer /
  services#80 sharing).
- **A voucher sold with no customer on the ticket is not granted.** The sale goes through and the
  listener reports how many ownerless vouchers it saw, but nothing is written: an entitlement needs
  an owner. Grant it afterwards with `services.packages.grant`.
- **Deleting a customer leaves their grants behind.** `customer_id` is an opaque reference with no
  cross-module foreign key (the module contract), so a deleted or merged customer leaves grants that
  no balance screen will show. Of 17 products surveyed **not one** documents an answer to this, so
  there is no prior art to copy and ours has to be designed (services#81).
- **A voucher sold by mistake can be voided, but a used one cannot be corrected.** Voiding
  (`services.packages.void_grant`, services#82) only works while nothing has been spent from it.
  «Adjust» (`services.packages.adjust_grant`, services#118) only ADDS — sessions to a voucher with a
  limit, days to one that expires, up to 100 sessions / 366 days per movement. Taking sessions or
  days away, or correcting the balance of a voucher that was already used, is services#119.
- **A courtesy cannot be undone from the screen.** Once given, the movement stays; the way back is
  the balance correction of services#119.
- **Voiding and redeeming the same voucher at the very same instant can both succeed.** The void
  re-checks inside its own transaction that nothing is spent or held, which closes every ordinary
  case; two tills racing on the same millisecond are not serialised against each other (services#120).
- **A customer's name needs `customers` and the permission to see customers.** «Sold vouchers», the
  movements ledger and the void confirmation name the customer through `customers.get` (services#121).
  Without the `customers` module, without `customers.view_customer`, or once the customer sheet was
  deleted, the row shows the customer's id instead. The same goes for who voided a sale or gave a
  session back: named from the hub's people list, the user id when that list cannot be read.

## Errors you will actually see

| Error | What happened | What to do |
|---|---|---|
| `services.category_unavailable` | The category you attached belongs to another hub | Pick a category of this hub, or leave it empty |
| `services.service_update_rejected` | The update matched nothing: either the service is not in this hub **or** the category is foreign | Check both — the message deliberately names the two |
| `services.service_not_found` / `services.category_not_found` / `services.package_not_found` | A delete or update named an id that is not in this hub | Check the id — nothing was changed |
| `services.parent_category_unavailable` | The parent category you attached belongs to another hub or is deleted | Pick a live parent of this hub, or leave it empty (root) |
| `services.category_update_rejected` | The category update matched nothing: the category is not in this hub, or the parent is foreign/deleted/the category itself | Check both |
| `InvalidPayload` (validation error) | The payload broke the command's contract: unknown key, pricing type outside the enum, negative price, duration 0, capacity 0, percentage above 100, empty batch… | Fix the named field; every public command has a JSON Schema |
| `services.package_no_grant` | **Nobody sold that voucher to this customer.** The grant does not exist in this hub | Sell it — or grant it with `services.packages.grant`. It is not a matter of reactivating anything |
| `services.grant_customer_required` | A grant was attempted with no customer | Pick the customer: a voucher with no owner cannot be redeemed by anyone |
| `package_not_found` | The grant is real but its voucher template is archived or inactive | Reactivate the package, or check the id |
| `no_uses_left` | The sessions **of that grant** are already consumed | Sell another one — a second grant of the same voucher is a normal, supported case |
| `expired` | The validity window has passed since the **purchase** | The voucher is spent; a new one is needed |
| `services.grant_void_reason_required` | A void was sent with no reason | Say why it is voided: the reason stays on its record |
| `services.grant_in_use` | A session of that voucher was already delivered or is held at a till | It cannot be voided; release the hold first, or correct it another way |
| `services.grant_already_voided` | Someone voided it before you | Nothing to do — reload the list |
| `services.grant_not_found` | That sold voucher does not exist in this hub | Check the id — nothing was changed |
| `services.grant_not_voidable` | Between the check and the write, the voucher was used or voided | Reload the list and try again |

A refused redemption rolls the whole transaction back — no ledger row, no event.

## Accepted values

| Field | Values |
|---|---|
| Pricing type | `fixed`, `hourly`, `from`, `variable`, `free` |
| Package discount type | `percentage` or `fixed` |
| Currency | EUR |

## Validation rules (server side — the schemas refuse, the CHECK constraints back them up)

| Rule | Where |
|---|---|
| Money (`price`, `cost`, `min_price`, `max_price`, `fixed_price`, `discount_amount_cents`) is a non-negative integer in minor units | schema + CHECK |
| `min_price <= max_price` | CHECK only (a cross-field rule) |
| `duration_minutes >= 1`; buffers `>= 0`; `max_capacity >= 1` | schema + CHECK |
| Flags (`is_bookable`, `is_active`, …) are `0` or `1` | schema + CHECK |
| `discount_percent_bp` in `0..10000` (basis points: `10000` = 100 %) and a WHOLE number; `max_uses >= 1`; `validity_days >= 1` (or null) | schema + CHECK |
| A category's parent is a live category of this hub and never itself | statement (`expect_rows`) + CHECK |
| Unknown keys and the system params (`hub_id`, `now`, …) are refused | schema (`additionalProperties: false`) |
| Updates are **partial**: send the id plus the fields you change; omitted fields keep their value, an explicit `null` clears | `records.*.patch` |

## Caps and sizes

| Limit | Value |
|---|---|
| Rows per page (services, categories, packages, package items) | 50 |
| Maximum rows a paginated request may ask for | 500 |
| Slug uniqueness | one per hub, for services, categories and packages |
| A service inside a package | once — repeats are de-duplicated |
| Lines in one package | 255 |

## Permissions per action

| To do this | You need |
|---|---|
| See services, categories, packages and the settings | `services.view_service`, `services.view_category`, `services.view_package` |
| Create a service | `services.add_service` |
| Change a service, bulk-create services | `services.change_service` |
| Archive a service | `services.delete_service` |
| Restore an archived service | `services.change_service` |
| Create or change a category | `services.add_category` / `services.change_category` |
| Delete a category | `services.delete_category` |
| Create or change a package | `services.add_package` / `services.change_package` |
| Delete a package | `services.delete_package` |
| Grant a voucher to a customer (and what the till's `sale.completed` listener needs) | `services.grant_package` |
| Redeem one use of a package | `services.redeem_package` |
| See a customer's package balance, a voucher's movements and its sold vouchers | `services.view_package_balance` |
| Void a voucher sold by mistake | `services.void_grant` (admin and manager only) |
| Give a sold voucher more sessions or a later expiry | `services.adjust_grant` (admin and manager only) |
| Change the module settings | `services.manage_settings` |

By role: **admin** has everything. **manager** has everything except the three deletes and
`manage_settings`. **cashier** can see the catalogue, **grant**, **redeem**, hold and settle.
**employee** can **see** everything, **create a service**, **redeem a package** and **see a
balance** — but cannot edit or delete anything, and cannot manage categories or packages.

Redeeming is deliberately available to an employee: it happens at the counter.

🔴 **`services.grant_package` is what the till's own listener runs under.** The relay delivers
`sale.completed` with the permissions of whoever completed the sale, so a role that can take money
and cannot grant would leave a customer paying for a voucher that never lands. Cashier, manager and
admin have it; if you build a custom role that closes a sale, give it this too.

## Dependencies — what breaks if something is missing

**`taxes` is required** and is installed automatically with Services. You **cannot uninstall `taxes`
while Services is installed**: every service points at a tax category, and the hub validates that
pointer on every save.

**`appointments` is optional but is the main consumer.** It reads this catalogue for the name, the
price and above all the **duration** of a service. Without a service catalogue, `appointments` cannot
book anything — which is why installing the diary installs this module.

**`customers` is referenced but not depended on.** Grants and redemptions store a customer id by
convention, with no cross-module foreign key. That is what makes a deleted customer's grants
invisible rather than refused — see the known gaps above. The voucher sheets ask `customers.get`
for the name on the OPTIONAL door, so a hub without `customers` still opens them, with ids.

**`sales` is not depended on either, and does not know vouchers exist.** The grant listener reads one
field of `sale.completed` — a line's `product_id`, matched against this module's own catalogue — the
same way the settle already reads `order_id`. Nothing was added to `sales` for it, and a hub without
`sales` simply grants by hand.

## When something looks wrong

**"I cannot book this service."** Check that it is marked **bookable** and that it has a duration. A
service with no duration gives the diary no window.

**"It refused to save the service without a tax category."** That is deliberate: a service is sold as
a sale line with its VAT, so `tax_category_key` is required at save time (not discovered at the
counter). **The batch works the same way**: every line of a `bulk_create` carries its own category,
and a line without one is reported as an error of that line — the rest of the batch is still
created. Nothing is filled in for you: a made-up tax category is made-up fiscal data.

**"It says the category is unavailable but I can see it."** It belongs to another hub. An empty
category is allowed; a foreign one is not.

**"It refused to create the package because of one of its lines."** A package line has to name a
service of **this** business that is still in the catalogue. It used to be worse: the line was
dropped and the package was created without it, so the voucher was short of sessions and nobody was
told. Now the whole package is refused and nothing is saved — fix the line and save again.

**"A customer's voucher is not recognised."** The first thing to check is whether they were ever
**granted** it: the voucher being in the catalogue does not mean this customer owns one. The
redemption says which of the four it is — `services.package_no_grant` (nobody sold it to them),
`services.package_no_uses_left`, `services.package_expired` or `services.package_not_found` (the
template is archived). The check command answers the same four without consuming.

**"They paid for the voucher on the ticket but it is not on their account."** Look at whether the
sale had a **customer**. A voucher line on an anonymous ticket grants nothing — there is nobody to
grant it to. Grant it by hand with `services.packages.grant` and the sessions are theirs.

**"The voucher expired sooner than expected."** The clock starts at the **purchase**, not at the
first use, so a voucher bought and never touched does expire. ⚠️ And in Spain an expiry on a prepaid
voucher is legally contested (consumer authorities call it *«una práctica ilegal»*): `validity_days`
is optional and empty by default — leave it empty unless you have taken advice.

**"The balance says uses remain but redeeming is refused."** Check the expiry and whether the package
is still active — remaining uses is only one of the three conditions.

**"I archived a service that had appointments."** That is allowed on purpose: the screen warned you
with the count. The appointments keep their denormalised copy of the name, price and duration; only
new bookings stop.

**"I archived a service by mistake and now I cannot find it."** It is not lost. In **Services**, open
the **Status** filter and pick **Archived**; the row offers **Restore**, and the service comes back
as it was. The list hides archived services by default on purpose — the diary reads that same list
to know what can be booked, so what it shows is what you can actually offer.

**"A 20 discount was applied wrongly."** Check which field holds it, and in which unit.
`discount_percent_bp` is a percentage in basis points (`2000` is 20 %); `discount_amount_cents` is
money in cents (`2000` is 20,00 €). They are separate fields precisely because this used to be
ambiguous — and both are whole numbers, so a payload carrying `20.5` is refused at the door rather
than persisted as something else.
