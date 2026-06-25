-- Services · migración aditiva 002 (Postgres / Aurora cloud). Equivalente a
-- migrations/sqlite/002_tax_rate_id.sql. ADR-0066: el IVA se enlaza por REFERENCIA a un
-- tipo (taxes_rate), no se guarda el % crudo. Unifica servicios con inventory.
-- Sin FK cross-módulo (convención + depends_on: ["taxes"]).

-- services_service: reemplaza tax_rate (REAL, % crudo) por tax_rate_id (referencia a
-- taxes_rate.id). Vacío/NULL → tipo por defecto del hub.
ALTER TABLE services_service ADD COLUMN tax_rate_id TEXT;
ALTER TABLE services_service DROP COLUMN tax_rate;

-- services_settings: el "tipo impositivo por defecto" pasa de % numérico
-- (default_tax_rate REAL DEFAULT 21.00) a referencia (default_tax_rate_id TEXT). El flag
-- include_tax_in_price se conserva.
ALTER TABLE services_settings ADD COLUMN default_tax_rate_id TEXT;
ALTER TABLE services_settings DROP COLUMN default_tax_rate;
