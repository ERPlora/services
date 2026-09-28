-- The pre-check of `services.packages.adjust_grant` (services#118): may this grant take more
-- sessions and/or days, and if not, WHY. The handler reads it (`required`) and turns `reason` and
-- the two flags into a domain code; the write (`commands/_adjust_grant.sql`) repeats the same
-- conditions inside the transaction, so this read is advisory.
--
-- `can_add_uses` / `can_extend` are per KIND on purpose: an unlimited voucher can still be
-- extended and one that never expires can still take a session, so a single «adjustable» flag
-- would refuse half of what the salon asked for. A grant soft-deleted without a void stamp does
-- not exist for this door: `grant_not_found`.
WITH grant_row AS (
    SELECT id, package_id, customer_id, is_deleted, voided_at, max_uses, validity_days
      FROM services_package_grant
     WHERE id = :grant_id AND hub_id = :hub_id
),
facts AS (
    SELECT
        (SELECT id FROM grant_row)                        AS gid,
        COALESCE((SELECT package_id FROM grant_row), '')  AS package_id,
        COALESCE((SELECT customer_id FROM grant_row), '') AS customer_id,
        (SELECT is_deleted FROM grant_row)                AS is_deleted,
        (SELECT voided_at FROM grant_row)                 AS voided_at,
        (SELECT max_uses FROM grant_row)                  AS max_uses,
        (SELECT validity_days FROM grant_row)             AS validity_days
)
SELECT
    :grant_id                                             AS grant_id,
    package_id,
    customer_id,
    CASE WHEN max_uses IS NOT NULL THEN 1 ELSE 0 END      AS can_add_uses,
    CASE WHEN validity_days IS NOT NULL THEN 1 ELSE 0 END AS can_extend,
    CASE
        WHEN gid IS NULL           THEN 'grant_not_found'
        WHEN voided_at IS NOT NULL THEN 'already_voided'
        WHEN is_deleted = 1        THEN 'grant_not_found'
        ELSE ''
    END                                                   AS reason
FROM facts;
