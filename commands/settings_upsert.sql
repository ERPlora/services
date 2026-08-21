-- Upsert del singleton de ajustes del hub. Portado de SettingsService.update_settings
-- (crea la fila por defecto si falta, luego aplica los campos enviados).
-- Runtime inyecta :new_id, :hub_id, :current_user_id, :now. La UI/SDK envía SIEMPRE el
-- conjunto completo de campos (rellenando con los actuales/defaults los no tocados).
-- The integer binds are CAST to BIGINT on purpose: that is the type the runtime puts on
-- the wire, and pinning it in the statement is what stops Postgres from inferring `int4`
-- for the parameters a payload omits. Full story in commands/service_create.sql (services#50).
INSERT INTO services_settings
  (id, hub_id, default_duration, default_buffer_time, default_tax_category_key,
   show_prices, show_duration, allow_online_booking, include_tax_in_price, currency,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, CAST(:default_duration AS BIGINT), CAST(:default_buffer_time AS BIGINT), :default_tax_category_key,
   CAST(:show_prices AS BIGINT), CAST(:show_duration AS BIGINT), CAST(:allow_online_booking AS BIGINT), CAST(:include_tax_in_price AS BIGINT), :currency,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id) DO UPDATE SET
  default_duration     = CAST(:default_duration AS BIGINT),
  default_buffer_time  = CAST(:default_buffer_time AS BIGINT),
  default_tax_category_key  = :default_tax_category_key,
  show_prices          = CAST(:show_prices AS BIGINT),
  show_duration        = CAST(:show_duration AS BIGINT),
  allow_online_booking = CAST(:allow_online_booking AS BIGINT),
  include_tax_in_price = CAST(:include_tax_in_price AS BIGINT),
  currency             = :currency,
  updated_by           = :current_user_id,
  updated_at           = :now;
