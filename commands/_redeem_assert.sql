-- Assert del consumo (statement 2 de 3). Si el INSERT condicional (_redeem_insert.sql) NO
-- materializó el uso (paquete inexistente/inactivo, sin usos restantes o caducado), el gate
-- recibe ok=0 y viola el CHECK (ok = 1) de services__gate, así que TODA la transacción revierte
-- (no se registra el uso ni se emite el evento). SQLite no permite RAISE fuera de triggers; la
-- tabla guardia es el mecanismo de aborto declarativo (mismo patrón que reservations__gate).
-- El gate `ok` es INTEGER: EXISTS() es boolean en Postgres (falla al insertarlo en INTEGER) y
-- entero en SQLite. Se envuelve en CASE ... THEN 1 ELSE 0 END → 1/0 portable en ambos dialectos
-- (sin `::int`, que SQLite no entiende).
INSERT INTO services__gate (gate, ok)
SELECT 'package_redeemable',
       CASE WHEN EXISTS (SELECT 1 FROM services_package_redemption
                         WHERE id = :new_id AND hub_id = :hub_id)
            THEN 1 ELSE 0 END;
