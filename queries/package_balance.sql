-- Saldo de bonos/paquetes de un cliente: usos restantes y vigencia por paquete que el
-- cliente ha consumido alguna vez (un bono = relación cliente↔paquete materializada por su
-- primer uso). Query simple (param :customer_id; scope :hub_id inyectado por el runtime).
--   used            = nº de usos activos del cliente para ese paquete
--   remaining       = max_uses - used  (NULL si max_uses es NULL = ilimitado)
--   first_redeemed_at = ancla de vigencia (primer uso)
--   expires_at      = first_redeemed_at + validity_days  (NULL si validity_days es NULL)
--   is_expired      = 1 si now > expires_at, si no 0  (0 cuando no caduca)
SELECT
  p.id                                                   AS package_id,
  p.name                                                 AS package_name,
  :customer_id                                           AS customer_id,
  p.max_uses                                             AS max_uses,
  COUNT(r.id)                                            AS used,
  CASE WHEN p.max_uses IS NULL THEN NULL
       ELSE p.max_uses - COUNT(r.id) END                 AS remaining,
  p.validity_days                                        AS validity_days,
  MIN(r.redeemed_at)                                     AS first_redeemed_at,
  CASE WHEN p.validity_days IS NULL THEN NULL
       ELSE erp_dateadd(MIN(r.redeemed_at), p.validity_days, 'days') END AS expires_at,
  CASE WHEN p.validity_days IS NOT NULL
            AND erp_dt(:now) > erp_dateadd(MIN(r.redeemed_at), p.validity_days, 'days')
       THEN 1 ELSE 0 END                                 AS is_expired
FROM services_package_redemption r
JOIN services_package p ON p.id = r.package_id AND p.hub_id = r.hub_id AND p.is_deleted = 0
WHERE r.hub_id = :hub_id AND r.customer_id = :customer_id AND r.is_deleted = 0
GROUP BY p.id, p.name, p.max_uses, p.validity_days;
