# Services — Limits and troubleshooting

## Known gaps you should know about

- **Variants and add-ons are unreachable.** They exist in the database but have no query or command,
  so no screen and no API touch them.
- **Archiving a service warns about its upcoming appointments, it does not block.** The Services
  screen asks `appointments` how many pending/confirmed appointments still use the service and
  shows the count before you confirm; the appointments keep their booking, price and duration. If
  `appointments` is not installed the dialog simply has no such line. Nothing stops an API caller
  from archiving a booked service — by design (Fresha, Square and Vagaro archive and warn too).
- **This module cannot grant a package to a customer.** It can only redeem one.

## Errors you will actually see

| Error | What happened | What to do |
|---|---|---|
| `services.category_unavailable` | The category you attached belongs to another hub | Pick a category of this hub, or leave it empty |
| `services.service_update_rejected` | The update matched nothing: either the service is not in this hub **or** the category is foreign | Check both — the message deliberately names the two |
| `services.service_not_found` / `services.category_not_found` / `services.package_not_found` | A delete or update named an id that is not in this hub | Check the id — nothing was changed |
| `services.parent_category_unavailable` | The parent category you attached belongs to another hub or is deleted | Pick a live parent of this hub, or leave it empty (root) |
| `services.category_update_rejected` | The category update matched nothing: the category is not in this hub, or the parent is foreign/deleted/the category itself | Check both |
| `InvalidPayload` (validation error) | The payload broke the command's contract: unknown key, pricing type outside the enum, negative price, duration 0, capacity 0, percentage above 100, empty batch… | Fix the named field; every public command has a JSON Schema |
| `package_not_found` | The package does not exist or is inactive | Reactivate it, or check the id |
| `no_uses_left` | The maximum uses are already consumed | Sell another package |
| `expired` | The validity window has passed since the **first** redemption | The package is spent; a new one is needed |

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
| Redeem one use of a package | `services.redeem_package` |
| See a customer's package balance | `services.view_package_balance` |
| Change the module settings | `services.manage_settings` |

By role: **admin** has everything. **manager** has everything except the three deletes and
`manage_settings`. **employee** can **see** everything, **create a service**, **redeem a package**
and **see a balance** — but cannot edit or delete anything, and cannot manage categories or
packages.

Redeeming is deliberately available to an employee: it happens at the counter.

## Dependencies — what breaks if something is missing

**`taxes` is required** and is installed automatically with Services. You **cannot uninstall `taxes`
while Services is installed**: every service points at a tax category, and the hub validates that
pointer on every save.

**`appointments` is optional but is the main consumer.** It reads this catalogue for the name, the
price and above all the **duration** of a service. Without a service catalogue, `appointments` cannot
book anything — which is why installing the diary installs this module.

**`customers` is referenced but not depended on.** Package redemptions store a customer id by
convention, with no cross-module foreign key.

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

**"A customer's voucher is not recognised."** Either they were never granted it — this module cannot
grant, only redeem — or it is out of uses, expired or inactive. Run the check command; it tells you
which.

**"The voucher expired sooner than expected."** The clock starts at the **first redemption**, not at
purchase. That surprises everyone once.

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
