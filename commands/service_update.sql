-- Edición de servicio (la UI envía el conjunto de campos editables, Tier 0/1).
-- Portado de ServiceCatalogService.update_service. NOTA: el aviso por citas activas
-- (appointments) que comprueba el legacy es lógica cross-módulo → ver WASM-TODO.md.
-- La categoría, si viene, tiene que ser de ESTE hub (services#7). La FK apunta a un id GLOBAL, así
-- que sin esta comprobación un `category_id` de otro hub se guardaba tal cual y su nombre privado
-- salía luego en la lista. `category_id` es OPCIONAL: vacío/NULL es legítimo (servicio sin
-- categoría), y por eso la condición tiene sus dos ramas.
--
-- Si la categoría es ajena, la sentencia no afecta ninguna fila. Eso NO es un éxito silencioso: el
-- command declara `expect_rows: {op: min, n: 1}`, así que el runtime revierte la transacción entera
-- —ni fila ni evento— y devuelve `services.category_unavailable` (hub#139).
UPDATE services_service SET
  name             = :name,
  slug             = :slug,
  description      = :description,
  category_id      = :category_id,
  pricing_type     = :pricing_type,
  price            = :price,
  cost             = :cost,
  duration_minutes = :duration_minutes,
  is_bookable      = :is_bookable,
  is_active        = :is_active,
  sort_order       = :sort_order,
  tax_category_key      = :tax_category_key,
  updated_by       = :current_user_id,
  updated_at       = :now
WHERE id = :service_id AND hub_id = :hub_id AND is_deleted = 0
  AND (COALESCE(NULLIF(:category_id, ''), '') = ''
       OR EXISTS (
            SELECT 1 FROM services_category c
            WHERE c.id = :category_id AND c.hub_id = :hub_id AND c.is_deleted = 0
          ));
