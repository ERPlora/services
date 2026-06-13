-- Cascada de soft-delete: marca como borradas todas las líneas vivas del paquete
-- (services_packageitem). Corre en la MISMA transacción que package_delete.sql
-- (el runtime ejecuta todas las sentencias del array `sql` del command atómicamente).
-- Soft-delete, no DELETE: preserva las FK del histórico de ventas/bonos.
UPDATE services_packageitem
SET is_deleted = 1, deleted_at = :now,
    updated_by = :current_user_id, updated_at = :now
WHERE package_id = :package_id AND hub_id = :hub_id AND is_deleted = 0;
