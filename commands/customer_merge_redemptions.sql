UPDATE services_package_redemption AS r
   SET customer_id = :surviving_id,
       use_index   = r.use_index + (
                        SELECT COALESCE(MAX(s.use_index), 0)
                          FROM services_package_redemption AS s
                         WHERE s.hub_id = :hub_id
                           AND s.package_id = r.package_id
                           AND s.customer_id = :surviving_id
                           AND s.is_deleted = 0
                      ),
       updated_by  = :current_user_id,
       updated_at  = :now
 WHERE r.hub_id = :hub_id
   AND r.customer_id = :absorbed_id
   AND CAST(:surviving_id AS TEXT) <> CAST(:absorbed_id AS TEXT);

-- Services · `customer.merged` (layer 2) — re-point a customer's spent sessions to the survivor
-- (customers#86/customers#87). Prose at the BOTTOM by house rule (hub#1137/ADR-0387).
--
-- This runs from the outbox relay when `customers` publishes `customer.merged`. The payload IS the
-- params of the command that emitted it (`{surviving_id, absorbed_id, hub_id}`), and there is no
-- `schema` here for the same reason `grant_orphan_stamp.sql` has none: the shape belongs to the
-- neighbour, and pinning it here would be a contract we do not own.
--
-- `customer_id` is an OPAQUE id with no cross-module foreign key, so the `hub_id` guard is not
-- decoration: the same string can legitimately name a different person in a different hub, and
-- without it one tenant merging a customer would re-point another tenant's paid sessions.
--
-- ALL ROWS MOVE, live AND soft-deleted: a released or refunded session is still HISTORY of what
-- the absorbed sheet spent, and `services.packages.redemption_history` reads it either way.
--
-- 🔴 THE ORDINAL SHIFT. `uq_services_redemption_use` is `(hub_id, package_id, customer_id,
-- use_index)` over live rows, and two sheets that both spent the SAME voucher template both own
-- use_index 1..n — a blind re-point collides on the very first row. The absorbed uses are distinct
-- among themselves (that uniqueness is what the index already enforced on them), so adding the
-- survivor's current MAX moves them all past it and they stay distinct — the index closes whole and
-- the next redemption of either former grant simply continues the count.
--
-- The `surviving_id <> absorbed_id` guard is not a formality: without it a degenerate merge event
-- would match the survivor's own rows and shift them against themselves.
--
-- IDEMPOTENT: the outbox is at-least-once, and a redelivery finds no row left on the absorbed id —
-- the WHERE matches zero rows and nothing moves twice. NO `expect_rows`: a merge of a customer who
-- never redeemed anything is the common case, not a failure. This file runs FIRST in
-- `services._on_customer_merged`, so `customer_merge_grants.sql` never depends on it having matched.
