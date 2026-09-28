-- Voids a grant sold by mistake (services#82): the only statement of `services._void_grant`,
-- emitted by the `void_grant` handler after `services.packages.void_check` said yes.
--
-- It repeats every condition of the pre-check — this hub, still live, not voided, a non-blank
-- reason, no session spent or held — so the read is advisory and the WRITE is the authority. A
-- race (a till holds a session between the read and this statement) lands on zero rows, and the
-- manifest's `expect_rows` turns that zero into `services.grant_not_voidable` and rolls back.
--
-- The row is soft-deleted, never removed: every door that spends or offers a session filters
-- `is_deleted = 0`, and the three stamps keep who, when and why for the audit (migration 018).
UPDATE services_package_grant AS g
   SET is_deleted = 1,
       deleted_at = :now,
       voided_at = :now,
       voided_by = :current_user_id,
       void_reason = TRIM(:reason),
       updated_by = :current_user_id,
       updated_at = :now
 WHERE g.id = :grant_id
   AND g.hub_id = :hub_id
   AND g.is_deleted = 0
   AND g.voided_at IS NULL
   AND TRIM(COALESCE(:reason, '')) <> ''
   AND NOT EXISTS (
       SELECT 1 FROM services_package_redemption r
        WHERE r.hub_id = :hub_id AND r.grant_id = g.id AND r.is_deleted = 0
          AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
   );
