-- The vouchers this customer OWNS and can spend on THIS line, in the order they will be spent
-- (`services.packages.tender_options`, services#70 / ADR-0386, grant-aware since services#73).
-- Read-only: it decides nothing and writes nothing — it is what the till shows BEFORE anything is
-- held, and what the handler of `services.packages.hold_for_line` verifies the payload against (a
-- handler never takes the caller's word for whether a voucher is eligible).
--
-- 🔴 A ROW HERE IS A GRANT — a PURCHASE — and not a catalogue package. Until services#73 this
-- query read `services_package` directly, so it offered every voucher of the hub to every customer,
-- bought or not. Now it reads `services_package_grant`: no purchase, no row, and a customer who
-- never bought anything gets an empty answer rather than five free sessions.
--
-- A voucher is N uses of CONCRETE services, not a wallet, so it covers a LINE whole or not at all.
-- Hence the two params: `:customer_id` (whose grants) and `:service_id` (which line). The runtime
-- injects `:hub_id` and `:now`.
--
-- Every row carries the PREVIEW the ADR demands: which grant, of which voucher, how many sessions
-- are left now (`remaining_before`) and how many are left once this one is spent
-- (`remaining_after`), plus the expiry that may have decided the order. `candidate_count` is how
-- many valid grants there were, so the till can say «2 valid vouchers» instead of quietly picking
-- one — the single thing none of the twelve products surveyed does, and the one that turns an
-- auto-selection into a decision the operator knows they can review.
--
-- `max_uses` and `validity_days` come off the GRANT, never off the template: they are the terms the
-- customer was sold, and editing the catalogue afterwards must not shorten what somebody paid for.
-- The name is still read live, because a name is presentation and not a term.
--
-- ── THE TIE-BREAK ───────────────────────────────────────────────────────────────────────────────
--
-- Decided by the market, not by us (12 references; the full table is in the PR of services#70).
-- Only Mindbody publishes a TOTAL order, and its last key is a payment reference number — that is,
-- an id, exactly so that nothing is left to chance. This is that order, reduced to the keys this
-- model actually has:
--
--   1. `is_unlimited` ASC        — a FINITE voucher before an unlimited one. Vagaro's published
--      rule («the system will always deduct a package visit first if there is also a redeemable
--      membership visit»): spending an unlimited pass costs the customer nothing, spending a
--      finite session costs them something that can also EXPIRE. Spend first what can be lost.
--   2. `expires_at` ASC NULLS LAST — what expires soonest is spent first (Mindbody's level 5).
--      🔴 `NULLS LAST` is load-bearing: Postgres puts NULLs FIRST in ASC, so without it a voucher
--      that never expires would jump ahead of one expiring tomorrow — the exact opposite.
--   3. `first_redeemed_at` ASC NULLS LAST — finish the voucher already started. This is where we
--      deliberately DIVERGE from Mindbody, which sorts by activation date ABOVE expiry: its own
--      knowledge base documents what that produces — «the software often begins to cover visits
--      with the second pricing option before the first one is used up», leaving the customer with
--      two half-spent vouchers and the salon reassigning visits by hand.
--   4. `remaining_before` ASC    — fewest sessions left first, so a nearly-finished voucher does
--      not get stranded behind a fresh one and expire with sessions in it.
--   5. `granted_at` ASC          — the voucher bought FIRST. Since services#73 this is a real
--      purchase date rather than the moment somebody created the template, which is what the
--      market's FIFO actually means.
--   6. `grant_id` ASC            — stability, never randomness. Two grants identical down to the
--      timestamp must still come out in the SAME order on two consecutive looks at the same
--      screen; without a final key that is the physical row order, which a VACUUM can change.
--
-- Two keys of the market's rule have no data here and are NOT faked: shared/family ownership (a
-- grant belongs to one customer — see the PR of services#73 for why the market defaults to that)
-- and a business-set priority (`services_package` has no priority field; `sort_order` is a display
-- order and pressing it into service as a business rule would be inventing a semantic nobody
-- declared). Both are named in the PR as the seams to extend.
--
-- `default_reason` is the criterion that actually separated the winner from the runner-up, so the
-- till can say WHY this voucher and not the other one. Only the default carries it: on the rest it
-- is empty, because a reason on a voucher that was not chosen explains nothing.
WITH candidate AS (
    SELECT
        g.id            AS grant_id,
        g.package_id    AS package_id,
        p.name          AS package_name,
        g.max_uses      AS max_uses,
        g.validity_days AS validity_days,
        g.granted_at    AS granted_at,
        (SELECT COUNT(*) FROM services_package_redemption r
          WHERE r.hub_id = :hub_id AND r.grant_id = g.id AND r.is_deleted = 0)   AS used,
        (SELECT MIN(r.redeemed_at) FROM services_package_redemption r
          WHERE r.hub_id = :hub_id AND r.grant_id = g.id AND r.is_deleted = 0)   AS first_redeemed_at
    FROM services_package_grant g
    JOIN services_package p ON p.id = g.package_id AND p.hub_id = g.hub_id
    WHERE g.hub_id = :hub_id AND g.is_deleted = 0 AND g.customer_id = :customer_id
      AND p.is_deleted = 0 AND p.is_active = 1
      AND EXISTS (
        SELECT 1 FROM services_packageitem i
         WHERE i.hub_id = :hub_id AND i.package_id = g.package_id
           AND i.service_id = :service_id AND i.is_deleted = 0
      )
),
priced AS (
    SELECT
        c.*,
        CASE WHEN c.max_uses IS NULL THEN 1 ELSE 0 END                  AS is_unlimited,
        CASE WHEN c.max_uses IS NULL THEN NULL
             ELSE c.max_uses - c.used END                               AS remaining_before,
        CASE WHEN c.validity_days IS NULL THEN NULL
             ELSE erp_dateadd(c.granted_at, c.validity_days, 'days') END AS expires_at
    FROM candidate c
),
eligible AS (
    SELECT * FROM priced
     WHERE (max_uses IS NULL OR remaining_before > 0)
       AND (expires_at IS NULL OR erp_dt(:now) <= expires_at)
),
ranked AS (
    SELECT
        e.*,
        ROW_NUMBER() OVER w                        AS rank_position,
        COUNT(*) OVER ()                           AS candidate_count,
        LEAD(e.grant_id)          OVER w           AS next_grant_id,
        LEAD(e.is_unlimited)      OVER w           AS next_is_unlimited,
        LEAD(e.expires_at)        OVER w           AS next_expires_at,
        LEAD(e.first_redeemed_at) OVER w           AS next_first_redeemed_at,
        LEAD(e.remaining_before)  OVER w           AS next_remaining_before,
        LEAD(e.granted_at)        OVER w           AS next_granted_at
    FROM eligible e
    WINDOW w AS (ORDER BY e.is_unlimited ASC,
                          e.expires_at ASC NULLS LAST,
                          e.first_redeemed_at ASC NULLS LAST,
                          e.remaining_before ASC,
                          e.granted_at ASC,
                          e.grant_id ASC)
)
SELECT
    grant_id,
    package_id,
    package_name,
    :customer_id                                    AS customer_id,
    :service_id                                     AS service_id,
    max_uses,
    used,
    remaining_before,
    CASE WHEN remaining_before IS NULL THEN NULL
         ELSE remaining_before - 1 END              AS remaining_after,
    is_unlimited,
    validity_days,
    granted_at,
    first_redeemed_at,
    expires_at,
    candidate_count,
    CASE WHEN rank_position = 1 THEN 1 ELSE 0 END   AS is_default,
    CASE
        WHEN rank_position <> 1                                              THEN ''
        WHEN next_grant_id IS NULL                                           THEN 'only_option'
        WHEN is_unlimited       IS DISTINCT FROM next_is_unlimited           THEN 'finite_before_unlimited'
        WHEN expires_at         IS DISTINCT FROM next_expires_at             THEN 'expires_first'
        WHEN first_redeemed_at  IS DISTINCT FROM next_first_redeemed_at      THEN 'already_started'
        WHEN remaining_before   IS DISTINCT FROM next_remaining_before       THEN 'fewest_sessions_left'
        WHEN granted_at         IS DISTINCT FROM next_granted_at             THEN 'oldest_voucher'
        ELSE 'stable_order'
    END                                             AS default_reason
FROM ranked
ORDER BY rank_position;
