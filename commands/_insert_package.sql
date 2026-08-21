-- Inserción de la cabecera de un paquete usada por el handler WASM create_package.
-- El handler aporta :package_id (de new_ids) + slug. Runtime inyecta :hub_id,
-- :current_user_id, :now. Las líneas se insertan con services._insert_package_item.
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
INSERT INTO services_package
  (id, hub_id, name, slug, description, discount_type, discount_percent_bp, discount_amount_cents,
   fixed_price, validity_days, max_uses, sort_order, is_active, is_featured,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:package_id, :hub_id, :name, :slug, :description, :discount_type,
   CAST(:discount_percent_bp AS BIGINT), CAST(:discount_amount_cents AS BIGINT), CAST(:fixed_price AS BIGINT),
   CAST(:validity_days AS BIGINT), CAST(:max_uses AS BIGINT), CAST(:sort_order AS BIGINT),
   CAST(:is_active AS BIGINT), CAST(:is_featured AS BIGINT),
   0, :current_user_id, :current_user_id, :now, :now);
