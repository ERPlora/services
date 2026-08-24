-- Hold of one voucher session against a checkout LINE (statement 1 of 3 of
-- `services.packages.hold_for_line`, services#70 / ADR-0386). Conditional INSERT: it only
-- materialises the hold when EVERY guard holds, evaluated against live data inside the command's
-- transaction. If one fails it inserts nothing and the assert (`_redeem_assert.sql`) rolls the
-- transaction back — no row, no event, no session spent.
--
-- The runtime injects :hub_id, :current_user_id and :now. The WASM handler of
-- `services.packages.hold_for_line` supplies :redemption_id (from `context.new_ids`, so the
-- command can hand the id back to the caller and the assert can verify exactly the row the
-- handler said it wrote) and the caller supplies :package_id, :customer_id, :service_id,
-- :checkout_ref, :line_ref and optionally :note.
--
-- 🔴 The ordinal is the anti-double-spend guard, not the COUNT below it. `MAX(use_index) + 1` over
-- the LIVE rows is what two concurrent tills both compute, and `uq_services_redemption_use` lets
-- exactly one of them commit — see migration 011 for why counting alone is a TOCTOU (Odoo#79235).
-- `MAX + 1` rather than `COUNT + 1` because a released hold leaves a gap, and counting would land
-- on an ordinal a live row already owns and refuse a legitimate redemption.
INSERT INTO services_package_redemption
  (id, hub_id, package_id, customer_id, service_id, checkout_ref, line_ref,
   appointment_id, sale_id, note, redeemed_at, status, settled_at, use_index,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
  :redemption_id, :hub_id, :package_id, :customer_id, :service_id, :checkout_ref, :line_ref,
  NULL, NULL, COALESCE(:note, ''), :now, 'held', NULL,
  (SELECT COALESCE(MAX(u.use_index), 0) + 1
     FROM services_package_redemption u
    WHERE u.hub_id = :hub_id AND u.package_id = :package_id
      AND u.customer_id = :customer_id AND u.is_deleted = 0),
  0, :current_user_id, :current_user_id, :now, :now
FROM services_package p
WHERE p.id = :package_id AND p.hub_id = :hub_id AND p.is_deleted = 0 AND p.is_active = 1
  -- Guard 0: the voucher must COVER this line's service. A voucher of haircuts is N uses of
  -- haircuts — modelling it as a balance is what would let it pay for the shampoo (ADR-0386).
  AND EXISTS (
    SELECT 1 FROM services_packageitem i
     WHERE i.hub_id = :hub_id AND i.package_id = p.id
       AND i.service_id = :service_id AND i.is_deleted = 0
  )
  -- Guard 1: sessions left. max_uses NULL = unlimited; otherwise the customer's live uses of
  -- this voucher — HELD ones included, a hold is a spent session until it is released — must be
  -- below max_uses.
  AND (
    p.max_uses IS NULL
    OR (SELECT COUNT(*) FROM services_package_redemption u
         WHERE u.hub_id = :hub_id AND u.package_id = :package_id
           AND u.customer_id = :customer_id AND u.is_deleted = 0) < p.max_uses
  )
  -- Guard 2: validity. validity_days NULL = no expiry; otherwise the voucher expires
  -- validity_days after the customer's FIRST use (acquisition anchor). On the first use there is
  -- no anchor yet (MIN = NULL) so it passes — the voucher starts now.
  AND (
    p.validity_days IS NULL
    OR NOT EXISTS (
      SELECT MIN(a.redeemed_at) FROM services_package_redemption a
       WHERE a.hub_id = :hub_id AND a.package_id = :package_id
         AND a.customer_id = :customer_id AND a.is_deleted = 0
      HAVING erp_dt(:now) > erp_dateadd(MIN(a.redeemed_at), p.validity_days, 'days')
    )
  );
