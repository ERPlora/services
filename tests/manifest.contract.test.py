#!/usr/bin/env python3
"""Manifest contract test (services#26) — `module.json` must parse the way the RUNTIME parses it.

Why this file exists: since hub#369 the `setup` block is no longer something the Hub merely
transports to the shell. `crates/runtime/src/manifest.rs` deserializes it into `SetupDef`, and
`Manifest::load` is the FIRST thing `installer::install` does — so a wrong JSON type in `setup`
does not degrade a feature, it CLOSES THE DOOR: the published module cannot be installed on ANY
hub. That is not theory; it happened to `tables` (tables#28) with a boolean where a string enum
belonged. Nothing in a module repo notices, because `erplora validate` re-implements a subset of
the JSON Schema by hand instead of applying it — and it does not look at `setup` at all.

Four layers, all in this one file, no services needed:

  1. TYPE CONTRACT (always, zero dependencies). Mirrors the serde model of
     `hub/crates/runtime/src/manifest.rs`: every block declared here must carry the JSON type the
     runtime deserializes it into.

  2. THE `setup` BLOCK (services#26 / ADR-0222, contract in `architecture/hub/setup-status.md`).
     Beyond the types: the query must belong to this module and be declared, every
     `configured_when` field must be something that query actually selects, the route must point
     at a screen this manifest declares, the permission must be one this module owns, and the
     `key` must NOT be declared (the core derives it as `<module_id>.setup`).

  3. CANONICAL JSON SCHEMA (when reachable). If `jsonschema` is importable and a hub checkout is
     at hand (`ERPLORA_MODULE_SCHEMA`, or the sibling checkout of the dev workspace), the manifest
     is validated against `hub/schemas/module.schema.json` ITSELF — the source of truth, no
     re-implementation, no drift. Unreachable, or older than the contract under test, is reported
     as SKIPPED — never as a pass, and never as a false red.

  4. DECLARED FILES EXIST. Every path the manifest points at (migrations, seed, query/command SQL,
     JSON Schemas, the WASM handler, the UI bundle) must be in the package.

The other half of services#26 — that the declared query really RETURNS the field, against a real
Postgres with real rows — is `tests/setup.postgres.test.py`. Static text cannot answer that.

Usage: tests/manifest.contract.test.py   (exit 0 = green)
"""

import json
import os
import pathlib
import re
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST_PATH = MODULE_DIR / "module.json"

# Dialects the runtime knows about (`struct Migrations`).
SQL_DIALECTS = ("sqlite", "postgres")

# `enum CatchUp` in hub/crates/runtime/src/manifest.rs. A boolean is not a member of this enum
# (tables#28). This module declares no scheduled task today; the guard costs nothing and the day
# it declares one, the trap is already covered.
CATCH_UP_VALUES = ("collapse", "skip")

# The slot the CORE reserved for this module in the onboarding checklist. The scale belongs to the
# core (`architecture/hub/setup-status.md` §6): "your catalogue" is position 30, shared by two
# modules — `inventory` takes 30, `services` takes 31. It is not ours to choose, so it is asserted
# rather than left to whoever edits the manifest next.
SETUP_ORDER = 31

# Top-level blocks of the contract. The canonical schema declares `additionalProperties: false`;
# here an unknown key is only a warning, so that a manifest using a block newer than this list does
# not turn red for no reason (layer 3 is the strict one).
KNOWN_TOP_LEVEL = {
    "id",
    "name",
    "version",
    "description",
    "depends_on",
    "permissions",
    "role_permissions",
    "roles",
    "navigation",
    "migrations",
    "seed",
    "queries",
    "commands",
    "events",
    "agent",
    "ai_context",
    "scheduled_tasks",
    "widgets",
    "settings",
    "static_files",
    "provides_slots",
    "ui",
    "notify",
    "network",
    "capabilities",
    "setup",
}

# Keys of `SetupDef`. `key` is deliberately NOT one of them: the core derives it as
# `<module_id>.setup` so that a manifest cannot rename itself out of the core-owned blocking list.
SETUP_KEYS = {
    "query",
    "params",
    "configured_when",
    "title",
    "description",
    "icon",
    "route",
    "permission",
    "countries",
    "order",
    "required",
}

JSON_TYPE_NAME = {
    bool: "boolean",
    int: "number",
    float: "number",
    str: "string",
    list: "array",
    dict: "object",
    type(None): "null",
}

failures: list[str] = []
warnings: list[str] = []
notes: list[str] = []


def type_name(value) -> str:
    return JSON_TYPE_NAME.get(type(value), type(value).__name__)


def expect(path: str, value, kind, enum: tuple | None = None) -> bool:
    """Assert the JSON type of `value`. `True`/`False` never pass as a number or a string:
    in Python `bool` is a subclass of `int`, in JSON it is a type of its own — and confusing the
    two is exactly the bug this file guards against."""
    ok = isinstance(value, kind) and not (isinstance(value, bool) and kind is not bool)
    if not ok:
        failures.append(
            f"{path}: expected {kind.__name__}, got {type_name(value)} ({value!r})"
        )
        return False
    if enum is not None and value not in enum:
        failures.append(f"{path}: {value!r} is not one of {list(enum)}")
        return False
    return True


def field(
    path: str,
    obj: dict,
    key: str,
    kind,
    required: bool = False,
    enum: tuple | None = None,
):
    """Check one key of an object. Absent (or `null`, which serde reads as `None` for an
    `Option<T>`) is fine unless the field is required."""
    if key not in obj or obj[key] is None:
        if required:
            failures.append(f"{path}.{key}: missing, and the runtime requires it")
        return None
    expect(f"{path}.{key}", obj[key], kind, enum)
    return obj[key]


def string_array(path: str, value) -> None:
    if not expect(path, value, list):
        return
    for i, item in enumerate(value):
        expect(f"{path}[{i}]", item, str)


# ── Layer 1: the type contract, mirroring `struct Manifest` ──────────────────────────────


def check_identity(m: dict) -> None:
    field("", m, "id", str, required=True)
    field("", m, "name", str, required=True)
    field("", m, "version", str, required=True)
    field("", m, "description", str)

    if m.get("id") != MODULE_DIR.name:
        failures.append(
            f"id: {m.get('id')!r} does not match the module folder {MODULE_DIR.name!r}"
        )

    # The release bot bumps module.json and package.json together; a mismatch means a half-applied
    # release, and the marketplace publishes whatever module.json says.
    pkg_path = MODULE_DIR / "package.json"
    if pkg_path.exists():
        pkg_version = json.loads(pkg_path.read_text()).get("version")
        if pkg_version != m.get("version"):
            failures.append(
                f"version: module.json says {m.get('version')!r}, package.json says {pkg_version!r}"
            )


def check_permissions(m: dict) -> None:
    string_array("depends_on", m.get("depends_on", []))
    string_array("permissions", m.get("permissions", []))

    roles = m.get("role_permissions", {})
    if expect("role_permissions", roles, dict):
        for role, perms in roles.items():
            string_array(f"role_permissions.{role}", perms)


def check_navigation(m: dict) -> None:
    nav = m.get("navigation", [])
    if not expect("navigation", nav, list):
        return
    for i, entry in enumerate(nav):
        path = f"navigation[{i}]"
        if not expect(path, entry, dict):
            continue
        field(path, entry, "id", str, required=True)
        field(path, entry, "label", str, required=True)
        field(path, entry, "component", str, required=True)
        field(path, entry, "icon", str)
    check_navigation_views(nav)


# The three views of the catalogue (services#4, ADR-0022): Services, Categories, Packages. Each
# entry names a Web Component that really lives in `ui/components/` (a `navigation` entry whose
# component nobody defines is a menu item that opens an empty screen), and has its label in BOTH
# locales (`navigation.<id>.label`, ADR-0055 — English source + Spanish).
REQUIRED_VIEWS = {
    "services": "erp-services-list",
    "categories": "erp-services-categories",
    "packages": "erp-services-packages",
}


def check_navigation_views(nav: list) -> None:
    by_id = {e.get("id"): e for e in nav if isinstance(e, dict)}
    for view_id, component in REQUIRED_VIEWS.items():
        entry = by_id.get(view_id)
        if entry is None:
            failures.append(f"navigation: view {view_id!r} ({component}) is not declared")
            continue
        if entry.get("component") != component:
            failures.append(f"navigation[{view_id}].component is {entry.get('component')!r}, expected {component!r}")
        src = MODULE_DIR / "ui" / "components" / component / f"{component}.ts"
        if not src.exists():
            failures.append(f"navigation[{view_id}]: {src.relative_to(MODULE_DIR)} does not exist — the menu would open nothing")
        elif f"define('{component}'" not in src.read_text():
            failures.append(f"{src.relative_to(MODULE_DIR)}: does not `define('{component}', …)`")
        for lang in ("en", "es"):
            catalog = json.loads((MODULE_DIR / "locales" / f"{lang}.json").read_text())
            label = ((catalog.get("navigation") or {}).get(view_id) or {}).get("label")
            if not isinstance(label, str) or not label.strip():
                failures.append(f"locales/{lang}.json: navigation.{view_id}.label is missing")


def check_sql_blocks(m: dict) -> None:
    for block in ("migrations", "seed"):
        value = m.get(block, {})
        if not expect(block, value, dict):
            continue
        for dialect, files in value.items():
            if dialect not in SQL_DIALECTS:
                failures.append(f"{block}.{dialect}: unknown SQL dialect {dialect!r}")
                continue
            string_array(f"{block}.{dialect}", files)

    queries = m.get("queries", {})
    if expect("queries", queries, dict):
        for name, q in queries.items():
            path = f"queries.{name}"
            if not expect(path, q, dict):
                continue
            field(path, q, "permission", str, required=True)
            field(path, q, "sql", str, required=True)
            field(path, q, "schema", str)
            field(path, q, "expose_api", bool)
            if "list" in q and expect(f"{path}.list", q["list"], dict):
                spec = q["list"]
                string_array(f"{path}.list.search", spec.get("search", []))
                string_array(f"{path}.list.sort", spec.get("sort", []))
                field(f"{path}.list", spec, "default_sort", str)
                field(f"{path}.list", spec, "default_dir", str)
                field(f"{path}.list", spec, "page_size", int)

    commands = m.get("commands", {})
    if expect("commands", commands, dict):
        for name, c in commands.items():
            path = f"commands.{name}"
            if not expect(path, c, dict):
                continue
            field(path, c, "permission", str, required=True)
            field(path, c, "schema", str)
            field(path, c, "transaction", bool)
            field(path, c, "expose_api", bool)
            string_array(f"{path}.sql", c.get("sql", []))
            string_array(f"{path}.emit", c.get("emit", []))
            if "handler" in c and expect(f"{path}.handler", c["handler"], dict):
                h = c["handler"]
                field(f"{path}.handler", h, "type", str, required=True)
                field(f"{path}.handler", h, "file", str, required=True)
                field(f"{path}.handler", h, "function", str, required=True)


def check_scheduled_tasks(m: dict) -> None:
    tasks = m.get("scheduled_tasks", [])
    if not expect("scheduled_tasks", tasks, list):
        return
    for i, task in enumerate(tasks):
        path = f"scheduled_tasks[{i}]"
        if not expect(path, task, dict):
            continue
        field(path, task, "name", str, required=True)
        field(path, task, "command", str, required=True)
        field(path, task, "cron", str, required=True)
        if "catch_up" in task:
            if isinstance(task["catch_up"], bool):
                failures.append(
                    f"{path}.catch_up: {task['catch_up']!r} is a boolean — the contract is the "
                    f"string enum {list(CATCH_UP_VALUES)} (ADR-0011)."
                )
            else:
                expect(f"{path}.catch_up", task["catch_up"], str, CATCH_UP_VALUES)


def check_unknown_top_level(m: dict) -> None:
    for key in sorted(set(m) - KNOWN_TOP_LEVEL):
        warnings.append(
            f"{key}: not a block this test knows about — the canonical schema declares "
            f"`additionalProperties: false`, so either it is a typo or this list is stale"
        )


# ── Layer 2: the `setup` block (services#26) ─────────────────────────────────────────────

# Columns a SELECT exposes: `... AS alias` or a bare `table.column` / `column`. Good enough to
# catch a typo in `configured_when.field`, which is the failure this guards; the real answer —
# does the query return it, with a real row — is `tests/setup.postgres.test.py`.
SQL_ALIAS = re.compile(r"\bAS\s+([a-z_][a-z0-9_]*)", re.IGNORECASE)
SQL_WORD = re.compile(r"[a-z_][a-z0-9_]*", re.IGNORECASE)


def check_setup(m: dict) -> None:
    """The block hub#369 turned from transport into contract.

    A module with no `setup` contributes no item to `hub.setup.status`, and that is exactly the
    hole services#26 closes: a hub whose catalogue is empty must be told so, on the checklist, and
    the only one who can say what "an empty catalogue" means is this module.
    """
    setup = m.get("setup")
    if setup is None:
        failures.append(
            "setup: missing — services#26. Without it this module contributes no item to "
            "`hub.setup.status`, so 'your catalogue' (slot 31) never appears on the onboarding "
            "checklist. Contract: architecture/hub/setup-status.md §6."
        )
        return
    if not expect("setup", setup, dict):
        return

    for key in sorted(set(setup) - SETUP_KEYS):
        if key == "key":
            failures.append(
                "setup.key: must NOT be declared — the core derives it as `<module_id>.setup` "
                "precisely so a manifest cannot rename itself out of the core-owned ⛔ list."
            )
        else:
            failures.append(
                f"setup.{key}: unknown field ({SETUP_KEYS} is the whole of `SetupDef`)"
            )

    query = field("setup", setup, "query", str, required=True)
    title = field("setup", setup, "title", str, required=True)
    route = field("setup", setup, "route", str, required=True)
    field("setup", setup, "description", str)
    field("setup", setup, "icon", str)
    field("setup", setup, "params", dict)
    field("setup", setup, "required", bool)
    field("setup", setup, "order", int)
    permission = field("setup", setup, "permission", str)

    # `required` maps to 🔴 functional / 🟡 recommended and NEVER to ⛔: that list is core-owned, so
    # a module cannot proclaim itself a blocker of the sale.
    for forbidden in ("level", "blocking"):
        if forbidden in setup:
            failures.append(
                f"setup.{forbidden}: the level is the core's to decide. A module declares "
                f"`required` (🔴/🟡) and nothing else."
            )

    # ── the query is ours, is declared, and returns what we evaluate ──
    module_id = m.get("id", "")
    queries = m.get("queries", {})
    query_sql = ""
    if isinstance(query, str):
        if not query.startswith(f"{module_id}."):
            failures.append(
                f"setup.query: {query!r} does not belong to this module — the check must be a read "
                f"of `{module_id}` itself."
            )
        qdef = queries.get(query)
        if qdef is None:
            failures.append(f"setup.query: {query!r} is not declared in `queries`")
        elif isinstance(qdef, dict) and isinstance(qdef.get("sql"), str):
            path = MODULE_DIR / qdef["sql"]
            query_sql = path.read_text() if path.exists() else ""
            # A `list` block turns the query into a paginated one. `setup` evaluates the FIRST row
            # of the answer, so a status check must be a query that returns exactly one row and
            # answers one question — not the first page of a catalogue.
            if "list" in qdef:
                failures.append(
                    f"setup.query: {query!r} declares a `list` block — the setup check reads ONE "
                    f"row, so it must not be a paginated list query."
                )

    checks = setup.get("configured_when")
    if not expect("setup.configured_when", checks, list):
        return
    if not checks:
        failures.append(
            "setup.configured_when: empty means 'having a row is the whole condition'. For a "
            "catalogue that is never true: the status query answers with a row even when the "
            "catalogue is empty."
        )
    selected = {a.lower() for a in SQL_ALIAS.findall(query_sql)}
    words = {w.lower() for w in SQL_WORD.findall(query_sql)}
    for i, chk in enumerate(checks):
        path = f"setup.configured_when[{i}]"
        if not expect(path, chk, dict):
            continue
        for key in sorted(set(chk) - {"field", "truthy", "equals"}):
            failures.append(f"{path}.{key}: unknown field in a check")
        name = field(path, chk, "field", str, required=True)
        has_truthy, has_equals = "truthy" in chk, "equals" in chk
        if has_truthy and has_equals:
            failures.append(
                f"{path}: declares both `truthy` and `equals` — exactly one is allowed"
            )
        elif not has_truthy and not has_equals:
            # `passes()` returns false for a check with neither, forever: the item could never be
            # ticked as done, and nothing would say why.
            failures.append(
                f"{path}: declares neither `truthy` nor `equals`, so the check can NEVER pass and "
                f"the item stays pending forever."
            )
        if has_truthy:
            expect(f"{path}.truthy", chk["truthy"], bool)
        if isinstance(name, str) and query_sql:
            if name.lower() not in selected and name.lower() not in words:
                failures.append(
                    f"{path}.field: {name!r} is not selected by `{query}` — the check would read "
                    f"a missing column, which is silently 'not configured' forever."
                )

    # ── the route is a screen this manifest actually declares ──
    if isinstance(route, str):
        nav_ids = {e.get("id") for e in m.get("navigation", []) if isinstance(e, dict)}
        prefix = f"/m/{module_id}"
        if route == prefix or route.startswith("/settings"):
            pass  # module root (first tab) or the hub's settings screen
        elif route.startswith(f"{prefix}/"):
            nav_id = route[len(prefix) + 1 :].split("/")[0]
            if nav_id not in nav_ids:
                failures.append(
                    f"setup.route: {route!r} points at nav id {nav_id!r}, which is not in "
                    f"`navigation[]` — a checklist item that leads to a dead route is worse than "
                    f"no item at all."
                )
        else:
            failures.append(
                f"setup.route: {route!r} is not a route of this module ({prefix}/…)"
            )

    # ── the permission is the one to CONFIGURE, and this module owns it ──
    declared = set(m.get("permissions", []))
    if permission:
        if permission not in declared:
            failures.append(
                f"setup.permission: {permission!r} is not declared in `permissions`"
            )
        if ".view_" in permission:
            failures.append(
                f"setup.permission: {permission!r} is a READ permission. The setup permission is "
                f"the one to CONFIGURE: whoever only looks must not be handed a task they cannot "
                f"complete."
            )
    else:
        failures.append(
            "setup.permission: missing — without it every session gets the item, including the "
            "cashier who cannot create a service."
        )

    # ── the slot belongs to the core ──
    if setup.get("order") != SETUP_ORDER:
        failures.append(
            f"setup.order: {setup.get('order')!r} — the core reserved slot {SETUP_ORDER} for this "
            f"module (see the table in architecture/hub/setup-status.md §6). The scale is not "
            f"ours to pick."
        )

    # ── English canonical + its translation (ADR-0055) ──
    if isinstance(title, str) and not title.strip():
        failures.append("setup.title: empty")
    for lang in ("en", "es"):
        path = MODULE_DIR / "locales" / f"{lang}.json"
        if not path.exists():
            failures.append(f"locales/{lang}.json: missing")
            continue
        block = json.loads(path.read_text()).get("setup")
        if not isinstance(block, dict) or not block.get("title"):
            failures.append(
                f"locales/{lang}.json: no `setup.title`. The manifest carries the English "
                f"fallback; every visible string ships with its translation (ADR-0055)."
            )
            continue
        if lang == "en" and block.get("title") != title:
            failures.append(
                f"locales/en.json: `setup.title` is {block.get('title')!r} but the manifest says "
                f"{title!r} — English is the SOURCE, the two cannot disagree."
            )
        if lang == "es" and block.get("title") == title:
            warnings.append(
                "locales/es.json: `setup.title` is identical to the English one"
            )


# ── Layer 3: the canonical JSON Schema, when it is reachable ─────────────────────────────


def canonical_schema_path() -> pathlib.Path | None:
    override = os.environ.get("ERPLORA_MODULE_SCHEMA")
    if override:
        return pathlib.Path(override)
    # Dev workspace layout: <root>/modules-workspace/modules/<id>/ next to <root>/hub/.
    sibling = MODULE_DIR.parents[2] / "hub" / "schemas" / "module.schema.json"
    return sibling if sibling.exists() else None


def check_against_canonical_schema(m: dict) -> None:
    try:
        import jsonschema
    except ImportError:
        notes.append(
            "SKIPPED canonical schema: `jsonschema` is not installed (pip install jsonschema)"
        )
        return

    path = canonical_schema_path()
    if path is None or not path.exists():
        notes.append(
            "SKIPPED canonical schema: hub/schemas/module.schema.json not found "
            "(set ERPLORA_MODULE_SCHEMA to point at it)"
        )
        return

    schema = json.loads(path.read_text())
    # A hub checkout parked on a branch older than hub#369 has a `setup` block without `countries`
    # and `order`, and it declares `additionalProperties: false` — so it would fail a manifest that
    # is CORRECT against the contract in force. A stale source of truth is not a source of truth:
    # report it, do not turn red on it, and do not pass silently either.
    setup_props = schema.get("properties", {}).get("setup", {}).get("properties", {})
    if not {"countries", "order"} <= set(setup_props):
        notes.append(
            f"SKIPPED canonical schema: {path} predates hub#369 (no `setup.countries`/`setup.order`). "
            f"Update the hub checkout, or point ERPLORA_MODULE_SCHEMA at a current copy."
        )
        return

    validator = jsonschema.Draft202012Validator(schema)
    notes.append(f"canonical schema applied: {path}")
    for err in sorted(validator.iter_errors(m), key=lambda e: list(e.absolute_path)):
        where = "/".join(str(p) for p in err.absolute_path) or "<root>"
        failures.append(f"[schema] {where}: {err.message}")


# ── Layer 4: everything the manifest points at is in the package ─────────────────────────


def check_declared_files_exist(m: dict) -> None:
    declared: list[tuple[str, str]] = []

    for block in ("migrations", "seed"):
        for dialect, files in (m.get(block) or {}).items():
            if isinstance(files, list):
                declared += [
                    (f"{block}.{dialect}", f) for f in files if isinstance(f, str)
                ]

    for name, q in (m.get("queries") or {}).items():
        for key in ("sql", "schema"):
            if isinstance(q, dict) and isinstance(q.get(key), str):
                declared.append((f"queries.{name}.{key}", q[key]))

    for name, c in (m.get("commands") or {}).items():
        if not isinstance(c, dict):
            continue
        for rel in c.get("sql") or []:
            if isinstance(rel, str):
                declared.append((f"commands.{name}.sql", rel))
        if isinstance(c.get("schema"), str):
            declared.append((f"commands.{name}.schema", c["schema"]))
        handler = c.get("handler")
        if isinstance(handler, dict) and isinstance(handler.get("file"), str):
            declared.append((f"commands.{name}.handler.file", handler["file"]))

    if isinstance(m.get("ui"), dict) and isinstance(m["ui"].get("entry"), str):
        declared.append(("ui.entry", m["ui"]["entry"]))
    if isinstance(m.get("settings"), dict) and isinstance(
        m["settings"].get("schema"), str
    ):
        declared.append(("settings.schema", m["settings"]["schema"]))

    for where, rel in declared:
        if not (MODULE_DIR / rel).exists():
            failures.append(f"{where}: declares `{rel}`, which is not in the package")


# ── Runner ───────────────────────────────────────────────────────────────────────────────


def main() -> int:
    raw = MANIFEST_PATH.read_text()
    try:
        manifest = json.loads(raw)
    except json.JSONDecodeError as exc:
        print(f"FAILED — module.json is not valid JSON: {exc}")
        return 1

    check_identity(manifest)
    check_permissions(manifest)
    check_navigation(manifest)
    check_sql_blocks(manifest)
    check_scheduled_tasks(manifest)
    check_setup(manifest)
    check_unknown_top_level(manifest)
    check_against_canonical_schema(manifest)
    check_declared_files_exist(manifest)

    for note in notes:
        print(f"  · {note}")
    for warning in warnings:
        print(f"  ! {warning}")
    print()

    if failures:
        print(f"FAILED — {len(failures)} contract violation(s) in module.json:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(
        f"PASS — module.json v{manifest.get('version')} parses the way the runtime parses it"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
