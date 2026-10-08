ALTER TABLE services_package_grant ADD COLUMN IF NOT EXISTS void_refund_id TEXT;

ALTER TABLE services_package_grant ADD COLUMN IF NOT EXISTS void_sale_item_id TEXT;

-- Services · migration 021 — the refund of ONE line of a sale voids the voucher sold on that line
-- (services#158). The prose is at the BOTTOM by house rule (hub#1137/ADR-0387): the migration guard
-- matches a `DROP` at the START of the statement text and its splitter keeps a preceding comment
-- inside the statement. There is no `DROP` here — this is an `expand`.
--
-- WHAT WAS WRONG. `sale.refunded` said how much money went back, never which line, so only the
-- refund that returned the WHOLE ticket voided the voucher sold on it. A ticket with a haircut and a
-- voucher whose voucher alone was returned gave the money back and left the customer the voucher.
-- `sales` now names the lines that go back (`lines`, SALES-F31) and `sale_refund_line_grants.sql`
-- voids as many vouchers of that package, sold on that sale, as units went back.
--
-- WHY TWO STAMPS. The void itself is the one of migration 018 (`is_deleted` + who, when, why). These
-- two say WHICH refund line it answered: a redelivered `sale.refunded` finds its refund line already
-- answered and voids nothing more, and a later refund of ANOTHER line of the same package takes the
-- next live voucher. Without them the relay's at-least-once delivery would void one more voucher on
-- every retry. A voucher voided by hand, by a void or by a full refund leaves them NULL.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS: two nullable columns, no rewrite, no CHECK to validate. An
-- older module version ignores them. Reverting is leaving them unused.
