-- The vouchers SOLD on one sale and still live, for the warning the till shows BEFORE voiding the
-- sale or refunding it in full (services#157, SERVICES-F27 / SERVICES-F26, slot
-- `sales.reversal.notice`): those are exactly the rows `sale_void_grants.sql` and
-- `sale_refund_grants.sql` would void — same hub, `source = 'sale'`, same sale, not voided yet.
--
-- `used` counts what the balance counts (a live session: spent, or held at a till and not lapsed),
-- except a session settled on THIS very sale: the void gives it back before the voucher is judged
-- (`sale_void_return_sessions.sql`), so it is not a visit that stays made. `remaining` is what is
-- lost, with what was given or corrected later (`Ajustar`), and NULL for an unlimited voucher.
SELECT
    g.id                                                   AS grant_id,
    g.package_id                                           AS package_id,
    COALESCE(p.name, '')                                   AS package_name,
    g.customer_id                                          AS customer_id,
    COALESCE(u.used, 0)                                    AS used,
    CASE WHEN g.max_uses IS NULL THEN NULL
         ELSE (g.max_uses + COALESCE(adj.uses_delta, 0)) - COALESCE(u.used, 0) END AS remaining
FROM services_package_grant g
LEFT JOIN services_package p
       ON p.id = g.package_id AND p.hub_id = g.hub_id
LEFT JOIN (SELECT hub_id, grant_id, CAST(SUM(uses_delta) AS BIGINT) AS uses_delta
             FROM services_package_grant_adjustment
            WHERE is_deleted = 0
            GROUP BY hub_id, grant_id) adj
       ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
LEFT JOIN (SELECT r.hub_id, r.grant_id, CAST(COUNT(*) AS BIGINT) AS used
             FROM services_package_redemption r
            WHERE r.is_deleted = 0
              AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
              AND NOT (r.settled_at IS NOT NULL AND COALESCE(r.sale_id, '') = CAST(:sale_id AS TEXT))
            GROUP BY r.hub_id, r.grant_id) u
       ON u.grant_id = g.id AND u.hub_id = g.hub_id
WHERE g.hub_id = :hub_id
  AND g.sale_id = CAST(:sale_id AS TEXT)
  AND g.source = 'sale'
  AND g.is_deleted = 0
  AND g.voided_at IS NULL
ORDER BY package_name, g.granted_at, g.id
