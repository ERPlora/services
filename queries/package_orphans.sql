-- The vouchers whose owner is gone (`services.packages.orphans`, services#81).
--
-- 🔴 THIS IS THE ONLY DOOR IN THE MODULE THAT DOES NOT START FROM A CUSTOMER, and that is the whole
-- reason it exists. `services.packages.balance` — and every screen that leads to a voucher — takes
-- `:customer_id`, so the instant `customers` removes a sheet the money that customer had paid for
-- becomes unreachable: still in the table, still owed, but with no question anyone can ask that
-- returns it. Lightspeed X-Series solved the same shape the same way: «deleted customers also
-- appear on the store credit report». The report IS the rescue.
--
-- It is the READ half of services#81; the WRITE half is `commands/grant_orphan_stamp.sql`, which
-- stamps `customer_deleted_at` when `customer.deleted` or `customer.anonymized` arrives. The
-- predicate here — `is_deleted = 0 AND customer_deleted_at IS NOT NULL` — is exactly the partial
-- index of migration 015, so this is an index scan over the handful of orphans rather than a sweep
-- over every voucher the salon has ever sold.
--
-- 🔴 IT LISTS SPENT AND EXPIRED ONES TOO. Filtering to «still has value» here was the tempting
-- version and it is wrong: a voucher with one session left that expires next Tuesday would VANISH
-- from the rescue list on Tuesday, on its own, without anyone deciding anything — the same
-- invisibility this issue is about, one level further down. Nobody could then answer «what did we
-- do with that customer's money?», which is the question an auditor and an angry ex-customer both
-- ask. So the list carries the whole set and SAYS what each row is worth: `has_value` and
-- `is_expired` are projected columns, filterable from the `list` block, and it is the OPERATOR who
-- narrows it (`f_has_value = 1` for «what do we still owe?»), not the query deciding for them.
--
-- WHAT TRAVELS WITH EACH ROW is what somebody needs in order to act without being able to open the
-- customer sheet: the package name, the sessions left (`remaining`) and whether any are left at all
-- (`has_value`), the amount that was charged (`amount_cents` — the refund conversation), when it
-- was bought and when it dies, and `customer_deleted_at`, which is the default sort so the ones
-- that just happened are on top.
--
-- `customer_id` is projected even though it no longer resolves. It is the OPAQUE id that is already
-- in the row — no name, no e-mail, no phone: this module never had those and must not start now,
-- least of all on a row that exists because of a GDPR erasure. It is projected because it is the
-- only handle a support conversation can match against a sale, and because services#79 (transfer a
-- grant to another sheet) needs to name the source.
--
-- `used`, `remaining`, `expires_at` and `is_expired` are computed exactly as in
-- `queries/package_balance.sql`, deliberately duplicated rather than shared: a held session that is
-- past its deadline does not count (services#77, migration 014), `max_uses` and `validity_days` are
-- the GRANT's snapshot and never the template's, and the `erp_dt` / `erp_dateadd` bridges (ADR-0007)
-- keep the date arithmetic portable. The scalar sub-queries are repeated instead of factored into a
-- CTE or a LATERAL for the same reason `package_balance.sql` repeats them three times: it is the
-- shape this module has already proven.
--
-- 🔴 The prose is at the TOP here, against the migration house rule (hub#1137/ADR-0387), because a
-- LIST query is not split by statement: the runtime wraps this whole file INLINE as
-- `FROM ( <base> ) AS sub …` on ONE line (`crates/runtime/src/queries.rs`), so a trailing `--`
-- comment would swallow the closing parenthesis and everything after it. Every query in this module
-- is written this way. For the same reason there is no `ORDER BY` and no `LIMIT`: search, filter,
-- sort and pagination are composed by the runtime from the `list` block of module.json.
SELECT
  g.id                                                   AS grant_id,
  g.package_id                                           AS package_id,
  p.name                                                 AS package_name,
  g.customer_id                                          AS customer_id,
  g.customer_deleted_at                                  AS customer_deleted_at,
  g.granted_at                                           AS granted_at,
  g.source                                               AS source,
  g.sale_id                                              AS sale_id,
  g.amount_cents                                         AS amount_cents,
  g.max_uses                                             AS max_uses,
  (SELECT COUNT(*) FROM services_package_redemption r
    WHERE r.hub_id = g.hub_id AND r.grant_id = g.id AND r.is_deleted = 0
      AND (r.expires_at IS NULL OR erp_dt(:now) < erp_dt(r.expires_at))) AS used,
  CASE WHEN g.max_uses IS NULL THEN NULL
       ELSE g.max_uses - (SELECT COUNT(*) FROM services_package_redemption r
                           WHERE r.hub_id = g.hub_id AND r.grant_id = g.id
                             AND r.is_deleted = 0
                             AND (r.expires_at IS NULL
                                  OR erp_dt(:now) < erp_dt(r.expires_at))) END   AS remaining,
  CASE WHEN g.max_uses IS NULL
            OR g.max_uses > (SELECT COUNT(*) FROM services_package_redemption r
                              WHERE r.hub_id = g.hub_id AND r.grant_id = g.id
                                AND r.is_deleted = 0
                                AND (r.expires_at IS NULL
                                     OR erp_dt(:now) < erp_dt(r.expires_at)))
       THEN 1 ELSE 0 END                                 AS has_value,
  g.validity_days                                        AS validity_days,
  CASE WHEN g.validity_days IS NULL THEN NULL
       ELSE erp_dateadd(g.granted_at, g.validity_days, 'days') END        AS expires_at,
  CASE WHEN g.validity_days IS NOT NULL
            AND erp_dt(:now) > erp_dateadd(g.granted_at, g.validity_days, 'days')
       THEN 1 ELSE 0 END                                 AS is_expired
FROM services_package_grant g
JOIN services_package p ON p.id = g.package_id AND p.hub_id = g.hub_id
WHERE g.hub_id = :hub_id
  AND g.is_deleted = 0
  AND g.customer_deleted_at IS NOT NULL
