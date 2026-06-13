# services — lógica para handler Rust→WASM (Tier 2)

El CRUD plano y los
soft-delete simples ya están en SQL declarativo Tier 0 (`commands/*.sql`). Lo que sigue es
lógica de batch / atomicidad multi-tabla / validación cross-módulo que **no** cabe en una
sola sentencia SQL y debe convertirse en handler WASM
(`handler/src/lib.rs` → `dist/handler.wasm`).

> Regla hub: el WASM **nunca toca la BD**. Recibe el payload + datos leídos por el
> runtime, valida/calcula y devuelve *intenciones* (filas a insertar/actualizar, comandos
> `_insert_service` / `_insert_package` / `_insert_package_item` a ejecutar) que el runtime
> valida y persiste en una transacción. Los importes (`price`, `cost`, `discount_value`,
> `fixed_price`) son decimales con `quantize(0.01)`; el WASM nunca genera ids ni timestamps
> (los aporta el runtime: `new_ids`, `:hub_id`, `:current_user_id`, `:now`).

## 1. `bulk_create_services` (command `services.services.bulk_create`)
Origen: `ServiceCatalogService.bulk_create_services`.
- Entrada: `{ services: [ {name, price, pricing_type?, duration_minutes?, description?,
 short_description?, category_id?, is_bookable?, requires_confirmation?,
 allow_online_booking?, is_featured?, sku?, barcode?, notes?, cost?,
 buffer_before?, buffer_after?, max_capacity?, sort_order?}, ... ] }`.
- Validación por ítem (NO aborta el lote — recolecta errores y sigue):
 - `name` no vacío.
 - `pricing_type` por defecto `'fixed'`; uno de `fixed|hourly|from|variable|free`.
 - `price`: parsear decimal; si `pricing_type != 'free'` exigir `price >= 0`
 (error `"Price must be zero or greater"`).
 - `duration_minutes` por defecto `60`; debe ser `> 0`
 (error `"Duration must be greater than 0 minutes"`).
- Por cada ítem **válido**: derivar `slug` = slugify(name) (ver pieza 4) y emitir
 un `services._insert_service` con sus binds (id de `new_ids`, defaults para los campos no
 provistos coherentes con la tabla: `is_active=1`, etc.).
- Emitir tantos `_insert_service` como ítems válidos en una sola transacción del runtime.
- Devolver `{success:true, created:N, errors:[{name, error}, ...]}`.
- Es batch (N filas, N validaciones independientes, recolección de errores parciales) →
 no encaja en una sola sentencia SQL.

## 2. `create_package` (command `services.packages.create`)
Origen: `PackageService.create_package`.
- Entrada: `{name, description?, discount_type?, discount_value?, fixed_price?,
 validity_days?, max_uses?, is_active?, is_featured?, sort_order?,
 items: [ {service_id, quantity?}, ... ] }`.
- Validación de cabecera:
 - `name` no vacío.
 - `discount_type` por defecto `'percentage'`; uno de `percentage|fixed`
 (error `"discount_type must be 'percentage' or 'fixed'"`).
 - `discount_value`: decimal, por defecto `0.00` (error `"Invalid discount_value"`).
 - `fixed_price`: opcional; si viene, decimal válido → si no, error `"Invalid fixed_price"`.
 Vacío/ausente ⇒ NULL (precio por descuento). `fixed_price` set anula el descuento.
- Derivar `slug` = slugify(name) (pieza 4) y emitir `services._insert_package` (cabecera).
- Por cada línea de `items` (índice `idx`):
 - Saltar las que tengan `service_id` inválido (no abortar el paquete).
 - `quantity` = `max(1, int(quantity or 1))`.
 - `sort_order` = `idx`.
 - Emitir `services._insert_package_item` con `package_id` = id del paquete recién creado.
- Atómico: cabecera + N líneas en una sola transacción del runtime
 (la cabecera y sus líneas se persisten juntas o nada). El emit
 `services.package.created` lo dispara el runtime tras commit.
- Devolver `{id, name, created:true}`.
- Multi-tabla atómico (1 paquete + N package_items, con dedupe por
 `uq_services_packageitem_pkg_svc`) → no encaja en una sola sentencia SQL.

## 3. Validación cross-módulo: bloqueo por citas activas de `appointments`
Origen: `ServiceCatalogService.delete_service` (guard `has_active_appointments`) y el
warning de precio en `update_service`.
- **Contrato, no import** (§ cross-module = contracts): `services` NO importa de
 `appointments`. Antes de soft-delete de un servicio, el handler pide al runtime el conteo
 de citas activas vía la query pública de appointments (p.ej.
 `appointments.appointments.count_active_for_service` con `{service_id, statuses:['pending','confirmed']}`),
 pasada como dato leído al WASM.
- Si `active_count > 0` → rechazar con error `code:"has_active_appointments"`,
 mensaje `"Cannot delete service '<name>': <N> active appointment(s) reference this
 service. Cancel or complete them first."`. NO emite `_set`/`_delete`.
- Si `active_count == 0` (o appointments no instalado / query ausente) → proceder con el
 soft-delete declarativo (`commands/service_delete.sql`).
- Variante no bloqueante: en cambio de precio de `update_service`, si hay citas activas,
 **no** se aborta; se devuelve `warnings:[ "<N> active appointment(s)... quoted price will
 not change automatically." ]` junto al resultado. El precio cotizado de las citas no se
 recalcula.
- Razón WASM: necesita orquestar (leer conteo de otro módulo → decidir → emitir el
 soft-delete o el error) — flujo condicional cross-módulo, no una sola UPDATE.

## 4. `slugify` (capacidad de texto del handler)
- `slug = lower(strip(name))`; eliminar todo lo que no sea `[\w\s-]`; colapsar
 `[\s_]+` → `-`; recortar `-` de los extremos.
- Usado por las piezas 1 y 2 (y por `update_*` si se reusa). El runtime garantiza unicidad
 vía `uq_services_service_hub_slug` / `uq_services_package_hub_slug`; el WASM solo compone
 el slug base (la desambiguación por colisión, si se quiere, la resuelve el runtime).

## 5. Cascada de soft-delete de líneas de paquete (`delete_package`) — ✅ RESUELTA EN TIER 0 (2026-06-11)
Origen: `PackageService.delete_package` (comentario "cascade to ServicePackageItem rows").
- **No necesitó WASM**: el runtime ejecuta todas las sentencias del array `sql` de un
 command en **una sola transacción** (`crates/runtime/src/commands.rs`), así que la cascada
 se resolvió añadiendo `commands/package_delete_items.sql` al `sql` de
 `services.packages.delete` (issue services#3):
 - `commands/package_delete.sql` — soft-delete de la cabecera (`services_package`).
 - `commands/package_delete_items.sql` — soft-delete de **todas** las líneas vivas
 (`services_packageitem WHERE package_id=:package_id AND hub_id=:hub_id AND is_deleted=0`),
 atómico con la cabecera (cabecera + líneas o nada).
- Importante (preservar histórico): es soft-delete, no DELETE — cualquier venta/bono ya
 emitido conserva su FK al paquete. El `ON DELETE CASCADE` de la tabla es solo para hard
 delete; aquí no aplica.
