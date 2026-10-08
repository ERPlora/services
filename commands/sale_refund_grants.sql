-- A voucher SOLD on a sale is voided when that sale is refunded IN FULL, used or not
-- (`services._on_sale_refunded`, statement 2 of 3, services#154, services#157 / SERVICES-F14).
--
-- `sale.refunded` says how much went back, whether the sale is now refunded in full
-- (`fully_refunded`) and which lines went back with the money (`lines`, SALES-F31). The refund that
-- returns the WHOLE ticket is the same as voiding it, and every voucher sold on it goes the same way
-- as in `sale_void_grants.sql`: the void an operator does by hand in **Bonos vendidos**, stamped
-- with who refunded the sale, when and the refund's reason. A partial refund voids only the
-- vouchers of the lines it names, in statement 3 (`sale_refund_line_grants.sql`, services#158); one
-- that names no line voids nothing. The kernel binds a JSON bool as 0/1, and an event that does not
-- carry the flag binds NULL: neither is a full refund.
--
-- 🔴 Used or not (services#157), as in the void: the visits already made stay made — no session is
-- touched here, a session held at a till right now included — and what was left is lost. The till
-- says so before the operator confirms (`services.packages.sold_on_sale`, slot
-- `sales.reversal.notice`). Statement 1 (`sale_void_lock.sql`) queued this on the voucher's pair,
-- so a till holding a session of it waits for the refund and then reads it voided. A session
-- settled on THIS very sale is not given back by the listener either: the return window does it
-- when the operator leaves it ticked (SERVICES-F26), and giving it back here would make that window
-- answer «already returned».
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
   AND g.voided_at IS NULL;
