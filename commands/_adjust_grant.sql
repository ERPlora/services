-- Adds sessions and/or days to a sold voucher (services#118), or takes sessions away as a balance
-- correction (services#119): the only statement of `services._adjust_grant`, emitted by the
-- `adjust_grant` handler after `services.packages.adjust_check` said yes.
--
-- It repeats every condition of the pre-check — this hub, still live, not voided, a non-blank
-- reason, something to move, no negative days, no more than 100 sessions (either way) nor 366 days
-- at once (what the screen promises; the handler's ADJUST_MAX_*), no sessions on an unlimited
-- voucher and no days on one that never expires, and a correction never below what is spent (the
-- same live count as `adjust_check.uses_left`) — so the read is advisory and the WRITE is the
-- authority. A refused case
-- lands on zero rows and the manifest's `expect_rows` turns that into
-- `services.grant_not_adjustable` and rolls back.
--
-- It WRITES A MOVEMENT and leaves the grant alone: `max_uses` / `validity_days` are the snapshot
-- of what was sold (ADR-0390, migration 019), and every reader adds the live movements to them.
INSERT INTO services_package_grant_adjustment
  (id, hub_id, grant_id, uses_delta, days_delta, reason, adjusted_at, is_deleted,
   created_by, updated_by, created_at, updated_at)
SELECT
  :adjustment_id, g.hub_id, g.id,
  CAST(:uses_delta AS BIGINT), CAST(:days_delta AS BIGINT), TRIM(:reason), :now, 0,
  :current_user_id, :current_user_id, :now, :now
FROM services_package_grant g
WHERE g.id = :grant_id
  AND g.hub_id = :hub_id
  AND g.is_deleted = 0
  AND g.voided_at IS NULL
  AND TRIM(COALESCE(:reason, '')) <> ''
  AND CAST(:uses_delta AS BIGINT) >= -100
  AND CAST(:days_delta AS BIGINT) >= 0
  AND CAST(:uses_delta AS BIGINT) <= 100
  AND CAST(:days_delta AS BIGINT) <= 366
  AND (CAST(:uses_delta AS BIGINT) <> 0 OR CAST(:days_delta AS BIGINT) > 0)
  AND (CAST(:uses_delta AS BIGINT) = 0 OR g.max_uses IS NOT NULL)
  AND (CAST(:days_delta AS BIGINT) = 0 OR g.validity_days IS NOT NULL)
  -- The floor of a correction: what the customer is left with can never be less than what is spent.
  AND (
    CAST(:uses_delta AS BIGINT) >= 0
    OR g.max_uses
         + COALESCE((SELECT CAST(SUM(a.uses_delta) AS BIGINT) FROM services_package_grant_adjustment a
                      WHERE a.hub_id = g.hub_id AND a.grant_id = g.id AND a.is_deleted = 0), 0)
         + CAST(:uses_delta AS BIGINT)
       >= (SELECT COUNT(*) FROM services_package_redemption r
            WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0
              AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at)))
  );
