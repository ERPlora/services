-- One session of a voucher a customer OWNS is spent at the chair (statement 1 of 3 of
-- `services.packages.redeem`). Conditional INSERT: it only materialises the use when every guard
-- holds, evaluated against live data INSIDE the command's transaction (the count is atomic — no
-- TOCTOU). If one fails it inserts nothing and the assert (`_redeem_assert.sql`) rolls the
-- transaction back.
--
-- The runtime injects :hub_id, :current_user_id and :now. The WASM handler of
-- `services.packages.redeem` supplies :redemption_id (from `context.new_ids`, so the command can
-- hand the id back to the caller) and the caller supplies :grant_id and, optionally,
-- :appointment_id / :sale_id / :note.
--
-- 🔴 THE SESSION IS SPENT AGAINST A GRANT, NOT AGAINST THE CATALOGUE (services#73). Until then this
-- statement counted uses per `(package_id, customer_id)` over `services_package` — a CATALOGUE row —
-- so every customer of the hub had their own N sessions of every voucher without anyone having sold
-- them one, and the customer who HAD bought it got another N next month. `services_package_grant`
-- is the purchase, and `:grant_id` is the whole entitlement: the package and the customer are read
-- FROM IT rather than taken from the payload, so a caller cannot pair someone else's voucher with
-- their own customer. A grant that does not exist in this hub is a grant that does not exist.
INSERT INTO services_package_redemption
  (id, hub_id, grant_id, package_id, customer_id, appointment_id, sale_id, note, redeemed_at,
   status, use_index, is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
  :redemption_id, :hub_id, g.id, g.package_id, g.customer_id,
  :appointment_id, :sale_id, COALESCE(:note, ''), :now,
  -- A session spent HERE is spent at the chair, with no checkout to undo: it is born
  -- `consumed`. The till's path holds first and settles later (`services._hold`, services#70).
  'consumed',
  -- 🔴 The ordinal is the anti-double-spend guard (migration 011). The COUNT in guard 1 below is
  -- the business rule («this voucher has N sessions») and it is a check-then-act against a SECOND
  -- till: under READ COMMITTED both transactions read the same snapshot and both insert. Two
  -- concurrent redemptions compute the SAME `MAX + 1` here, and `uq_services_redemption_use` lets
  -- exactly one of them commit — the loser's whole transaction rolls back, so no row, no event and
  -- no session spent. That is the difference between this and Odoo#79235, open since 2021.
  --
  -- It spans every GRANT of the pair on purpose (migration 013): the index is still
  -- `(hub_id, package_id, customer_id, use_index)`, so two grants simply continue the numbering —
  -- 1..5 on the first, 6..10 on the second — and the guard stays exactly as wide as it was. What
  -- became per-grant is the COUNT below, which is what lets the two coexist instead of sharing one
  -- pool.
  (SELECT COALESCE(MAX(u.use_index), 0) + 1
     FROM services_package_redemption u
    WHERE u.hub_id = :hub_id AND u.package_id = g.package_id
      AND u.customer_id = g.customer_id AND u.is_deleted = 0),
  0, :current_user_id, :current_user_id, :now, :now
FROM services_package_grant g
LEFT JOIN (SELECT hub_id, grant_id, SUM(uses_delta) AS uses_delta, SUM(days_delta) AS days_delta
             FROM services_package_grant_adjustment
            WHERE is_deleted = 0
            GROUP BY hub_id, grant_id) adj
       ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
JOIN services_package p ON p.id = g.package_id AND p.hub_id = g.hub_id
WHERE g.id = :grant_id AND g.hub_id = :hub_id AND g.is_deleted = 0
  AND p.is_deleted = 0 AND p.is_active = 1
  -- Guard 1: sessions left, counted over THIS grant against the `max_uses` THIS grant was sold
  -- with. NULL = unlimited.
  AND (
    g.max_uses IS NULL
    OR (SELECT COUNT(*) FROM services_package_redemption u
         WHERE u.hub_id = :hub_id AND u.grant_id = g.id AND u.is_deleted = 0) < (g.max_uses + COALESCE(adj.uses_delta, 0))
  )
  -- Guard 2: validity, anchored on the PURCHASE (`granted_at`) and not on the first use. Under the
  -- old anchor an unstarted voucher had no clock at all, so one bought a year ago and never touched
  -- had not expired and never would. NULL `validity_days` = no expiry.
  AND (
    g.validity_days IS NULL
    OR erp_dt(:now) <= erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days')
  );
