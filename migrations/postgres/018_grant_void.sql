ALTER TABLE services_package_grant ADD COLUMN IF NOT EXISTS voided_at TEXT;

ALTER TABLE services_package_grant ADD COLUMN IF NOT EXISTS voided_by TEXT;

ALTER TABLE services_package_grant ADD COLUMN IF NOT EXISTS void_reason TEXT NOT NULL DEFAULT '';

-- Services · migration 018 — a voucher sold BY MISTAKE can be voided, and the void is a trail, not
-- an erasure (services#82). The prose is at the BOTTOM by house rule (hub#1137/ADR-0387): the
-- migration guard matches a `DROP` at the START of the statement text and its splitter keeps a
-- preceding comment inside the statement. There is no `DROP` here — this is an `expand`.
--
-- WHAT WAS WRONG. Migration 013 made the entitlement a row (ADR-0390) and nothing could touch it
-- afterwards: the wrong voucher, the wrong customer or the same voucher rung up twice stayed live
-- with every session spendable, and the only way out was SQL by hand.
--
-- WHY THE VOID IS A SOFT-DELETE PLUS THREE STAMPS. `is_deleted = 1` is what every door that spends
-- or offers a session already filters on (`_redeem_insert`, `_hold_insert`, `balance`,
-- `tender_options`, `redeem_check`, `orphans`), so a voided grant leaves all of them at once and no
-- reader has to learn a new column to stay correct. The row itself stays — it is the purchase an
-- inspection reconciles the accrual against — and these three columns say WHO voided it, WHEN and
-- WHY. The reason is mandatory at the command; `NOT NULL DEFAULT ''` only keeps the existing rows
-- valid without a backfill.
--
-- The void does NOT free the sale reference: `commands/_grant_insert.sql` checks `sale_ref` against
-- every grant, voided ones included, so a redelivered `sale.completed` cannot mint the voided
-- voucher again. The money side of a mistaken sale is `sales`' rectificativa, not this module.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS: three nullable/defaulted columns, no rewrite, no CHECK to
-- validate. An older module version ignores them. Reverting is leaving them unused.
