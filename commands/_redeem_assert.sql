-- Assert del consumo (statement 2 de 3). Si el INSERT condicional (_redeem_insert.sql) NO
-- materializó el uso (paquete inexistente/inactivo, sin usos restantes o caducado), EXISTS=0
-- viola el CHECK (ok = 1) de services__gate y TODA la transacción revierte (no se registra el
-- uso ni se emite el evento). SQLite no permite RAISE fuera de triggers; la tabla guardia es el
-- mecanismo de aborto declarativo (mismo patrón que reservations__gate).
-- GUARDARRAÍL QA (2026-07-16, qa-hub-beauty): en Postgres `EXISTS(...)` es BOOLEAN y la
-- columna `ok` es INTEGER/bigint → "column ok is of type bigint but expression is of type
-- boolean" y el canje de bono NUNCA funciona en Hub Cloud (en SQLite EXISTS ya da 0/1).
-- CASE WHEN lo hace portable en ambos dialectos sin cambiar la semántica del gate.
INSERT INTO services__gate (gate, ok)
SELECT 'package_redeemable',
       CASE WHEN EXISTS (SELECT 1 FROM services_package_redemption
                         WHERE id = :new_id AND hub_id = :hub_id)
            THEN 1 ELSE 0 END;
