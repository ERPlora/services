# Services — Limits and troubleshooting

## Known gaps you should know about

- **Variants and add-ons are unreachable.** They exist in the database but have no query or command,
  so no screen and no API touch them.
- **Deleting a package does not soft-delete its lines.** The header goes; the item rows remain.
- **Deleting a service does not check for live appointments.** The cross-module guard that would
  count active bookings for that service is not wired, so a service can be deleted while it is
  booked.
- **This module cannot grant a package to a customer.** It can only redeem one.

## Errors you will actually see

| Error | What happened | What to do |
|---|---|---|
| `services.category_unavailable` | The category you attached belongs to another hub | Pick a category of this hub, or leave it empty |
| `services.service_update_rejected` | The update matched nothing: either the service is not in this hub **or** the category is foreign | Check both — the message deliberately names the two |
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

## Caps and sizes

| Limit | Value |
|---|---|
| Rows per page (services, categories, packages, package items) | 50 |
| Maximum rows a paginated request may ask for | 500 |
| Slug uniqueness | one per hub, for services, categories and packages |
| A service inside a package | once — repeats are de-duplicated |

## Permissions per action

| To do this | You need |
|---|---|
| See services, categories, packages and the settings | `services.view_service`, `services.view_category`, `services.view_package` |
| Create a service | `services.add_service` |
| Change a service, bulk-create services | `services.change_service` |
| Delete a service | `services.delete_service` |
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

**"The service saved without a tax category."** That is legitimate — it falls back to the hub's
default tax category from the settings. If the fallback is also missing, the sale will fail to
resolve a rate.

**"It says the category is unavailable but I can see it."** It belongs to another hub. An empty
category is allowed; a foreign one is not.

**"A customer's voucher is not recognised."** Either they were never granted it — this module cannot
grant, only redeem — or it is out of uses, expired or inactive. Run the check command; it tells you
which.

**"The voucher expired sooner than expected."** The clock starts at the **first redemption**, not at
purchase. That surprises everyone once.

**"The balance says uses remain but redeeming is refused."** Check the expiry and whether the package
is still active — remaining uses is only one of the three conditions.

**"I deleted a package and its services are still listed."** Known gap: the lines are not
soft-deleted with the header.

**"I deleted a service that had appointments."** Also a known gap: no guard prevents it today. The
appointments keep their denormalised copy of the name and price.

**"A 20 discount was applied wrongly."** Check which field holds it. `discount_percent` is a
percentage; `discount_amount_cents` is money in cents. They are separate fields precisely because
this used to be ambiguous.
