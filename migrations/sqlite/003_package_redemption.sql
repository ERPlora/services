-- Services · consumo de bonos/paquetes (SQLite). Modelo de USO de un paquete por cliente.
-- Problema que cierra: services_package se podía crear/listar (validity_days, max_uses) pero
-- NO había forma de consumirlo. Esta migración añade el LIBRO DE USOS (ledger) + la tabla
-- guardia que permite RECHAZAR un consumo inválido de forma declarativa (mismo mecanismo que
-- reservations__gate: SQLite no permite RAISE fuera de triggers, así que un CHECK que falla
-- aborta el statement y revierte toda la transacción del command).
--
-- Modelo (decisión documentada en architecture/modules/services.md + decision-log):
--   * Un "bono" es la relación (customer_id, package_id): el cliente posee ese paquete.
--   * Cada uso = una fila en services_package_redemption (ledger append-only, soft-delete).
--   * usos_restantes = max_uses - COUNT(usos activos del cliente para ese paquete).
--   * Vencimiento: validity_days cuenta desde el PRIMER uso del cliente (acquisition anchor).
--     services no tiene evento de compra; el primer consumo ancla la validez. La integración
--     con sales/checkout (seam) puede en el futuro anclar en la fecha de compra real.

-- Libro de usos de un paquete por cliente (contrato de fila estándar §2.5).
CREATE TABLE IF NOT EXISTS services_package_redemption (
    id             TEXT PRIMARY KEY,
    hub_id         TEXT NOT NULL,
    package_id     TEXT NOT NULL,
    customer_id    TEXT NOT NULL,            -- ref a customers (convención, sin FK cross-módulo)
    appointment_id TEXT,                     -- cita contra la que se consumió (opcional)
    sale_id        TEXT,                     -- venta contra la que se consumió (opcional)
    note           TEXT NOT NULL DEFAULT '',
    redeemed_at    TEXT NOT NULL,            -- ISO-8601 (= :now del consumo)
    is_deleted     INTEGER NOT NULL DEFAULT 0,
    deleted_at     TEXT,
    created_by     TEXT,
    updated_by     TEXT,
    created_at     TEXT,
    updated_at     TEXT,
    FOREIGN KEY (package_id) REFERENCES services_package (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS ix_services_redemption_pkg_cust
    ON services_package_redemption (hub_id, package_id, customer_id, is_deleted);

-- Tabla guardia para el aborto declarativo del consumo (mismo patrón que reservations__gate):
-- el command de redeem inserta aquí el resultado de su assert; si el consumo no se materializó
-- (ok = 0) el CHECK aborta y revierte la transacción. El command la limpia en su último
-- statement, así que en reposo está vacía.
CREATE TABLE IF NOT EXISTS services__gate (
    gate TEXT NOT NULL,                 -- nombre del gate (diagnóstico del error)
    ok   INTEGER NOT NULL CHECK (ok = 1)
);
