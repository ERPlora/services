-- One category by id (scoped by hub_id). Also the `patch` read of services.categories.update
-- (hub#632): it selects every key that update requires, so a partial payload can be completed.
SELECT id, name, slug, description, parent_id, icon, color, sort_order, is_active
FROM services_category
WHERE id = :category_id AND hub_id = :hub_id AND is_deleted = 0;
