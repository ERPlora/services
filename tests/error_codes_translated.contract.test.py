"""Every domain code a command of this module can raise has its sentence in `en` AND `es`.

A command raises a code from two places of the manifest: `expect_rows.error` (the statement touched
no row) and `on_unique` (a unique index refused the write, renamed by the runtime, hub#2081). The
screens paint the code through `ui/lib/domain-error.ts`, which looks it up in
`locales/<lang>.json → errors`; a code missing there falls back to the runtime's generic English
sentence, and a Spanish-speaking owner reads «the operation … conflicts with a record that already
exists» instead of what happened. services#107 added the first `on_unique` code of the module
(`services.category_name_taken`); this keeps it — and every code after it — translated.

Usage: tests/error_codes_translated.contract.test.py   (exit 0 = green)
"""

import json
import pathlib
import sys

MODULE_DIR = pathlib.Path(__file__).resolve().parent.parent
MANIFEST = json.loads((MODULE_DIR / "module.json").read_text())
LANGS = ("en", "es")


def raised_codes() -> dict[str, str]:
    """code → the command that raises it (first one found)."""
    out: dict[str, str] = {}
    for name, cmd in MANIFEST["commands"].items():
        err = (cmd.get("expect_rows") or {}).get("error")
        if err:
            out.setdefault(err, name)
        for code in (cmd.get("on_unique") or {}).values():
            out.setdefault(code, name)
    return out


def main() -> int:
    failures: list[str] = []
    codes = raised_codes()
    if "services.category_name_taken" not in codes:
        failures.append(
            "no command raises `services.category_name_taken` (services#107)"
        )
    for lang in LANGS:
        errors = json.loads((MODULE_DIR / "locales" / f"{lang}.json").read_text()).get(
            "errors", {}
        )
        for code, command in sorted(codes.items()):
            sentence = errors.get(code)
            if not isinstance(sentence, str) or not sentence.strip():
                failures.append(
                    f"locales/{lang}.json: `{code}` (raised by {command}) has no sentence"
                )
    for f in failures:
        print("FAIL:", f)
    print(
        f"{len(codes)} codes × {len(LANGS)} languages:",
        "OK" if not failures else f"{len(failures)} missing",
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
