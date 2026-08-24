-- What vouchers this customer OWNS and what is left in each (`services.packages.balance`,
-- grant-aware since services#73). One row per GRANT — per PURCHASE — so a customer who bought the
-- same voucher twice sees two, which is the case that used to be impossible.
--
-- 🔴 It reads `services_package_grant`, not the redemption ledger. Until services#73 a «balance»
-- only existed once the customer had redeemed something, because the entitlement was materialised
-- by the first use: a voucher bought and never started had no row here, and a customer who never
-- bought anything had five sessions of everything. Now the purchase is the row and the ledger is
-- only what has been spent against it.
--
-- Param `:customer_id`; the runtime injects `:hub_id` and `:now`.
--   used        = live sessions spent against THIS grant (held ones included — a hold is spent
--                 until it is released)
--   remaining   = max_uses - used  (NULL when the grant was sold as unlimited)
--   granted_at  = when it was bought: the expiry anchor and the date an auditor matches against the
--                 fiscal record of the sale
--   expires_at  = granted_at + validity_days  (NULL when it never expires)
--   is_expired  = 1 when now is past expires_at, else 0
--
-- `max_uses` and `validity_days` are the GRANT's snapshot, never the template's: editing the
-- catalogue must not change what somebody already paid for.
SELECT
  g.id                                                   AS grant_id,
  g.package_id                                           AS package_id,
  p.name                                                 AS package_name,
  g.customer_id                                          AS customer_id,
  g.granted_at                                           AS granted_at,
  g.source                                               AS source,
  g.sale_id                                              AS sale_id,
  g.amount_cents                                         AS amount_cents,
  g.max_uses                                             AS max_uses,
  (SELECT COUNT(*) FROM services_package_redemption r
    WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0) AS used,
  CASE WHEN g.max_uses IS NULL THEN NULL
       ELSE g.max_uses - (SELECT COUNT(*) FROM services_package_redemption r
                           WHERE r.hub_id = g.hub_id AND r.grant_id = g.id
                             AND r.is_deleted = 0) END   AS remaining,
  g.validity_days                                        AS validity_days,
  (SELECT MIN(r.redeemed_at) FROM services_package_redemption r
    WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0) AS first_redeemed_at,
  CASE WHEN g.validity_days IS NULL THEN NULL
       ELSE erp_dateadd(g.granted_at, g.validity_days, 'days') END        AS expires_at,
  CASE WHEN g.validity_days IS NOT NULL
            AND erp_dt(:now) > erp_dateadd(g.granted_at, g.validity_days, 'days')
       THEN 1 ELSE 0 END                                 AS is_expired
FROM services_package_grant g
JOIN services_package p ON p.id = g.package_id AND p.hub_id = g.hub_id
WHERE g.hub_id = :hub_id AND g.customer_id = :customer_id AND g.is_deleted = 0
ORDER BY g.granted_at DESC, g.id DESC;
