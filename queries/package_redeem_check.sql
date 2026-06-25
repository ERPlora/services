-- Pre-check de consumo de bono (read-only): ¿se puede consumir 1 uso ANTES de llamar a
-- services.packages.redeem? Mismas guardas que commands/_redeem_insert.sql, pero sin mutar y
-- devolviendo un `reason` de NEGOCIO en vez del crudo "CHECK constraint failed" del gate.
-- La UI/checkout llama esto primero y muestra el motivo; redeem sigue siendo la autoridad
-- transaccional (anti-TOCTOU) — esto solo mejora el mensaje, no sustituye el gate.
--   redeemable = 1 si el consumo pasaría; 0 si no.
--   reason     = 'package_not_found' | 'no_uses_left' | 'expired' | ''  (primer fallo).
-- Binds: :package_id, :customer_id. Runtime inyecta :hub_id, :now. Fechas vía erp_* (ADR-0007).
WITH pkg AS (
    SELECT id, max_uses, validity_days
    FROM services_package
    WHERE id = :package_id AND hub_id = :hub_id AND is_deleted = 0 AND is_active = 1
),
used AS (
    SELECT COUNT(*) AS n, MIN(redeemed_at) AS first_at
    FROM services_package_redemption
    WHERE hub_id = :hub_id AND package_id = :package_id
      AND customer_id = :customer_id AND is_deleted = 0
),
checks AS (
    SELECT
        CASE WHEN (SELECT id FROM pkg) IS NULL THEN 1 ELSE 0 END AS not_found,
        CASE WHEN (SELECT max_uses FROM pkg) IS NOT NULL
                  AND (SELECT n FROM used) >= (SELECT max_uses FROM pkg)
             THEN 1 ELSE 0 END AS no_uses_left,
        CASE WHEN (SELECT validity_days FROM pkg) IS NOT NULL
                  AND (SELECT first_at FROM used) IS NOT NULL
                  AND erp_dt(:now) > erp_dateadd((SELECT first_at FROM used),
                                                 (SELECT validity_days FROM pkg), 'days')
             THEN 1 ELSE 0 END AS expired
)
SELECT
    CASE WHEN not_found + no_uses_left + expired = 0 THEN 1 ELSE 0 END AS redeemable,
    CASE
        WHEN not_found    = 1 THEN 'package_not_found'
        WHEN no_uses_left = 1 THEN 'no_uses_left'
        WHEN expired      = 1 THEN 'expired'
        ELSE ''
    END AS reason
FROM checks;
