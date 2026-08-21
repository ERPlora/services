#!/usr/bin/env python3
"""services#50 / services#55 — every bound parameter has ONE type, and it is the one the runtime sends.

WHY THIS FILE EXISTS. `services.services.create` refused the very payload its own screen sends:

    db: sqlx: error returned from database: incorrect binary data format in bind parameter 12

`bind parameter 12` is `:cost`. Nothing was wrong with the value — the failure is in the TYPE of
the slot it landed in, and it is a property of the statement, not of the caller:

  * The runtime binds every JSON integer as Rust `i64`, i.e. Postgres `int8` — always, for every
    parameter (`build_query!`, crates/db/src/lib.rs). A parameter the payload OMITS is bound as
    `DynNull`, whose Parse OID is 0: "server, infer this one from context".
  * `COALESCE(:cost, 0)` gives that inference an `int4` literal to work from, so an omitted `:cost`
    pins the slot to `int4` — while a supplied `:cost` declares `int8`. The same statement text
    therefore has TWO different parameter shapes depending on the payload.
  * sqlx's prepared-statement cache is keyed by the SQL TEXT ALONE and never re-Parses. Whichever
    payload prepares the statement first on a pooled connection pins the types for every later call
    on that connection. Prepare with a minimal payload → `:cost` is `int4` → the next caller that
    actually sends a cost pushes 8 bytes of `int8` into a 4-byte slot → *incorrect binary data
    format*. Prepare with the full payload first → everything works, forever. That is the
    intermittency reported in the issue: it is a lottery on which connection served the first call.

So the fix is not a value fix, it is a contract: the STATEMENT must pin the type, so that what
Postgres infers is what the runtime sends no matter who calls first. `CAST(:p AS BIGINT)` does
that — it is already the house idiom (customers/commands/record_purchase.sql).

WHAT IS CHECKED. Every statement of the manifest is PREPAREd against a real Postgres built from
this module's own migrations, and the types Postgres reports in `pg_prepared_statements` must all
be types the runtime can send: `text` (String), `bigint` (i64) or `double precision` (f64). An
`integer`/`smallint`/`real` slot is not a style problem — it is the bug above, armed and waiting
for the first caller that omits the field.

The second half runs `services.services.create` for real: the literal payload of the screen ten
times in a row, and each of the five parameters that blew up with 0 / 1 / 500. That half proves the
statement accepts the values and writes the right row; it CANNOT reproduce the binary-format
failure, because this harness binds literals instead of speaking the extended protocol. The type
check above is the half that would have caught it.

services#55 added the second half, and it is the one that does not need a database: no declarative
command may declare a bound field as `number`, because a `number` has TWO shapes on the wire. That
check runs first, container or no container, and the reasoning is written above `ALLOWED`'s grave.

Usage: tests/bind_types.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import sys

from pg_harness import HUB, MANIFEST, MODULE_DIR, ScratchDb, container_available

# The types the runtime is able to put on the wire (crates/db/src/lib.rs, `build_query!`):
# String → text, i64 → bigint, f64 → double precision. Anything else is a slot no caller can fill.
BINDABLE = {"text", "bigint", "double precision"}

# services#55 — the OTHER half of the same contract, and the one no SQL cast can fix.
#
# The runtime picks the bind type from the VALUE, not from the schema: `10` is an `i64` (int8) and
# `10.5` an `f64` (float8), through the same slot. A `"type": "number"` field therefore gives one
# statement TWO parameter shapes, and the cache above (keyed by SQL text) freezes whichever came
# first. Both are 8 bytes, so nothing can notice at Bind time — the bytes are simply read as the
# other type. Measured against a real Postgres 18, on `discount_percent REAL` + its CHECK:
#
#     prepared float8, then the integer 10   → 22003 "value out of range: underflow"
#     prepared float8, then the integer 0    → stores 0 (right, by luck: 8 zero bytes are 0.0 too)
#     prepared int8,   then the decimal 10.5 → 23514, the 0..100 CHECK (the bytes read 4.6e18)
#
# and the same two on a `DOUBLE PRECISION` column with no CHECK — which is what a well-meant
# `CAST(:discount_percent AS DOUBLE PRECISION)` would create — store `5e-323` and `4.6e18`
# WITHOUT A WORD. The loud version is the accident, not the design.
#
# So the rule is about the payload contract, and it is mechanical: a command whose SQL binds a
# parameter may not declare that parameter as `number`. Only `integer` (always i64) and `string`
# (always text) have a single shape on the wire. A percentage that needs decimals is expressed as
# an integer with a fixed scale — `discount_percent_bp`, basis points — which is the escape hatch
# the money contract already names (`unit_price_micros`, §1), not a float in disguise.
#
# A `number` behind a WASM HANDLER is fine and is not checked here: the handler emits the params,
# so it is the one that pins the type (`create_package` rounds to `f64`, always float8).


def number_slots_bound_by_sql() -> list[str]:
    """Schema fields typed `number` that a declarative command binds straight into a statement."""
    bad: list[str] = []
    for name, cmd in sorted(MANIFEST["commands"].items()):
        if "handler" in cmd or not cmd.get("schema"):
            continue
        schema = json.loads((MODULE_DIR / cmd["schema"]).read_text())
        bound: set[str] = set()
        for rel in cmd.get("sql", []):
            bound |= set(positional((MODULE_DIR / rel).read_text())[1])
        for field, spec in sorted(schema.get("properties", {}).items()):
            declared = spec.get("type")
            declared = declared if isinstance(declared, list) else [declared]
            if "number" in declared and field in bound:
                bad.append(f"{name}: `{field}` is {declared} and is bound by {cmd['sql']}")
    return bad

# `erp_*` are ERPlora-SQL bridge functions (ADR-0007 §4a): the runtime rewrites them into native
# Postgres BEFORE the statement reaches the server, so a raw PREPARE of the manifest text does not
# resolve them. These stubs exist only so the probe can type such a statement; that the real
# rewrite prepares is what `erplora validate --pg` proves, in the gate.
PROBE_STUBS = """
CREATE OR REPLACE FUNCTION erp_dt(text) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE AS $$ SELECT $1::timestamptz $$;
CREATE OR REPLACE FUNCTION erp_dateadd(text, integer, text) RETURNS timestamptz
  LANGUAGE sql IMMUTABLE AS $$ SELECT $1::timestamptz $$;
"""


def positional(sql: str) -> tuple[str, list[str]]:
    """`:name` → `$n`, mirroring `translate()` of crates/db/src/lib.rs.

    Same three rules as the runtime, and they matter here: `::` is the cast operator and never a
    parameter, a `:` inside a `'…'` literal is left alone, and a `:name` inside a `--`/`/* */`
    comment is NOT a parameter (translating those would create phantom placeholders the engine
    never sees).
    """
    out: list[str] = []
    names: list[str] = []
    i, in_string = 0, False
    while i < len(sql):
        c = sql[i]
        if in_string:
            out.append(c)
            in_string = c != "'"
            i += 1
            continue
        if c == "'":
            in_string = True
            out.append(c)
            i += 1
            continue
        if sql.startswith("--", i):
            end = sql.find("\n", i)
            end = len(sql) if end < 0 else end
            out.append(sql[i:end])
            i = end
            continue
        if sql.startswith("/*", i):
            end = sql.find("*/", i + 2)
            end = len(sql) if end < 0 else end + 2
            out.append(sql[i:end])
            i = end
            continue
        if c == ":":
            if sql.startswith("::", i):
                out.append("::")
                i += 2
                continue
            j = i + 1
            while j < len(sql) and (sql[j].isalnum() or sql[j] == "_"):
                j += 1
            if j > i + 1:
                name = sql[i + 1 : j]
                if name not in names:
                    names.append(name)
                out.append(f"${names.index(name) + 1}")
                i = j
                continue
        out.append(c)
        i += 1
    return "".join(out), names


def statements() -> list[tuple[str, str]]:
    """Every SQL file the manifest declares, as (owner, relative path)."""
    seen: dict[str, str] = {}
    for name, cmd in MANIFEST["commands"].items():
        for rel in cmd.get("sql", []):
            seen.setdefault(rel, name)
    for name, q in MANIFEST.get("queries", {}).items():
        if q.get("sql"):
            seen.setdefault(q["sql"], name)
    return sorted((owner, rel) for rel, owner in seen.items())


failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


UI_PAYLOAD = {
    "name": "Manicura",
    "description": "",
    "short_description": "",
    "category_id": None,
    "pricing_type": "fixed",
    "price": 1850,
    "cost": 0,
    "duration_minutes": 45,
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
    "tax_category_key": "service.generic",
}

# The five slots the issue bisected, each with the three values it asks for — clamped to the domain
# the schema and the CHECK constraints allow (`max_capacity >= 1`; the flags are 0/1 only).
BLEW_UP = {
    "cost": [0, 1, 500],
    "max_capacity": [1, 2, 500],
    "requires_confirmation": [0, 1],
    "sort_order": [0, 1, 500],
    "is_featured": [0, 1],
}


def probe_types(db: ScratchDb) -> None:
    """PREPARE every statement and compare what Postgres infers with what the runtime sends."""
    db.psql([], db=db.name, stdin=PROBE_STUBS)
    for owner, rel in statements():
        sql, names = positional((MODULE_DIR / rel).read_text())
        out = db.psql(
            ["-tA"],
            db=db.name,
            stdin=(
                "DEALLOCATE ALL;\n"
                f"PREPARE probe AS {sql.rstrip().rstrip(';')};\n"
                "SELECT parameter_types FROM pg_prepared_statements WHERE name = 'probe';"
            ),
        )
        types = [t.strip() for t in out.strip().splitlines()[-1].strip("{}").split(",")]
        bad = [f"{n}={t}" for n, t in zip(names, types) if t not in BINDABLE]
        if bad:
            failures.append(f"{rel} ({owner}): unbindable slots — {', '.join(bad)}")
            print(f"  FAIL: {rel} → {', '.join(bad)}")
        else:
            print(f"  ok: {rel} ({len(names)} params, all bindable)")


def main() -> int:
    # Manifest-only, so it runs with or without the container: it is the half that owns services#55.
    print("\nNo declarative command binds a `number` field (the runtime would type it by value):")
    ambiguous = number_slots_bound_by_sql()
    for line in ambiguous or ["every bound field has a single shape on the wire"]:
        print(f"  {'FAIL' if ambiguous else 'ok'}: {line}")
    failures.extend(ambiguous)

    if not container_available():
        print("\nSKIPPED: the test Postgres container is not running")
        return 1 if failures else 0

    db = ScratchDb("services_bind_types")
    db.create()
    try:
        print("\nEvery parameter slot is a type the runtime can send:")
        probe_types(db)

        print("\nThe screen's own payload creates a service, ten times in a row:")
        created = 0
        for i in range(10):
            db.run_command("services.services.create", {**UI_PAYLOAD, "name": f"Manicura {i}"})
            created += 1
        check("services created from the UI payload", 10, created)
        check(
            "rows in the catalogue",
            "10",
            db.scalar(f"SELECT COUNT(*) FROM services_service WHERE hub_id = '{HUB}'"),
        )
        check(
            "the UI payload's values landed",
            "1850|0|45|1|0|0|0",
            db.scalar(
                "SELECT price || '|' || cost || '|' || duration_minutes || '|' || max_capacity"
                " || '|' || requires_confirmation || '|' || sort_order || '|' || is_featured"
                f" FROM services_service WHERE hub_id = '{HUB}' AND name = 'Manicura 0'"
            ),
        )

        print("\nThe five slots that blew up, one field at a time, with 0 / 1 / 500:")
        for field, values in BLEW_UP.items():
            for n, value in enumerate(values):
                name = f"{field}-{n}-{value}"
                db.run_command(
                    "services.services.create",
                    {
                        "name": name,
                        "pricing_type": "fixed",
                        "price": 1850,
                        "duration_minutes": 45,
                        "tax_category_key": "service.generic",
                        field: value,
                    },
                )
                check(
                    f"{field} = {value}",
                    str(value),
                    db.scalar(
                        f"SELECT {field} FROM services_service"
                        f" WHERE hub_id = '{HUB}' AND name = '{name}'"
                    ),
                )
        print("\nThe percentage survives the round trip through both package doors, scaled:")
        package_id = "pkg-bp"
        db.run_command(
            "services._insert_package",
            {
                "package_id": package_id,
                "name": "Bono",
                "slug": "bono",
                "description": "",
                "discount_type": "percentage",
                # 10,50 % — the half point is the whole reason the field is not an integer of
                # percent: it is what a `number` would have had to carry, and what the old REAL
                # column lost the type of.
                "discount_percent_bp": 1050,
                "discount_amount_cents": 0,
                "fixed_price": None,
                "validity_days": None,
                "max_uses": None,
                "sort_order": 0,
                "is_active": 1,
                "is_featured": 0,
            },
        )
        check(
            "created with 1050 basis points",
            "1050",
            db.scalar(
                f"SELECT discount_percent_bp FROM services_package WHERE id = '{package_id}'"
            ),
        )
        db.run_command(
            "services.packages.update",
            {
                "package_id": package_id,
                "name": "Bono",
                "slug": "bono",
                "description": "",
                "discount_type": "percentage",
                "discount_percent_bp": 2575,
                "discount_amount_cents": 0,
                "fixed_price": None,
                "validity_days": None,
                "max_uses": None,
                "is_active": 1,
                "is_featured": 0,
            },
        )
        check(
            "updated to 2575 (25,75 %), read back whole",
            "2575",
            db.scalar(
                f"SELECT discount_percent_bp FROM services_package WHERE id = '{package_id}'"
            ),
        )
        check(
            "and the list query serves that same number",
            2575,
            db.run_query("services.packages.list", {})[0]["discount_percent_bp"],
        )
    except (RuntimeError, KeyError) as exc:
        failures.append(f"the run aborted: {exc}")
        print(f"\n  ABORTED: {exc}")
    finally:
        db.drop()

    print()
    if failures:
        print(f"FAILED — {len(failures)} point(s):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("PASS — every bound slot has the type the runtime sends, and the screen's payload saves")
    return 0


if __name__ == "__main__":
    sys.exit(main())
