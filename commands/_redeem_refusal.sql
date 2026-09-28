-- Names the reason a session was NOT spent (services#128) — statement 2 of the gated statements of
-- `services._redeem` (the chair) and `services._hold` (the till), right after the conditional
-- INSERT it speaks for and before the generic assert.
--
-- The handler already refuses with a reason BEFORE the transaction, from the pre-check
-- `services.packages.redeem_check`. What that read cannot see is the door that commits between it
-- and the write: another till spending the last session, a void, a correction. `_grant_lock.sql`
-- makes this command wait for that door, and the INSERT then reads what it committed and writes
-- nothing. Without this statement the refusal was the CHECK of `services__gate`, which the kernel
-- answers with its generic `db` code — «could not complete» at the till, where «no sessions left»
-- or «this voucher is voided» is what the cashier can act on.
--
-- It answers the SAME reasons, in the SAME order, as `queries/package_redeem_check.sql` (a late
-- till reads what it would have read one second later), plus the till's own: the voucher does not
-- cover the line's service. `:service_id` is NULL at the chair — no line, no coverage to check.
--
-- A 2-row constant set selected only when the INSERT wrote no row with :redemption_id: nothing is
-- inserted on the happy path; on a refusal the second row violates the unique index of its reason
-- (`services_redeem_<reason>`, migration 020) → 23505 → `on_unique` → `services.package_<reason>`
-- → the command rolls back. `not_redeemable` is the closed fallback: a refusal no rule explains
-- still reaches the caller as a code, never as `db`.
INSERT INTO services__redeem_gate (gate, redemption_id)
SELECT why.reason, :redemption_id
FROM (SELECT 1 AS n UNION ALL SELECT 2 AS n) AS twice
CROSS JOIN (
  SELECT CASE
           WHEN g.voided_at IS NOT NULL THEN 'voided'
           WHEN g.id IS NULL OR g.is_deleted <> 0 THEN 'no_grant'
           WHEN p.id IS NULL THEN 'package_not_found'
           WHEN g.max_uses IS NOT NULL
                AND (SELECT COUNT(*) FROM services_package_redemption u
                      WHERE u.hub_id = :hub_id AND u.grant_id = g.id AND u.is_deleted = 0
                        AND (u.expires_at IS NULL OR erp_dt(:now) < erp_dt(u.expires_at)))
                    >= g.max_uses + COALESCE(adj.uses_delta, 0)
             THEN 'no_uses_left'
           WHEN g.validity_days IS NOT NULL
                AND erp_dt(:now) > erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days')
             THEN 'expired'
           WHEN CAST(:service_id AS TEXT) IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM services_packageitem i
                                 WHERE i.hub_id = :hub_id AND i.package_id = g.package_id
                                   AND i.service_id = CAST(:service_id AS TEXT) AND i.is_deleted = 0)
             THEN 'does_not_cover_service'
           ELSE 'not_redeemable'
         END AS reason
  FROM (SELECT 1 AS one) AS always
  LEFT JOIN services_package_grant g ON g.id = :grant_id AND g.hub_id = :hub_id
  LEFT JOIN (SELECT hub_id, grant_id, CAST(SUM(uses_delta) AS BIGINT) AS uses_delta, CAST(SUM(days_delta) AS BIGINT) AS days_delta
               FROM services_package_grant_adjustment
              WHERE is_deleted = 0
              GROUP BY hub_id, grant_id) adj
         ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
  LEFT JOIN services_package p
         ON p.id = g.package_id AND p.hub_id = g.hub_id AND p.is_deleted = 0 AND p.is_active = 1
) AS why
WHERE NOT EXISTS (SELECT 1 FROM services_package_redemption
                   WHERE id = :redemption_id AND hub_id = :hub_id);
