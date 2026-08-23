"""Shared plumbing for the module's Postgres tests — the runtime, in miniature.

Runs the manifest's own SQL against a REAL Postgres 18 in Docker (the `erplora-test-pg-5433`
container of the workspace), building a scratch database from this module's own migrations and
DROPPING it at the end, pass or fail. `tests/setup.postgres.test.py` carries its own copy of this
(it predates the harness); new tests import from here instead of pasting it again.

What is reproduced of the dispatcher, and only that:
  * `:name` placeholders bound as literals in ONE pass (a value carrying a colon — an ISO
    timestamp — is never rescanned);
  * params absent from the payload bind as NULL (`DynNull`, crates/db/src/lib.rs);
  * a command's `sql[]` runs inside one BEGIN/COMMIT with the system params (`hub_id`,
    `current_user_id`, `now`, one `new_id` per statement) injected;
  * migrations are applied through the MIGRATION GUARD (`crates/runtime/src/migration_guard.rs`,
    hub#542): a bare path is an `expand` and runs as written, while a declared `contract` has its
    `DROP`s translated into `RENAME … TO _deprecated_…` before anything reaches the database.
    Without this the harness would DESTROY what the hub only sets aside, and a test asking «did
    the retired rows survive?» would answer about a database the fleet never has.
JSON Schema validation is NOT reproduced here — that is `tests/schemas.contract.test.py`.
"""

import json
import os
import pathlib
import re
import subprocess
import uuid

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
CONTAINER = os.environ.get("SERVICES_TEST_PG_CONTAINER", "erplora-test-pg-5433")
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())

HUB = "hub-under-test"
OTHER_HUB = "hub-next-door"
USER = "u-owner"
NOW = "2026-08-18T10:00:00Z"

PARAM = re.compile(r":([a-z_][a-z0-9_]*)", re.IGNORECASE)


def container_available() -> bool:
    try:
        subprocess.run(
            ["docker", "inspect", CONTAINER], capture_output=True, check=True, text=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def bind(sql: str, params: dict) -> str:
    return PARAM.sub(lambda m: literal(params.get(m.group(1))), sql)


def migration_entries() -> list[tuple[str, str]]:
    """The manifest's Postgres migrations as `(file, kind)`.

    `MigrationEntry` has two shapes (hub#542) and the runtime reads both: the bare path — which is
    what the whole published catalogue uses, and which means `expand` — or the object
    `{file, kind, since}`, the ONLY way to declare a `contract` and therefore the only legitimate
    way to write a `DROP`.
    """
    out: list[tuple[str, str]] = []
    for entry in MANIFEST["migrations"]["postgres"]:
        if isinstance(entry, str):
            out.append((entry, "expand"))
        else:
            out.append((entry["file"], entry.get("kind", "expand")))
    return out


def strip_comments(sql: str) -> str:
    """Drop SQL comments before anything is read — the runtime's `strip_comments`, port for port.

    Without it the WORDS of a comment read as SQL: measured against the published catalogue, prose
    like `-- … the …` produced five rejections of perfectly correct migrations. A string literal is
    opaque and is kept: `'a--b'` is data, not a comment.
    """
    out = ""
    in_string = False
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        if in_string:
            out += ch
            if ch == "'":
                in_string = False
            i += 1
            continue
        if ch == "'":
            in_string = True
            out += ch
        elif ch == "-" and i + 1 < n and sql[i + 1] == "-":
            i += 1
            while i + 1 < n and sql[i + 1] != "\n":
                i += 1
            if i + 1 < n:
                out += "\n"
                i += 1
        elif ch == "/" and i + 1 < n and sql[i + 1] == "*":
            i += 2
            while i < n and not (sql[i - 1] == "*" and sql[i] == "/"):
                i += 1
            out += " "
        else:
            out += ch
        i += 1
    return out


def split_statements(sql: str) -> list[str]:
    """Split on `;` respecting literals AND comments — the runtime's splitter, character for character.

    A `;` inside `-- …` is prose, not SQL. The comment is KEPT inside the statement it precedes,
    which is exactly what makes the leading-prose trap below possible.
    """
    out: list[str] = []
    current = ""
    in_string = False
    i, n = 0, len(sql)
    while i < n:
        ch = sql[i]
        if in_string:
            current += ch
            if ch == "'":
                in_string = False
            i += 1
            continue
        if ch == "'":
            in_string = True
            current += ch
        elif ch == "-" and i + 1 < n and sql[i + 1] == "-":
            current += ch
            i += 1
            while i < n:
                current += sql[i]
                if sql[i] == "\n":
                    break
                i += 1
        elif ch == "/" and i + 1 < n and sql[i + 1] == "*":
            current += ch
            i += 1
            prev = " "
            while i < n:
                current += sql[i]
                if prev == "*" and sql[i] == "/":
                    break
                prev = sql[i]
                i += 1
        elif ch == ";":
            if current.strip():
                out.append(current.strip())
            current = ""
        else:
            current += ch
        i += 1
    if current.strip():
        out.append(current.strip())
    return out


def _strip_if_exists(rest: str) -> tuple[str, str]:
    if rest.upper().startswith("IF EXISTS "):
        return "IF EXISTS ", rest[len("IF EXISTS ") :].strip()
    return "", rest


def set_aside_instead_of_dropping(statement: str) -> str:
    """`DROP COLUMN x` → `RENAME COLUMN x TO _deprecated_x`; `DROP TABLE t` → `RENAME TO _deprecated_t`.

    🔴 The match is on the START of the statement text, and the splitter above keeps a preceding
    comment inside it — so PROSE ABOVE A `DROP` MAKES THIS MISS and the hub runs a real,
    irreversible `DROP TABLE`. This port keeps that flaw on purpose: a mirror that quietly behaves
    better than the thing it mirrors is how a test comes out green over a migration that destroys
    data in production. `tests/retire_addon.postgres.test.py` is what refuses the prose.
    """
    upper = statement.upper()

    at = upper.find(" DROP COLUMN ")
    if at != -1:
        head = statement[:at].rstrip()
        guard, column = _strip_if_exists(statement[at + len(" DROP COLUMN ") :].strip())
        column = (column.split() or [column])[0].rstrip(";")
        return f"{head} RENAME COLUMN {guard}{column} TO _deprecated_{column}"

    if upper.startswith("DROP TABLE "):
        guard, table = _strip_if_exists(statement[len("DROP TABLE ") :].strip())
        table = (table.split() or [table])[0].rstrip(";")
        return f"ALTER TABLE {guard}{table} RENAME TO _deprecated_{table}"

    return statement


def as_the_runtime_applies(sql: str, kind: str) -> str:
    """The SQL the hub really executes. Only a `contract` is rewritten; everything else runs as written."""
    if kind != "contract":
        return sql
    return ";\n".join(set_aside_instead_of_dropping(s) for s in split_statements(sql)) + ";"


class ScratchDb:
    """A throwaway database built from the manifest's Postgres migrations."""

    def __init__(self, prefix: str):
        self.name = f"{prefix}_{os.getpid()}"

    def psql(
        self, args: list[str], db: str | None = None, stdin: str | None = None
    ) -> str:
        cmd = [
            "docker",
            "exec",
            "-i",
            CONTAINER,
            "psql",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
        ]
        if db:
            cmd += ["-d", db]
        cmd += args
        res = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
        if res.returncode != 0:
            raise RuntimeError(res.stderr.strip() or res.stdout.strip())
        return res.stdout

    def create(self, through: str | None = None) -> None:
        """Build the database from the manifest's migrations, applied the way the runtime applies them.

        `through` stops after that file — the schema a hub that has not yet taken the newer
        migrations is running today.
        """
        self.psql(["-c", f'DROP DATABASE IF EXISTS "{self.name}"'])
        self.psql(["-c", f'CREATE DATABASE "{self.name}"'])
        for rel, kind in migration_entries():
            self.apply(rel, kind)
            if through is not None and rel == through:
                return

    def apply(self, rel: str, kind: str | None = None) -> None:
        """Apply one declared migration, through the guard (`kind` defaults to what the manifest says)."""
        if kind is None:
            kind = dict(migration_entries()).get(rel, "expand")
        sql = (MODULE_DIR / rel).read_text()
        self.psql([], db=self.name, stdin=as_the_runtime_applies(sql, kind))

    def drop(self) -> None:
        try:
            self.psql(["-c", f'DROP DATABASE IF EXISTS "{self.name}" WITH (FORCE)'])
        except RuntimeError as exc:
            print(f"  ! could not drop {self.name}: {exc}")

    def scalar(self, sql: str) -> str:
        return self.psql(["-tAc", sql], db=self.name).strip()

    def run_command(self, name: str, payload: dict, hub: str = HUB) -> None:
        """Execute a manifest command's `sql[]` the way the runtime does (one transaction)."""
        cmd = MANIFEST["commands"][name]
        params = dict(payload)
        params.setdefault("hub_id", hub)
        params.setdefault("current_user_id", USER)
        params.setdefault("now", NOW)
        script = ["BEGIN;"]
        for rel in cmd["sql"]:
            stmt_params = dict(params)
            stmt_params.setdefault("new_id", str(uuid.uuid4()))
            script.append(bind((MODULE_DIR / rel).read_text(), stmt_params))
        script.append("COMMIT;")
        self.psql([], db=self.name, stdin="\n".join(script))

    def run_query(self, name: str, params: dict, hub: str = HUB) -> list[dict]:
        """Execute a manifest query's base SELECT (no list wrapper) and return rows as dicts."""
        q = MANIFEST["queries"][name]
        p = dict(params)
        p.setdefault("hub_id", hub)
        sql = (MODULE_DIR / q["sql"]).read_text().rstrip().rstrip(";")
        out = self.psql(
            [
                "-tAc",
                f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({bind(sql, p)}) t",
            ],
            db=self.name,
        )
        return json.loads(out.strip() or "[]")
