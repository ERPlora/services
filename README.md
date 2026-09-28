# Módulo `services` — catálogo de servicios, categorías y bonos

Catálogo de lo que se vende cuando lo vendido **no es físico**: precio, **duración**, capacidad y
opciones de reserva. Categorías **jerárquicas** y **paquetes/bonos** con descuento, con **libro de
usos** append-only (`redeem`). Es el catálogo contra el que reserva `appointments`.

> **Module id:** `services`. **Depende de:** `taxes` (instalar services auto-instala taxes,
> ADR-0066/0085). Módulo híbrido: SQL + handler WASM (`bulk_create_services`, `create_package`, `grant_package`, `redeem_package`, `on_sale_completed`).

## Documentación de usuario — [`docs/`](docs/)

Viaja **dentro** del módulo y se versiona con él: el asistente del hub (ADR-0282) la indexa por
versión instalada y cita la de TU versión, no la de la última publicada. En inglés (idioma fuente).

| Fichero | Para qué |
| ------- | -------- |
| [`docs/overview.md`](docs/overview.md) | Qué hace y qué NO hace; qué es un paquete en un párrafo |
| [`docs/screens.md`](docs/screens.md) | Servicios, categorías y paquetes: crear, empaquetar, consultar saldo y canjear |
| [`docs/concepts.md`](docs/concepts.md) | Paquete ≠ **concesión** ≠ canje, **la vigencia arranca en la COMPRA**, `%` y `fixed` son campos DISTINTOS, cantidad de bono en punto fijo 10⁶ |
| [`docs/limits.md`](docs/limits.md) | Huecos conocidos (variantes/addons inalcanzables, borrado sin cascada ni guard de citas), errores y permisos |

## Qué expone hoy

| Tipo | Nombre | Permiso |
| ---- | ------ | ------- |
| query | `services.services.list` / `.get` · `services.settings.get` · `services.catalog.status` | `view_service` |
| query | `services.categories.list` | `view_category` |
| query | `services.packages.list` / `.get` · `services.package_items.list` | `view_package` |
| query | `services.packages.balance` · `.redeem_check` | `view_package_balance` · `redeem_package` |
| command | `services.services.create` (→ `services.category_unavailable`) | `add_service` |
| command | `services.services.update` (→ `services.service_update_rejected`) / `.bulk_create` (WASM) | `change_service` |
| command | `services.services.delete` | `delete_service` |
| command | `services.categories.create` / `.update` / `.delete` | los `*_category` |
| command | `services.packages.create` (WASM) / `.update` / `.delete` | los `*_package` |
| command | `services.packages.grant` (WASM + **gate**) — la COMPRA: quién, qué bono, cuándo, en qué venta y por cuánto | `grant_package` |
| command | `services.packages.redeem` (WASM + **gate**, rechaza con código de dominio: `package_no_grant` / `package_no_uses_left` / `package_expired` / `package_not_found`) | `redeem_package` |
| command | `services.packages.void_grant` (WASM, lee `services.packages.void_check`) — ANULA una concesión vendida por error, con motivo obligatorio; solo si no se ha gastado ni retenido ninguna sesión (services#82). Rechaza con `grant_not_found` / `grant_already_voided` / `grant_in_use` / `grant_void_reason_required` | `void_grant` (admin + manager) |
| query | `services.packages.grants` — bonos VENDIDOS de un bono (paginada), vivos y anulados con su rastro | `view_package_balance` |
| command | `services.settings.update` | `manage_settings` (solo admin) |
| emite | `services.service.*`, `services.package.*` (incl. `services.package.granted` y `.redeemed`) | — |
| escucha | — | — |

Navegación: `erp-services-list` («Services»); ajustes declarativos (ADR-0082).

## Layout

```text
module.json                   # manifest (contrato técnico)
migrations/postgres/          # esquema §2.5 + libro de usos + tabla guardia services__gate
queries/*.sql                 # lecturas declarativas (:hub_id inyectado)
commands/*.sql                # escrituras declarativas (las `_` son intenciones del WASM)
schemas/*.json                # JSON Schemas de input (draft 2020-12)
handler/                      # WASM Tier 2 → dist/handler.wasm
ui/                           # Web Components (Lit/Ionic/OutfitKit)
docs/                         # documentación de usuario + corpus del asistente
```

## Estado y trabajo abierto

El estado vive en las **Issues de este repo**, no aquí. Huecos conocidos y documentados en
`docs/limits.md`: variantes y addons existen en BD **sin query ni command**. Archivar un servicio
con citas próximas **avisa** con el conteo (query pública de `appointments`), no bloquea (services#2).
La **concesión** del bono se escribe aquí al comprarlo (services#73, ADR-0390): el listener de
`sale.completed` concede cada bono que el ticket vendió, y `services.packages.grant` es la puerta
manual. Sin concesión no se gasta una sesión.

Doc de arquitectura: `architecture/modules/services.md` (cargarlo antes de tocar el módulo).
