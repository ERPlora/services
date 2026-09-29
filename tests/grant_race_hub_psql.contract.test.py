#!/usr/bin/env python3
"""services#134 — the voucher race battery opens the hub's database THE HARNESS hands over.

`tests/grant_race.hub.test.py` leaves a till's transaction open in the hub's own database. Both
runners that start a hub for it — `erplora test --against-hub` (module-toolkit#405) and the hub's
CI `scripts/ci/run-module-hub-batteries.sh` (hub#2367) — hand the battery a psql session on THAT
database in `ERPLORA_HUB_PSQL` (`docker exec -i <pg> psql -U <u> -v ON_ERROR_STOP=1 -d <db>`). The
battery used to guess instead (`docker ps` + every database of every candidate container).

This file pins the contract without a hub (no Postgres, no runtime needed):

  1. with `ERPLORA_HUB_PSQL` empty or missing the battery FAILS with `hub_psql_missing`, before it
     talks to any hub — it neither skips nor guesses;
  2. every psql call starts with the variable's words, split like a shell would (`shlex`);
  3. the session that keeps the till's transaction open overrides the variable's
     `ON_ERROR_STOP=1` with `ON_ERROR_STOP=0` AFTER it (psql applies `-v` in order): with the
     variable as is, a failing till statement would kill psql before its COMMIT and the battery
     would read a broken pipe instead of the till's error;
  4. the probe takes the handed-over database only when it holds the package this run wrote, under
     this hub's `hub_id` — a wrong database (psql error, or no such row) is refused by name.

It runs with the contract family, where no hub is started: the battery has to answer by name
here, before it would ever reach for one. (It deliberately does not name the hub's url variable:
the toolkit and the hub's CI classify a battery that mentions it as a HUB battery, and this one
would then run only against a live kernel — or, on the hub's CI, fail its pairing guard.)

The live half (the variable really opens the hub's database, the override really keeps the session
alive) is proved by the battery itself against a real kernel.

Usage: tests/grant_race_hub_psql.contract.test.py   (exit 0 = green)
"""

import importlib.util
import os
import pathlib
import subprocess
import sys

TESTS = pathlib.Path(__file__).resolve().parent
BATTERY = TESTS / "grant_race.hub.test.py"
HANDED = "docker exec -i pg-x psql -U postgres -v ON_ERROR_STOP=1 -d 'hub db'"

failures: list[str] = []


def check(label: str, got, want) -> None:
    if got != want:
        failures.append(f"{label} — expected [{want!r}], got [{got!r}]")
        print(f"  FAIL: {label} — expected [{want!r}], got [{got!r}]")
    else:
        print(f"  ok: {label}")


def run_battery(psql: str | None) -> subprocess.CompletedProcess:
    env = {k: v for k, v in os.environ.items() if k != "ERPLORA_HUB_PSQL"}
    if psql is not None:
        env["ERPLORA_HUB_PSQL"] = psql
    return subprocess.run(
        [sys.executable, str(BATTERY)],
        capture_output=True,
        text=True,
        env=env,
        cwd=TESTS,
        timeout=60,
    )


print("1 · without ERPLORA_HUB_PSQL the battery fails by name, before touching a hub")
for label, value in (("missing", None), ("empty", ""), ("blank", "   ")):
    done = run_battery(value)
    check(f"{label}: exit code", done.returncode, 1)
    check(f"{label}: names hub_psql_missing", "hub_psql_missing" in done.stdout, True)
    check(
        f"{label}: no traceback (it did not reach the hub)",
        "Traceback" in done.stderr,
        False,
    )

print("2 · psql calls start with the handed-over words")
sys.path.insert(0, str(TESTS))
spec = importlib.util.spec_from_file_location("grant_race_hub", BATTERY)
battery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(battery)

db = battery.HubDatabase.from_env({"ERPLORA_HUB_PSQL": HANDED})
handed_words = [
    "docker",
    "exec",
    "-i",
    "pg-x",
    "psql",
    "-U",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
    "-d",
    "hub db",
]
check(
    "a one-shot query", db.psql("-tAc", "SELECT 1"), handed_words + ["-tAc", "SELECT 1"]
)

print("3 · the till's open session overrides ON_ERROR_STOP after the variable")
check("the open session", db.open_session(), handed_words + ["-v", "ON_ERROR_STOP=0"])

print(
    "4 · the probe accepts the handed-over database only when it holds THIS hub's package"
)
# A stand-in psql: `sh -c <script> fake-psql <psql args…>` answers like the real one would.
HUB_ID = "hub-a"
PACKAGE_ID = "pkg-probe"
probe_hub = type("ProbeHub", (), {"hub_id": HUB_ID})()


def probe(script: str) -> str:
    try:
        battery.prove_hub_database(
            battery.HubDatabase(("sh", "-c", script, "fake-psql")),
            probe_hub,
            PACKAGE_ID,
        )
    except AssertionError as exc:
        return f"refused: {exc}"
    return "accepted"


holds_it = f"""case "$*" in *"id = '{PACKAGE_ID}' AND hub_id = '{HUB_ID}'"*) echo 1;; *) echo 0;; esac"""
check("the hub's database (package + hub_id match)", probe(holds_it), "accepted")
check("a database without the package", probe("echo 0").startswith("refused"), True)
no_table = "echo 'ERROR:  relation \"services_package\" does not exist' >&2; exit 1"
refused = probe(no_table)
check("a database psql cannot query", refused.startswith("refused"), True)
check("the refusal carries psql's error", "services_package" in refused, True)

print()
if failures:
    print(f"✗ grant_race_hub_psql.contract: {len(failures)} failure(s)")
    sys.exit(1)
print(
    "✓ grant_race_hub_psql.contract: the race battery uses the database the harness hands over"
)
