-- Every movement of a voucher, in one place (`services.packages.redemption_history`, services#71 /
-- ADR-0386). This is the «ficha del bono» the ADR asks for: a session that comes back must be a
-- MOVEMENT anyone can look at, not a counter that quietly goes up.
--
-- 🔴 It reads the SOFT-DELETED rows too, and that is the whole point. In this module giving a
-- session back means taking its row out of the live set — a release for a hold that was never paid,
-- a refund for one that was. A history filtered on `is_deleted = 0`, which is the reflex everywhere
-- else in the hub, would show exactly the movements it exists to show and hide the two that matter.
--
-- `grant_id` travels in the row (services#73): the movements of a voucher a customer bought TWICE
-- are two ledgers under one template, and without the grant on the row nobody could tell which
-- session came out of which purchase — which is exactly what an audit of the accrual has to do.
--
-- Binds: :package_id. The runtime injects :hub_id. There is no `:customer_id` filter on purpose:
-- the screen this feeds is the VOUCHER's sheet, not a customer's, and `customer_id` travels in the
-- row so the caller can group or filter without a second round trip. A customer's balance across
-- vouchers is the other question and it already has its own door, `services.packages.balance`.
--
-- `movement` is the one derived field, and the order of its branches is the semantics:
--   * `refunded` — a delivered session that went back because the sale was returned. It wins over
--     the soft-delete flag, because a refund IS a soft-delete plus a reason;
--   * `released`  — a hold undone before the sale was paid. Nothing was owed and nobody was charged;
--   * `consumed`  — the session was delivered and the sale is settled;
--   * `held`      — the checkout is still open.
--
-- The service is LEFT-joined and matched on `hub_id` as well: without that a line pointing at
-- another hub's service would print its name here (the bug `package_items_list.sql` already had).
-- It is a LEFT join because `services.packages.redeem` — the chair path — spends a session with no
-- line and therefore no `service_id`, and a movement with no service still has to be listed.
SELECT
    r.id                                    AS redemption_id,
    r.grant_id                              AS grant_id,
    r.package_id                            AS package_id,
    r.customer_id                           AS customer_id,
    r.service_id                            AS service_id,
    s.name                                  AS service_name,
    r.use_index                             AS use_index,
    r.status                                AS status,
    r.redeemed_at                           AS redeemed_at,
    r.settled_at                            AS settled_at,
    r.sale_id                               AS sale_id,
    r.checkout_ref                          AS checkout_ref,
    r.line_ref                              AS line_ref,
    r.appointment_id                        AS appointment_id,
    r.note                                  AS note,
    r.refunded_at                           AS refunded_at,
    r.refunded_by                           AS refunded_by,
    r.refund_ref                            AS refund_ref,
    COALESCE(r.refund_note, '')             AS refund_note,
    COALESCE(r.refund_expired, 0)           AS refund_expired,
    r.is_deleted                            AS is_deleted,
    r.created_by                            AS created_by,
    CASE
        WHEN r.refunded_at IS NOT NULL THEN 'refunded'
        WHEN r.is_deleted = 1          THEN 'released'
        WHEN r.status = 'consumed'     THEN 'consumed'
        ELSE 'held'
    END                                     AS movement
FROM services_package_redemption r
LEFT JOIN services_service s
       ON s.id = r.service_id AND s.hub_id = r.hub_id
WHERE r.hub_id = :hub_id AND r.package_id = :package_id
ORDER BY r.redeemed_at DESC, r.use_index DESC, r.id DESC;
