-- A voucher SOLD on a sale is voided when that sale is refunded IN FULL, while it is still intact
-- (`services._on_sale_refunded`, statement 2 of 2, services#154 / SERVICES-F14).
--
-- `sales.refund` gives money back, not lines (SALES-F31): `sale.refunded` says how much went back
-- and whether the sale is now refunded in full (`fully_refunded`), never which line. So the only
-- refund that says «the voucher went back» is the one that returns the WHOLE ticket — the same as
-- voiding it, and the voucher goes the same way as in `sale_void_grants.sql`: the void an operator
-- does by hand in **Bonos vendidos**, stamped with who refunded the sale, when and the refund's
-- reason. A partial refund cannot name the voucher's line and voids nothing; the refund that gives
-- back the last cent is the one that does. The kernel binds a JSON bool as 0/1, and an event that
-- does not carry the flag binds NULL: neither is a full refund.
--
-- 🔴 Only an INTACT voucher, the rule of the manual void («Anular solo un bono intacto»): a session
-- spent elsewhere, or held live at a till, is a visit that happened, and the voucher stays live for
-- **Ajustar** (SERVICES-F18). Statement 1 (`sale_void_lock.sql`) queued this on the voucher's pair,
-- so the `NOT EXISTS` below reads what a till committed a moment ago.
--
-- What differs from the void: a session of the voucher settled on THIS very sale is not a use —
-- the full refund returns the whole ticket, that session included, exactly as the void gives it
-- back before judging the voucher (`sale_void_grants.sql` runs after the sessions come back). The
-- till cannot do it (the voucher is minted when the sale completes); the API can. The listener does NOT give that session back itself: the return window does it when
-- the operator leaves it ticked (SERVICES-F26), and giving it back here would make that window
-- answer «already returned». A session at the chair that only names the sale was never settled
-- with it, so it still counts.
--
-- Only `source = 'sale'` rows carry the sale that minted them; a manual grant naming a sale id is
-- an operator's note. Idempotent: a redelivered event finds the voucher already voided.
UPDATE services_package_grant AS g
   SET is_deleted = 1,
       deleted_at = :now,
       voided_at = :now,
       voided_by = COALESCE(NULLIF(TRIM(CAST(:refunded_by AS TEXT)), ''), :current_user_id),
       void_reason = COALESCE(TRIM(CAST(:reason AS TEXT)), ''),
       updated_by = :current_user_id,
       updated_at = :now
 WHERE g.hub_id = :hub_id
   AND CAST(:fully_refunded AS BIGINT) = 1
   AND g.sale_id = CAST(:sale_id AS TEXT)
   AND g.source = 'sale'
   AND g.is_deleted = 0
   AND g.voided_at IS NULL
   AND NOT EXISTS (
       SELECT 1 FROM services_package_redemption r
        WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0
          AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
          AND NOT (r.settled_at IS NOT NULL AND COALESCE(r.sale_id, '') = CAST(:sale_id AS TEXT))
   );
