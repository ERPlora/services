-- Services · migración aditiva 003 (SQLite). ADR-0085 (supersede ADR-0066): el enlace
-- fiscal deja de ser una REFERENCIA a un tipo (`taxes_rate.id`) y pasa a ser una CLAVE DE
-- CATEGORÍA FISCAL canónica (`tax_category_key`). El % se resuelve en venta desde el
-- país/región del hub + la categoría. Unifica con inventory. Sin FK cross-módulo.
-- RENAME COLUMN: SQLite ≥ 3.25 (el runtime usa 3.50+).

-- services_service: `tax_rate_id` (referencia) → `tax_category_key` (clave canónica).
-- Vacío/NULL → categoría por defecto del hub.
ALTER TABLE services_service RENAME COLUMN tax_rate_id TO tax_category_key;

-- services_settings: el "tipo por defecto" pasa de referencia (default_tax_rate_id) a
-- clave de categoría por defecto (default_tax_category_key).
ALTER TABLE services_settings RENAME COLUMN default_tax_rate_id TO default_tax_category_key;
