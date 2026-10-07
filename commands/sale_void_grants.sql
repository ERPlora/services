-- A voucher SOLD on a sale is voided with that sale, used or not
-- (`services._on_sale_voided`, statement 3 of 3, services#151, services#157 / SERVICES-F14).
--
-- The customer is getting the money back, so the voucher she bought goes too: the same void an
-- operator does by hand in **Bonos vendidos** (`_void_grant.sql`), with the same stamps — who
-- (the operator who voided the sale), when, and why (the void's reason) — so the sheet shows
-- «Anulado por … el …» and the reason without a second screen to explain it.
--
-- 🔴 Used or not (services#157, the market rule: MyTime, Square, Lightspeed, GoDaddy void what is
-- left; WooCommerce leaving it live is the complaint): the visits already made stay made — their
-- sessions are not touched here, a session held at a till right now included — and what was left
-- is lost. Leaving it live would give the money back AND the sessions. The till says so before the
-- operator confirms (`services.packages.sold_on_sale`, slot `sales.reversal.notice`). Statement 1
-- queued this on the voucher's pair, so a till holding a session of it waits for the void and then
-- reads it voided.
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
   AND g.voided_at IS NULL;
