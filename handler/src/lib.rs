//! Handler WASM (Tier 2) del módulo `services` — batch de servicios y paquetes.
//! Portado de old_modules/m_services (ServiceCatalogService.bulk_create_services,
//! PackageService.create_package). Lógica pura, sin BD: recibe `{payload, context}`,
//! valida/deriva (`slugify`, `quantize(0.01)`) y devuelve **intenciones**
//! (commands privados `services._insert_*` del mismo módulo) que el host valida
//! y ejecuta en una transacción. WASM-TODO.md piezas 1, 2 y 4.
//!
//! Ids: el host pasa `context.new_ids` (autoridad de ids; el guest no genera
//! ids ni timestamps). En `bulk_create_services` los ids se reparten en orden a
//! los ítems **válidos**; en `create_package`, `new_ids[0]` = paquete y
//! `new_ids[1..]` = líneas.
//!
//! El campo `result` del [`HandlerOutput`] lleva el resultado documentado
//! (`{success, created, errors[]}` / `{id, name, created}`); el host actual
//! deserializa `{operations, events}` y lo ignora (forward-compatible — el
//! caller recibe hoy `{ok, operations}` del runtime).

use erplora_guest_sdk::money;
use erplora_guest_sdk::units::QUANTITY_SCALE;
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use erplora_guest_sdk::{DomainError, Event, Operation, Output};
use serde::Serialize;
use serde_json::{json, Map, Value};

#[cfg(feature = "guest")]
use extism_pdk::*;

/// Salida del handler: las intenciones del contrato (`operations`, `events`)
/// más un `result` informativo (ignorado por el host actual, ver doc del crate).
#[derive(Debug, Clone, Serialize, Default)]
pub struct HandlerOutput {
    pub operations: Vec<Operation>,
    pub events: Vec<Event>,
    pub result: Value,
}

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn bulk_create_services(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<HandlerOutput>> {
    Ok(Json(bulk_create_services_pure(input.into_inner().into_value())))
}

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn create_package(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<HandlerOutput>> {
    match create_package_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(msg) => Err(WithReturnCode::new(Error::msg(msg), 1)),
    }
}

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn redeem_package(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match redeem_package_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(msg) => Err(WithReturnCode::new(Error::msg(msg), 1)),
    }
}

#[cfg(feature = "guest")]
#[plugin_fn]
pub fn hold_package_for_line(input: Json<erplora_guest_sdk::Input>) -> FnResult<Json<Output>> {
    match hold_package_for_line_pure(input.into_inner().into_value()) {
        Ok(out) => Ok(Json(out)),
        Err(msg) => Err(WithReturnCode::new(Error::msg(msg), 1)),
    }
}

// ── helpers de tipos (mismo criterio que el handler de sales) ───────────────

// El DINERO lo redondea `erplora_guest_sdk::money` (ADR-0123): unidad mínima, HALF_UP, uno solo
// para todo el hub. Este módulo tenía su propio `round_cents` (half-even sobre `f64`).

/// A percentage with decimals → **basis points**, the integer the catalogue stores
/// (`1050` = 10,50 %). The scale is 10⁴ of the rate, i.e. two decimals of a percent.
///
/// This is the only conversion left, and it exists for ONE caller: the legacy `discount_value`,
/// which speaks percent-with-decimals. Everything else already sends basis points (services#55):
/// a float percentage cannot survive the trip, because the host types the bind from the value and
/// `10` and `10.5` reach the same statement as two different Postgres types.
///
/// The mode is the hub's single one, HALF_UP (ADR-0123 §4), and it lives in `money::round` —
/// not in a local `* 100.0).round()`, which is where this module's divergent rounding used to be.
fn percent_to_basis_points(percent: f64) -> i64 {
    money::round(Decimal::from_f64(percent).unwrap_or(Decimal::ZERO) * Decimal::from(100))
}

fn as_str(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        _ => String::new(),
    }
}

fn as_bool(v: &Value, d: bool) -> bool {
    match v {
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_i64().unwrap_or(if d { 1 } else { 0 }) != 0,
        Value::String(s) => matches!(s.as_str(), "1" | "true" | "True" | "yes"),
        Value::Null => d,
        _ => d,
    }
}

/// Parsea un decimal; `None` si el valor presente no es parseable.
/// `Null`/ausente NO es error: el caller decide el default.
fn parse_decimal(v: Option<&Value>) -> Result<Option<f64>, ()> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => n.as_f64().map(Some).ok_or(()),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                Ok(None)
            } else {
                t.parse::<f64>().map(Some).map_err(|_| ())
            }
        }
        Some(_) => Err(()),
    }
}

/// Parsea un entero; `None` si Null/ausente/vacío; `Err` si no parseable.
fn parse_int(v: Option<&Value>) -> Result<Option<i64>, ()> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(Value::Number(n)) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f as i64))
            .map(Some)
            .ok_or(()),
        Some(Value::String(s)) => {
            let t = s.trim();
            if t.is_empty() {
                Ok(None)
            } else {
                t.parse::<f64>().map(|f| Some(f as i64)).map_err(|_| ())
            }
        }
        Some(_) => Err(()),
    }
}

fn str_field(p: &Value, k: &str) -> String {
    p.get(k).map(as_str).unwrap_or_default()
}

fn bool_field(p: &Value, k: &str, d: bool) -> i64 {
    p.get(k).map(|v| as_bool(v, d)).unwrap_or(d) as i64
}

/// `slugify` (WASM-TODO.md pieza 4): lower + strip; fuera todo lo que no sea
/// `[\w\s-]`; colapsa `[\s_]+` → `-`; recorta `-` de los extremos. La unicidad
/// final la garantizan los índices `UNIQUE (hub_id, slug)`.
pub fn slugify(name: &str) -> String {
    let lowered = name.trim().to_lowercase();
    let kept: String = lowered
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || c.is_whitespace())
        .collect();
    let mut slug = String::with_capacity(kept.len());
    let mut pending_sep = false;
    for c in kept.chars() {
        if c.is_whitespace() || c == '_' {
            pending_sep = true;
        } else {
            if pending_sep && !slug.is_empty() {
                slug.push('-');
            }
            pending_sep = false;
            slug.push(c);
        }
    }
    slug.trim_matches('-').to_string()
}

const PRICING_TYPES: [&str; 5] = ["fixed", "hourly", "from", "variable", "free"];

/// Ids de los servicios VIVOS de este hub, de `context.reads["services.services.list"]`
/// (ADR-0069: el catálogo de confianza que entrega el host, no lo que diga el payload).
/// `None` = la read no llegó (manifest antiguo o query degradada) — el caller decide, y en
/// `create_package` decide cerrar.
fn catalogue_service_ids(input: &Value) -> Option<Vec<String>> {
    let rows = input
        .get("context")?
        .get("reads")?
        .get("services.services.list")?
        .as_array()?;
    Some(rows.iter().filter_map(|r| r.get("id").map(as_str)).collect())
}

// ── pieza 1: bulk_create_services ───────────────────────────────────────────

/// Lógica pura de `services.services.bulk_create`: valida cada ítem de forma
/// independiente (recolecta errores parciales, NO aborta el lote), deriva el
/// `slug` y devuelve un `services._insert_service` por ítem válido. El runtime
/// persiste todas las intenciones en UNA transacción e inyecta
/// `:hub_id`/`:current_user_id`/`:now` en cada una.
pub fn bulk_create_services_pure(input: Value) -> HandlerOutput {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);
    let items = payload.get("services").and_then(|v| v.as_array()).unwrap_or(&empty);

    let mut ops: Vec<Operation> = Vec::new();
    let mut errors: Vec<Value> = Vec::new();

    for item in items {
        let name = str_field(item, "name").trim().to_string();
        let push_err = |errors: &mut Vec<Value>, name: &str, msg: &str| {
            errors.push(json!({ "name": name, "error": msg }));
        };

        if name.is_empty() {
            push_err(&mut errors, &name, "Name is required");
            continue;
        }

        // La categoría fiscal es OBLIGATORIA por ítem (services#41), igual que en
        // `services.services.create` desde services#33: un servicio se vende como línea de venta
        // con su IVA, así que sin ella el lote nace invendible. El schema ya la exige antes de
        // llegar aquí; esto es la segunda puerta, y falla el ÍTEM (no el lote) para no perder los
        // demás. NUNCA se inventa un default: eso sería inventarse dato fiscal.
        let tax_category_key = str_field(item, "tax_category_key").trim().to_string();
        if tax_category_key.is_empty() {
            push_err(&mut errors, &name, "A tax category is required");
            continue;
        }

        let pricing_type = {
            let pt = str_field(item, "pricing_type");
            if pt.is_empty() { "fixed".to_string() } else { pt }
        };
        if !PRICING_TYPES.contains(&pricing_type.as_str()) {
            push_err(&mut errors, &name, "Invalid pricing_type");
            continue;
        }

        let price = match parse_decimal(item.get("price")) {
            Ok(p) => p.unwrap_or(0.0),
            Err(()) => {
                push_err(&mut errors, &name, "Invalid price");
                continue;
            }
        };
        if pricing_type != "free" && price < 0.0 {
            push_err(&mut errors, &name, "Price must be zero or greater");
            continue;
        }

        let duration = match parse_int(item.get("duration_minutes")) {
            Ok(d) => d.unwrap_or(60),
            Err(()) => {
                push_err(&mut errors, &name, "Duration must be greater than 0 minutes");
                continue;
            }
        };
        if duration <= 0 {
            push_err(&mut errors, &name, "Duration must be greater than 0 minutes");
            continue;
        }

        // Id del lote del host (autoridad de ids): siguiente id libre.
        let service_id = match new_ids.get(ops.len()).map(as_str) {
            Some(id) if !id.is_empty() => id,
            _ => {
                push_err(&mut errors, &name, "Host id batch exhausted");
                continue;
            }
        };

        let cost = parse_decimal(item.get("cost")).ok().flatten().unwrap_or(0.0);
        let buffer_before = parse_int(item.get("buffer_before")).ok().flatten().unwrap_or(0);
        let buffer_after = parse_int(item.get("buffer_after")).ok().flatten().unwrap_or(0);
        let max_capacity = parse_int(item.get("max_capacity")).ok().flatten().unwrap_or(1).max(1);
        let sort_order = parse_int(item.get("sort_order")).ok().flatten().unwrap_or(0);

        let mut p = Map::new();
        p.insert("service_id".into(), json!(service_id));
        p.insert("name".into(), json!(name));
        p.insert("slug".into(), json!(slugify(&name)));
        p.insert("description".into(), json!(str_field(item, "description")));
        p.insert("short_description".into(), json!(str_field(item, "short_description")));
        p.insert(
            "category_id".into(),
            match item.get("category_id") {
                Some(Value::String(s)) if !s.trim().is_empty() => json!(s),
                Some(v @ Value::Number(_)) => v.clone(),
                _ => Value::Null,
            },
        );
        p.insert("tax_category_key".into(), json!(tax_category_key));
        p.insert("pricing_type".into(), json!(pricing_type));
        p.insert("price".into(), json!(money::round(Decimal::from_f64(price).unwrap_or(Decimal::ZERO)))); // céntimos (input cents)
        p.insert("cost".into(), json!(money::round(Decimal::from_f64(cost).unwrap_or(Decimal::ZERO))));   // céntimos
        p.insert("duration_minutes".into(), json!(duration));
        p.insert("buffer_before".into(), json!(buffer_before));
        p.insert("buffer_after".into(), json!(buffer_after));
        p.insert("max_capacity".into(), json!(max_capacity));
        p.insert("is_bookable".into(), json!(bool_field(item, "is_bookable", true)));
        p.insert(
            "requires_confirmation".into(),
            json!(bool_field(item, "requires_confirmation", false)),
        );
        p.insert(
            "allow_online_booking".into(),
            json!(bool_field(item, "allow_online_booking", true)),
        );
        p.insert("sort_order".into(), json!(sort_order));
        p.insert("is_featured".into(), json!(bool_field(item, "is_featured", false)));
        p.insert("sku".into(), json!(str_field(item, "sku")));
        p.insert("barcode".into(), json!(str_field(item, "barcode")));
        p.insert("notes".into(), json!(str_field(item, "notes")));
        ops.push(Operation::sql("services._insert_service", p));
    }

    let created = ops.len();
    HandlerOutput {
        operations: ops,
        events: vec![],
        result: json!({ "success": true, "created": created, "errors": errors }),
    }
}

// ── pieza 2: create_package ─────────────────────────────────────────────────

/// Lógica pura de `services.packages.create`: valida la cabecera (un error de
/// cabecera ABORTA el command), deriva el `slug` y compone
/// `services._insert_package` + N×`services._insert_package_item` (líneas con
/// `service_id` inválido se saltan; dedupe por `service_id` — índice
/// `uq_services_packageitem_pkg_svc`). El runtime persiste cabecera + líneas
/// atómicamente y dispara el `emit` declarado (`services.package.created`)
/// tras el commit; por eso el handler NO devuelve eventos.
pub fn create_package_pure(input: Value) -> Result<HandlerOutput, String> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);

    let name = str_field(&payload, "name").trim().to_string();
    if name.is_empty() {
        return Err("Name is required".to_string());
    }

    let discount_type = {
        let dt = str_field(&payload, "discount_type");
        if dt.is_empty() { "percentage".to_string() } else { dt }
    };
    if discount_type != "percentage" && discount_type != "fixed" {
        return Err("discount_type must be 'percentage' or 'fixed'".to_string());
    }

    // Descuento TIPADO (migración 004): el % y el importe fijo viven en columnas separadas en
    // vez del antiguo `discount_value` polimórfico.
    //   * discount_percent_bp   → INTEGER basis points (el % cuando discount_type = 'percentage';
    //     migración 008 / services#55 — antes era un REAL y el % viajaba como `number`).
    //   * discount_amount_cents → INTEGER céntimos (cuando discount_type = 'fixed').
    // Compat: si el caller aún manda el legado `discount_value` (% o euros según el tipo) y NO
    // las columnas nuevas, lo derivamos al campo tipado que corresponda.
    let legacy_discount_value = parse_decimal(payload.get("discount_value"))
        .map_err(|_| "Invalid discount_value".to_string())?;

    let discount_percent_bp = match parse_int(payload.get("discount_percent_bp"))
        .map_err(|_| "Invalid discount_percent_bp".to_string())?
    {
        Some(bp) => bp,
        None if discount_type == "percentage" => {
            percent_to_basis_points(legacy_discount_value.unwrap_or(0.0))
        }
        None => 0,
    };

    let discount_amount_cents = match parse_int(payload.get("discount_amount_cents")).ok().flatten()
    {
        Some(c) => c,
        None if discount_type == "fixed" => {
            // legado: discount_value venía en EUROS → a céntimos por el SDK (HALF_UP).
            // NOTA: el refactor del 13-07 borró `round_cents` pero dejó esta llamada —
            // el crate llevaba desde entonces SIN COMPILAR (el wasm de dist/ era anterior).
            money::euros_to_cents(Decimal::from_f64(legacy_discount_value.unwrap_or(0.0)).unwrap_or(Decimal::ZERO))
        }
        None => 0,
    };

    let fixed_price = parse_decimal(payload.get("fixed_price"))
        .map_err(|_| "Invalid fixed_price".to_string())?;

    let package_id = match new_ids.first().map(as_str) {
        Some(id) if !id.is_empty() => id,
        _ => return Err("Host id batch exhausted".to_string()),
    };

    let validity_days = parse_int(payload.get("validity_days")).ok().flatten();
    let max_uses = parse_int(payload.get("max_uses")).ok().flatten();
    let sort_order = parse_int(payload.get("sort_order")).ok().flatten().unwrap_or(0);

    let mut ops: Vec<Operation> = Vec::new();
    let mut h = Map::new();
    h.insert("package_id".into(), json!(package_id));
    h.insert("name".into(), json!(name));
    h.insert("slug".into(), json!(slugify(&name)));
    h.insert("description".into(), json!(str_field(&payload, "description")));
    h.insert("discount_type".into(), json!(discount_type));
    // Descuento tipado (migración 004/008): % → basis points; importe fijo → céntimos. Los dos
    // son ENTEROS, que es la única forma que tiene un slot de conservar un solo tipo en el cable.
    h.insert("discount_percent_bp".into(), json!(discount_percent_bp));
    h.insert("discount_amount_cents".into(), json!(discount_amount_cents));
    // fixed_price es dinero → céntimos (input cents).
    h.insert(
        "fixed_price".into(),
        fixed_price.map(|f| json!(money::round(Decimal::from_f64(f).unwrap_or(Decimal::ZERO)))).unwrap_or(Value::Null),
    );
    h.insert("validity_days".into(), validity_days.map(|v| json!(v)).unwrap_or(Value::Null));
    h.insert("max_uses".into(), max_uses.map(|v| json!(v)).unwrap_or(Value::Null));
    h.insert("sort_order".into(), json!(sort_order));
    h.insert("is_active".into(), json!(bool_field(&payload, "is_active", true)));
    h.insert("is_featured".into(), json!(bool_field(&payload, "is_featured", false)));
    ops.push(Operation::sql("services._insert_package", h));

    // Líneas: dedupe (uq_services_packageitem_pkg_svc); quantity = max(1, int);
    // sort_order = índice de entrada.
    //
    // services#42 — lo que YA NO se hace es saltarse una línea en silencio. `_insert_package_item`
    // es un `INSERT … SELECT` que JOINea el servicio con el hub del paquete: un `service_id`
    // desconocido o de otro hub insertaba CERO filas, nadie miraba el recuento (el camino WASM
    // aplica las intenciones con `execute_tx`, sin la gate de `expect_rows`) y el bono se creaba
    // sin esa sesión, respondiendo `ok`. Un bono al que le faltan sesiones es un bono mal vendido,
    // así que ahora el command entero se rechaza y no se persiste nada.
    //
    // El handler corre en un sandbox y no puede leer la BD: la lista de servicios vivos de ESTE
    // hub llega pre-cargada en `context.reads` (ADR-0069), declarada por el manifest en
    // `services.packages.create`. Sin ese catálogo las líneas no son verificables → fail CLOSED.
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);
    // services#42 — fail closed on the EMPTY package too, not only on bad lines. The schema
    // (`schemas/package_create.json`: `items` required, `minItems: 1`) is the front door and
    // refuses the payload with 422 before the handler runs; this guard is defense in depth for
    // the doors that do not pass through it (an internal caller, a future flow). A package with
    // no lines describes nothing sellable or redeemable — there is no legitimate way to reach
    // here with `items` empty, so refusing costs nothing real and keeps the invariant in ONE
    // place per door instead of trusting that every door remembers the schema.
    if items.is_empty() {
        return Err(
            "services.package_needs_lines: a package with no lines describes nothing sellable \
             or redeemable — add at least one service line"
                .to_string(),
        );
    }
    let catalogue = catalogue_service_ids(&input);
    // (Con las líneas ya no vacías arriba, «sin catálogo» siempre es un fallo de lectura.)
    if catalogue.is_none() {
        return Err(
            "The service catalogue could not be read, so the package lines cannot be verified"
                .to_string(),
        );
    }
    let catalogue = catalogue.unwrap_or_default();

    let mut seen: Vec<String> = Vec::new();
    for (idx, item) in items.iter().enumerate() {
        let service_id = str_field(item, "service_id").trim().to_string();
        if service_id.is_empty() {
            return Err("A package line must name a service".to_string());
        }
        if !catalogue.iter().any(|id| id == &service_id) {
            return Err(format!(
                "Service `{service_id}` is not in this business's catalogue: the package line cannot be created"
            ));
        }
        // Duplicada: el índice único `uq_services_packageitem_pkg_svc` la rechazaría; se colapsa
        // en una sola línea (mismo servicio, misma línea), que es lo que el índice describe.
        if seen.contains(&service_id) {
            continue;
        }
        let item_id = match new_ids.get(1 + seen.len()).map(as_str) {
            Some(id) if !id.is_empty() => id,
            // Lote de ids agotado: antes se descartaban las líneas de más, sin decirlo.
            _ => return Err("Host id batch exhausted: the package has too many lines".to_string()),
        };
        seen.push(service_id.clone());

        // Punto fijo 10⁶ (ADR-0147): ausente = 1 sesión = QUANTITY_SCALE.
        //
        // services#51 — aquí había un `.max(QUANTITY_SCALE)` heredado del tiempo en que la columna
        // contaba sesiones enteras: era el suelo «al menos 1 sesión». Cuando ADR-0147 pasó la
        // columna a escala 10⁶ ese suelo dejó de ser un suelo y se convirtió en un REESCRITOR: un
        // `quantity: 5` —que es lo que escribe un humano, un flujo o el asistente cuando quiere
        // cinco sesiones— subía a 1_000_000 y el command respondía `ok`. Un bono de 5 sesiones
        // vendido como 1 es dinero del cliente, y ningún error lo delataba.
        //
        // El valor es AMBIGUO (¿cinco sesiones, o cinco millonésimas de sesión?) y la regla de la
        // casa para una entrada dudosa es cerrar el guard, no inventar un default. Así que un
        // valor por debajo de la escala se RECHAZA con un código de dominio que nombra la escala.
        // El schema lo declara también (`minimum`), para que el rechazo llegue en la capa de
        // validación; esto es la segunda puerta, para el camino que no pase por ella.
        let quantity = match parse_int(item.get("quantity")).ok().flatten() {
            None => QUANTITY_SCALE,
            Some(q) if q >= QUANTITY_SCALE => q,
            Some(q) => {
                return Err(format!(
                    "services.invalid_quantity: line `{service_id}` sent quantity {q}, which is \
                     below one session. Sessions travel as fixed-point on a scale of {QUANTITY_SCALE} \
                     (ADR-0147), so 5 sessions is {}, not 5",
                    5 * QUANTITY_SCALE
                ))
            }
        };
        let mut p = Map::new();
        p.insert("item_id".into(), json!(item_id));
        p.insert("package_id".into(), json!(package_id));
        p.insert("service_id".into(), json!(service_id));
        p.insert("quantity".into(), json!(quantity));
        p.insert("sort_order".into(), json!(idx as i64));
        ops.push(Operation::sql("services._insert_package_item", p));
    }

    Ok(HandlerOutput {
        operations: ops,
        events: vec![],
        result: json!({ "id": package_id, "name": name, "created": true }),
    })
}

// ── pieza 3: redeem_package (services#52) ───────────────────────────────────

/// The read `services.packages.redeem` declares in its manifest `reads` block (ADR-0069): the
/// module's own pre-check of the same guards the transactional gate enforces.
const READ_REDEEM_CHECK: &str = "services.packages.redeem_check";

/// Domain refusals of a redemption, in the module's namespace (the host validates it).
///
/// The three reasons are exactly the ones `services.packages.redeem_check` already computes —
/// there is no new business logic here, only the mapping the declarative path could not express:
/// until services#52 the caller got the raw CHECK of `services__gate` (`sqlx: … violates check
/// constraint "services__gate_ok_check"`), which nobody at a counter can act on.
fn redeem_refusal(code: &str, message: &str) -> DomainError {
    DomainError::new(code, message)
}

/// `reason` of the read → the domain error the caller receives. The closed set comes from
/// `queries/package_redeem_check.sql`; anything else (including an empty reason with
/// `redeemable = 0`, which that query never produces) is a broken contract and fails CLOSED with
/// the generic refusal — never a silent go, and never the raw gate either.
fn refusal_for(reason: &str) -> DomainError {
    match reason.trim() {
        "no_uses_left" => redeem_refusal(
            "services.package_no_uses_left",
            "This voucher has no sessions left.",
        ),
        "expired" => redeem_refusal(
            "services.package_expired",
            "This voucher has expired.",
        ),
        "package_not_found" => redeem_refusal(
            "services.package_not_found",
            "That package does not exist in this business.",
        ),
        _ => redeem_refusal(
            "services.package_not_redeemable",
            "This voucher cannot be redeemed right now.",
        ),
    }
}

/// Is the pre-check's `redeemable` flag saying yes? The row carries it as an INTEGER (the query's
/// `CASE … THEN 1 ELSE 0`); Postgres drivers may also hand it as bool or text, and all three say
/// the same thing.
fn redeemable_is(row: &Value) -> bool {
    match row.get("redeemable") {
        Some(Value::Bool(b)) => *b,
        Some(Value::Number(n)) => n.as_i64().unwrap_or(0) != 0,
        Some(Value::String(s)) => matches!(s.trim(), "1" | "true" | "t"),
        _ => false,
    }
}

/// Logic of `services.packages.redeem` (services#52).
///
/// The handler runs in a sandbox and cannot read the database, so the host preloads the module's
/// own pre-check (`context.reads["services.packages.redeem_check"]`, parameterized with the
/// payload's `package_id`/`customer_id` and `required` — hub#701: a redemption is money, it does
/// not admit guessing). What the handler adds over the declarative path of before:
///
///   * a refusal NAMES its reason with a stable, namespaced, translatable code —
///     `services.package_no_uses_left` / `services.package_expired` / `services.package_not_found`
///     — instead of the raw CHECK of `services__gate` reaching the API, flows and the assistant;
///   * a redeemable voucher still goes through THE SAME gated statements (`services._redeem`:
///     conditional INSERT + assert + clear), so the gate stays the transactional authority — the
///     read is advisory and the race (another till spends the last use between read and write)
///     still aborts the transaction. The read improves the message; it never replaces the gate.
///
/// Fail-closed: without the read there is nothing to verify against, so the command refuses with
/// the generic `services.package_not_redeemable` rather than proceeding blind.
pub fn redeem_package_pure(input: Value) -> Result<Output, String> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);

    let package_id = str_field(&payload, "package_id").trim().to_string();
    let customer_id = str_field(&payload, "customer_id").trim().to_string();

    // The pre-check's row (the query always answers exactly one). `None` = the read was not
    // preloaded (runtime without `reads` support); an empty array = a broken contract. Both fail
    // closed: without data to verify against, the redemption does not happen.
    let row = input
        .pointer(format!("/context/reads/{READ_REDEEM_CHECK}/0").as_str())
        .cloned()
        .unwrap_or(Value::Null);

    if package_id.is_empty() || customer_id.is_empty() || row.is_null() || !redeemable_is(&row) {
        let reason: String = if row.is_null() { String::new() } else { str_field(&row, "reason") };
        return Ok(Output::new().with_error(refusal_for(&reason)));
    }

    // Redeemable: one intention, three gated statements. The host resolves `services._redeem`
    // (same module), injects the system params (`:hub_id`, `:current_user_id`, `:now`) and runs
    // them in the command's transaction; the `emit` declared in the manifest
    // (`services.package.redeemed`) fires after the commit, which is why the handler emits no
    // event of its own.
    let redemption_id = match new_ids.first().map(as_str) {
        Some(id) if !id.is_empty() => id,
        _ => return Err("context.new_ids is empty: the host did not hand out ids".to_string()),
    };
    let mut p = Map::new();
    p.insert("redemption_id".into(), json!(redemption_id));
    p.insert("package_id".into(), json!(package_id));
    p.insert("customer_id".into(), json!(customer_id));
    p.insert("appointment_id".into(), payload.get("appointment_id").cloned().unwrap_or(Value::Null));
    p.insert("sale_id".into(), payload.get("sale_id").cloned().unwrap_or(Value::Null));
    p.insert("note".into(), json!(str_field(&payload, "note")));

    Ok(Output::new()
        .with_operation(Operation::sql("services._redeem", p.clone()))
        .with_result(json!({
            "redeemed": true,
            "redemption_id": redemption_id,
            "package_id": p["package_id"],
            "customer_id": p["customer_id"],
        })))
}

/// The read the till shows and the handler verifies against (services#70).
const READ_TENDER_OPTIONS: &str = "services.packages.tender_options";

/// Logic of `services.packages.hold_for_line` — the voucher as a TENDER that covers a LINE
/// (services#70, ADR-0386).
///
/// A voucher is N uses of CONCRETE services, not a wallet, so it covers the eligible line whole or
/// not at all. The handler runs in a sandbox and cannot read the database, so the host preloads TWO
/// reads of this module, both `required`:
///
///   * `services.packages.tender_options` — the vouchers that COVER THIS SERVICE and still have a
///     session, already ordered by the tie-break. 🔴 This is the authority on eligibility. The
///     payload says which voucher the cashier picked; whether that voucher may be spent on this
///     line is decided HERE, against the hub's own rows. A handler that took the payload's word
///     for it would let a caller spend a haircut voucher on a bottle of shampoo by asking nicely.
///   * `services.packages.redeem_check` — WHY not, when not: it turns the raw `CHECK constraint
///     failed` of `services__gate` into a stable, namespaced, translatable code before it reaches
///     the API, the flows and the assistant.
///
/// Both are fail-closed: with no read there is nothing to verify against, so nothing is held.
///
/// An eligible voucher goes through the SAME gated statements as before (`services._hold`:
/// conditional INSERT + assert + clear), so the database stays the transactional authority — the
/// reads improve the message, they never replace the gate, and the race between two tills is
/// settled by the unique index on the use ordinal (migration 011), not by this code.
///
/// 🔴 No fiscal document comes out of a redemption. A voucher of N sessions is UNIVALENT: the
/// record was issued when the voucher was SOLD, with the service's VAT, and art. 30 ter.1 of
/// Directive 2006/112/CE says the supply made in exchange for it «shall not be regarded as an
/// independent transaction». A second document here would be double taxation.
pub fn hold_package_for_line_pure(input: Value) -> Result<Output, String> {
    let payload = input.get("payload").cloned().unwrap_or(Value::Null);
    let context = input.get("context").cloned().unwrap_or(Value::Null);
    let empty: Vec<Value> = Vec::new();
    let new_ids = context.get("new_ids").and_then(|v| v.as_array()).unwrap_or(&empty);

    let package_id = str_field(&payload, "package_id").trim().to_string();
    let customer_id = str_field(&payload, "customer_id").trim().to_string();
    let service_id = str_field(&payload, "service_id").trim().to_string();
    let checkout_ref = str_field(&payload, "checkout_ref").trim().to_string();
    let line_ref = str_field(&payload, "line_ref").trim().to_string();

    // A hold that does not say which line it covers cannot be undone or audited later: it would
    // sit in the ledger as a spent session nobody can trace back to a service.
    if package_id.is_empty()
        || customer_id.is_empty()
        || service_id.is_empty()
        || checkout_ref.is_empty()
        || line_ref.is_empty()
    {
        return Ok(Output::new().with_error(refusal_for("")));
    }

    // The eligible vouchers for this line, from the host. `None` = the read was not preloaded
    // (a runtime without `reads` support, or a degraded query): fail closed, do not hold blind.
    let options = match input.pointer(format!("/context/reads/{READ_TENDER_OPTIONS}").as_str()) {
        Some(Value::Array(rows)) => rows.clone(),
        _ => return Ok(Output::new().with_error(refusal_for(""))),
    };
    let chosen = options
        .iter()
        .find(|row| str_field(row, "package_id").trim() == package_id);

    // The pre-check's row. It is required even on the happy path: without it a refusal could not
    // name its reason, and naming the reason is half of what this command is for.
    let check_row = input
        .pointer(format!("/context/reads/{READ_REDEEM_CHECK}/0").as_str())
        .cloned()
        .unwrap_or(Value::Null);
    if check_row.is_null() {
        return Ok(Output::new().with_error(refusal_for("")));
    }

    let chosen = match chosen {
        Some(row) => row,
        None => {
            // Not among the eligible ones. If the pre-check can say why (exhausted, expired,
            // unknown), that is the honest reason. If it says the voucher is perfectly redeemable,
            // then the ONLY thing wrong is that it does not cover this service — which is its own
            // code, because «no uses left» would be a lie the cashier cannot act on.
            let reason = str_field(&check_row, "reason");
            return Ok(Output::new().with_error(if redeemable_is(&check_row) {
                redeem_refusal(
                    "services.package_does_not_cover_service",
                    "This voucher does not cover that service.",
                )
            } else {
                refusal_for(&reason)
            }));
        }
    };

    let redemption_id = match new_ids.first().map(as_str) {
        Some(id) if !id.is_empty() => id,
        _ => return Err("context.new_ids is empty: the host did not hand out ids".to_string()),
    };

    let mut p = Map::new();
    p.insert("redemption_id".into(), json!(redemption_id));
    p.insert("package_id".into(), json!(package_id));
    p.insert("customer_id".into(), json!(customer_id));
    p.insert("service_id".into(), json!(service_id));
    p.insert("checkout_ref".into(), json!(checkout_ref));
    p.insert("line_ref".into(), json!(line_ref));
    p.insert("note".into(), json!(str_field(&payload, "note")));

    Ok(Output::new()
        .with_operation(Operation::sql("services._hold", p.clone()))
        .with_result(json!({
            "held": true,
            "redemption_id": redemption_id,
            "package_id": p["package_id"],
            "customer_id": p["customer_id"],
            "service_id": p["service_id"],
            "package_name": chosen.get("package_name").cloned().unwrap_or(Value::Null),
            // The preview travels back with the confirmation: what the till SHOWED before the
            // cashier confirmed and what it PRINTS afterwards are then the same number, taken
            // from the same read, instead of two counts that can disagree.
            "remaining_before": chosen.get("remaining_before").cloned().unwrap_or(Value::Null),
            "remaining_after": chosen.get("remaining_after").cloned().unwrap_or(Value::Null),
        })))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(payload: Value) -> Value {
        json!({
            "payload": payload,
            "context": {
                "new_ids": ["pkg-1", "li-1", "li-2"],
                // Catálogo de confianza del hub (ADR-0069): el manifest declara la read
                // `services.services.list` en `services.packages.create`.
                "reads": { "services.services.list": [{ "id": "s1" }, { "id": "s2" }] }
            }
        })
    }

    /// Igual que [`input`] pero SIN la read del catálogo: el caso degradado.
    fn input_without_catalogue(payload: Value) -> Value {
        json!({ "payload": payload, "context": { "new_ids": ["pkg-1", "li-1", "li-2"] } })
    }

    fn batch(services: Value) -> Value {
        json!({
            "payload": { "services": services },
            "context": { "new_ids": ["svc-1", "svc-2", "svc-3"] }
        })
    }

    /// services#41 — a service of the batch is born SELLABLE: it carries the fiscal category
    /// `services.services.create` has demanded since services#33. Without it the row lands with
    /// `tax_category_key = NULL` and the sale is refused at the counter.
    #[test]
    fn bulk_created_service_carries_its_tax_category() {
        let out = bulk_create_services_pure(batch(json!([
            { "name": "Cut", "tax_category_key": "standard", "price": 1500 }
        ])));
        assert_eq!(out.operations.len(), 1);
        assert_eq!(out.operations[0].command, "services._insert_service");
        assert_eq!(
            out.operations[0].params["tax_category_key"],
            json!("standard"),
            "the batch must write the fiscal category, not leave it NULL"
        );
    }

    /// Defence in depth behind the schema: an item with no fiscal category is an ITEM error
    /// (the batch keeps going with the rest), never a row saved unsellable.
    #[test]
    fn an_item_without_a_tax_category_is_refused_not_saved_unsellable() {
        let out = bulk_create_services_pure(batch(json!([
            { "name": "No tax" },
            { "name": "Blank tax", "tax_category_key": "  " },
            { "name": "Dye", "tax_category_key": "reduced" }
        ])));
        assert_eq!(out.operations.len(), 1, "only the item that knows how it taxes is saved");
        assert_eq!(out.operations[0].params["name"], json!("Dye"));
        assert_eq!(
            out.operations[0].params["service_id"],
            json!("svc-1"),
            "the id batch is spent on the valid items, in order"
        );
        let errors = out.result["errors"].as_array().unwrap();
        assert_eq!(errors.len(), 2);
        assert_eq!(errors[0]["name"], json!("No tax"));
        assert!(
            errors[0]["error"].as_str().unwrap().contains("tax category"),
            "the reason must name the fiscal category, got {:?}",
            errors[0]["error"]
        );
    }

    /// Devuelve los params del primer op (`services._insert_package`).
    fn header_params(out: &HandlerOutput) -> &Map<String, Value> {
        assert_eq!(out.operations[0].command, "services._insert_package");
        &out.operations[0].params
    }

    #[test]
    fn split_percentage_goes_to_discount_percent_bp() {
        let out = create_package_pure(input(json!({
            "name": "Bono 5 cortes",
            "discount_type": "percentage",
            "discount_percent_bp": 1000,
            "items": [{ "service_id": "s1" }]
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_type"], json!("percentage"));
        assert_eq!(p["discount_percent_bp"], json!(1000));
        assert_eq!(p["discount_amount_cents"], json!(0));
        // ya NO se emite el campo polimórfico legado.
        assert!(p.get("discount_value").is_none());
        assert!(p.get("discount_percent").is_none());
    }

    /// services#55 — the reason the percentage is an integer at all.
    ///
    /// The host binds a JSON number by its VALUE: an integer becomes `i64` (int8), a decimal
    /// becomes `f64` (float8), through the same parameter of the same statement — and sqlx caches
    /// prepared statements by SQL text, so the first payload freezes the type for every later one.
    /// Both are 8 bytes, so the mismatch is not caught at Bind time: the bytes are read as the
    /// other type. What the handler emits therefore has to have ONE shape, always, and an integer
    /// number of basis points is the only shape a percentage can have and keep its decimals.
    #[test]
    fn the_emitted_percentage_is_always_an_integer_never_a_float() {
        for payload in [
            json!({ "name": "A", "discount_type": "percentage", "discount_percent_bp": 1050, "items": [{ "service_id": "s1" }] }),
            json!({ "name": "B", "discount_type": "percentage", "discount_percent_bp": 0, "items": [{ "service_id": "s1" }] }),
            json!({ "name": "C", "discount_type": "percentage", "discount_value": 10.5, "items": [{ "service_id": "s1" }] }),
            json!({ "name": "D", "discount_type": "fixed", "discount_amount_cents": 500, "items": [{ "service_id": "s1" }] }),
        ] {
            let out = create_package_pure(input(payload.clone())).unwrap();
            let emitted = &header_params(&out)["discount_percent_bp"];
            assert!(
                emitted.is_i64(),
                "`{payload}` emitted {emitted}, which the host would bind as float8"
            );
        }
    }

    #[test]
    fn split_fixed_goes_to_amount_cents() {
        let out = create_package_pure(input(json!({
            "name": "Bono fijo",
            "discount_type": "fixed",
            "discount_amount_cents": 1500,
            "items": [{ "service_id": "s1" }]
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_type"], json!("fixed"));
        assert_eq!(p["discount_amount_cents"], json!(1500));
        assert_eq!(p["discount_percent_bp"], json!(0));
    }

    #[test]
    fn legacy_discount_value_percentage_is_migrated() {
        // Caller antiguo: solo manda discount_value (= % porque el tipo es percentage).
        let out = create_package_pure(input(json!({
            "name": "Legado %",
            "discount_type": "percentage",
            "discount_value": 25.0,
            "items": [{ "service_id": "s1" }]
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_percent_bp"], json!(2500));
        assert_eq!(p["discount_amount_cents"], json!(0));
    }

    #[test]
    fn legacy_discount_value_fixed_euros_to_cents() {
        // Caller antiguo: discount_value = 12.50 EUROS con tipo fixed → 1250 céntimos.
        // (Línea incluida desde services#42: un bono sin líneas ya no es un payload legal.)
        let out = create_package_pure(input(json!({
            "name": "Legado fijo",
            "discount_type": "fixed",
            "discount_value": 12.50,
            "items": [{ "service_id": "s1" }]
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_amount_cents"], json!(1250));
        assert_eq!(p["discount_percent_bp"], json!(0));
    }

    #[test]
    fn package_item_quantity_is_fixed_point_10e6() {
        // ADR-0147: la cantidad viaja y se guarda en punto fijo entero escala 10⁶.
        // «2 sesiones» = 2_000_000; ausente = 1 sesión = 1_000_000 (no 1 µ).
        let out = create_package_pure(input(json!({
            "name": "Bono corte+color",
            "discount_type": "percentage",
            "discount_percent_bp": 500,
            "items": [
                { "service_id": "s1", "quantity": 2_000_000 },
                { "service_id": "s2" }
            ]
        })))
        .unwrap();
        assert_eq!(out.operations[1].command, "services._insert_package_item");
        assert_eq!(out.operations[1].params["quantity"], json!(2_000_000));
        assert_eq!(out.operations[2].params["quantity"], json!(1_000_000), "el default es 1 sesión en escala");
    }

    /// services#51 — un `quantity` que no está en la escala 10⁶ NO se reescribe en silencio.
    ///
    /// El síntoma: `quantity: 5` (cinco sesiones, tal como lo escribe un humano, un flujo o el
    /// asistente) salía por el `.max(QUANTITY_SCALE)` convertido en 1_000_000 y el command
    /// respondía `ok`. Un bono de 5 sesiones vendido como 1 es dinero del cliente. El valor es
    /// ambiguo (¿cinco sesiones o cinco millonésimas?), así que se cierra el guard: se rechaza.
    #[test]
    fn a_quantity_below_the_scale_is_rejected_instead_of_being_clamped_to_one_session() {
        for sent in [2_i64, 3, 5, 10, 999_999] {
            let err = create_package_pure(input(json!({
                "name": "Bono 5 cortes",
                "items": [{ "service_id": "s1", "quantity": sent }]
            })))
            .unwrap_err();
            assert!(
                err.contains("services.invalid_quantity"),
                "a quantity of {sent} must be refused with a typed code, got: {err}"
            );
            assert!(
                err.contains("1000000"),
                "the refusal must name the scale so the caller can fix it, got: {err}"
            );
        }
    }

    /// El caller que YA escala no se rompe: sigue habiendo bono de 5 sesiones por API.
    #[test]
    fn five_sessions_on_the_wire_is_five_million() {
        let out = create_package_pure(input(json!({
            "name": "Bono 5 cortes",
            "items": [{ "service_id": "s1", "quantity": 5_000_000 }]
        })))
        .unwrap();
        assert_eq!(out.operations[1].params["quantity"], json!(5_000_000));
    }

    // ── services#42: una línea que no se puede materializar NO se salta en silencio ──────────

    /// El síntoma: `_insert_package_item` es un `INSERT … SELECT` que JOINea el servicio con el
    /// hub del paquete, así que un `service_id` desconocido (o de otro hub) insertaba CERO filas
    /// y nadie lo miraba: el bono se creaba sin esa línea y el command respondía `ok`.
    #[test]
    fn a_line_naming_a_service_outside_the_catalogue_rejects_the_command() {
        let err = create_package_pure(input(json!({
            "name": "Bono con línea fantasma",
            "items": [{ "service_id": "s1" }, { "service_id": "s-from-another-hub" }]
        })))
        .unwrap_err();
        assert!(
            err.contains("s-from-another-hub"),
            "the rejection must name the line that cannot be created, got: {err}"
        );
    }

    /// services#42 — el bono VACÍO no es un payload legal. La schema es la puerta principal
    /// (422 antes de tocar la BD); este guard es la defensa en profundidad de las puertas que
    /// no pasan por ella. Mismo código tipado que `invalid_quantity`: traducible en el catálogo.
    #[test]
    fn an_empty_package_is_refused_with_a_typed_code() {
        for payload in [
            json!({ "name": "Bono vacío", "items": [] }),
            json!({ "name": "Bono sin campo items" }),
        ] {
            let err = create_package_pure(input(payload)).unwrap_err();
            assert!(
                err.contains("services.package_needs_lines"),
                "the empty package must be refused with a typed code, got: {err}"
            );
        }
    }

    /// Las líneas del catálogo del hub sí pasan, y siguen componiendo su operación.
    #[test]
    fn lines_of_the_hub_catalogue_are_accepted() {
        let out = create_package_pure(input(json!({
            "name": "Bono corte+color",
            "items": [{ "service_id": "s1" }, { "service_id": "s2" }]
        })))
        .unwrap();
        assert_eq!(out.operations.len(), 3, "cabecera + dos líneas");
        assert_eq!(out.operations[1].params["service_id"], json!("s1"));
        assert_eq!(out.operations[2].params["service_id"], json!("s2"));
    }

    /// Una línea sin `service_id` tampoco se cae por el sumidero (el schema ya la rechaza; esta
    /// es la segunda puerta).
    #[test]
    fn a_line_without_a_service_rejects_the_command() {
        assert!(create_package_pure(input(json!({
            "name": "Bono vacío por dentro",
            "items": [{ "service_id": "  " }]
        })))
        .is_err());
    }

    /// Fail-CLOSED: si el catálogo no llegó, las líneas no se pueden verificar y el bono no se
    /// crea a medias. Y desde services#42 tampoco existe el bono SIN líneas: un paquete vacío
    /// se rechaza ANTES de mirar el catálogo (no hay nada que verificar porque no hay producto).
    #[test]
    fn without_the_catalogue_lines_cannot_be_verified_and_the_command_is_refused() {
        assert!(create_package_pure(input_without_catalogue(json!({
            "name": "Bono sin catálogo",
            "items": [{ "service_id": "s1" }]
        })))
        .is_err());
        let err = create_package_pure(input_without_catalogue(json!({ "name": "Bono sin líneas" })))
            .unwrap_err();
        assert!(
            err.contains("services.package_needs_lines"),
            "the empty package is refused with its typed code, got: {err}"
        );
    }

    /// El lote de ids del host es finito (256): al agotarse, las líneas de más se descartaban en
    /// silencio. Ahora el command se rechaza — un bono al que le faltan sesiones es un bono mal
    /// vendido.
    #[test]
    fn an_exhausted_id_batch_rejects_the_command_instead_of_dropping_lines() {
        let err = create_package_pure(json!({
            "payload": {
                "name": "Bono largo",
                "items": [{ "service_id": "s1" }, { "service_id": "s2" }]
            },
            "context": {
                "new_ids": ["pkg-1", "li-1"],
                "reads": { "services.services.list": [{ "id": "s1" }, { "id": "s2" }] }
            }
        }))
        .unwrap_err();
        assert!(err.to_lowercase().contains("id"), "got: {err}");
    }

    #[test]
    fn legacy_discount_value_rounds_half_up_like_the_rest_of_the_hub() {
        // Coherencia de modo (ADR-0123 §4): el ÚNICO redondeo del hub es HALF_UP. Sigue vivo para
        // el campo LEGADO, que es el único que puede traer decimales: 12,125 % → 1213 bp (12,13 %),
        // no 1212 (half-even). Los llamantes nuevos mandan basis points y no redondea nadie.
        let out = create_package_pure(input(json!({
            "name": "Bono",
            "discount_type": "percentage",
            "discount_value": 12.125,
            "items": [{ "service_id": "s1" }]
        })))
        .unwrap();
        assert_eq!(header_params(&out)["discount_percent_bp"], json!(1213));
    }

    // ── services#52: a refused redemption says WHY, with a domain code ──────────────────────
    //
    // The symptom: redeeming an exhausted voucher returned the raw gate internals —
    // `db: sqlx: … violates check constraint "services__gate_ok_check"` — to the API, to flows
    // and to the assistant, while the module's own pre-check already knew the reason. The three
    // reasons come out of `context.reads["services.packages.redeem_check"]` as codes; the handler
    // maps them to its namespaced, translatable domain errors.

    /// `{payload, context}` with the pre-check read preloaded, the way the manifest declares it.
    fn redeem_input(read_row: Option<Value>, payload: Value) -> Value {
        let mut ctx = json!({ "new_ids": ["red-1"] });
        if let Some(row) = read_row {
            ctx["reads"] = json!({ "services.packages.redeem_check": [row] });
        }
        json!({ "payload": payload, "context": ctx })
    }

    fn redeem_payload() -> Value {
        json!({ "package_id": "pkg-1", "customer_id": "cus-1" })
    }

    #[test]
    fn an_exhausted_voucher_refuses_with_no_uses_left_not_the_raw_gate() {
        let out = redeem_package_pure(redeem_input(
            Some(json!({ "redeemable": 0, "reason": "no_uses_left" })),
            redeem_payload(),
        ))
        .unwrap();
        let error = out.error.expect("the 6th redemption of a 5-use package must REFUSE");
        assert_eq!(error.code, "services.package_no_uses_left");
        assert!(
            out.operations.is_empty(),
            "a refusal must not carry intentions: nothing persists"
        );
    }

    #[test]
    fn an_expired_voucher_refuses_with_expired() {
        let out = redeem_package_pure(redeem_input(
            Some(json!({ "redeemable": 0, "reason": "expired" })),
            redeem_payload(),
        ))
        .unwrap();
        assert_eq!(
            out.error.expect("an expired voucher must REFUSE").code,
            "services.package_expired"
        );
    }

    #[test]
    fn an_unknown_package_refuses_with_package_not_found() {
        let out = redeem_package_pure(redeem_input(
            Some(json!({ "redeemable": 0, "reason": "package_not_found" })),
            redeem_payload(),
        ))
        .unwrap();
        assert_eq!(
            out.error.expect("an unknown package must REFUSE").code,
            "services.package_not_found"
        );
    }

    /// Acceptance criterion 2 of the issue: no response carries the plumbing's marks.
    #[test]
    fn no_refusal_message_carries_the_gate_internals() {
        for reason in ["no_uses_left", "expired", "package_not_found", "anything-else"] {
            let out = redeem_package_pure(redeem_input(
                Some(json!({ "redeemable": 0, "reason": reason })),
                redeem_payload(),
            ))
            .unwrap();
            let msg = out.error.unwrap().message.to_lowercase();
            for mark in ["sqlx", "services__gate", "check constraint", "db:"] {
                assert!(
                    !msg.contains(mark),
                    "`{reason}` refusal leaks `{mark}`: {msg}"
                );
            }
        }
    }

    /// A reason outside the closed set (or a read that never arrived) is a broken contract, and
    /// the answer to a broken contract is to close the guard — never to proceed blind.
    #[test]
    fn an_unknown_reason_fails_closed_with_the_generic_refusal() {
        let out = redeem_package_pure(redeem_input(
            Some(json!({ "redeemable": 0, "reason": "sevilla" })),
            redeem_payload(),
        ))
        .unwrap();
        assert_eq!(
            out.error.expect("an unmapped reason must still REFUSE").code,
            "services.package_not_redeemable"
        );
    }

    /// A runtime without `reads` support does not preload the check at all. Failing closed turns
    /// the raw-CHECK path into a translated refusal instead of redeeming unverified.
    #[test]
    fn without_the_read_the_redemption_fails_closed_not_blind() {
        let out = redeem_package_pure(redeem_input(None, redeem_payload())).unwrap();
        assert_eq!(
            out.error.expect("no read, no verification, no redemption").code,
            "services.package_not_redeemable"
        );
        assert!(out.operations.is_empty(), "nothing may persist");
    }

    /// The happy path still goes through THE SAME gated statements — the read is advisory, the
    /// gate stays the transactional authority (anti-TOCTOU), so a race at the till still aborts.
    #[test]
    fn a_redeemable_voucher_emits_the_gated_redeem_intention() {
        let out = redeem_package_pure(redeem_input(
            Some(json!({ "redeemable": 1, "reason": "" })),
            json!({
                "package_id": "pkg-1",
                "customer_id": "cus-1",
                "appointment_id": "apt-9",
                "note": "first use"
            }),
        ))
        .unwrap();
        assert!(out.error.is_none());
        assert_eq!(out.operations.len(), 1);
        let op = &out.operations[0];
        assert_eq!(op.command, "services._redeem");
        assert_eq!(op.params["redemption_id"], json!("red-1"), "the host's id batch, front first");
        assert_eq!(op.params["package_id"], json!("pkg-1"));
        assert_eq!(op.params["customer_id"], json!("cus-1"));
        assert_eq!(op.params["appointment_id"], json!("apt-9"));
        assert_eq!(op.params["note"], json!("first use"));
        assert!(op.params["sale_id"].is_null(), "an optional link the caller did not send is NULL, not a string");
        // The caller gets the authoritative id back (hub#70) — appointments links the redemption.
        assert_eq!(out.result.unwrap()["redemption_id"], json!("red-1"));
    }

    /// The flag reaches the handler as an INTEGER (the query's `CASE … THEN 1`), but a driver may
    /// say the same thing as bool or text; all three mean yes.
    #[test]
    fn the_redeemable_flag_is_read_whatever_shape_the_driver_chooses() {
        for shape in [json!(1), json!(true), json!("1")] {
            let out = redeem_package_pure(redeem_input(
                Some(json!({ "redeemable": shape, "reason": "" })),
                redeem_payload(),
            ))
            .unwrap();
            assert!(
                out.error.is_none(),
                "a redeemable voucher in shape {shape} must go through, got {out:?}"
            );
        }
    }

    // ── services#70 · el bono como TENDER que cubre una LÍNEA ────────────────────────────────
    //
    // El handler no puede leer la BD, así que el host le precarga DOS lecturas del propio módulo:
    // `services.packages.tender_options` (los bonos que cubren ESTA línea, ya ordenados) y
    // `services.packages.redeem_check` (por qué NO, si no). El payload dice qué bono quiere gastar
    // el cajero; quién decide si ese bono es elegible son las lecturas. Es la regla de la casa: un
    // handler no se fía del payload para datos de negocio, y que el manifest declare la read no
    // prueba que el handler la use — estos tests son lo que lo prueba.

    fn tender_option(package_id: &str) -> Value {
        json!({
            "package_id": package_id,
            "package_name": "Bono 5 cortes",
            "remaining_before": 5,
            "remaining_after": 4,
            "is_default": 1,
            "default_reason": "only_option",
            "candidate_count": 1
        })
    }

    fn hold_payload() -> Value {
        json!({
            "package_id": "pkg-1",
            "customer_id": "cus-1",
            "service_id": "svc-1",
            "checkout_ref": "order-7",
            "line_ref": "line-1",
            "note": "cobro en caja"
        })
    }

    fn hold_input(options: Option<Value>, check_row: Option<Value>, payload: Value) -> Value {
        let mut reads = Map::new();
        if let Some(rows) = options {
            reads.insert("services.packages.tender_options".into(), rows);
        }
        if let Some(row) = check_row {
            reads.insert(READ_REDEEM_CHECK.into(), json!([row]));
        }
        json!({
            "payload": payload,
            "context": { "new_ids": ["red-1"], "reads": Value::Object(reads) }
        })
    }

    fn eligible_input(payload: Value) -> Value {
        hold_input(
            Some(json!([tender_option("pkg-1")])),
            Some(json!({ "redeemable": 1, "reason": "" })),
            payload,
        )
    }

    #[test]
    fn an_eligible_voucher_holds_the_session_for_that_line() {
        let out = hold_package_for_line_pure(eligible_input(hold_payload())).unwrap();
        assert!(out.error.is_none(), "an eligible voucher must go through, got {out:?}");
        assert_eq!(out.operations.len(), 1);
        let op = &out.operations[0];
        assert_eq!(op.command, "services._hold");
        assert_eq!(op.params["redemption_id"], json!("red-1"), "the host's id batch, front first");
        assert_eq!(op.params["package_id"], json!("pkg-1"));
        assert_eq!(op.params["customer_id"], json!("cus-1"));
        assert_eq!(op.params["service_id"], json!("svc-1"), "which LINE the session covers");
        assert_eq!(op.params["checkout_ref"], json!("order-7"));
        assert_eq!(op.params["line_ref"], json!("line-1"));
        assert_eq!(op.params["note"], json!("cobro en caja"));
        let result = out.result.unwrap();
        assert_eq!(result["redemption_id"], json!("red-1"));
        // The preview travels back with the confirmation, so the till can print «quedan 4»
        // without asking again — and so what was SHOWN and what was SPENT are the same number.
        assert_eq!(result["remaining_after"], json!(4));
    }

    /// 🔴 El corazón de la regla: la elegibilidad la decide la LECTURA, no el payload. Un bono que
    /// existe y tiene sesiones pero NO cubre este servicio no está en `tender_options`, y el
    /// handler lo rechaza aunque el payload insista y aunque `redeem_check` diga que sí.
    #[test]
    fn a_voucher_that_does_not_cover_this_service_is_refused_however_the_payload_insists() {
        let out = hold_package_for_line_pure(hold_input(
            Some(json!([tender_option("pkg-otro")])),
            Some(json!({ "redeemable": 1, "reason": "" })),
            hold_payload(),
        ))
        .unwrap();
        assert_eq!(
            out.error.as_ref().map(|e| e.code.as_str()),
            Some("services.package_does_not_cover_service")
        );
        assert!(out.operations.is_empty(), "nothing is written when the voucher is not eligible");
    }

    /// Sin ningún bono elegible para la línea, y con `redeem_check` explicando por qué, sale el
    /// código de NEGOCIO — no el CHECK crudo del gate.
    #[test]
    fn the_business_reason_survives_all_the_way_to_the_caller() {
        for (reason, code) in [
            ("no_uses_left", "services.package_no_uses_left"),
            ("expired", "services.package_expired"),
            ("package_not_found", "services.package_not_found"),
        ] {
            let out = hold_package_for_line_pure(hold_input(
                Some(json!([])),
                Some(json!({ "redeemable": 0, "reason": reason })),
                hold_payload(),
            ))
            .unwrap();
            assert_eq!(
                out.error.as_ref().map(|e| e.code.as_str()),
                Some(code),
                "reason {reason} must reach the caller as {code}"
            );
        }
    }

    /// Fail-closed, las dos patas: sin lectura no hay nada contra lo que verificar, así que NO se
    /// reserva a ciegas. Es la mitad que un `required: true` en el manifest no demuestra.
    #[test]
    fn without_the_reads_nothing_is_held() {
        for input in [
            hold_input(None, Some(json!({ "redeemable": 1, "reason": "" })), hold_payload()),
            hold_input(Some(json!([tender_option("pkg-1")])), None, hold_payload()),
            hold_input(None, None, hold_payload()),
        ] {
            let out = hold_package_for_line_pure(input).unwrap();
            assert!(out.error.is_some(), "a missing read must refuse, got {out:?}");
            assert!(out.operations.is_empty());
        }
    }

    /// El cobro necesita saber A QUÉ línea se pega la sesión. Sin esas referencias no hay canje
    /// que deshacer ni línea que liberar, y la reserva quedaría huérfana en la tabla.
    #[test]
    fn a_hold_without_its_checkout_and_line_is_refused() {
        for missing in ["service_id", "checkout_ref", "line_ref", "package_id", "customer_id"] {
            let mut payload = hold_payload();
            payload[missing] = json!("");
            let out = hold_package_for_line_pure(eligible_input(payload)).unwrap();
            assert_eq!(
                out.error.as_ref().map(|e| e.code.as_str()),
                Some("services.package_not_redeemable"),
                "an empty {missing} must refuse"
            );
        }
    }

    /// El host es la autoridad de ids. Sin lote no hay id que devolver al caller ni fila que el
    /// assert pueda verificar, así que el command se cae en vez de inventarse uno.
    #[test]
    fn without_an_id_batch_the_hold_cannot_be_written() {
        let mut input = eligible_input(hold_payload());
        input["context"]["new_ids"] = json!([]);
        assert!(hold_package_for_line_pure(input).is_err());
    }
}
