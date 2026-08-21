-- Creates a service. The runtime injects :new_id, :hub_id, :current_user_id, :now.
-- Ported from ServiceCatalogService.create_service. The slug is derived here when the caller
-- does not bring one.
--
-- EVERY INTEGER BIND IS CAST TO BIGINT ON PURPOSE (services#50). It is not decoration: without it
-- this statement could not save the payload its own screen sends, and failed with
-- `incorrect binary data format in bind parameter 12`. The runtime always puts a JSON integer on
-- the wire as `i64`, i.e. `int8` (`build_query!`, crates/db/src/lib.rs) — but a parameter the
-- payload OMITS is bound as `DynNull`, whose Parse OID is 0: "server, infer this one". With
-- `COALESCE(:cost, 0)` the server infers from the `int4` literal, so the SAME statement text ends
-- up with a different parameter shape depending on who calls it, and sqlx's prepared-statement
-- cache — keyed by the SQL text alone, never re-Parsed — freezes whichever shape arrived first on
-- that pooled connection. A minimal payload first meant `int4`, and the next caller that did send
-- a cost pushed 8 bytes into a 4-byte slot. Hence the lottery: same call, different connection,
-- different answer. The CAST pins the type in the statement, so what Postgres infers is what the
-- runtime sends, whoever calls first. Same idiom as customers/commands/record_purchase.sql.
-- (int8 → the INTEGER columns of the migration is a plain assignment cast; the CHECKs still apply.)
--
-- The binder does NOT apply the JSON Schema defaults (systemic gap, see decision-log / P2
-- watchlist), so omitted fields arrive as NULL → NOT NULL constraint. They are wrapped in COALESCE
-- so that a minimal insert ({name, price, duration_minutes, tax_category_key}) works, mirroring the
-- DEFAULTs of the migration.
--
-- The category, when it comes, has to belong to THIS hub (services#7). The FK points at a GLOBAL
-- id, so without that check a `category_id` from another hub was stored as-is and its private name
-- later showed up in the list. `category_id` is OPTIONAL: empty/NULL is legitimate (a service with
-- no category), which is why the condition has its two branches.
--
-- If the category belongs to someone else the statement touches no row. That is NOT a silent
-- success: the command declares `expect_rows: {op: min, n: 1}`, so the runtime rolls the whole
-- transaction back — no row, no event — and answers `services.category_unavailable` (hub#139).
--
-- The service DEFAULTS come from the hub's SETTINGS, not from numbers nailed down here
-- (services#13). With `default_duration = 90` saved, a minimal service was still created with 60:
-- the settings screen configured something nobody read, and every service had to be fixed by hand.
--
-- The chain has three rungs on purpose: what the caller sent → what the hub configured → the
-- module's default. The last one stays because the settings row is a singleton that may not exist
-- (a hub installed without a blueprint has none); that is why the JOIN is LEFT and not INNER —with
-- INNER that hub could not create services— and why there is a final value: a NULL against a NOT
-- NULL column is a write that blows up, not a default.
INSERT INTO services_service
  (id, hub_id, name, slug, description, short_description, category_id,
   pricing_type, price, min_price, max_price, cost, duration_minutes, buffer_before, buffer_after,
   max_capacity, is_bookable, requires_confirmation, allow_online_booking,
   sort_order, is_active, is_featured, sku, barcode, notes, tax_category_key,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
   :new_id, :hub_id, :name,
   COALESCE(NULLIF(:slug, ''), 'svc-' || :new_id),
   COALESCE(:description, ''), COALESCE(:short_description, ''), :category_id,
   COALESCE(NULLIF(:pricing_type, ''), 'fixed'),
   COALESCE(CAST(:price AS BIGINT), 0),
   CAST(:min_price AS BIGINT), CAST(:max_price AS BIGINT),
   COALESCE(CAST(:cost AS BIGINT), 0),
   COALESCE(CAST(:duration_minutes AS BIGINT), st.default_duration, 60),
   COALESCE(CAST(:buffer_before AS BIGINT), st.default_buffer_time, 0),
   COALESCE(CAST(:buffer_after AS BIGINT), st.default_buffer_time, 0),
   COALESCE(CAST(:max_capacity AS BIGINT), 1),
   COALESCE(CAST(:is_bookable AS BIGINT), 1),
   COALESCE(CAST(:requires_confirmation AS BIGINT), 0),
   COALESCE(CAST(:allow_online_booking AS BIGINT), st.allow_online_booking, 1),
   COALESCE(CAST(:sort_order AS BIGINT), 0), 1, COALESCE(CAST(:is_featured AS BIGINT), 0),
   COALESCE(:sku, ''), COALESCE(:barcode, ''), COALESCE(:notes, ''), :tax_category_key,
   0, :current_user_id, :current_user_id, :now, :now
FROM (SELECT 1) AS one
LEFT JOIN services_settings st ON st.hub_id = :hub_id AND st.is_deleted = 0
WHERE COALESCE(NULLIF(:category_id, ''), '') = ''
   OR EXISTS (
        SELECT 1 FROM services_category c
        WHERE c.id = :category_id AND c.hub_id = :hub_id AND c.is_deleted = 0
      );
