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
- **Sort and filter** by name, slug, discount type, percentage (basis points), fixed amount, fixed price, active
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

### Sell a voucher to a customer

Usually nobody does this by hand: the voucher goes on the ticket like any other line, and when the
sale is completed `services` grants it — one grant per unit, with the amount, the base and the VAT
of that line on the row. The manual door is `services.packages.grant` (package + customer, plus the
sale and the amounts when there are any), for a voucher handed over outside the till. It refuses
with `services.grant_customer_required` if no customer is named, and `services.package_not_found` if
the voucher is not in this hub's catalogue. Requires `services.grant_package`.

⚠️ **A voucher line on an anonymous ticket grants nothing.** The sale goes through; the customer
owns nothing. Add the customer and grant it by hand.

### Check a customer's vouchers

`services.packages.balance` gives **one row per voucher they bought**: sessions consumed, sessions
remaining, when they bought it, what they paid, when it expires and whether it has. A customer who
bought the same voucher twice has two rows, each with its own balance and its own deadline.
Requires `services.view_package_balance`.

### Redeem one use

1. Check first with `services.packages.redeem_check`, naming the **grant** — it tells you whether the
   redemption would work and, if not, **why**: `no_grant`, `package_not_found`, `no_uses_left` or
   `expired`.
2. Redeem with `services.packages.redeem`, giving the **grant** and, optionally, the appointment, the
   sale and a note. The voucher and the owner are read off the grant, never off the payload.

The redemption is appended to the ledger and `services.package.redeemed` is emitted. If the customer
was never sold the voucher, or it is out of uses, expired, or its template archived, the whole thing
is **refused and rolled back**, and the refusal carries a code the caller can translate:
`services.package_no_grant`, `services.package_not_found`, `services.package_no_uses_left` or
`services.package_expired` — never the database's internals. Requires `services.redeem_package` — an
employee has this.

### The voucher's movements (`erp-services-packages` → «Movements»)

The row action next to «edit» on the packages screen, gated by `services.view_package_balance`. It
opens the voucher's ledger — every session it has moved: **reserved**, **delivered**, **released**
and **given back** — with the customer, the sale and, for a return, who returned it, when and
against which document. A session that came back into an already expired voucher says so, because a
session that is on the books but cannot be spent is exactly the thing an operator must not discover
later.

It reads `services.packages.redemption_history`, which includes the soft-deleted rows on purpose:
that is where releases and refunds live. Loading, empty and error are painted, not assumed.

### Pay a line with a voucher (`erp-services-voucher-tender`)

The component the till mounts on the checkout line (slot `sales.pos.tender`). It is the only screen
of this module that spends money, and everything on it exists to make the spend **visible before it
happens**:

1. It asks `services.packages.tender_options` for the vouchers that cover **that line's service**,
   already ordered by the tie-break.
2. Each one shows **how many sessions are left now and how many are left after this one** — a
   counter, not a green tick — plus its expiry date.
3. The one that will be spent is preselected and **says why**: «se gasta primero porque es el que
   antes caduca». If there was more than one valid voucher, the screen says so («2 bonos válidos»)
   so the operator knows there was something to review.
4. The operator can pick another one. The rule is a default, never a cage.
5. **Nothing is spent until «Gastar una sesión»**, and afterwards «Deshacer» gives the session back
   — until the sale is paid, at which point the runtime refuses and the screen says so.

Requires `services.view_package_balance` to see it and `services.hold_package` to spend. A read that
FAILS is never painted as «this customer has no vouchers»: that would have the cashier charge full
price for a session already paid for.

### Give the session back (`erp-services-session-refund`)

The mirror of the one above, mounted by **`sales`' return screen** on the slot
`sales.refund.tender` — one hole per line an external tender paid for. Without it, returning a sale
a voucher covered left the session spent **forever**, and the operator only found out if they
remembered to walk into **Bonos** afterwards. That is Mindbody's documented failure («it will remain
attached to the returned Pricing Option as if it were still paid») reached by another door.

1. It asks `services.packages.redemptions_for_sale` **once** for the whole ticket, and each hole
   picks its own row out of the answer.
2. It names the voucher and previews the counter — «quedan 2 · 3 tras esta devolución» — so the
   operator sees what the return puts back before pressing anything.
3. It **arms itself**: the session goes back unless the operator un-ticks it. Giving back what the
   customer paid for is the expected outcome, not an opt-in.
4. A session that **cannot** go back is shown with its reason («ya se devolvió en otra devolución»)
   instead of a hole that says nothing.
5. An **expired** voucher is a warning, never a veto (ADR-0386): the notice travels to the host so
   it is painted next to **Devolver**, and the session goes back anyway. A return undoes a past act;
   refusing would cost the customer the session *and* the money path with it.
6. The money refund is `sales`' authority and this screen never brings it down. When the refund
   document exists the session goes back **while the screen waits**; if that half fails, the money
   still came back and the screen says which half did not.

Requires `services.refund_package` — the same permission that guards the command, so a cashier who
cannot refund never sees the hole. Twins are told apart by the line's ordinal: a mother and her
daughter with the same haircut on one ticket are two covered lines and **two** sessions.

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
