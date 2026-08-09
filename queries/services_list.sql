-- Lista de servicios activos del hub con nombre de categoría. Portado de
-- ServiceCatalogService.list_services (orden por sort_order, name; búsqueda/filtro en UI/SDK).
--
-- `status` — el estado del servicio, con TRES valores y no dos. Un servicio se vende como una
-- línea de venta con su IVA: sin `tax_category_key` no se puede cobrar, y hasta ahora eso no se
-- veía en ninguna parte —el cobro se rechazaba con la clienta delante—. A los que se crearon antes
-- de que la categoría fuese obligatoria NO se les inventa una por migración (sería inventarse dato
-- fiscal): se quedan sin ella y se MARCAN aquí, con `status = 'unconfigured'`.
--
-- El orden de las ramas es a propósito: «sin configurar» gana a «activo». Un servicio activo que no
-- sabe cómo tributa está activo solo de nombre.
--
-- `inactive` es parte del vocabulario aunque esta query no lo devuelva hoy: el catálogo filtra
-- `is_active = 1` (más abajo) y ese filtro no se toca aquí porque `appointments` consume esta misma
-- query como selector de servicios reservables — soltarle los desactivados sería una regresión en
-- otra pantalla. El estado se calcula entero para que el día que services#4 traiga activar/
-- desactivar desde la UI no haya que redefinir el vocabulario.
--
-- Es una query de LISTA: el runtime envuelve este SELECT y compone búsqueda/filtro/orden/paginación
-- a partir del bloque `list` de module.json, así que `status` es filtrable y ordenable como
-- cualquier columna proyectada (`filters.status`, `op: eq`).
SELECT s.id, s.name, s.price, s.pricing_type, s.duration_minutes, s.is_bookable,
       s.category_id, s.tax_category_key, c.name AS category,
       CASE
         WHEN COALESCE(NULLIF(TRIM(s.tax_category_key), ''), '') = '' THEN 'unconfigured'
         WHEN s.is_active = 1 THEN 'active'
         ELSE 'inactive'
       END AS status
FROM services_service s
-- `c.hub_id = s.hub_id`: la FK apunta a un id GLOBAL, así que sin esto una categoría de
-- OTRO hub casa por id y su nombre privado sale en esta lista (services#7).
LEFT JOIN services_category c ON c.id = s.category_id AND c.hub_id = s.hub_id AND c.is_deleted = 0
WHERE s.hub_id = :hub_id AND s.is_deleted = 0 AND s.is_active = 1
