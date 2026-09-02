UPDATE services_package_redemption
   SET is_deleted     = 1,
       deleted_at     = :now,
       release_reason = 'released',
       updated_by     = :current_user_id,
       updated_at     = :now
 WHERE hub_id = :hub_id
   AND checkout_ref = :order_id
   AND line_ref = :line_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL;

-- The line left the cart, so its session comes back NOW (`services._on_order_line_removed`,
-- services#84 / ADR-0386). The prose is at the BOTTOM by house rule (hub#1137/ADR-0387).
--
-- WHAT THIS CLOSES. `services.packages.hold_for_line` spends the session the instant the cashier
-- taps «pay with voucher». Take that line out of the cart and `sales` stops discounting it — the
-- money is charged correctly — but the redemption was left ORPHANED here: the session stayed spent
-- until the deadline swept it, up to a day later. The market gives it back immediately (Zenoti:
-- `Remove` on the line reopens the package there and then; Vagaro: «Not This Time»), and a session
-- a customer paid for that nobody can spend for the rest of the day is a complaint, not a delay.
--
-- 🔴 WHY AN EVENT, AND NOT A BUTTON. `erp-services-voucher-tender` is mounted PER LINE, so it is
-- torn down WITH the line and cannot let go of anything on its way out — and it could not tell that
-- tear-down apart from the one that happens when the payment sheet closes, where the hold MUST
-- survive (that is the whole of services#77). What does know is the server: `sales.order.remove_line`
-- is where the fact happens. So `sales` raises `sales.order.line_removed` and this listens, over the
-- same channel `sale.completed` → `services._on_sale_completed` already uses to settle. Neither
-- module learns anything about the other, and it works when no filler is mounted at all: a cart
-- cleared from another device, a tablet that died, a ticket touched with the sheet closed. The relay
-- ticks every second (`crates/server/src/boot.rs`), so «on the spot» is a second, not a day.
--
-- 🔴 THE GUARD IS THIS WHERE, and it is `hold_release.sql`'s guard word for word. Releasing and
-- settling are the same conditional UPDATE over the same row, so they cannot both win: whichever
-- commits first takes the row out of the other's WHERE. There is no read-then-decide in between,
-- which is what makes «give back a session the customer already had» impossible rather than
-- unlikely — the customer walked out having had the service, and undoing that is a REFUND, with its
-- own audited door and its own permission.
--
-- IDEMPOTENT BY CONSTRUCTION, which the outbox requires: delivery is at-least-once, so this row may
-- arrive twice. The second pass finds `is_deleted = 1` and touches nothing — no counter moves, no
-- stamp is rewritten.
--
-- NO `expect_rows`, AND NO `emit`, both on purpose. Every removal of a cart line in the hub raises
-- this event, and the overwhelming majority of them have no voucher on the line: `expect_rows` would
-- make the dispatcher raise on the ordinary case, the relay would retry it, and a perfectly normal
-- «nothing to do» would land in the dead-letter queue. `emit` would be the same mistake read from
-- the other side — the outbox INSERT is unconditional, so `services.package.hold_released` would
-- fire on every cart edit in the business, voucher or no voucher, announcing something that did not
-- happen. The audit trail is the ROW, which is what `services.packages.redemption_history` reads.
--
-- `release_reason = 'released'` is what separates a DECISION from a timeout (migration 014). Taking
-- the line out of the cart IS the cashier deciding; an abandoned checkout swept by `hold_expire.sql`
-- is not, and the ledger of a salon has to say which of the two happened.
