-- Lines (services) of a package. Ported from the items[] block of PackageService.get_package.
SELECT i.service_id, i.quantity, i.sort_order, s.name AS service_name, s.price AS service_price
FROM services_packageitem i
-- The header must be ALIVE and of THIS hub (services#3): a line is never shown on its own once
-- its package is gone, whatever its own flag says.
JOIN services_package p ON p.id = i.package_id AND p.hub_id = i.hub_id AND p.is_deleted = 0
-- `s.hub_id = i.hub_id`: without it, a line pointing at ANOTHER hub's service returned its name
-- and its PRICE (services#7).
JOIN services_service s ON s.id = i.service_id AND s.hub_id = i.hub_id AND s.is_deleted = 0
WHERE i.package_id = :package_id AND i.hub_id = :hub_id AND i.is_deleted = 0
