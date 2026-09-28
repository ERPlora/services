-- The pre-check of `services.packages.void_grant` (services#82): may this grant be voided, and if
-- not, WHY. The handler reads it (`required`) and turns `reason` into a domain code; the void
-- statement (`commands/_void_grant.sql`) repeats the same conditions inside the transaction, so
-- this read is advisory and a race cannot void a grant somebody is spending.
--
-- `in_use` counts the sessions the voucher still owes as spent — consumed or held at a till, the
-- same live set `balance` counts. A voucher that was already started is not «sold by mistake»: the
-- customer used it, and correcting it is the balance adjustment (services#119), not a void.
-- A grant soft-deleted without a void stamp does not exist for this door: `grant_not_found`.
WITH grant_row AS (
    SELECT id, package_id, customer_id, is_deleted, voided_at
      FROM services_package_grant
     WHERE id = :grant_id AND hub_id = :hub_id
),
used AS (
    SELECT COUNT(*) AS n
      FROM services_package_redemption r
     WHERE r.hub_id = :hub_id AND r.grant_id = :grant_id AND r.is_deleted = 0
       AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))
),
facts AS (
    SELECT
        (SELECT id FROM grant_row)                        AS gid,
        COALESCE((SELECT package_id FROM grant_row), '')  AS package_id,
        COALESCE((SELECT customer_id FROM grant_row), '') AS customer_id,
        (SELECT is_deleted FROM grant_row)                AS is_deleted,
        (SELECT voided_at FROM grant_row)                 AS voided_at,
        (SELECT n FROM used)                              AS used
)
SELECT
    :grant_id                                             AS grant_id,
    package_id,
    customer_id,
    used,
    CASE WHEN gid IS NOT NULL AND voided_at IS NULL AND is_deleted = 0 AND used = 0
         THEN 1 ELSE 0 END                                AS voidable,
    CASE
        WHEN gid IS NULL          THEN 'grant_not_found'
        WHEN voided_at IS NOT NULL THEN 'already_voided'
        WHEN is_deleted = 1       THEN 'grant_not_found'
        WHEN used > 0             THEN 'in_use'
        ELSE ''
    END                                                   AS reason
FROM facts;
