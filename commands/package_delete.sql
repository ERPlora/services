-- Soft-delete of a package (keeps the FK for the sales/voucher history).
-- Ported from PackageService.delete_package. The soft-delete cascade to the lines
-- (services_packageitem) is package_delete_items.sql, declared right after this one in the
-- command's `sql[]` (services#3) — the runtime runs the whole array in ONE transaction.
UPDATE services_package
SET is_active = 0, is_deleted = 1, deleted_at = :now,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :package_id AND hub_id = :hub_id;
