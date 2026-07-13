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
use rust_decimal::prelude::FromPrimitive;
use rust_decimal::Decimal;
use erplora_guest_sdk::{Event, Operation};
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

// ── helpers de tipos (mismo criterio que el handler de sales) ───────────────

// El DINERO lo redondea `erplora_guest_sdk::money` (ADR-0123): unidad mínima, HALF_UP, uno solo
// para todo el hub. Este módulo tenía su propio `round_cents` (half-even sobre `f64`).

/// Redondeo a 2 decimales half-even — usado para `discount_percent` (el %), que se
/// almacena como REAL (no es céntimos). El importe fijo va por `round_cents` → céntimos.
fn round2(x: f64) -> f64 {
    let scaled = x * 100.0;
    let floor = scaled.floor();
    let diff = scaled - floor;
    let rounded = if (diff - 0.5).abs() < 1e-9 {
        if (floor as i64) % 2 == 0 { floor } else { floor + 1.0 }
    } else {
        scaled.round()
    };
    rounded / 100.0
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
    //   * discount_percent      → REAL  (% cuando discount_type = 'percentage').
    //   * discount_amount_cents → INTEGER céntimos (cuando discount_type = 'fixed').
    // Compat: si el caller aún manda el legado `discount_value` (% o euros según el tipo) y NO
    // las columnas nuevas, lo derivamos al campo tipado que corresponda.
    let legacy_discount_value = parse_decimal(payload.get("discount_value"))
        .map_err(|_| "Invalid discount_value".to_string())?;

    let discount_percent = match parse_decimal(payload.get("discount_percent"))
        .map_err(|_| "Invalid discount_percent".to_string())?
    {
        Some(p) => p,
        None if discount_type == "percentage" => legacy_discount_value.unwrap_or(0.0),
        None => 0.0,
    };

    let discount_amount_cents = match parse_int(payload.get("discount_amount_cents")).ok().flatten()
    {
        Some(c) => c,
        None if discount_type == "fixed" => {
            // legado: discount_value venía en EUROS → a céntimos (×100; round_cents espera
            // el valor ya en el espacio de céntimos, half-even).
            round_cents(legacy_discount_value.unwrap_or(0.0) * 100.0)
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
    // Descuento tipado (migración 004): % → REAL; importe fijo → céntimos (INTEGER).
    h.insert("discount_percent".into(), json!(round2(discount_percent)));
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

    // Líneas: saltar service_id inválido; dedupe (uq_services_packageitem_pkg_svc);
    // quantity = max(1, int); sort_order = índice de entrada.
    let items = payload.get("items").and_then(|v| v.as_array()).unwrap_or(&empty);
    let mut seen: Vec<String> = Vec::new();
    for (idx, item) in items.iter().enumerate() {
        let service_id = str_field(item, "service_id").trim().to_string();
        if service_id.is_empty() || seen.contains(&service_id) {
            continue;
        }
        let item_id = match new_ids.get(1 + seen.len()).map(as_str) {
            Some(id) if !id.is_empty() => id,
            _ => continue, // lote de ids agotado: no añadir más líneas
        };
        seen.push(service_id.clone());

        let quantity = parse_int(item.get("quantity")).ok().flatten().unwrap_or(1).max(1);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn input(payload: Value) -> Value {
        json!({ "payload": payload, "context": { "new_ids": ["pkg-1", "li-1", "li-2"] } })
    }

    /// Devuelve los params del primer op (`services._insert_package`).
    fn header_params(out: &HandlerOutput) -> &Map<String, Value> {
        assert_eq!(out.operations[0].command, "services._insert_package");
        &out.operations[0].params
    }

    #[test]
    fn split_percentage_goes_to_discount_percent() {
        let out = create_package_pure(input(json!({
            "name": "Bono 5 cortes",
            "discount_type": "percentage",
            "discount_percent": 10.0
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_type"], json!("percentage"));
        assert_eq!(p["discount_percent"], json!(10.0));
        assert_eq!(p["discount_amount_cents"], json!(0));
        // ya NO se emite el campo polimórfico legado.
        assert!(p.get("discount_value").is_none());
    }

    #[test]
    fn split_fixed_goes_to_amount_cents() {
        let out = create_package_pure(input(json!({
            "name": "Bono fijo",
            "discount_type": "fixed",
            "discount_amount_cents": 1500
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_type"], json!("fixed"));
        assert_eq!(p["discount_amount_cents"], json!(1500));
        assert_eq!(p["discount_percent"], json!(0.0));
    }

    #[test]
    fn legacy_discount_value_percentage_is_migrated() {
        // Caller antiguo: solo manda discount_value (= % porque el tipo es percentage).
        let out = create_package_pure(input(json!({
            "name": "Legado %",
            "discount_type": "percentage",
            "discount_value": 25.0
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_percent"], json!(25.0));
        assert_eq!(p["discount_amount_cents"], json!(0));
    }

    #[test]
    fn legacy_discount_value_fixed_euros_to_cents() {
        // Caller antiguo: discount_value = 12.50 EUROS con tipo fixed → 1250 céntimos.
        let out = create_package_pure(input(json!({
            "name": "Legado fijo",
            "discount_type": "fixed",
            "discount_value": 12.50
        })))
        .unwrap();
        let p = header_params(&out);
        assert_eq!(p["discount_amount_cents"], json!(1250));
        assert_eq!(p["discount_percent"], json!(0.0));
    }
}
