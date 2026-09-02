UPDATE services_package_redemption
   SET is_deleted     = 1,
       deleted_at     = :now,
       release_reason = 'released',
       updated_by     = :current_user_id,
       updated_at     = :now
 WHERE hub_id = :hub_id
   AND checkout_ref = :order_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL;

-- The whole ticket was cancelled, so every session it held comes back NOW
-- (`services._on_order_voided`, services#84 / ADR-0386). Prose at the BOTTOM by house rule
-- (hub#1137/ADR-0387).
--
-- This is the sibling of `hold_release_on_line_removed.sql` — the same guard, the same stamp, the
-- same reasons — with the line dropped from the WHERE: voiding an open order takes away every line
-- at once, so every live hold of that checkout goes back to its voucher. It is the case the issue
-- describes as «keep_lines empty», and it CANNOT be served by the per-line path: `sales.order.void`
-- does not remove the lines one by one, and by the time the ticket is cancelled the payment sheet
-- is gone, so there is no filler left anywhere to ask.
--
-- It stays ONE conditional UPDATE over N rows, not N statements: a partial cancel — some sessions
-- back, some still held — is a state no screen can explain and no operator can fix.
--
-- Settled sessions are outside the WHERE, as everywhere else in this module: `sales.order.void`
-- only voids an OPEN order, but the guard is written here anyway rather than assumed of the caller.
-- A session the customer already had comes back through the refund door, never through a cancel.
