-- Alta de servicio. Runtime inyecta :new_id, :hub_id, :current_user_id, :now.
-- Portado de ServiceCatalogService.create_service. El slug lo calcula el SDK/handler.
-- GUARDARRAÍL QA (2026-06-25): el binder del runtime no aplica los defaults del JSON Schema
-- (gap sistémico, ver decision-log / P2 watchlist). Como esta command NO declara `schema`,
-- los campos omitidos llegan como NULL → NOT NULL constraint. Se envuelven en COALESCE para
-- que un alta mínima ({name, price, duration_minutes, tax_category_key}) funcione, espejando los
-- DEFAULT de la migración. El slug se deriva del id (:new_id) cuando el caller no lo aporta.
-- La categoría, si viene, tiene que ser de ESTE hub (services#7). La FK apunta a un id GLOBAL, así
-- que sin esta comprobación un `category_id` de otro hub se guardaba tal cual y su nombre privado
-- salía luego en la lista. `category_id` es OPCIONAL: vacío/NULL es legítimo (servicio sin
-- categoría), y por eso la condición tiene sus dos ramas.
--
-- Si la categoría es ajena, la sentencia no afecta ninguna fila. Eso NO es un éxito silencioso: el
-- command declara `expect_rows: {op: min, n: 1}`, así que el runtime revierte la transacción entera
-- —ni fila ni evento— y devuelve `services.category_unavailable` (hub#139).
-- Los DEFAULTS del servicio salen de los AJUSTES del hub, no de números clavados aquí
-- (services#13). Con `default_duration = 90` guardado, un servicio mínimo se creaba igualmente con
-- 60: la pantalla de ajustes configuraba algo que no leía nadie, y había que corregir cada servicio
-- a mano.
--
-- La cadena tiene tres escalones a propósito: lo que mandó el llamante → lo que configuró el hub →
-- el default del módulo. El último se queda porque la fila de ajustes es un singleton que puede no
-- existir (un hub instalado sin blueprint no la tiene); por eso el JOIN es LEFT y no INNER —con
-- INNER, ese hub no podría crear servicios— y por eso hay un valor final: un NULL contra una
-- columna NOT NULL es una escritura que revienta, no un default.
INSERT INTO services_service
  (id, hub_id, name, slug, description, short_description, category_id,
   pricing_type, price, cost, duration_minutes, buffer_before, buffer_after,
   max_capacity, is_bookable, requires_confirmation, allow_online_booking,
   sort_order, is_active, is_featured, sku, barcode, notes, tax_category_key,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
   :new_id, :hub_id, :name,
   COALESCE(NULLIF(:slug, ''), 'svc-' || :new_id),
   COALESCE(:description, ''), COALESCE(:short_description, ''), :category_id,
   COALESCE(NULLIF(:pricing_type, ''), 'fixed'), COALESCE(:price, 0), COALESCE(:cost, 0),
   COALESCE(:duration_minutes, st.default_duration, 60),
   COALESCE(:buffer_before, st.default_buffer_time, 0),
   COALESCE(:buffer_after, st.default_buffer_time, 0),
   COALESCE(:max_capacity, 1), COALESCE(:is_bookable, 1), COALESCE(:requires_confirmation, 0),
   COALESCE(:allow_online_booking, st.allow_online_booking, 1),
   COALESCE(:sort_order, 0), 1, COALESCE(:is_featured, 0),
   COALESCE(:sku, ''), COALESCE(:barcode, ''), COALESCE(:notes, ''), :tax_category_key,
   0, :current_user_id, :current_user_id, :now, :now
FROM (SELECT 1) AS one
LEFT JOIN services_settings st ON st.hub_id = :hub_id AND st.is_deleted = 0
WHERE COALESCE(NULLIF(:category_id, ''), '') = ''
   OR EXISTS (
        SELECT 1 FROM services_category c
        WHERE c.id = :category_id AND c.hub_id = :hub_id AND c.is_deleted = 0
      );
