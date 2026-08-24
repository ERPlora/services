-- Consumo de 1 uso de un bono/paquete por un cliente (statement 1 de 3 del command
-- services.packages.redeem). INSERT condicional: solo materializa la fila de uso si TODAS
-- las guardas se cumplen, evaluadas contra datos vivos DENTRO de la transacción del command
-- (el conteo de usos es atómico — sin TOCTOU). Si alguna falla no inserta nada y el assert
-- (_redeem_assert.sql) revierte la transacción.
-- Runtime inyecta :hub_id, :current_user_id, :now. El handler WASM de services.packages.redeem
-- aporta :redemption_id (de context.new_ids, para poder devolvérselo al caller) y el caller
-- :package_id, :customer_id y, opcionalmente, :appointment_id / :sale_id / :note.
INSERT INTO services_package_redemption
  (id, hub_id, package_id, customer_id, appointment_id, sale_id, note, redeemed_at,
   status, use_index, is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
  :redemption_id, :hub_id, :package_id, :customer_id,
  :appointment_id, :sale_id, COALESCE(:note, ''), :now,
  -- A session spent HERE is spent at the chair, with no checkout to undo: it is born
  -- `consumed`. The till's path holds first and settles later (`services._hold`, services#70).
  'consumed',
  -- 🔴 The ordinal is the anti-double-spend guard (migration 011). The COUNT in guard 1 below is
  -- the business rule («this voucher has N sessions») and it is a check-then-act against a SECOND
  -- till: under READ COMMITTED both transactions read the same snapshot and both insert. Two
  -- concurrent redemptions compute the SAME `MAX + 1` here, and `uq_services_redemption_use` lets
  -- exactly one of them commit — the loser's whole transaction rolls back, so no row, no event and
  -- no session spent. That is the difference between this and Odoo#79235, open since 2021.
  (SELECT COALESCE(MAX(u.use_index), 0) + 1
     FROM services_package_redemption u
    WHERE u.hub_id = :hub_id AND u.package_id = :package_id
      AND u.customer_id = :customer_id AND u.is_deleted = 0),
  0, :current_user_id, :current_user_id, :now, :now
FROM services_package p
WHERE p.id = :package_id AND p.hub_id = :hub_id AND p.is_deleted = 0 AND p.is_active = 1
  -- Guarda 1: usos restantes. max_uses NULL = ilimitado; si no, los usos activos del
  -- cliente para este paquete deben ser < max_uses.
  AND (
    p.max_uses IS NULL
    OR (SELECT COUNT(*) FROM services_package_redemption u
        WHERE u.hub_id = :hub_id AND u.package_id = :package_id
          AND u.customer_id = :customer_id AND u.is_deleted = 0) < p.max_uses
  )
  -- Guarda 2: vigencia. validity_days NULL = sin caducidad; si no, el bono caduca a
  -- validity_days desde el PRIMER uso del cliente (acquisition anchor). En el primer
  -- consumo no hay ancla previa (MIN = NULL) → pasa (el bono empieza ahora).
  AND (
    p.validity_days IS NULL
    OR NOT EXISTS (
      -- consulta agregada: MIN(redeemed_at) = ancla (primer uso del cliente). Sobre conjunto
      -- vacío (primer consumo) NO produce fila → NOT EXISTS = true → pasa. Con usos previos,
      -- el HAVING produce fila solo si now > ancla + validity_days → consumo CADUCADO → rechaza.
      SELECT MIN(a.redeemed_at) FROM services_package_redemption a
      WHERE a.hub_id = :hub_id AND a.package_id = :package_id
        AND a.customer_id = :customer_id AND a.is_deleted = 0
      HAVING erp_dt(:now) > erp_dateadd(MIN(a.redeemed_at), p.validity_days, 'days')
    )
  );
