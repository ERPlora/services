-- Services · the reason a voucher session was refused INSIDE the transaction (services#128).
--
-- Purpose: `commands/_redeem_refusal.sql` — the statement right after the conditional INSERT of
-- `services._redeem` (the chair) and `services._hold` (the till) — inserts TWO identical rows into
-- this table ONLY when that INSERT wrote nothing. The rows carry the REASON (`gate`) and the
-- redemption id the command was about to write; the second one violates the unique index of that
-- reason, Postgres raises a 23505 naming the index, and the `on_unique` map of
-- `services.packages.redeem` and `services.packages.hold_for_line` (hub#2081) renames it to the
-- domain code the caller already knows from the pre-check (`services.package_no_uses_left`, …),
-- rolling back the whole command.
--
-- Why it exists: the handler refuses with a reason BEFORE the transaction, from the pre-check
-- `services.packages.redeem_check`. The till that loses a race — another till took the last
-- session, a void or a correction committed first — passed that pre-check, and was refused by the
-- generic CHECK of `services__gate`, which the kernel answers with its bare `db` code. The cashier
-- read «could not complete the operation» instead of «no sessions left» or «this voucher is
-- voided». The kernel only renames UNIQUE violations, so each reason needs its own unique index.
--
-- One index per reason, PARTIAL on the reason and keyed on the redemption id: two tills refused
-- for the same reason at the same instant never wait on each other's (uncommitted, about to roll
-- back) rows — each one only collides with its own twin.
--
-- This table NEVER holds a row: the only INSERT that reaches it lives inside a transaction that
-- the violation it causes always rolls back. Purely additive — no existing table, column, index
-- or row is touched.
--
-- Idempotent: every statement uses IF NOT EXISTS.
--
-- Reverse: DROP TABLE IF EXISTS services__redeem_gate;
CREATE TABLE IF NOT EXISTS services__redeem_gate (
    gate TEXT NOT NULL,
    redemption_id TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_no_grant ON services__redeem_gate (redemption_id) WHERE gate = 'no_grant';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_voided ON services__redeem_gate (redemption_id) WHERE gate = 'voided';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_package_not_found ON services__redeem_gate (redemption_id) WHERE gate = 'package_not_found';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_no_uses_left ON services__redeem_gate (redemption_id) WHERE gate = 'no_uses_left';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_expired ON services__redeem_gate (redemption_id) WHERE gate = 'expired';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_does_not_cover_service ON services__redeem_gate (redemption_id) WHERE gate = 'does_not_cover_service';
CREATE UNIQUE INDEX IF NOT EXISTS services_redeem_not_redeemable ON services__redeem_gate (redemption_id) WHERE gate = 'not_redeemable';
