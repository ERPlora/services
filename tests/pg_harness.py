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
    `current_user_id`, `now`, one `new_id` per statement) injected.
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

    def create(self) -> None:
        self.psql(["-c", f'DROP DATABASE IF EXISTS "{self.name}"'])
        self.psql(["-c", f'CREATE DATABASE "{self.name}"'])
        for rel in MANIFEST["migrations"]["postgres"]:
            self.psql([], db=self.name, stdin=(MODULE_DIR / rel).read_text())

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
