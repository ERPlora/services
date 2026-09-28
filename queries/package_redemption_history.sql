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
-- Binds: :package_id. The runtime injects :hub_id. Everything else — the page, the order and the
-- filters — belongs to the runtime's LIST engine, declared in the `list` block of the manifest
-- (services#76). It used to answer the WHOLE ledger with no `LIMIT`, which is invisible on a
-- voucher created last week and hundreds or thousands of rows on the star voucher of a salon after
-- two years, on a tablet. So: no `ORDER BY` and no `LIMIT` here — the engine wraps this SELECT as a
-- derived table and composes them, and an `ORDER BY` inside a subquery is a sort the outer one
-- throws away anyway.
--
-- A customer's balance across vouchers is the other question and it already has its own door,
-- `services.packages.balance`; `f_customer_id` here answers «this customer's movements ON THIS
-- voucher», which is the question the sheet is asked most.
--
-- `movement` is the derived field the ledger is read by, and the order of its branches is the
-- semantics:
--   * `refunded` — a delivered session that went back because the sale was returned. It wins over
--     the soft-delete flag, because a refund IS a soft-delete plus a reason;
--   * `expired`  — a hold on a checkout nobody ever came back to, swept by the deadline. It also
--     wins over the plain soft-delete: migration 014 added `release_reason` precisely so this
--     ledger could tell an operator's undo from a timeout, and while both were printed `released`
--     a salon read two identical rows for two very different events — and the `movement` filter
--     would have handed an auditor the timeouts along with the choices;
--   * `released` — a hold undone before the sale was paid. Nothing was owed and nobody was charged;
--   * `consumed` — the session was delivered and the sale is settled;
--   * `held`     — the checkout is still open;
--   * `adjusted` — not a session at all but a COURTESY on the purchase (services#118, migration
--     019): sessions added (`uses_delta`) and/or days the expiry moved (`days_delta`), with who
--     (`created_by`), when (`redeemed_at`, the ledger's instant column) and why (`adjust_reason`).
--     It is the second branch of the UNION because it lives in its own table; the columns a
--     session has and an adjustment does not are NULL there, and the adjustment columns are 0/''
--     on a session. The branch is matched on `hub_id` twice — the movement and its grant — so a
--     neighbour's row naming this grant id cannot print here.
--
-- `movement_seq` is the ledger's own cursor, and it exists because the list engine sorts by ONE
-- column (`crates/runtime/src/queries.rs::run_list`): the composite order this query used to
-- carry — instant, then ordinal, then id — has to collapse into a single comparable key, or two
-- movements written in the same instant can swap between two queries and the reader gets one of
-- them twice and never sees the other. `redeemed_at` is already an ISO-8601 string, so comparing
-- it as text is comparing it as a date, and `id` is the primary key: the pair is a TOTAL order.
-- The ordinal is no longer the middle tie-break — it stays in the row for the reader — because
-- `use_index` is a number and a number padded into a string is one more rule to keep in sync.
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
    COALESCE(r.release_reason, '')          AS release_reason,
    r.created_by                            AS created_by,
    0                                       AS uses_delta,
    0                                       AS days_delta,
    ''                                      AS adjust_reason,
    CASE
        WHEN r.refunded_at IS NOT NULL             THEN 'refunded'
        WHEN r.is_deleted = 1
             AND r.release_reason = 'expired'      THEN 'expired'
        WHEN r.is_deleted = 1                      THEN 'released'
        WHEN r.status = 'consumed'                 THEN 'consumed'
        ELSE 'held'
    END                                     AS movement,
    r.redeemed_at || '|' || r.id            AS movement_seq
FROM services_package_redemption r
LEFT JOIN services_service s
       ON s.id = r.service_id AND s.hub_id = r.hub_id
WHERE r.hub_id = :hub_id AND r.package_id = :package_id
UNION ALL
SELECT
    a.id                                    AS redemption_id,
    a.grant_id                              AS grant_id,
    g.package_id                            AS package_id,
    g.customer_id                           AS customer_id,
    NULL                                    AS service_id,
    NULL                                    AS service_name,
    NULL                                    AS use_index,
    'adjusted'                              AS status,
    a.adjusted_at                           AS redeemed_at,
    NULL                                    AS settled_at,
    NULL                                    AS sale_id,
    NULL                                    AS checkout_ref,
    NULL                                    AS line_ref,
    NULL                                    AS appointment_id,
    ''                                      AS note,
    NULL                                    AS refunded_at,
    NULL                                    AS refunded_by,
    NULL                                    AS refund_ref,
    ''                                      AS refund_note,
    0                                       AS refund_expired,
    a.is_deleted                            AS is_deleted,
    ''                                      AS release_reason,
    a.created_by                            AS created_by,
    a.uses_delta                            AS uses_delta,
    a.days_delta                            AS days_delta,
    a.reason                                AS adjust_reason,
    'adjusted'                              AS movement,
    a.adjusted_at || '|' || a.id            AS movement_seq
FROM services_package_grant_adjustment a
JOIN services_package_grant g
  ON g.id = a.grant_id AND g.hub_id = a.hub_id
WHERE a.hub_id = :hub_id AND g.package_id = :package_id AND a.is_deleted = 0
