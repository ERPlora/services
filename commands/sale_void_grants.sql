-- A voucher SOLD on a sale is voided with that sale while it is still intact
-- (`services._on_sale_voided`, statement 3 of 3, services#151 / SERVICES-F14).
--
-- The customer is getting the money back, so the sessions she bought go back too: the same void
-- an operator does by hand in **Bonos vendidos** (`_void_grant.sql`), with the same stamps — who
-- (the operator who voided the sale), when, and why (the void's reason) — so the sheet shows
-- «Anulado por … el …» and the reason without a second screen to explain it.
--
-- 🔴 Only an INTACT voucher, the rule of the manual void («Anular solo un bono intacto»): if a
-- session of it is spent or held, those visits happened and voiding the voucher would erase them.
-- It stays live and the manager corrects its balance with **Ajustar** (SERVICES-F18); `sales` voids
-- the money regardless, because the void is not this module's decision. Statement 1 queued this on
-- the voucher's pair, so the `NOT EXISTS` below reads what a till committed a moment ago.
--
-- Only `source = 'sale'` rows carry the sale that minted them (`sale.completed`, SERVICES-F14); a
-- manual grant naming a sale id is an operator's note, not a purchase on this ticket. Idempotent: a
-- redelivered event finds the voucher already voided and touches nothing.
UPDATE services_package_grant AS g
   SET is_deleted = 1,
       deleted_at = :now,
       voided_at = :now,
       voided_by = COALESCE(NULLIF(TRIM(CAST(:voided_by AS TEXT)), ''), :current_user_id),
       void_reason = COALESCE(TRIM(CAST(:reason AS TEXT)), ''),
       updated_by = :current_user_id,
       updated_at = :now
 WHERE g.hub_id = :hub_id
   AND g.sale_id = CAST(:sale_id AS TEXT)
   AND g.source = 'sale'
   AND g.is_deleted = 0
   AND g.voided_at IS NULL
   AND NOT EXISTS (
       SELECT 1 FROM services_package_redemption r
        WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0
          AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
   );
