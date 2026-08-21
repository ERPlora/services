-- Services · migration 008 — the package discount percentage stops being a float (services#55).
--
-- `discount_percent REAL` (migration 004) was the last field of this module whose PAYLOAD type was
-- `"number"`, and that is the bug. The runtime types a bind from the VALUE, so `10` reaches the
-- statement as `int8` and `10.5` as `float8` — the same slot, two shapes — while sqlx caches
-- prepared statements by SQL text and never re-Parses. Whichever payload prepared the statement on
-- a pooled connection freezes the type for every later caller, and both types are eight bytes wide,
-- so the server cannot notice the swap: it reads the bytes as the type it holds. Measured against a
-- real Postgres 18, on this very column and its CHECK: an integer `10` arriving at a float8 slot is
-- `22003 value out of range: underflow`, a `10.5` arriving at an int8 slot trips the 0..100 CHECK
-- with 4.6e18 — and the same two on a wider column, or without the CHECK, are STORED, as `5e-323`
-- and `4.6e18`. The loud version is the accident — silence is what this column type is one `CAST`
-- away from.
--
-- The cure is the payload contract, not a cast: only an `integer` (always i64) or a `string`
-- (always text) has ONE shape on the wire. So the percentage becomes an integer with a fixed
-- scale — BASIS POINTS, 1050 = 10,50 % — which is the escape hatch the money contract already
-- names for "more precision than the unit, still an integer" (`unit_price_micros`, §1) and the
-- same move ADR-0147 made for quantity. It keeps both decimals, exactly, and it can no longer
-- change type under the statement. The `_bp` suffix is deliberate: a caller still speaking the old
-- scale is refused BY NAME (`additionalProperties: false`) instead of quietly meaning 0,10 %.
--
-- ADDITIVE ON PURPOSE, and `discount_percent` stays behind, dead, at its default 0. Retiring it
-- needs a `contract` migration, and a `contract` can only be declared as
-- `{ file, kind, since }` — a form `MigrationEntry` (hub#542) parses but `hub/schemas/module.schema.json`
-- still refuses, so no module can publish one today. Nothing reads the old column any more: no
-- statement of this module names it, and its `NOT NULL DEFAULT 0` keeps every INSERT and the CHECK
-- of migration 007 satisfied without anyone writing to it. It is dead weight, not a second unit.

ALTER TABLE services_package ADD COLUMN discount_percent_bp INTEGER NOT NULL DEFAULT 0;

-- ROUND *before* the cast, never `discount_percent::integer * 100`: the column is a float, and
-- casting first would truncate a 10,50 % to 10 before scaling it — the exact defect this migration
-- exists to remove (same lesson as pricing#22).
UPDATE services_package SET discount_percent_bp = ROUND(discount_percent::numeric * 100);

-- Its own constraint, next to `ck_services_package_discount` (migration 007) rather than replacing
-- it: rebuilding that one would mean dropping it, and a DROP is exactly what an additive migration
-- may not do. `NOT VALID` for the same reason as 007 — enforced from now on, no scan of old rows.
ALTER TABLE services_package
  ADD CONSTRAINT ck_services_package_discount_bp
  CHECK (discount_percent_bp >= 0 AND discount_percent_bp <= 10000) NOT VALID;
