-- Alta de servicio. Runtime inyecta :new_id, :hub_id, :current_user_id, :now.
-- Portado de ServiceCatalogService.create_service. El slug lo calcula el SDK/handler.
-- GUARDARRAÍL QA (2026-06-25): el binder del runtime no aplica los defaults del JSON Schema
-- (gap sistémico, ver decision-log / P2 watchlist). Como esta command NO declara `schema`,
-- los campos omitidos llegan como NULL → NOT NULL constraint. Se envuelven en COALESCE para
-- que un alta mínima ({name, price, duration_minutes, tax_rate_id}) funcione, espejando los
-- DEFAULT de la migración. El slug se deriva del id (:new_id) cuando el caller no lo aporta.
INSERT INTO services_service
  (id, hub_id, name, slug, description, short_description, category_id,
   pricing_type, price, cost, duration_minutes, buffer_before, buffer_after,
   max_capacity, is_bookable, requires_confirmation, allow_online_booking,
   sort_order, is_active, is_featured, sku, barcode, notes, tax_rate_id,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :name,
   COALESCE(NULLIF(:slug, ''), 'svc-' || :new_id),
   COALESCE(:description, ''), COALESCE(:short_description, ''), :category_id,
   COALESCE(NULLIF(:pricing_type, ''), 'fixed'), COALESCE(:price, 0), COALESCE(:cost, 0),
   COALESCE(:duration_minutes, 60), COALESCE(:buffer_before, 0), COALESCE(:buffer_after, 0),
   COALESCE(:max_capacity, 1), COALESCE(:is_bookable, 1), COALESCE(:requires_confirmation, 0),
   COALESCE(:allow_online_booking, 1),
   COALESCE(:sort_order, 0), 1, COALESCE(:is_featured, 0),
   COALESCE(:sku, ''), COALESCE(:barcode, ''), COALESCE(:notes, ''), :tax_rate_id,
   0, :current_user_id, :current_user_id, :now, :now);
