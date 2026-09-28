-- The voucher sessions ALREADY HELD on an open checkout (`services.packages.holds_for_checkout`,
-- services#77 / ADR-0386). Read-only: it decides nothing and writes nothing.
--
-- WHY IT EXISTS. `services.packages.hold_for_line` spends the session the instant the cashier taps
-- «pay with voucher», and the `redemption_id` it hands back is the only key that undoes it. Until
-- this query that key lived nowhere but the component's memory, so a reload — the wifi drops and
-- the shell restarts, the cashier hits F5, Android kills the tab, the shift moves to another
-- device — left the salon with no way out: charging billed the FULL price (the host does not know
-- the line is covered) so the customer paid AND lost the session; redeeming again was refused by
-- `uq_services_redemption_line`, which is exactly the guard that must be there; and undoing was
-- impossible, because the release needs an id the reload took with it. That is Mindbody's stuck
-- session by the other door.
--
-- This is the read that closes it. A remounted `erp-services-voucher-tender` has four strings the
-- host re-emits on every mount — customer, service, checkout, line — and asking «what did I
-- already hold on this checkout?» is the one question that turns them back into a hold. `sales`
-- learns nothing new: it keeps hosting a slot and stays ignorant of what a voucher is (ADR-0386),
-- which is the dependency that would otherwise have to be invented.
--
-- 🔴 IT RETURNS ONLY WHAT CAN STILL BE UNDONE. Live rows, `status = 'held'`, `settled_at IS NULL`
-- and not past their deadline. Each exclusion is a different promise:
--
--   * a SETTLED session is delivered — the customer had the haircut — and giving it back is a
--     REFUND, which is audited and goes through `services.packages.refund_redemption`. Handing it
--     to a screen whose only verb is «undo» would offer an operation the runtime then refuses;
--   * a RELEASED or EXPIRED one is soft-deleted: the session is already back on the voucher, and
--     showing it would tell the cashier a line is covered when it is not — the one lie that ends
--     with the salon giving a haircut away;
--   * an EXPIRED-BUT-NOT-YET-SWEPT one is excluded HERE, by the clock, and not by waiting for
--     the sweep. The reads decide; `commands/hold_expire.sql` only tidies up afterwards. That
--     ordering is deliberate — WooCommerce frees held stock from a cron running at the same
--     interval as the hold, so when the cron does not run the stock stays blocked forever.
--
-- The runtime injects `:hub_id` and `:now`; the caller supplies `:checkout_ref`, opaque to this
-- module (it is the `order_id` when the till is working an order — the same value `sale.completed`
-- carries, which is what lets the settle find these rows by event).
--
-- `remaining_after` is the counter the cashier was looking at when the screen died: sessions left
-- on THIS grant with this hold already taken. It is counted live rather than remembered, so it
-- cannot drift from what `services.packages.tender_options` and `services.packages.balance` say —
-- and the count excludes the stale holds for the same reason those do.
SELECT
    r.id            AS redemption_id,
    r.grant_id      AS grant_id,
    r.package_id    AS package_id,
    p.name          AS package_name,
    r.customer_id   AS customer_id,
    r.service_id    AS service_id,
    s.name          AS service_name,
    r.checkout_ref  AS checkout_ref,
    r.line_ref      AS line_ref,
    r.redeemed_at   AS redeemed_at,
    r.expires_at    AS hold_expires_at,
    r.note          AS note,
    (g.max_uses + COALESCE(adj.uses_delta, 0)) AS max_uses,
    CASE WHEN g.max_uses IS NULL THEN 1 ELSE 0 END          AS is_unlimited,
    CASE WHEN g.max_uses IS NULL THEN NULL
         ELSE (g.max_uses + COALESCE(adj.uses_delta, 0)) - (
            SELECT COUNT(*) FROM services_package_redemption u
             WHERE u.hub_id = :hub_id AND u.grant_id = r.grant_id AND u.is_deleted = 0
               AND (u.expires_at IS NULL OR erp_dt(:now) < erp_dt(u.expires_at))
         ) END                                              AS remaining_after,
    CASE WHEN g.validity_days IS NULL THEN NULL
         ELSE erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days') END AS expires_at
FROM services_package_redemption r
JOIN services_package_grant g ON g.id = r.grant_id AND g.hub_id = r.hub_id
LEFT JOIN (SELECT hub_id, grant_id, SUM(uses_delta) AS uses_delta, SUM(days_delta) AS days_delta
             FROM services_package_grant_adjustment
            WHERE is_deleted = 0
            GROUP BY hub_id, grant_id) adj
       ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
JOIN services_package p ON p.id = r.package_id AND p.hub_id = r.hub_id
LEFT JOIN services_service s ON s.id = r.service_id AND s.hub_id = r.hub_id
WHERE r.hub_id = :hub_id
  AND r.checkout_ref = :checkout_ref
  AND r.is_deleted = 0
  AND r.status = 'held'
  AND r.settled_at IS NULL
  AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
ORDER BY r.redeemed_at ASC, r.id ASC;
