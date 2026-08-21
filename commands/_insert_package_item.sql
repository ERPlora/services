-- Inserción de una línea de paquete (paquete ↔ servicio) usada por el handler WASM
-- create_package, una op por línea. El handler aporta :item_id (de new_ids),
-- :package_id, :service_id, :quantity, :sort_order. Runtime inyecta :hub_id,
-- :current_user_id, :now. Portado del bucle items[] de PackageService.create_package.
-- El paquete Y el servicio tienen que ser de ESTE hub (services#7). Antes insertaba el
-- `:service_id` que llegara: una línea del hub A podía apuntar a un servicio del hub B, y
-- `package_items_list` devolvía su nombre y su precio.
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
INSERT INTO services_packageitem
  (id, hub_id, package_id, service_id, quantity, sort_order,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
   :item_id, :hub_id, p.id, sv.id, :quantity, CAST(:sort_order AS BIGINT),
   0, :current_user_id, :current_user_id, :now, :now
FROM services_package p
JOIN services_service sv ON sv.hub_id = p.hub_id AND sv.id = :service_id AND sv.is_deleted = 0
WHERE p.id = :package_id AND p.hub_id = :hub_id AND p.is_deleted = 0;
