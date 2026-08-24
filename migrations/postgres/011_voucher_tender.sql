ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'consumed';
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS service_id   TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS checkout_ref TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS line_ref     TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS settled_at   TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS use_index    INTEGER;

UPDATE services_package_redemption SET use_index = 0 WHERE use_index IS NULL;

UPDATE services_package_redemption AS r
   SET use_index = (
        SELECT COUNT(*)
          FROM services_package_redemption AS e
         WHERE e.hub_id = r.hub_id
           AND e.package_id = r.package_id
           AND e.customer_id = r.customer_id
           AND e.is_deleted = 0
           AND (e.redeemed_at < r.redeemed_at
                OR (e.redeemed_at = r.redeemed_at AND e.id <= r.id)))
 WHERE r.is_deleted = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_services_redemption_use
    ON services_package_redemption (hub_id, package_id, customer_id, use_index)
    WHERE is_deleted = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_services_redemption_line
    ON services_package_redemption (hub_id, checkout_ref, line_ref)
    WHERE is_deleted = 0 AND checkout_ref IS NOT NULL AND line_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_services_redemption_checkout
    ON services_package_redemption (hub_id, checkout_ref, status, is_deleted);

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_status
  CHECK (status IN ('held', 'consumed')) NOT VALID;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_use_index
  CHECK (use_index IS NOT NULL) NOT VALID;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_settled
  CHECK (settled_at IS NULL OR status = 'consumed') NOT VALID;

-- Services · migration 011 — the voucher becomes a TENDER that covers LINES (services#70,
-- ADR-0386). The prose is at the BOTTOM by house rule (hub#1137): the migration guard matches a
-- `DROP` at the START of the statement text and its splitter keeps a preceding comment inside the
-- statement, so a header above SQL is the shape that silently defeats it. There is no `DROP` here
-- — this is an `expand` and nothing is destroyed — but the shape is kept so no one has to check.
--
-- WHAT IS ADDED, AND WHY EACH COLUMN EXISTS
--
--   * `status` — `held` while the checkout is open, `consumed` once the sale is settled. Existing
--     rows default to `consumed`, which is what they are: `services.packages.redeem` spends a
--     session at the chair, with no checkout to undo. The tender path is the one that holds first.
--   * `service_id` — WHICH line the session covers. A voucher is N uses of CONCRETE services, so a
--     redemption without the service it paid for cannot be audited, refunded or reversed.
--   * `checkout_ref` / `line_ref` — the open checkout and the cart line, opaque to this module.
--     They exist before the sale does: `sales.complete_sale` mints line ids server-side, so a hold
--     taken BEFORE the payment cannot reference `sales_saleitem.id`. `checkout_ref` is the
--     `order_id` when the till is working an order, which is what lets `sale.completed` settle the
--     holds by event without the caller's help.
--   * `settled_at` — the moment the sale was paid. Non-NULL means the session was delivered and
--     the hold is FINAL: the release refuses from here on, in the same conditional UPDATE.
--   * `use_index` — the ordinal of this use within (hub, package, customer). This is the
--     anti-double-spend guard, and the reason it is a COLUMN and not an `IF`.
--
-- 🔴 WHY THE ORDINAL, AND WHY COUNTING IS NOT ENOUGH
--
-- The guard that was here counted live redemptions inside the conditional INSERT and refused when
-- the count reached `max_uses`. That is atomic against itself and NOT against a second till: under
-- READ COMMITTED both transactions read the same snapshot, both see «one session left», and both
-- insert. It is a check-then-act with the check written in SQL — the same TOCTOU as
-- appointments#10, and exactly the shape of Odoo#79235, open since 2021 because the card is never
-- marked exhausted.
--
-- `uq_services_redemption_use` closes it with no locking and no serializable isolation: the
-- statement computes `MAX(use_index) + 1` over the LIVE rows, so two concurrent tills compute the
-- SAME ordinal and the index lets exactly one of them commit. The loser gets a unique violation
-- and its whole transaction rolls back — no row, no event, no session spent. The count stays as
-- the business rule («this voucher has N sessions»); the index is what makes it true under
-- concurrency. `tests/voucher_tender.postgres.test.py` proves it with two real transactions, and
-- also through raw SQL that skips the command entirely — a guard that only lives in one statement
-- is a guard the next statement forgets.
--
-- The index is partial on `is_deleted = 0` on purpose: releasing a hold soft-deletes it and frees
-- its session, and the freed ordinal must not block the next hold. `MAX + 1` (rather than
-- `COUNT + 1`) is what makes that safe — after a release the ordinals have a gap, and counting
-- would land on an ordinal a live row already owns and refuse a perfectly legitimate redemption.
--
-- `uq_services_redemption_line` is the second half: one checkout line is covered by ONE redemption
-- and no more. Without it a double-tap on «pay with voucher» charges the same line to two
-- sessions, which is the same money lost by a different door.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS. Every column is nullable or has a default; the ordinal is
-- backfilled before either unique index is created, so neither can find a duplicate; and the three
-- CHECKs are `NOT VALID` — enforced from now on, no scan of the existing rows, so a legacy row
-- cannot make `migrate` abort and leave the module half-installed (the lesson of migration 007).
-- `use_index` is left NULLable with a `NOT VALID` CHECK instead of `SET NOT NULL` for the same
-- reason: `SET NOT NULL` scans the table and can abort a deploy, and the CHECK refuses new rows
-- just as firmly. Soft-deleted rows keep the `0` of the first backfill; they are outside every
-- unique index, so their ordinal means nothing and collides with nothing.
--
-- The backfill counts, rather than using `ROW_NUMBER() OVER … FROM (SELECT …)`, and that shape is
-- not a style choice: `validate-migration-guard`'s table linter anchors on `FROM` in a non-SELECT
-- statement and reads the `(SELECT` of a derived table as a table named `select`, which is not a
-- `services_` table, so the migration is REJECTED before a hub ever sees it. A correlated count
-- over the module's own table says the same thing — how many live uses of this voucher by this
-- customer come at or before this row — with nothing for the linter to misread.
