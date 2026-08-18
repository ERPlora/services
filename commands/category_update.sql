-- Update a service category. Ported from CategoryService.update_category. Full snapshot
-- (schemas/category_update.json); partial for callers through `records.category.patch`.
--
-- The parent, if any, must be a LIVE category of THIS hub and not the category itself; otherwise
-- no row is affected and `expect_rows` rejects with `services.category_update_rejected`. A cycle
-- deeper than one level (A→B→A) is not checked here (services#9 follow-up).
UPDATE services_category SET
  name        = :name,
  slug        = :slug,
  description = COALESCE(:description, ''),
  parent_id   = NULLIF(:parent_id, ''),
  icon        = COALESCE(:icon, ''),
  color       = COALESCE(:color, ''),
  sort_order  = :sort_order,
  is_active   = :is_active,
  updated_by  = :current_user_id,
  updated_at  = :now
WHERE id = :category_id AND hub_id = :hub_id AND is_deleted = 0
  AND (COALESCE(NULLIF(:parent_id, ''), '') = ''
       OR (:parent_id <> :category_id AND EXISTS (
            SELECT 1 FROM services_category p
            WHERE p.id = :parent_id AND p.hub_id = :hub_id AND p.is_deleted = 0
          )));
