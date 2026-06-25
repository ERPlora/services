-- Assert del consumo (statement 2 de 3). Si el INSERT condicional (_redeem_insert.sql) NO
-- materializó el uso (paquete inexistente/inactivo, sin usos restantes o caducado), EXISTS=0
-- viola el CHECK (ok = 1) de services__gate y TODA la transacción revierte (no se registra el
-- uso ni se emite el evento). SQLite no permite RAISE fuera de triggers; la tabla guardia es el
-- mecanismo de aborto declarativo (mismo patrón que reservations__gate).
INSERT INTO services__gate (gate, ok)
SELECT 'package_redeemable',
       EXISTS (SELECT 1 FROM services_package_redemption
               WHERE id = :new_id AND hub_id = :hub_id);
