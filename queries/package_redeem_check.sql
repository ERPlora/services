-- Pre-check of a redemption (read-only): can ONE session of this grant be spent right now, and if
-- not, why? Same guards as `commands/_redeem_insert.sql`, but without mutating and answering a
-- BUSINESS reason instead of the raw «CHECK constraint failed» of `services__gate` (services#52).
-- The UI/checkout asks this first and shows the reason; the command remains the transactional
-- authority (anti-TOCTOU) — this only improves the message, it does not replace the gate.
--
-- 🔴 It is asked about a GRANT, not about a catalogue package (services#73). `no_grant` is the new
-- first answer and it is the whole point of the issue: a voucher nobody sold to this customer is a
-- voucher they cannot spend, and until now this query answered `redeemable = 1` for every customer
-- in the hub.
--
--   redeemable = 1 when the redemption would pass; 0 when it would not.
--   reason     = 'no_grant' | 'package_not_found' | 'no_uses_left' | 'expired' | ''  (first failure)
--
-- Bind: :grant_id. The runtime injects :hub_id and :now — and :hub_id is what makes the neighbour's
-- grant invisible rather than merely unauthorised. Dates go through the `erp_*` bridges (ADR-0007).
--
-- It always answers exactly ONE row, including for an id that does not exist here: the final SELECT
-- reads an aggregate CTE, so there is always a row to answer with. «No rows» and «not redeemable»
-- would otherwise be indistinguishable to the handler, which fails closed on a missing read and
-- would turn every unknown id into the generic refusal instead of the honest one.
WITH grant_row AS (
    -- The terms are the grant's snapshot PLUS its live adjustments (services#118, migration 019):
    -- a gifted session or a later expiry is spendable here exactly as it is at the gated write.
    SELECT g.id, g.package_id, g.customer_id, g.granted_at,
           g.max_uses + COALESCE(adj.uses_delta, 0)      AS max_uses,
           g.validity_days + COALESCE(adj.days_delta, 0) AS validity_days
    FROM services_package_grant g
    LEFT JOIN (SELECT hub_id, grant_id, SUM(uses_delta) AS uses_delta, SUM(days_delta) AS days_delta
                 FROM services_package_grant_adjustment
                WHERE is_deleted = 0
                GROUP BY hub_id, grant_id) adj
           ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
    WHERE g.id = :grant_id AND g.hub_id = :hub_id AND g.is_deleted = 0
),
pkg AS (
    SELECT p.id
    FROM services_package p
    WHERE p.hub_id = :hub_id
      AND p.id = (SELECT package_id FROM grant_row)
      AND p.is_deleted = 0 AND p.is_active = 1
),
used AS (
    -- A hold whose deadline has passed does NOT count: an abandoned checkout gives the session
    -- back on its own (services#77, migration 014). Same predicate as `tender_options` and
    -- `balance` on purpose — this query has to answer what the command is about to decide, and
    -- `commands/hold_expire.sql` runs as the first statement of that command.
    SELECT COUNT(*) AS n
    FROM services_package_redemption
    WHERE hub_id = :hub_id AND grant_id = :grant_id AND is_deleted = 0
      AND (expires_at IS NULL OR erp_dt(:now) < erp_dt(expires_at))
),
checks AS (
    SELECT
        CASE WHEN (SELECT id FROM grant_row) IS NULL THEN 1 ELSE 0 END AS no_grant,
        CASE WHEN (SELECT id FROM grant_row) IS NOT NULL
                  AND (SELECT id FROM pkg) IS NULL
             THEN 1 ELSE 0 END AS not_found,
        CASE WHEN (SELECT max_uses FROM grant_row) IS NOT NULL
                  AND (SELECT n FROM used) >= (SELECT max_uses FROM grant_row)
             THEN 1 ELSE 0 END AS no_uses_left,
        CASE WHEN (SELECT validity_days FROM grant_row) IS NOT NULL
                  AND erp_dt(:now) > erp_dateadd((SELECT granted_at FROM grant_row),
                                                 (SELECT validity_days FROM grant_row), 'days')
             THEN 1 ELSE 0 END AS expired
)
SELECT
    :grant_id                                                        AS grant_id,
    CASE WHEN no_grant + not_found + no_uses_left + expired = 0 THEN 1 ELSE 0 END AS redeemable,
    CASE
        WHEN no_grant     = 1 THEN 'no_grant'
        WHEN not_found    = 1 THEN 'package_not_found'
        WHEN no_uses_left = 1 THEN 'no_uses_left'
        WHEN expired      = 1 THEN 'expired'
        ELSE ''
    END AS reason
FROM checks;
