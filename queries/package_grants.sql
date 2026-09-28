-- The vouchers SOLD of one catalogue voucher (services#82): one row per grant, live or voided, so
-- the voucher's sheet can list who holds it and void the one sold by mistake. Voided rows are
-- included on purpose — that is the trail (who, when, why) — and `status` says which is which.
-- `can_void` is the same rule as `void_check`/`_void_grant` (live, nothing spent or held) for the
-- screen to decide whether to offer the button; the command re-checks it anyway.
--
-- services#118: `max_uses`, `remaining` and `expires_at` are the grant's snapshot PLUS its live
-- adjustments (migration 019) — what the customer can actually spend — and `adjusted_uses` /
-- `adjusted_days` say how much of that was given afterwards, so the sheet can tell a gift from the
-- purchase. `can_adjust` is the rule of `adjust_check`/`_adjust_grant` (live, and it has a session
-- limit or an expiry to move); the command re-checks it anyway.
SELECT
    g.id                                                   AS grant_id,
    g.package_id                                           AS package_id,
    g.customer_id                                          AS customer_id,
    g.granted_at                                           AS granted_at,
    g.source                                               AS source,
    g.sale_id                                              AS sale_id,
    g.amount_cents                                         AS amount_cents,
    (g.max_uses + COALESCE(adj.uses_delta, 0))             AS max_uses,
    (SELECT COUNT(*) FROM services_package_redemption r
      WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0
        AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at)))  AS used,
    CASE WHEN g.max_uses IS NULL THEN NULL
         ELSE (g.max_uses + COALESCE(adj.uses_delta, 0)) - (SELECT COUNT(*) FROM services_package_redemption r
                             WHERE r.hub_id = g.hub_id AND r.grant_id = g.id
                               AND r.is_deleted = 0
                               AND (r.expires_at IS NULL
                                    OR erp_dt(:now) < erp_dt(r.expires_at))) END AS remaining,
    CASE WHEN g.validity_days IS NULL THEN NULL
         ELSE erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days') END        AS expires_at,
    CASE WHEN g.voided_at IS NOT NULL THEN 'voided' ELSE 'active' END       AS status,
    g.voided_at                                            AS voided_at,
    g.voided_by                                            AS voided_by,
    COALESCE(g.void_reason, '')                            AS void_reason,
    CASE WHEN g.voided_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM services_package_redemption r
                               WHERE r.hub_id = g.hub_id AND r.grant_id = g.id
                                 AND r.is_deleted = 0
                                 AND (r.expires_at IS NULL
                                      OR erp_dt(:now) < erp_dt(r.expires_at)))
         THEN 1 ELSE 0 END                                 AS can_void,
    COALESCE(adj.uses_delta, 0)                            AS adjusted_uses,
    COALESCE(adj.days_delta, 0)                            AS adjusted_days,
    CASE WHEN g.voided_at IS NULL AND g.is_deleted = 0
              AND (g.max_uses IS NOT NULL OR g.validity_days IS NOT NULL)
         THEN 1 ELSE 0 END                                 AS can_adjust
FROM services_package_grant g
LEFT JOIN (SELECT hub_id, grant_id, SUM(uses_delta) AS uses_delta, SUM(days_delta) AS days_delta
             FROM services_package_grant_adjustment
            WHERE is_deleted = 0
            GROUP BY hub_id, grant_id) adj
       ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
WHERE g.hub_id = :hub_id AND g.package_id = :package_id
  AND (g.is_deleted = 0 OR g.voided_at IS NOT NULL)
