"""services#107 against the REAL kernel: a duplicate category name reaches the caller as its code.

`tests/category_unique_name.postgres.test.py` proves the SQL: the assert makes the gate's unique
index fire. What only the runtime can prove is the rest of the chain — the dispatcher turning that
23505 into `services.category_name_taken` through the command's `on_unique` (hub#2081), with an
HTTP refusal the screen can translate, and the whole command rolled back. Without the rename the
owner would read a bare database error, or the runtime's generic «could not complete».

Run with `erplora test <dir> --against-hub`.
"""

import sys

import hub_harness
from hub_harness import Hub, tag

CODE = "services.category_name_taken"


def names(hub: Hub, search: str) -> list[str]:
    return [r["name"] for r in hub.query("services.categories.list", {"search": search, "limit": 50})]


def main() -> int:
    hub = Hub("category_name_taken.hub")
    print(
        f"Hub battery · category_name_taken (services#107) · {hub_harness.BASE} · hub {hub.hub_id}"
    )

    name = f"Peinados de fiesta {tag('x')}"
    first = hub.run("services.categories.create", {"name": name})
    hub.check_true("the first category is created", bool(first), str(first))

    hub.refused(
        "the same name again", "services.categories.create", {"name": name}, CODE
    )
    hub.refused(
        "the same name, other case and spaces",
        "services.categories.create",
        {"name": f"  {name.upper()} "},
        CODE,
    )
    hub.check("live categories with that name", names(hub, name[:30]).count(name), 1)

    other = f"Color {tag('y')}"
    hub.run("services.categories.create", {"name": other})
    other_id = next(
        r["id"] for r in hub.query("services.categories.list", {"search": other, "limit": 5}) if r["name"] == other
    )
    hub.refused(
        "renaming onto the taken name",
        "services.categories.update",
        {"category_id": other_id, "name": name},
        CODE,
    )
    got = hub.query("services.categories.get", {"category_id": other_id})
    row = got[0] if isinstance(got, list) and got else got
    hub.check("the renamed category kept its name", (row or {}).get("name"), other)

    return hub.finish(
        "a second live category with a taken name is refused as `services.category_name_taken`, "
        "and nothing is written"
    )


if __name__ == "__main__":
    sys.exit(main())
