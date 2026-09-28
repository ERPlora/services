-- The voucher sessions a SALE spent (`services.packages.redemptions_for_sale`, services#88 /
-- ADR-0386). Read-only: it decides nothing and writes nothing.
--
-- WHY IT EXISTS. `sales`' return screen cedes the hole `sales.refund.tender` and hands its filler
-- four strings — `saleId`, `lineRef` (a `sales_sale_item.id`), `serviceId` and `lineIndex`. None of
-- them is a `redemption_id`, and `services.packages.refund_check` — the door that says whether a
-- session goes back — takes exactly that. The three reads published before this one cannot bridge
-- the gap, each for its own reason:
--
--   * `services.packages.holds_for_checkout` answers only what can still be UNDONE (live, `held`,
--     unsettled). By return time the session is `consumed` and settled, so it is never in there —
--     deliberately, because offering «undo» on a delivered session is an operation the runtime then
--     refuses;
--   * `services.packages.redemption_history` is keyed by `package_id`, which is precisely what the
--     return screen does not know;
--   * `checkout_ref` is the ORDER id, not the `sale_id`, and on a counter sale no order exists.
--
-- What IS stable is that settling stamps `sale_id` on the row (`commands/hold_settle.sql` and
-- `commands/settle_holds_for_sale.sql`). So this asks the only question the screen can ask: which
-- sessions did THIS sale spend, and does each one go back?
--
-- It is `refund_check` BY SALE, and that is not a figure of speech: `refundable`, `reason`,
-- `already_refunded`, `remaining_before`, `remaining_after`, `expires_at` and `voucher_expired` are
-- computed here character for character as that query computes them, and
-- `tests/redemptions_for_sale.postgres.test.py` §D holds the two to each other field by field. Two
-- doors that disagree about whether a session is refundable is how a screen paints a button the
-- runtime then refuses — and the filler needs no second round trip: what it paints is already here.
--
-- 🔴 ALWAYS ONE ROW PER SETTLED SESSION, including one that cannot go back. The criterion is
-- `package_refund_check.sql`'s and it is copied on purpose: with the row gone, «no rows» and «not
-- refundable» become the same answer to a screen whose whole job is to explain itself, and a hole
-- that cannot say «this one already came back» goes silent over a session the salon owes. A row
-- that is already refunded is soft-deleted (`commands/_refund_update.sql` sets `is_deleted = 1`),
-- so this query does NOT filter on `is_deleted` — it reports it, in `already_refunded` and `reason`.
--
-- 🔴 THE ORDER IS THE TWINS CONTRACT. A mother and her daughter get the same haircut on one
-- ticket: two covered lines, two sessions, and the host tells each hole its 0-based `lineIndex`
-- among the covered lines of the SAME service. A settled redemption keeps the ORDER line id in
-- `line_ref` and a sale item has no column pointing back at it, so the ordinal is the only way to
-- pair them: nth hole ↔ nth session of that (sale, service). An arbitrary order would have the nth
-- hole refund an arbitrary session, or — worse — both holes claim the first one and the second
-- session never come back at all. Hence `redeemed_at` (the moment the session was taken, which is
-- what the ordinal is meant to follow), then `use_index` — the per-(package, customer) ordinal, so
-- twins on the SAME voucher stay in the order they were taken even if the two holds share a
-- timestamp — and `id` last, so the answer is deterministic even when both tie.
--
-- The joins to the grant and the package are LEFT for the same reason the row is never dropped: a
-- session whose scenery went missing must still be REPORTABLE. `refundable` does not depend on
-- them, so such a row answers with the same verdict `refund_check` would give it.
--
-- Binds: :sale_id. The runtime injects :hub_id and :now — and :hub_id is what makes the neighbour's
-- session invisible rather than merely unauthorised, which matters here because `sale_id` is opaque
-- to this module and two hubs can perfectly well mint the same one.
SELECT
    r.id                        AS redemption_id,
    COALESCE(r.grant_id, '')    AS grant_id,
    r.package_id                AS package_id,
    COALESCE(p.name, '')        AS package_name,
    r.customer_id               AS customer_id,
    COALESCE(r.service_id, '')  AS service_id,
    COALESCE(s.name, '')        AS service_name,
    r.sale_id                   AS sale_id,
    COALESCE(r.checkout_ref, '') AS checkout_ref,
    COALESCE(r.line_ref, '')    AS line_ref,
    COALESCE(r.refund_ref, '')  AS refund_ref,
    r.redeemed_at               AS redeemed_at,
    r.settled_at                AS settled_at,
    -- Mirror of `package_refund_check.sql`. A session goes back when it is live, delivered and
    -- paid for; anything else is reported with its reason instead of being hidden.
    CASE WHEN r.is_deleted = 0
              AND r.status = 'consumed'
              AND r.settled_at IS NOT NULL
         THEN 1 ELSE 0 END                          AS refundable,
    CASE
        WHEN r.refunded_at IS NOT NULL THEN 'already_refunded'
        WHEN r.settled_at IS NULL      THEN 'not_settled'
        WHEN r.is_deleted = 1          THEN 'not_settled'
        ELSE ''
    END                                             AS reason,
    CASE WHEN r.refunded_at IS NOT NULL THEN 1 ELSE 0 END AS already_refunded,
    (g.max_uses + COALESCE(adj.uses_delta, 0))      AS max_uses,
    CASE WHEN g.max_uses IS NULL THEN 1 ELSE 0 END  AS is_unlimited,
    -- Counted live rather than remembered, so it cannot drift from what `balance` and
    -- `tender_options` say. NULL on an unlimited voucher, where counting means nothing.
    CASE WHEN g.max_uses IS NULL THEN NULL
         ELSE (g.max_uses + COALESCE(adj.uses_delta, 0)) - (
            SELECT COUNT(*) FROM services_package_redemption u
             WHERE u.hub_id = :hub_id AND u.grant_id = r.grant_id AND u.is_deleted = 0
         ) END                                      AS remaining_before,
    -- «quedan 2 → 3 tras devolver». Every row previews returning THAT one, which is why several
    -- rows of the same voucher all read `before + 1`: they are alternatives, not a running total.
    CASE WHEN g.max_uses IS NULL THEN NULL
         ELSE (g.max_uses + COALESCE(adj.uses_delta, 0)) - (
            SELECT COUNT(*) FROM services_package_redemption u
             WHERE u.hub_id = :hub_id AND u.grant_id = r.grant_id AND u.is_deleted = 0
         ) + 1 END                                  AS remaining_after,
    -- Read off the GRANT — the customer's purchase (services#73) — so a customer who bought the
    -- same voucher twice gets the expiry the spent one was sold with, which no later edit of the
    -- catalogue can move.
    CASE WHEN g.validity_days IS NULL THEN NULL
         ELSE erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days') END AS expires_at,
    -- 🔴 CALCULATED, NEVER APPLIED (ADR-0386). A ticket from three weeks ago is being undone
    -- TODAY; refusing would cost the customer the session AND the money path with it, and the
    -- return would fail at confirm, which ADR-0386 forbids. The till warns, the operator decides.
    CASE WHEN g.validity_days IS NOT NULL
              AND erp_dt(:now) > erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days')
         THEN 1 ELSE 0 END                          AS voucher_expired
FROM services_package_redemption r
LEFT JOIN services_package_grant g ON g.id = r.grant_id AND g.hub_id = r.hub_id
LEFT JOIN (SELECT hub_id, grant_id, SUM(uses_delta) AS uses_delta, SUM(days_delta) AS days_delta
             FROM services_package_grant_adjustment
            WHERE is_deleted = 0
            GROUP BY hub_id, grant_id) adj
       ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
LEFT JOIN services_package p ON p.id = r.package_id AND p.hub_id = r.hub_id
LEFT JOIN services_service s ON s.id = r.service_id AND s.hub_id = r.hub_id
WHERE r.hub_id = :hub_id
  AND r.sale_id IS NOT NULL
  AND r.sale_id = :sale_id
  AND r.settled_at IS NOT NULL
ORDER BY r.redeemed_at ASC, COALESCE(r.use_index, 0) ASC, r.id ASC;
