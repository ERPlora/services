UPDATE services_package_grant
   SET customer_deleted_at = :now,
       updated_by          = :current_user_id,
       updated_at          = :now
 WHERE hub_id = :hub_id
   AND customer_id = :customer_id
   AND is_deleted = 0
   AND customer_deleted_at IS NULL;

-- The customer's sheet is gone, so every voucher they had bought is marked as ORPHANED
-- (`services._on_customer_deleted`, services#81). Prose at the BOTTOM by house rule
-- (hub#1137/ADR-0387).
--
-- This runs from the outbox relay when `customers` publishes `customer.deleted` or
-- `customer.anonymized`. The payload of both IS the params of the command that emitted it, so
-- `:customer_id` is what arrives; there is no schema here because the shape is the neighbour's, not
-- ours, and validating it would mean pinning a contract we do not own.
--
-- 🔴 IT ONLY STAMPS. `max_uses`, `amount_cents`, `granted_at` and `validity_days` are outside the
-- SET on purpose: the customer left, the voucher did not change. `services.packages.balance` keeps
-- returning the same three sessions it returned yesterday, the refund door still refunds and the
-- transfer door (services#79) still has something to transfer. Deleting the grant instead — which
-- is what Square does with LOYALTY POINTS, and only with those — would destroy money that was
-- charged. Nothing here is destructive, which is also why this listener can be safely re-run.
--
-- 🔴 NO `expect_rows`, AND THAT IS THE POINT. Deleting a customer who never bought a voucher — the
-- overwhelming majority of deletes in any hub — affects ZERO rows, and that is the NORMAL case, not
-- a failure. A guard here would send every single customer deletion in the hub to the dead-letter
-- queue and fill the operator's screen with errors about a module that has nothing to do with it.
--
-- `customer_deleted_at IS NULL` IS THE IDEMPOTENCE. The outbox is at-least-once
-- (`crates/runtime/src/outbox.rs`), so a redelivery of the same event must not move the timestamp:
-- the mark records when the sheet went away, and the rescue list sorts by it. Without this
-- predicate a retry an hour later would silently rewrite the date and push the grant back to the
-- top of the list as if it had just happened. It also makes `customer.anonymized` arriving after
-- `customer.deleted` — the ordinary GDPR sequence, two events for one departure — a no-op instead
-- of a second stamp.
--
-- The `hub_id` guard is not decoration: `customer_id` is an OPAQUE id with no cross-module foreign
-- key, so the same string can legitimately name a different person in a different hub. Without it
-- one tenant deleting a customer would orphan another tenant's paid vouchers.
--
-- `updated_by` / `updated_at` are stamped like everywhere else in this module. The relay runs with
-- a wildcard context (ADR-0288, `outbox.rs::listener_ctx`), so `:current_user_id` is the system
-- actor rather than a person — which is exactly what an auditor should see, because no person did
-- this: an event did.
