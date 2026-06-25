-- Limpieza de la tabla guardia (statement 3 de 3 del redeem). Solo se alcanza si el assert
-- pasó (un assert fallido viola su CHECK y revierte la transacción antes de llegar aquí), así
-- que services__gate queda vacía en reposo.
DELETE FROM services__gate;
