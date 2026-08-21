-- Edición de paquete (campos escalares; no toca las líneas). Portado de
-- PackageService.update_package. Para limpiar fixed_price, envía :fixed_price = NULL.
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
UPDATE services_package SET
  name           = :name,
  slug           = :slug,
  description    = :description,
  discount_type         = :discount_type,
  discount_percent_bp   = CAST(:discount_percent_bp AS BIGINT),
  discount_amount_cents = CAST(:discount_amount_cents AS BIGINT),
  fixed_price           = CAST(:fixed_price AS BIGINT),
  validity_days  = CAST(:validity_days AS BIGINT),
  max_uses       = CAST(:max_uses AS BIGINT),
  is_active      = CAST(:is_active AS BIGINT),
  is_featured    = CAST(:is_featured AS BIGINT),
  updated_by     = :current_user_id,
  updated_at     = :now
WHERE id = :package_id AND hub_id = :hub_id AND is_deleted = 0;
