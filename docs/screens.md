# Services — Screens

The module contributes three tabs to the hub navigation — **Services**, **Categories** and
**Packages** — plus a **Servicios** settings tab the shell generates from the declarative settings
block. Each tab is a data table: the «+» opens the create panel, the row menu offers **Edit** (the
same panel, pre-filled) and **Archive**/**Delete** (always with a confirmation).

## Services

The catalogue (`services.services.list`, 50 rows per page). Requires `services.view_service`. Sorted
by name.

- **Search** by name.
- **Sort** by name, price, pricing type, duration, bookable flag or category.
- **Filter** by name, price range, pricing type, duration, bookable flag or category.

### Create a service

1. Open **Services** and press **+**.
2. Give it a **name** and a **price**.
3. Choose the **pricing type**: `fixed`, `hourly`, `from`, `variable` or `free`. For `variable` or
   `from` you can set a minimum and a maximum price.
4. Set the **duration** in minutes, and the buffers before and after if the service needs cleanup
   time.
5. Set **max capacity** — how many people this service takes at once.
6. Set the booking options: **bookable**, **requires confirmation**, **allow online booking**.
7. Optionally set the **tax category**, the category, a SKU, a barcode, an image and whether it is
   featured.
8. Save.

Prices are entered in euros and stored in cents. Requires `services.add_service` — an employee has
this.

### Edit or archive a service

**Edit** (row menu) opens the same panel pre-filled with the service; you can change name, price,
duration, category and tax category — the rest of the fields keep their values. Needs
`services.change_service`. **Archive** (row action `…` → Archive) needs
`services.delete_service` (**admin only**): it asks you to confirm and, if `appointments` is
installed, tells you how many upcoming appointments still use the service — they keep their
booking; the service just stops being offered. It is a soft delete: nothing is destroyed.

### See and restore the archived services

The list shows **only what you can offer**: archived services are not in it, on purpose — the diary
reads this very list to know what can be booked. To see them, open the **Status** filter and pick
**Archived**. That is a scope, not just a filter: the table asks the hub for the archived ones and
shows them with their grey badge.

While you are looking at them, the row offers **Restore** — one tap, no confirmation (it undoes an
archive; nothing is lost). The service comes back exactly as it was, with its name, price, duration
and category, and it can be booked and charged again. Needs `services.change_service`, so a manager
can bring a service back without needing an admin. Clear the filter and you are back to the working
list.

### Create many services at once

Bulk creation validates each service **independently** — one bad row does not abort the batch — and
returns what was created and what failed. Slugs are derived from the names. Requires
`services.change_service`.

## Categories

Hierarchical categories (`services.categories.list`, 50 rows per page). Requires
`services.view_category`. Sorted by name.

- **Search** by name or slug.
- **Sort and filter** by name, slug, icon, colour, parent, order or number of services.

A category has a name, a unique slug, an icon, a colour, an image, a sort order, an active flag and
optionally a **parent** — that is what makes them a tree. From the **Categories** tab you create
(name, parent, order), edit (row menu → Edit; a category cannot be its own parent) and delete (row
menu → Delete, with a confirmation that says how many services are left without a category — they
keep existing). Creating and changing need `services.add_category` / `services.change_category`;
deleting needs `services.delete_category` (**admin only**).

## Packages

Bundles of services with a discount (`services.packages.list`, 50 rows per page). Requires
`services.view_package`.

- **Search** by name or slug.
- **Sort and filter** by name, slug, discount type, percentage, fixed amount, fixed price, active
  flag or items.

### Create a package

1. Open **Packages** and press **+**. Give it a **name**.
2. Pick the **discount type**:
   - `percentage` — set the percentage;
   - `fixed` — set the amount (typed in euros; stored in cents).
3. Alternatively set a **closed price** for the whole bundle, which overrides the discount.
4. Add the **services** it contains, each with its number of **sessions**. At least one line.
5. Optionally set **uses** and **validity in days** (empty = unlimited / never expires).
6. Save.

**Edit** (row menu) changes the header — name, discount, closed price, validity, uses. The services
included are the package's identity and cannot be changed once created: delete it and create a new
one (vouchers already sold keep their balance). **Delete** asks for confirmation first.

The package header and all its lines are written together, and a service repeated in the list is
de-duplicated. Requires `services.add_package`.

### See what is inside a package

`services.package_items.list` lists the services in a package with their quantity, sort order, and
each service's name and price. Requires `services.view_package`.

### Check a customer's package balance

`services.packages.balance` gives, per package for that customer: uses consumed, uses remaining, when
it was first redeemed, when it expires and whether it has expired. Requires
`services.view_package_balance`.

### Redeem one use

1. Check first with `services.packages.redeem_check` — it tells you whether the redemption would work
   and, if not, **why**: `package_not_found`, `no_uses_left` or `expired`.
2. Redeem with `services.packages.redeem`, giving the package and the customer, and optionally the
   appointment, the sale and a note.

The redemption is appended to the ledger and `services.package.redeemed` is emitted. If the package
is inactive, out of uses or expired, the whole thing is **refused and rolled back**. Requires
`services.redeem_package` — an employee has this.

## Servicios — settings

Generated by the shell from the settings schema. Requires `services.manage_settings` — **admin
only**.

| Setting | What it controls |
|---|---|
| Default duration and buffer | Used when a service does not set its own |
| **Default tax category** | The category used by services that do not set one |
| Show prices, show duration | What the public-facing surfaces display |
| Online booking | Whether services can be booked online |
| Tax included | Whether prices are gross |
| Currency | EUR |

## First-run setup

Services contributes a **required** setup step called **"Your service catalogue"**: *Add the
services you sell, with their price and duration.* It points at the Services screen and is done once
there is at least one sellable service. It needs `services.add_service`.
