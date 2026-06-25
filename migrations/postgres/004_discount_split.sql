-- Services · migración 004 (Postgres / Aurora cloud). Equivalente a
-- migrations/sqlite/004_discount_split.sql — separa el descuento polimórfico del paquete
-- (discount_value REAL, % o euros) en dos columnas TIPADAS:
--   * discount_percent      REAL    — el % cuando discount_type = 'percentage'.
--   * discount_amount_cents INTEGER — el importe en CÉNTIMOS cuando discount_type = 'fixed'
--     (cierra la violación del convenio céntimos-enteros, ADR-0007).
-- discount_type se conserva como discriminador. El backfill va ANTES del DROP.

ALTER TABLE services_package ADD COLUMN discount_percent      REAL    NOT NULL DEFAULT 0;
ALTER TABLE services_package ADD COLUMN discount_amount_cents INTEGER NOT NULL DEFAULT 0;

-- Backfill por tipo: 'percentage' → discount_percent; 'fixed' → discount_amount_cents (céntimos).
UPDATE services_package
SET discount_percent = CASE WHEN discount_type = 'percentage' THEN discount_value ELSE 0 END,
    discount_amount_cents = CASE WHEN discount_type = 'fixed'
                                 THEN CAST(ROUND(discount_value::numeric * 100) AS INTEGER) ELSE 0 END;

ALTER TABLE services_package DROP COLUMN discount_value;
