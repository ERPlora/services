-- Lista de servicios activos del hub con nombre de categoría. Portado de
-- ServiceCatalogService.list_services (orden por sort_order, name; búsqueda/filtro en UI/SDK).
SELECT s.id, s.name, s.price, s.pricing_type, s.duration_minutes, s.is_bookable,
       s.category_id, s.tax_category_key, c.name AS category
FROM services_service s
-- `c.hub_id = s.hub_id`: la FK apunta a un id GLOBAL, así que sin esto una categoría de
-- OTRO hub casa por id y su nombre privado sale en esta lista (services#7).
LEFT JOIN services_category c ON c.id = s.category_id AND c.hub_id = s.hub_id AND c.is_deleted = 0
WHERE s.hub_id = :hub_id AND s.is_deleted = 0 AND s.is_active = 1
