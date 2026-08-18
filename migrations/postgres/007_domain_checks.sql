-- Services · migration 007 — domain CHECKs, defence in depth behind the JSON Schemas (services#9).
--
-- The schemas are the first line (they refuse before the DB is touched); these constraints are the
-- last: whatever door a row comes through (a private `_insert_*` operation of the WASM handler, a
-- future command, a manual fix), the invariants of the catalogue hold. Same rules as the schemas,
-- plus the ONE rule JSON Schema cannot express: `min_price <= max_price` (a cross-field
-- comparison).
--
-- `NOT VALID`: append-only and safe on a hub that already has rows. Postgres enforces the CHECK
-- for every INSERT/UPDATE from now on but does not scan the existing rows, so a legacy row that
-- would violate it cannot make the deploy's `migrate` abort (two open heads / a failing migration
-- abort silently and leave the module half-installed). A later `VALIDATE CONSTRAINT` is optional
-- housekeeping, not a requirement.

ALTER TABLE services_service
  ADD CONSTRAINT ck_services_service_pricing_type
  CHECK (pricing_type IN ('fixed', 'hourly', 'from', 'variable', 'free')) NOT VALID;
ALTER TABLE services_service
  ADD CONSTRAINT ck_services_service_money
  CHECK (price >= 0 AND cost >= 0
         AND (min_price IS NULL OR min_price >= 0)
         AND (max_price IS NULL OR max_price >= 0)
         AND (min_price IS NULL OR max_price IS NULL OR min_price <= max_price)) NOT VALID;
ALTER TABLE services_service
  ADD CONSTRAINT ck_services_service_time
  CHECK (duration_minutes >= 1 AND buffer_before >= 0 AND buffer_after >= 0 AND max_capacity >= 1) NOT VALID;
ALTER TABLE services_service
  ADD CONSTRAINT ck_services_service_flags
  CHECK (is_bookable IN (0, 1) AND requires_confirmation IN (0, 1) AND allow_online_booking IN (0, 1)
         AND is_active IN (0, 1) AND is_featured IN (0, 1)) NOT VALID;

ALTER TABLE services_category
  ADD CONSTRAINT ck_services_category_not_own_parent
  CHECK (parent_id IS NULL OR parent_id <> id) NOT VALID;
ALTER TABLE services_category
  ADD CONSTRAINT ck_services_category_flags
  CHECK (is_active IN (0, 1) AND sort_order >= 0) NOT VALID;

ALTER TABLE services_package
  ADD CONSTRAINT ck_services_package_discount
  CHECK (discount_type IN ('percentage', 'fixed')
         AND discount_percent >= 0 AND discount_percent <= 100
         AND discount_amount_cents >= 0
         AND (fixed_price IS NULL OR fixed_price >= 0)) NOT VALID;
ALTER TABLE services_package
  ADD CONSTRAINT ck_services_package_voucher
  CHECK ((validity_days IS NULL OR validity_days >= 1)
         AND (max_uses IS NULL OR max_uses >= 1)
         AND is_active IN (0, 1) AND is_featured IN (0, 1)) NOT VALID;

-- Fixed-point 10⁶ (ADR-0147): a line always carries at least a fraction of a session.
ALTER TABLE services_packageitem
  ADD CONSTRAINT ck_services_packageitem_quantity
  CHECK (quantity >= 1) NOT VALID;
