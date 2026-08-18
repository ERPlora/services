#!/usr/bin/env python3
"""services#9 — every public command validates its payload on the SERVER, with a closed contract.

Why: `services` was the worst module of the project in this category (triage 2026-08-09): 10 of 12
public commands had no `schema`, 6 of them reachable through the public REST API with nothing
judging the payload. `services.services.create` persisted `pricing_type = "nonsense"`, negative
prices, negative durations and `max_capacity = 0`. And three commands declared a `validates` block
the runtime never implemented (hub#610) — something that LOOKED like validation and validated
nothing.

What this file proves, statically, against the module's own JSON Schemas (Draft 2020-12, the
dialect the runtime compiles — `crates/runtime/src/registry.rs`):

  1. EVERY public (non `_`) command declares a `schema`, the file exists, and it is CLOSED
     (`additionalProperties: false`) — an unknown key is a typo or an attack, never a no-op.
  2. The dead `validates` key is gone from the manifest (hub#610: the runtime discards it).
  3. A matrix of payloads per command: the minimal legit one is ACCEPTED, and each domain
     violation of the issue is REFUSED — pricing type outside the enum, negative money, duration
     0, capacity 0, percentage > 100, empty batch, unknown key… (`min_price <= max_price` is a
     CROSS-FIELD rule JSON Schema cannot express: it lives in the CHECK constraints —
     `tests/domain_checks.postgres.test.py`.)
  4. The three `update` doors are PARTIAL (hub#632): the manifest declares `records.<x>.patch`
     pointing at a read of this module whose selected columns cover the update's required keys —
     so a caller may send `{service_id, price}` and the runtime completes the rest from the row.

Usage: uv run --with jsonschema tests/schemas.contract.test.py   (exit 0 = green)
       (`jsonschema` is the only dependency; without it the test FAILS loudly, it does not skip —
       a validation test that skips proves nothing.)
"""

import json
import pathlib
import re
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

try:
    from jsonschema import Draft202012Validator
except ImportError:  # pragma: no cover
    print(
        "FAILED — `jsonschema` is not importable. Run: uv run --with jsonschema "
        + sys.argv[0]
    )
    sys.exit(1)

failures: list[str] = []


def fail(msg: str) -> None:
    failures.append(msg)
    print(f"  FAIL: {msg}")


def ok(msg: str) -> None:
    print(f"  ok: {msg}")


# ── 1 + 2. Every public command has a CLOSED schema; `validates` is gone ────────────────────────

print("1. every public command declares a closed JSON Schema")
validators: dict[str, Draft202012Validator] = {}
for name, cmd in MANIFEST["commands"].items():
    if name.split(".")[1].startswith("_"):
        continue
    if "validates" in cmd:
        fail(
            f"{name}: declares the dead `validates` key (hub#610 — the runtime ignores it)"
        )
    rel = cmd.get("schema")
    if not rel:
        fail(f"{name}: no `schema` (expose_api={cmd.get('expose_api', False)})")
        continue
    path = MODULE_DIR / rel
    if not path.is_file():
        fail(f"{name}: schema file {rel} does not exist")
        continue
    schema = json.loads(path.read_text())
    if schema.get("additionalProperties") is not False:
        fail(f"{name}: {rel} is not closed (additionalProperties must be false)")
    for prop, spec in schema.get("properties", {}).items():
        if not re.fullmatch(r"[a-z][a-z0-9_]*", prop):
            fail(f"{name}: property `{prop}` is not snake_case")
    Draft202012Validator.check_schema(schema)
    validators[name] = Draft202012Validator(schema)
if validators:
    ok(f"{len(validators)} public commands carry a schema")


# ── 3. Payload matrix ────────────────────────────────────────────────────────────────────────────


def accepts(name: str, payload: dict, label: str) -> None:
    v = validators.get(name)
    if v is None:
        return  # already reported above
    errors = list(v.iter_errors(payload))
    if errors:
        fail(f"{name} refuses a legit payload ({label}): {errors[0].message}")
    else:
        ok(f"{name} accepts {label}")


def refuses(name: str, payload: dict, label: str) -> None:
    v = validators.get(name)
    if v is None:
        return
    if list(v.iter_errors(payload)):
        ok(f"{name} refuses {label}")
    else:
        fail(f"{name} ACCEPTS {label} — nothing on the server refuses it")


SVC_MIN = {"name": "Haircut", "tax_category_key": "standard"}
SVC_FULL = {
    "name": "Haircut",
    "tax_category_key": "standard",
    "slug": "haircut",
    "description": "",
    "short_description": "",
    "category_id": None,
    "pricing_type": "fixed",
    "price": 1800,
    "cost": 0,
    "duration_minutes": 30,
    "buffer_before": 0,
    "buffer_after": 0,
    "max_capacity": 1,
    "is_bookable": 1,
    "requires_confirmation": 0,
    "allow_online_booking": 1,
    "sort_order": 0,
    "is_featured": 0,
    "sku": "",
    "barcode": "",
    "notes": "",
}

print("\n3a. services.services.create")
C = "services.services.create"
accepts(C, SVC_MIN, "the minimal service (name + tax category)")
accepts(C, SVC_FULL, "the full form the UI sends")
accepts(
    C,
    dict(SVC_MIN, pricing_type="from", min_price=1000, max_price=2000),
    "a `from` price range",
)
refuses(C, dict(SVC_MIN, pricing_type="nonsense"), "pricing_type outside the enum")
refuses(C, dict(SVC_MIN, price=-1), "a negative price")
refuses(C, dict(SVC_MIN, cost=-1), "a negative cost")
refuses(C, dict(SVC_MIN, duration_minutes=0), "duration 0")
refuses(C, dict(SVC_MIN, duration_minutes=-30), "a negative duration")
refuses(C, dict(SVC_MIN, buffer_before=-5), "a negative buffer")
refuses(C, dict(SVC_MIN, max_capacity=0), "capacity 0")
refuses(C, dict(SVC_MIN, is_bookable=2), "a flag that is not 0/1")
refuses(C, dict(SVC_MIN, name=""), "an empty name")
refuses(C, dict(SVC_MIN, slug="Not A Slug"), "a slug with spaces/uppercase")
refuses(C, dict(SVC_MIN, price="1800"), "a price sent as a string")
refuses(C, dict(SVC_MIN, hub_id="other-hub"), "a smuggled hub_id (system param)")
refuses(C, dict(SVC_MIN, foo=1), "an unknown key")

print("\n3b. services.services.update")
U = "services.services.update"
SVC_UPD = {
    "service_id": "s1",
    "name": "Haircut",
    "slug": "haircut",
    "description": "",
    "category_id": None,
    "pricing_type": "fixed",
    "price": 1800,
    "cost": 0,
    "duration_minutes": 30,
    "is_bookable": 1,
    "is_active": 1,
    "sort_order": 0,
    "tax_category_key": "standard",
}
accepts(U, SVC_UPD, "the full snapshot")
refuses(U, dict(SVC_UPD, pricing_type="nonsense"), "pricing_type outside the enum")
refuses(U, dict(SVC_UPD, price=-1), "a negative price")
refuses(U, dict(SVC_UPD, duration_minutes=0), "duration 0")
refuses(U, dict(SVC_UPD, tax_category_key=""), "an emptied tax category")
refuses(
    U,
    {"service_id": "s1"},
    "a payload with only the key (patch merges the rest BEFORE validation; the schema itself demands the snapshot)",
)
refuses(U, dict(SVC_UPD, foo=1), "an unknown key")

print("\n3c. services.services.delete / categories.delete / packages.delete")
accepts("services.services.delete", {"service_id": "s1"}, "the id")
refuses("services.services.delete", {}, "no id")
refuses("services.services.delete", {"service_id": ""}, "an empty id")
refuses(
    "services.services.delete", {"service_id": "s1", "hub_id": "x"}, "a smuggled hub_id"
)
accepts("services.categories.delete", {"category_id": "c1"}, "the id")
refuses("services.categories.delete", {"id": "c1"}, "the wrong key name")
accepts("services.packages.delete", {"package_id": "p1"}, "the id")
refuses("services.packages.delete", {}, "no id")

print("\n3d. services.categories.create / update")
CC = "services.categories.create"
accepts(CC, {"name": "Hair"}, "the minimal category (name only)")
accepts(
    CC,
    {
        "name": "Hair",
        "slug": "hair",
        "description": "",
        "parent_id": None,
        "icon": "",
        "color": "",
        "sort_order": 0,
    },
    "the full snapshot the hub tests send",
)
accepts(
    CC,
    {"name": "Colour", "parent_id": "c1", "color": "#ff8800", "sort_order": 3},
    "a child with a hex colour",
)
refuses(CC, {"name": ""}, "an empty name")
refuses(CC, {"name": "Hair", "sort_order": -1}, "a negative sort order")
refuses(CC, {"name": "Hair", "slug": "Hair Salon"}, "an invalid slug")
refuses(CC, {"name": "Hair", "color": "orange"}, "a colour that is not #rrggbb")
refuses(CC, {"name": "Hair", "unknown": 1}, "an unknown key")
CU = "services.categories.update"
CAT_UPD = {
    "category_id": "c1",
    "name": "Hair",
    "slug": "hair",
    "description": "",
    "parent_id": None,
    "icon": "",
    "color": "",
    "sort_order": 0,
    "is_active": 1,
}
accepts(CU, CAT_UPD, "the full snapshot")
refuses(CU, dict(CAT_UPD, name=""), "an empty name")
refuses(CU, dict(CAT_UPD, is_active=3), "a flag that is not 0/1")
refuses(
    CU,
    {"category_id": "c1"},
    "only the key (patch completes the rest before validation)",
)

print("\n3e. services.packages.create / update")
PC = "services.packages.create"
PKG_MIN = {"name": "Bono 5", "items": [{"service_id": "s1", "quantity": 5000000}]}
accepts(PC, PKG_MIN, "the minimal package")
accepts(
    PC,
    dict(
        PKG_MIN,
        discount_type="percentage",
        discount_percent=10,
        max_uses=5,
        validity_days=90,
    ),
    "a percentage voucher",
)
accepts(
    PC,
    dict(PKG_MIN, discount_type="fixed", discount_amount_cents=500, fixed_price=4000),
    "a fixed-amount package",
)
accepts(
    PC,
    {
        "name": "Legacy",
        "discount_type": "percentage",
        "discount_value": 10.0,
        "max_uses": None,
        "validity_days": None,
        "items": [],
    },
    "the legacy shape the hub e2e still sends (discount_value, empty items)",
)
refuses(PC, dict(PKG_MIN, discount_type="coupon"), "discount_type outside the enum")
refuses(PC, dict(PKG_MIN, discount_percent=150), "a percentage above 100")
refuses(PC, dict(PKG_MIN, discount_percent=-1), "a negative percentage")
refuses(PC, dict(PKG_MIN, discount_amount_cents=-100), "a negative fixed discount")
refuses(PC, dict(PKG_MIN, fixed_price=-1), "a negative fixed price")
refuses(PC, dict(PKG_MIN, max_uses=0), "max_uses 0")
refuses(PC, dict(PKG_MIN, validity_days=0), "validity_days 0")
refuses(
    PC, dict(PKG_MIN, items=[{"service_id": ""}]), "a line with an empty service_id"
)
refuses(
    PC,
    dict(PKG_MIN, items=[{"service_id": "s1", "quantity": 0}]),
    "a line with quantity 0",
)
refuses(
    PC,
    dict(PKG_MIN, items=[{"service_id": "s1", "qty": 1}]),
    "a line with an unknown key",
)
refuses(PC, {"items": [{"service_id": "s1"}]}, "no name")
refuses(PC, dict(PKG_MIN, foo=1), "an unknown key")
PU = "services.packages.update"
PKG_UPD = {
    "package_id": "p1",
    "name": "Bono 5",
    "slug": "bono-5",
    "description": "",
    "discount_type": "percentage",
    "discount_percent": 10,
    "discount_amount_cents": 0,
    "fixed_price": None,
    "validity_days": 90,
    "max_uses": 5,
    "is_active": 1,
    "is_featured": 0,
}
accepts(PU, PKG_UPD, "the full snapshot")
refuses(PU, dict(PKG_UPD, discount_percent=101), "a percentage above 100")
refuses(PU, dict(PKG_UPD, max_uses=-1), "a negative max_uses")
refuses(
    PU,
    {"package_id": "p1"},
    "only the key (patch completes the rest before validation)",
)
refuses(
    PU, dict(PKG_UPD, items=[]), "lines in the update (the update never touches lines)"
)

print("\n3f. services.services.bulk_create")
B = "services.services.bulk_create"
accepts(
    B,
    {
        "services": [
            {"name": "Cut"},
            {"name": "Dye", "price": 4500, "duration_minutes": 90},
        ]
    },
    "a batch of two",
)
refuses(B, {"services": []}, "an empty batch")
refuses(B, {}, "no batch")
refuses(
    B,
    {"services": [{"name": "Cut", "pricing_type": "nonsense"}]},
    "an item with a bad pricing_type",
)
refuses(
    B, {"services": [{"name": "Cut", "price": -1}]}, "an item with a negative price"
)
refuses(
    B, {"services": [{"name": "Cut", "duration_minutes": 0}]}, "an item with duration 0"
)
refuses(
    B, {"services": [{"name": "Cut", "max_capacity": 0}]}, "an item with capacity 0"
)
refuses(B, {"services": [{"name": ""}]}, "an item with an empty name")
refuses(B, {"services": [{"name": "Cut", "foo": 1}]}, "an item with an unknown key")

print("\n3g. services.settings.update keeps its contract")
accepts(
    "services.settings.update", {"default_duration": 45}, "a partial settings payload"
)
refuses(
    "services.settings.update", {"default_duration": -1}, "a negative default duration"
)


# ── 4. Partial updates via `records.<x>.patch` ───────────────────────────────────────────────────

print("\n4. the update doors are partial (records.*.patch)")
records = MANIFEST.get("records", {})
EXPECTED_PATCH = {
    "services.services.update": (
        "services.services.get",
        "service_id",
        "queries/service_get.sql",
    ),
    "services.categories.update": (
        "services.categories.get",
        "category_id",
        "queries/category_get.sql",
    ),
    "services.packages.update": (
        "services.packages.get",
        "package_id",
        "queries/package_get.sql",
    ),
}
by_update = {r.get("update"): r for r in records.values()}
for update, (read, key, read_sql) in EXPECTED_PATCH.items():
    rec = by_update.get(update)
    if not rec:
        fail(f"{update}: no `records` entry names it as the update door")
        continue
    patch = rec.get("patch") or {}
    if (
        rec.get("mutable") is not True
        or patch.get("read") != read
        or patch.get("key") != key
    ):
        fail(
            f"{update}: records entry must be mutable with patch {{read: {read}, key: {key}}}, got {rec}"
        )
        continue
    q = MANIFEST["queries"].get(read)
    if not q or q.get("sql") != read_sql or not (MODULE_DIR / read_sql).is_file():
        fail(
            f"{update}: patch read `{read}` must be a declared query backed by {read_sql}"
        )
        continue
    # The read must SELECT every key the update requires (minus the key itself), otherwise a
    # partial payload can never be completed and the door is not partial at all.
    selected = set(
        re.findall(
            r"\b([a-z_]+)\b", (MODULE_DIR / read_sql).read_text().split("FROM")[0]
        )
    )
    required = set(
        json.loads(
            (MODULE_DIR / MANIFEST["commands"][update]["schema"]).read_text()
        ).get("required", [])
    )
    missing = required - {key} - selected
    if missing:
        fail(
            f"{update}: patch read {read_sql} does not select required keys {sorted(missing)}"
        )
    else:
        ok(f"{update} is a partial door via {read} ({key})")


print()
if failures:
    print(f"FAILED — {len(failures)} point(s):")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
print("PASS — every public command of services validates its payload on the server")
