-- Soft-delete cascade: marks every live line of the package (services_packageitem) as deleted.
-- Runs in the SAME transaction as package_delete.sql (the runtime executes all statements of the
-- command's `sql[]` atomically). Soft-delete, not DELETE: keeps the FKs of the sales/voucher
-- history. Scoped by hub_id: another tenant's package with the same id is out of reach.
UPDATE services_packageitem
SET is_deleted = 1, deleted_at = :now,
    updated_by = :current_user_id, updated_at = :now
WHERE package_id = :package_id AND hub_id = :hub_id AND is_deleted = 0;
