-- Create a service category. The runtime injects :new_id, :hub_id, :current_user_id, :now.
-- Ported from CategoryService.create_category. Payload validated by schemas/category_create.json
-- (services#9); optional fields resolve here, mirroring the column DEFAULTs, and the slug derives
-- from the id when the caller does not send one.
--
-- The parent, if any, must be a LIVE category of THIS hub (the FK points at a GLOBAL id, so
-- without this check a `parent_id` of another hub was stored as-is). `parent_id` is OPTIONAL:
-- empty/NULL is a root category — hence the two branches. If the parent is unavailable the
-- statement affects no row and `expect_rows` rejects the command with
-- `services.parent_category_unavailable` (rollback, no row).
INSERT INTO services_category
  (id, hub_id, name, slug, description, parent_id, icon, color, sort_order, is_active,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
  :new_id, :hub_id, :name,
  COALESCE(NULLIF(:slug, ''), 'cat-' || :new_id),
  COALESCE(:description, ''), NULLIF(:parent_id, ''), COALESCE(:icon, ''), COALESCE(:color, ''),
  COALESCE(:sort_order, 0), 1,
  0, :current_user_id, :current_user_id, :now, :now
WHERE COALESCE(NULLIF(:parent_id, ''), '') = ''
   OR EXISTS (
        SELECT 1 FROM services_category p
        WHERE p.id = :parent_id AND p.hub_id = :hub_id AND p.is_deleted = 0
      );
