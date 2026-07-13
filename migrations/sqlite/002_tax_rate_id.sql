-- Services · migración aditiva 002 (SQLite). ADR-0066: el IVA se enlaza por
-- REFERENCIA a un tipo (taxes_rate), no se guarda el % crudo. Unifica servicios con
-- el modelo de inventory (que ya enlaza por id). Sin FK cross-módulo (convención +
-- depends_on: ["taxes"]); el enlace es por id estable y la resolución la hace
-- venta/factura desde el servicio (no del payload).
--
-- DROP COLUMN requiere SQLite >= 3.35 (el runtime usa 3.50+). services_service y
-- services_settings no tienen índices ni generated-columns que dependan de las
-- columnas eliminadas, así que el DROP es seguro.

-- services_service: reemplaza tax_rate (REAL, % crudo) por tax_rate_id (referencia a
-- taxes_rate.id). Vacío/NULL → tipo por defecto del hub.
ALTER TABLE services_service ADD COLUMN tax_rate_id TEXT;
ALTER TABLE services_service DROP COLUMN tax_rate;

-- services_settings: el "tipo impositivo por defecto" pasa de % numérico
-- (default_tax_rate REAL DEFAULT 21.00) a referencia (default_tax_rate_id TEXT) — el
-- tipo del hub para servicios sin tipo propio. El flag include_tax_in_price se conserva.
ALTER TABLE services_settings ADD COLUMN default_tax_rate_id TEXT;
ALTER TABLE services_settings DROP COLUMN default_tax_rate;
