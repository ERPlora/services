-- Can this voucher session go back to its voucher, and what should the operator be told first?
-- (`services.packages.refund_check`, services#71 / ADR-0386). Read-only: it decides nothing and
-- writes nothing. Two callers, one answer:
--
--   * the WASM handler of `services.packages.refund_redemption` verifies the payload against it —
--     a handler never takes the caller's word for whether a session is returnable — and turns a
--     refusal into a stable, namespaced, translatable code instead of the raw `CHECK constraint
--     failed` of `services__gate` (the lesson of services#52);
--   * `sales`' return screen asks it BEFORE confirming, which is what ADR-0386 requires of a
--     multi-tender return: a tender that cannot be given back is shown as NOT ELIGIBLE WITH ITS
--     REASON, never as a confirm that fails.
--
-- It always answers exactly ONE row, including for an id that does not exist here — same shape as
-- `package_redeem_check.sql`, and for the same reason: the final SELECT reads an aggregate CTE, so
-- there is always a row to answer with. «No rows» and «not refundable» would otherwise be
-- indistinguishable to the handler, which fails closed on a missing read and would turn every
-- unknown id into the generic refusal instead of the honest one.
--
-- Binds: :redemption_id. The runtime injects :hub_id and :now — and :hub_id is what makes the
-- neighbour's session invisible rather than merely unauthorised.
--
-- 🔴 `voucher_expired` IS NOT A REFUSAL. Every other guard in this module weighs validity against
-- `:now`, which is right for a live sale and wrong for a rectification: a ticket from three weeks
-- ago is being undone TODAY, and refusing it would re-create the market's failure through a
-- different door — the customer would lose the session AND the money path with it, and `sales`'
-- return would fail at confirm, which ADR-0386 forbids. So expiry is reported, never enforced: the
-- till warns «this session goes back to a voucher that expired on <date>», the operator decides,
-- and the refund stamps the fact on the row. Validity is not extended and not reset; that would
-- hand out an entitlement nobody bought.
--
-- `remaining_after` is `remaining_before + 1` — the mirror image of `package_tender_options`, where
-- spending a session previews one less. NULL on an unlimited voucher, where counting means nothing.
WITH target AS (
    SELECT id, package_id, customer_id, service_id, sale_id, checkout_ref, line_ref,
           status, settled_at, is_deleted, refunded_at, refund_ref
      FROM services_package_redemption
     WHERE id = :redemption_id AND hub_id = :hub_id
),
pkg AS (
    SELECT p.max_uses, p.validity_days
      FROM services_package p
     WHERE p.hub_id = :hub_id
       AND p.id = (SELECT package_id FROM target)
),
used AS (
    SELECT COUNT(*) AS n, MIN(u.redeemed_at) AS first_at
      FROM services_package_redemption u
     WHERE u.hub_id = :hub_id
       AND u.package_id = (SELECT package_id FROM target)
       AND u.customer_id = (SELECT customer_id FROM target)
       AND u.is_deleted = 0
),
facts AS (
    SELECT
        (SELECT id FROM target)                    AS rid,
        COALESCE((SELECT package_id FROM target), '')   AS package_id,
        COALESCE((SELECT customer_id FROM target), '')  AS customer_id,
        COALESCE((SELECT service_id FROM target), '')   AS service_id,
        COALESCE((SELECT sale_id FROM target), '')      AS sale_id,
        COALESCE((SELECT checkout_ref FROM target), '') AS checkout_ref,
        COALESCE((SELECT line_ref FROM target), '')     AS line_ref,
        COALESCE((SELECT refund_ref FROM target), '')   AS refund_ref,
        (SELECT status FROM target)                AS status,
        (SELECT settled_at FROM target)            AS settled_at,
        (SELECT is_deleted FROM target)            AS is_deleted,
        (SELECT refunded_at FROM target)           AS refunded_at,
        (SELECT max_uses FROM pkg)                 AS max_uses,
        (SELECT n FROM used)                       AS live_uses,
        CASE WHEN (SELECT validity_days FROM pkg) IS NULL THEN NULL
             ELSE erp_dateadd((SELECT first_at FROM used),
                              (SELECT validity_days FROM pkg), 'days') END AS expires_at
)
SELECT
    :redemption_id                                  AS redemption_id,
    package_id,
    customer_id,
    service_id,
    sale_id,
    checkout_ref,
    line_ref,
    refund_ref,
    CASE WHEN rid IS NOT NULL
              AND is_deleted = 0
              AND status = 'consumed'
              AND settled_at IS NOT NULL
         THEN 1 ELSE 0 END                          AS refundable,
    CASE
        WHEN rid IS NULL               THEN 'redemption_not_found'
        WHEN refunded_at IS NOT NULL   THEN 'already_refunded'
        WHEN settled_at IS NULL        THEN 'not_settled'
        WHEN is_deleted = 1            THEN 'not_settled'
        ELSE ''
    END                                             AS reason,
    CASE WHEN refunded_at IS NOT NULL THEN 1 ELSE 0 END AS already_refunded,
    max_uses,
    CASE WHEN max_uses IS NULL THEN NULL
         ELSE max_uses - live_uses END              AS remaining_before,
    CASE WHEN max_uses IS NULL THEN NULL
         ELSE max_uses - live_uses + 1 END          AS remaining_after,
    expires_at,
    CASE WHEN expires_at IS NOT NULL AND erp_dt(:now) > expires_at
         THEN 1 ELSE 0 END                          AS voucher_expired
FROM facts;
