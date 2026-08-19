-- Lista de servicios del hub con nombre de categoría. Portado de ServiceCatalogService.list_services
-- (orden por sort_order, name; búsqueda/filtro en UI/SDK).
--
-- `status` — el estado del servicio, con TRES valores y no dos. Un servicio se vende como una
-- línea de venta con su IVA: sin `tax_category_key` no se puede cobrar, y hasta ahora eso no se
-- veía en ninguna parte —el cobro se rechazaba con la clienta delante—. A los que se crearon antes
-- de que la categoría fuese obligatoria NO se les inventa una por migración (sería inventarse dato
-- fiscal): se quedan sin ella y se MARCAN aquí, con `status = 'unconfigured'`.
--
-- El orden de las ramas es a propósito, y tiene dos escalones. Primero, «archivado» gana a todo: un
-- servicio archivado sin categoría fiscal es archivado, no «sin configurar» — si «sin configurar»
-- ganase, el filtro de archivados no lo encontraría y volvería a ser irrecuperable, que es justo el
-- agujero de services#44. Después, «sin configurar» gana a «activo»: un servicio activo que no sabe
-- cómo tributa está activo solo de nombre.
--
-- `:include_archived` — el ALCANCE, no un filtro (services#44). Por defecto esta query contesta
-- SOLO lo que se puede ofrecer y reservar, porque `appointments` la consume como selector de
-- servicios reservables: soltarle los archivados sería una regresión en la agenda. El catálogo —la
-- única pantalla que necesita verlos— lo pide EXPLÍCITAMENTE con `include_archived = 1`. Es lo que
-- hace el mercado entero (Square, Fresha, Vagaro, Treatwell, Odoo, Shopify, Lightspeed, Toast,
-- Mindbody, Booksy): el listado nunca trae archivados de serie.
--
-- El `CAST(... AS TEXT)` no es adorno: un `<select>` de HTML manda cadenas y un command manda
-- números, así que el parámetro llega como `1` o como `"1"` según quién pregunte; comparar en texto
-- acepta los dos y sigue siendo portable. Ausente = NULL = alcance por defecto.
--
-- Es una query de LISTA: el runtime envuelve este SELECT y compone búsqueda/filtro/orden/paginación
-- a partir del bloque `list` de module.json, así que `status` es filtrable y ordenable como
-- cualquier columna proyectada (`filters.status`, `op: eq`) — y por ahí es por donde la pantalla
-- pide «solo los archivados».
SELECT s.id, s.name, s.price, s.pricing_type, s.duration_minutes, s.is_bookable,
       s.category_id, s.tax_category_key, c.name AS category,
       CASE
         WHEN s.is_deleted = 1 OR s.is_active = 0 THEN 'inactive'
         WHEN COALESCE(NULLIF(TRIM(s.tax_category_key), ''), '') = '' THEN 'unconfigured'
         ELSE 'active'
       END AS status
FROM services_service s
-- `c.hub_id = s.hub_id`: la FK apunta a un id GLOBAL, así que sin esto una categoría de
-- OTRO hub casa por id y su nombre privado sale en esta lista (services#7).
LEFT JOIN services_category c ON c.id = s.category_id AND c.hub_id = s.hub_id AND c.is_deleted = 0
WHERE s.hub_id = :hub_id
  AND (
    (s.is_deleted = 0 AND s.is_active = 1)
    OR COALESCE(CAST(:include_archived AS TEXT), '0') IN ('1', 'true')
  )
