-- Adds sessions and/or days to a sold voucher (services#118): the only statement of
-- `services._adjust_grant`, emitted by the `adjust_grant` handler after
-- `services.packages.adjust_check` said yes.
--
-- It repeats every condition of the pre-check — this hub, still live, not voided, a non-blank
-- reason, something to add, nothing negative, no sessions on an unlimited voucher and no days on
-- one that never expires — so the read is advisory and the WRITE is the authority. A refused case
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
  CAST(:uses_delta AS INTEGER), CAST(:days_delta AS INTEGER), TRIM(:reason), :now, 0,
  :current_user_id, :current_user_id, :now, :now
FROM services_package_grant g
WHERE g.id = :grant_id
  AND g.hub_id = :hub_id
  AND g.is_deleted = 0
  AND g.voided_at IS NULL
  AND TRIM(COALESCE(:reason, '')) <> ''
  AND CAST(:uses_delta AS INTEGER) >= 0
  AND CAST(:days_delta AS INTEGER) >= 0
  AND (CAST(:uses_delta AS INTEGER) > 0 OR CAST(:days_delta AS INTEGER) > 0)
  AND (CAST(:uses_delta AS INTEGER) = 0 OR g.max_uses IS NOT NULL)
  AND (CAST(:days_delta AS INTEGER) = 0 OR g.validity_days IS NOT NULL);
