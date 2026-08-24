-- Every voucher hold of a checkout becomes final when its sale is paid — the listener half of the
-- settle (`services._settle_holds_for_sale`, fired by `sale.completed`, services#70 / ADR-0386).
--
-- WHY A LISTENER AND NOT ONLY THE EXPLICIT COMMAND. `services.packages.settle_hold` needs the
-- till to remember to call it, and a hold nobody settles stays releasable forever — a session
-- that could be handed back after the customer already had the haircut. The event closes that
-- without a cross-module dependency: `sale.completed` already carries `order_id` (ADR-0010) and
-- the till writes that same value into `checkout_ref` when it holds. `sales` learns nothing about
-- vouchers; `services` reads one field of an event it does not own.
--
-- A quick sale has no order, so `:order_id` arrives NULL and `checkout_ref = NULL` is never true:
-- the statement touches zero rows and that is CORRECT, not a swallowed failure — that till settles
-- through the explicit command, which is the authoritative path and the one under test. The
-- `IS NOT NULL` is written out so the intent cannot be mistaken for an accident of SQL semantics.
--
-- It clears `expires_at` for the same reason the explicit command does (services#77): the session
-- was delivered, so it is final and carries no deadline. And like that command it does NOT consult
-- the deadline before settling — the sale completing is the strongest possible evidence that this
-- checkout was not abandoned.
UPDATE services_package_redemption
   SET status = 'consumed',
       settled_at = :now,
       expires_at = NULL,
       sale_id = :sale_id,
       updated_by = :current_user_id,
       updated_at = :now
 WHERE hub_id = :hub_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL
   AND checkout_ref IS NOT NULL
   AND checkout_ref = :order_id;
