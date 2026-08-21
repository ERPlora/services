-- Inserción de un servicio usada por el handler WASM batch (bulk_create_services).
-- El handler aporta :service_id (de new_ids), nombre, slug, precio, etc.
-- Runtime inyecta :hub_id, :current_user_id, :now.
--
-- `tax_category_key` NO es una columna más (services#41): un servicio se vende como línea de venta
-- con su IVA, y `services.services.create` la exige desde services#33. Esta sentencia se la dejaba
-- fuera, así que TODO servicio creado por lote nacía con la categoría a NULL y el mostrador
-- rechazaba la venta. El valor viene del ítem del lote —el handler lo exige y el schema antes que
-- él—: aquí no hay COALESCE a un default porque inventarse la categoría es inventarse dato fiscal.
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
INSERT INTO services_service
  (id, hub_id, name, slug, description, short_description, category_id,
   pricing_type, price, cost, duration_minutes, buffer_before, buffer_after,
   max_capacity, is_bookable, requires_confirmation, allow_online_booking,
   sort_order, is_active, is_featured, sku, barcode, notes, tax_category_key,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:service_id, :hub_id, :name, :slug, :description, :short_description, :category_id,
   :pricing_type, CAST(:price AS BIGINT), CAST(:cost AS BIGINT),
   CAST(:duration_minutes AS BIGINT), CAST(:buffer_before AS BIGINT), CAST(:buffer_after AS BIGINT),
   CAST(:max_capacity AS BIGINT), CAST(:is_bookable AS BIGINT),
   CAST(:requires_confirmation AS BIGINT), CAST(:allow_online_booking AS BIGINT),
   CAST(:sort_order AS BIGINT), 1, CAST(:is_featured AS BIGINT),
   :sku, :barcode, :notes, :tax_category_key,
   0, :current_user_id, :current_user_id, :now, :now);
