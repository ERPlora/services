#!/usr/bin/env python3
"""services#118 — every text the module SHOWS exists in `en` (the source) and in `es` (no Postgres).

`error_codes_translated.contract` covers the codes the MANIFEST raises (`expect_rows`, `on_unique`).
Two surfaces were left without a guard, and dropping a sentence from either passed every battery
(measured by the review of services#125: five locale mutants, five survivors):

  1. the domain codes the WASM HANDLER raises (`Output.error`, e.g. `services.grant_unlimited`) —
     the manifest has no `errors` catalog yet (ADR-0398 §5), so `erplora validate` only warns;
  2. the `ui.*` keys the components ask for with `t(CATALOG, 'ui.…')` — a missing key falls back
     to the English one, or to the raw key, and the salon reads `ui.actionAdjustGrant`.

The rule: every such code has a non-empty sentence in `locales/en.json → errors` AND
`locales/es.json → errors`; every literal `ui.*` key a component uses exists, non-empty, in both
catalogues; and every `ui.*` / `errors.*` key of `en` has its `es`.
Usage: tests/texts_translated.contract.test.py   (exit 0 = green)
"""

import json
import re
import sys
from pathlib import Path

MODULE = Path(__file__).resolve().parent.parent
LANGS = ("en", "es")
# A domain code is `services.<snake_case>`: one segment, not `_private` (a command name) and not
# dotted (`services.packages.adjust_check` is a query the handler reads).
CODE = re.compile(r'"(services\.[a-z][a-z0-9_]*)"')
UI_KEY = re.compile(r"""\bt\(\s*(?:CATALOG\s*,\s*)?['"`](ui\.[A-Za-z0-9_.]+)['"`]""")


def flat(tree: dict, prefix: str = "") -> dict[str, object]:
    out: dict[str, object] = {}
    for key, value in tree.items():
        if isinstance(value, dict):
            out.update(flat(value, f"{prefix}{key}."))
        else:
            out[f"{prefix}{key}"] = value
    return out


def strip_comments(src: str) -> str:
    src = re.sub(r"/\*.*?\*/", "", src, flags=re.DOTALL)
    return re.sub(r"(?<![:'\"])//[^\n]*", "", src)


def handler_codes() -> set[str]:
    src = (MODULE / "handler" / "src" / "lib.rs").read_text()
    src = strip_comments(src.split("#[cfg(test)]")[0])
    return set(CODE.findall(src))


def ui_keys() -> set[str]:
    keys: set[str] = set()
    for path in (MODULE / "ui").rglob("*.ts"):
        if path.name.endswith(".test.ts") or "/test/" in path.as_posix():
            continue
        keys |= set(UI_KEY.findall(strip_comments(path.read_text())))
    return keys


def main() -> int:
    catalogs = {
        lang: flat(json.loads((MODULE / "locales" / f"{lang}.json").read_text()))
        for lang in LANGS
    }
    failures: list[str] = []

    def said(lang: str, key: str) -> bool:
        value = catalogs[lang].get(key)
        return isinstance(value, str) and value.strip() != ""

    codes = handler_codes()
    if "services.grant_unlimited" not in codes:
        failures.append("no handler code found: this guard is reading the wrong source")
    for code in sorted(codes):
        for lang in LANGS:
            if not said(lang, f"errors.{code}"):
                failures.append(
                    f"locales/{lang}.json: handler code `{code}` has no sentence"
                )

    keys = ui_keys()
    if "ui.actionAdjustGrant" not in keys:
        failures.append("no ui key found: this guard is reading the wrong components")
    for key in sorted(keys):
        for lang in LANGS:
            if not said(lang, key):
                failures.append(
                    f"locales/{lang}.json: `{key}` is used by a component and missing"
                )

    for key in sorted(catalogs["en"]):
        if key.startswith(("ui.", "errors.")) and not said("es", key):
            failures.append(f"locales/es.json: `{key}` exists in en and not in es")

    for failure in failures:
        print("FAIL:", failure)
    print(
        f"{len(codes)} handler codes + {len(keys)} ui keys × {len(LANGS)} languages:",
        "OK" if not failures else f"{len(failures)} error(s)",
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
