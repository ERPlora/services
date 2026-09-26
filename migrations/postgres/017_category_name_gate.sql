-- Services · name gate for service categories (services#107).
--
-- Purpose: `commands/_category_name_assert.sql` — the last statement of `services.categories.create`
-- and `services.categories.update` — inserts TWO identical rows into this table ONLY when the
-- category the command just wrote carries the name of another LIVE category of the same hub. The
-- second row violates the UNIQUE index below, Postgres raises a 23505, and the command's
-- `on_unique` map (hub#2081) renames it to the domain error `services.category_name_taken` —
-- rolling back the whole command transaction, including the write the assert is guarding.
--
-- Why a gate and not a unique index on `services_category (hub_id, name)`: hubs that ran the
-- module before this guard may ALREADY hold two live categories with the same name (the report
-- that opened services#107 left two «Peinados de fiesta» in a test hub). A unique index would
-- make this migration fail on exactly those hubs, and the module update with it. The gate leaves
-- legacy rows untouched and refuses only NEW duplicates; the owner cleans the old ones by renaming
-- or deleting one (both go through the same commands, so the next save of either is checked).
--
-- A separate table from `services__gate` (migration 003) on purpose: that one carries one named
-- CHECK per gate (migration 016) and a whitelist; this one needs a UNIQUE index, the only
-- violation the runtime renames to a module code.
--
-- This table NEVER holds a row: the only INSERT that reaches it lives inside a transaction that
-- the violation it causes always rolls back. Purely additive — no existing table, column, index
-- or row is touched.
--
-- Idempotent: both statements use IF NOT EXISTS.
--
-- Reverse: DROP TABLE IF EXISTS services__name_gate;
CREATE TABLE IF NOT EXISTS services__name_gate (
    gate TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS services_category_name_taken ON services__name_gate (gate);
