-- Inserción de un servicio usada por el handler WASM batch (bulk_create_services).
-- El handler aporta :service_id (de new_ids), nombre, slug, precio, etc.
-- Runtime inyecta :hub_id, :current_user_id, :now.
--
-- `tax_category_key` NO es una columna más (services#41): un servicio se vende como línea de venta
-- con su IVA, y `services.services.create` la exige desde services#33. Esta sentencia se la dejaba
-- fuera, así que TODO servicio creado por lote nacía con la categoría a NULL y el mostrador
-- rechazaba la venta. El valor viene del ítem del lote —el handler lo exige y el schema antes que
-- él—: aquí no hay COALESCE a un default porque inventarse la categoría es inventarse dato fiscal.
INSERT INTO services_service
  (id, hub_id, name, slug, description, short_description, category_id,
   pricing_type, price, cost, duration_minutes, buffer_before, buffer_after,
   max_capacity, is_bookable, requires_confirmation, allow_online_booking,
   sort_order, is_active, is_featured, sku, barcode, notes, tax_category_key,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:service_id, :hub_id, :name, :slug, :description, :short_description, :category_id,
   :pricing_type, :price, :cost, :duration_minutes, :buffer_before, :buffer_after,
   :max_capacity, :is_bookable, :requires_confirmation, :allow_online_booking,
   :sort_order, 1, :is_featured, :sku, :barcode, :notes, :tax_category_key,
   0, :current_user_id, :current_user_id, :now, :now);
