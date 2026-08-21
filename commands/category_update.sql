-- Update a service category. Ported from CategoryService.update_category. Full snapshot
-- (schemas/category_update.json); partial for callers through `records.category.patch`.
--
-- The parent, if any, must be a LIVE category of THIS hub and not the category itself; otherwise
-- no row is affected and `expect_rows` rejects with `services.category_update_rejected`. A cycle
-- deeper than one level (A→B→A) is not checked here (services#9 follow-up).
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
UPDATE services_category SET
  name        = :name,
  slug        = :slug,
  description = COALESCE(:description, ''),
  parent_id   = NULLIF(:parent_id, ''),
  icon        = COALESCE(:icon, ''),
  color       = COALESCE(:color, ''),
  sort_order  = CAST(:sort_order AS BIGINT),
  is_active   = CAST(:is_active AS BIGINT),
  updated_by  = :current_user_id,
  updated_at  = :now
WHERE id = :category_id AND hub_id = :hub_id AND is_deleted = 0
  AND (COALESCE(NULLIF(:parent_id, ''), '') = ''
       OR (:parent_id <> :category_id AND EXISTS (
            SELECT 1 FROM services_category p
            WHERE p.id = :parent_id AND p.hub_id = :hub_id AND p.is_deleted = 0
          )));
