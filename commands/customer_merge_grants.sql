UPDATE services_package_grant
   SET customer_id         = :surviving_id,
       customer_deleted_at = NULL,
       updated_by          = :current_user_id,
       updated_at          = :now
 WHERE hub_id = :hub_id
   AND customer_id = :absorbed_id
   AND CAST(:surviving_id AS TEXT) <> CAST(:absorbed_id AS TEXT);

-- Services · `customer.merged` (layer 2) — re-point a customer's vouchers to the survivor
-- (customers#86/customers#87). Prose at the BOTTOM by house rule (hub#1137/ADR-0387).
--
-- This runs right after `customer_merge_redemptions.sql`, in the same transaction
-- (`services._on_customer_merged`), from the outbox relay when `customers` publishes
-- `customer.merged`. The payload IS the params of the emitting command, so there is no `schema`
-- here — the shape belongs to the neighbour, not to this module.
--
-- The `hub_id` guard is not decoration: `customer_id` is an OPAQUE id with no cross-module foreign
-- key, so the same string can legitimately name a different person in a different hub. Without it
-- one tenant's merge would re-point another tenant's paid vouchers.
--
-- `customer_deleted_at = NULL` CLEARS a stale orphan stamp (`grant_orphan_stamp.sql`, services#81):
-- the owner is now the survivor, who is alive, so the grant is no longer an orphan and must stop
-- showing up in `services.packages.orphans`. Every other column — sessions, amount, expiry — is
-- untouched, exactly as it is for the orphan stamp itself: the voucher did not change, only who it
-- belongs to.
--
-- The `surviving_id <> absorbed_id` guard rules out a degenerate merge event matching the
-- survivor's own grants.
--
-- IDEMPOTENT: the outbox is at-least-once, and a redelivery finds no grant left on the absorbed id
-- — the WHERE matches zero rows. NO `expect_rows`: a merge of a customer who never bought a voucher
-- is the ordinary case, not a failure.
