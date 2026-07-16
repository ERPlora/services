-- PG-compat (auditoría pm#16, 07-17): los binds BOOLEANOS del schema van envueltos en
-- CASE WHEN :x THEN 1 WHEN NOT :x THEN 0 END — las columnas son INTEGER 0/1 por contrato
-- (§2.5) y Postgres NO castea boolean→bigint (SQLite sí lo toleraba). El tri-estado
-- preserva NULL para los COALESCE de opcionales.
-- Upsert del singleton de ajustes del hub. Portado de SettingsService.update_settings
-- (crea la fila por defecto si falta, luego aplica los campos enviados).
-- Runtime inyecta :new_id, :hub_id, :current_user_id, :now. La UI/SDK envía SIEMPRE el
-- conjunto completo de campos (rellenando con los actuales/defaults los no tocados).
INSERT INTO services_settings
  (id, hub_id, default_duration, default_buffer_time, default_tax_category_key,
   show_prices, show_duration, allow_online_booking, include_tax_in_price, currency,
   is_deleted, created_by, updated_by, created_at, updated_at)
VALUES
  (:new_id, :hub_id, :default_duration, :default_buffer_time, :default_tax_category_key,
   CASE WHEN :show_prices THEN 1 WHEN NOT :show_prices THEN 0 END, CASE WHEN :show_duration THEN 1 WHEN NOT :show_duration THEN 0 END, CASE WHEN :allow_online_booking THEN 1 WHEN NOT :allow_online_booking THEN 0 END, CASE WHEN :include_tax_in_price THEN 1 WHEN NOT :include_tax_in_price THEN 0 END, :currency,
   0, :current_user_id, :current_user_id, :now, :now)
ON CONFLICT (hub_id) DO UPDATE SET
  default_duration     = :default_duration,
  default_buffer_time  = :default_buffer_time,
  default_tax_category_key  = :default_tax_category_key,
  show_prices          = CASE WHEN :show_prices THEN 1 WHEN NOT :show_prices THEN 0 END,
  show_duration        = CASE WHEN :show_duration THEN 1 WHEN NOT :show_duration THEN 0 END,
  allow_online_booking = CASE WHEN :allow_online_booking THEN 1 WHEN NOT :allow_online_booking THEN 0 END,
  include_tax_in_price = CASE WHEN :include_tax_in_price THEN 1 WHEN NOT :include_tax_in_price THEN 0 END,
  currency             = :currency,
  updated_by           = :current_user_id,
  updated_at           = :now;
