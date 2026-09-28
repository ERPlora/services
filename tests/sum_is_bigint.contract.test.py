#!/usr/bin/env python3
"""services#118 — a `SUM` the runtime hands back must stay a NUMBER (no Postgres needed).

The portable DDL writes `INTEGER` and the runtime creates it as `BIGINT` in Postgres
(`shim_ddl_types`, hub `crates/db`). `SUM(bigint)` is `NUMERIC` in Postgres, and the runtime
decodes `NUMERIC` to a STRING on purpose (money precision, never f64). So a balance that adds the
voucher's adjustments with a bare `SUM(uses_delta)` answers `remaining: "3"` instead of `3` — the
hub battery `package_redeem.hub.test.py` caught exactly that, while the psql mirrors (which keep
`INTEGER`, where `SUM` is `bigint`) stayed green.

The rule, for every query and command of this module: a `SUM(...)` is written
`CAST(SUM(...) AS BIGINT)`. Sessions and days are counts, never fractions, so nothing is lost.
"""

import re
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent
SUM = re.compile(r"\bSUM\s*\(", re.IGNORECASE)
CAST_SUM = re.compile(
    r"\bCAST\s*\(\s*SUM\s*\(([^()]*)\)\s*AS\s+BIGINT\s*\)", re.IGNORECASE
)


def strip_comments(sql: str) -> str:
    sql = re.sub(r"/\*.*?\*/", "", sql, flags=re.DOTALL)
    return re.sub(r"--[^\n]*", "", sql)


errors: list[str] = []
checked = 0
for path in sorted([*MODULE.glob("queries/*.sql"), *MODULE.glob("commands/*.sql")]):
    sql = strip_comments(path.read_text())
    sums = len(SUM.findall(sql))
    if not sums:
        continue
    checked += 1
    cast = len(CAST_SUM.findall(sql))
    if cast != sums:
        errors.append(
            f"{path.relative_to(MODULE)}: {sums - cast} of {sums} SUM(...) not wrapped in "
            "CAST(... AS BIGINT) — the runtime would answer it as a string"
        )

if checked == 0:
    errors.append("no SUM found at all: this guard is looking at the wrong files")
for e in errors:
    print("FAIL:", e)
print(
    f"SUM stays a number: {checked} file(s)",
    "OK" if not errors else f"{len(errors)} error(s)",
)
sys.exit(1 if errors else 0)
