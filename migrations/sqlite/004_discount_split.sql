-- Services · migración 004 (SQLite). Separa el descuento polimórfico del paquete en dos
-- columnas TIPADAS (cierra deuda técnica de roadmap/TODO.md §G + auditoría de dinero):
--   * discount_value REAL (% O euros según discount_type) → ambiguo y, peor, guardaba euros
--     como float (violaba el convenio céntimos-enteros, ADR-0007).
-- Pasa a:
--   * discount_percent      REAL    — el % cuando discount_type = 'percentage' (0–100).
--   * discount_amount_cents INTEGER — el importe en CÉNTIMOS cuando discount_type = 'fixed'.
-- discount_type se conserva como discriminador (qué columna aplica). fixed_price (céntimos,
-- anula el descuento) no cambia.
--
-- DROP COLUMN requiere SQLite >= 3.35 (el runtime usa 3.50+). services_package no tiene
-- índices ni generated-columns sobre discount_value, así que el DROP es seguro (mismo patrón
-- que 002_tax_rate_id.sql). El backfill va ANTES del DROP para no perder datos.

ALTER TABLE services_package ADD COLUMN discount_percent      REAL    NOT NULL DEFAULT 0;
ALTER TABLE services_package ADD COLUMN discount_amount_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill: vuelca el valor polimórfico a su columna tipada según el tipo.
--  - 'percentage' → discount_percent = discount_value (el %), amount_cents queda 0.
--  - 'fixed'      → discount_amount_cents = round(euros * 100) (a céntimos), percent queda 0.
UPDATE services_package
SET discount_percent = CASE WHEN discount_type = 'percentage' THEN discount_value ELSE 0 END,
    discount_amount_cents = CASE WHEN discount_type = 'fixed'
                                 THEN CAST(ROUND(discount_value * 100) AS INTEGER) ELSE 0 END;

ALTER TABLE services_package DROP COLUMN discount_value;
