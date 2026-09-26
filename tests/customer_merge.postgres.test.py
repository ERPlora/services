#!/usr/bin/env python3
"""customers#86 (layer 2) — when two customer sheets are merged, the vouchers follow the survivor.

`customers.merge` retires the absorbed sheet and publishes `customer.merged` with
`{surviving_id, absorbed_id}` (customers#87). `services` stores the customer as an OPAQUE id in two
tables — `services_package_grant` (what was bought) and `services_package_redemption` (what was
spent) — so unless this module re-points them, the vouchers a customer paid for stay hanging off a
sheet nobody can open any more, and the survivor's balance shows nothing.

WHAT IS PROVEN HERE, against a REAL Postgres:

  1. The manifest listens to `customer.merged` with an internal, transactional command.
  2. Grants AND redemptions (live, held and soft-deleted) move to the survivor; the balance of the
     survivor shows every voucher of both sheets with the sessions each one has left.
  3. 🔴 THE ORDINAL. `uq_services_redemption_use` is `(hub_id, package_id, customer_id, use_index)`
     over live rows: two sheets that both spent the SAME voucher template both own use_index 1..n.
     A blind re-point would violate the index and dead-letter the event. The absorbed uses are
     renumbered after the survivor's, so the index stays whole and the next redemption continues.
  4. An orphan stamp on a moved grant is cleared: its owner is now the survivor, who is alive.
  5. It does not require the absorbed sheet to exist anywhere — `services` never reads `customers`.
  6. IDEMPOTENCE — the outbox is at-least-once; a redelivery is a no-op.
  7. TENANCY — rows of the hub next door that carry the absorbed id are NOT re-pointed (an opaque
     id has no cross-module foreign key: the same string may name another person in another hub).

Usage: tests/customer_merge.postgres.test.py   (exit 0 = green; SKIPPED without the container)
"""

import json
import sys
import uuid

from pg_harness import (
    HUB,
    NOW,
    OTHER_HUB,
    ScratchDb,
    container_available,
    query_sql,
    script_for,
)

MANIFEST = json.loads(
    (
        __import__("pathlib").Path(__file__).resolve().parent.parent / "module.json"
    ).read_text()
)

EVENT = "customer.merged"
LISTENER = "services._on_customer_merged"
SURVIVOR = "cust-ana"
ABSORBED = "cust-ana-dup"

failures: list[str] = []


def check(label: str, expected, actual) -> None:
    ok = expected == actual
    print(
        f"  {'ok' if ok else 'FAIL'}: {label} = {actual!r}"
        + ("" if ok else f" (expected {expected!r})")
    )
    if not ok:
        failures.append(f"{label}: expected {expected!r}, got {actual!r}")


def truthy(label: str, value) -> None:
    check(label, True, bool(value))


# ── 1 · the manifest (runs with or without Docker) ───────────────────────────


def manifest_half() -> None:
    print("\n— the manifest declares the ear —")
    listen = MANIFEST["events"].get("listen", {})
    check(
        f"`{EVENT}` is listened to", LISTENER, (listen.get(EVENT) or {}).get("command")
    )
    cmd = MANIFEST["commands"].get(LISTENER)
    truthy(f"`{LISTENER}` exists", cmd)
    if cmd:
        truthy(
            f"`{LISTENER}` is internal (leading `_`)",
            LISTENER.rsplit(".", 1)[1].startswith("_"),
        )
        check(f"`{LISTENER}` is transactional", True, cmd.get("transaction"))
        truthy(f"`{LISTENER}` carries SQL", cmd.get("sql"))
        check(f"`{LISTENER}` emits nothing", None, cmd.get("emit"))
        check(
            f"`{LISTENER}` has no expect_rows (a merge of a customer without vouchers is normal)",
            None,
            cmd.get("expect_rows"),
        )


# ── seeds ────────────────────────────────────────────────────────────────────


def seed_package(db: ScratchDb, hub: str, name: str, max_uses) -> str:
    package_id = str(uuid.uuid4())
    db.run_command(
        "services._insert_package",
        {
            "package_id": package_id,
            "name": name,
            "slug": name.lower().replace(" ", "-"),
            "description": "",
            "discount_type": "percentage",
            "discount_percent_bp": 0,
            "discount_amount_cents": 0,
            "fixed_price": None,
            "validity_days": 365,
            "max_uses": max_uses,
            "sort_order": 0,
            "is_active": 1,
            "is_featured": 0,
        },
        hub=hub,
    )
    return package_id


def grant(db: ScratchDb, package_id: str, customer: str, hub: str = HUB) -> str:
    gid = str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._grant",
            {
                "grant_id": gid,
                "package_id": package_id,
                "customer_id": customer,
                "granted_at": NOW,
                "source": "manual",
                "sale_id": None,
                "sale_ref": "",
                "amount_cents": 10000,
                "net_amount_cents": 10000,
                "tax_amount_cents": 0,
                "note": "",
            },
            hub=hub,
        ),
    )
    return gid


def redeem(db: ScratchDb, grant_id: str, hub: str = HUB) -> str:
    rid = str(uuid.uuid4())
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            "services._redeem",
            {
                "redemption_id": rid,
                "grant_id": grant_id,
                "appointment_id": None,
                "sale_id": None,
                "note": "",
            },
            hub=hub,
        ),
    )
    return rid


def merge(
    db: ScratchDb, hub: str = HUB, surviving: str = SURVIVOR, absorbed: str = ABSORBED
) -> None:
    """Deliver `customer.merged` the way the outbox relay does: the payload IS the emitter's params."""
    db.psql(
        [],
        db=db.name,
        stdin=script_for(
            LISTENER,
            {"surviving_id": surviving, "absorbed_id": absorbed, "hub_id": hub},
            hub=hub,
        ),
    )


def balance(db: ScratchDb, customer: str, hub: str = HUB) -> list[dict]:
    sql = query_sql("services.packages.balance", {"customer_id": customer}, hub=hub)
    out = db.psql(
        ["-tAc", f"SELECT COALESCE(json_agg(t), '[]'::json) FROM ({sql}) t"], db=db.name
    )
    return json.loads(out.strip() or "[]")


def fingerprint(db: ScratchDb, hub: str) -> str:
    """Every customer-bearing row of one hub, in a byte-stable order (COLLATE "C", not the locale)."""
    return db.scalar(
        "SELECT COALESCE(string_agg(x, '|' ORDER BY x COLLATE \"C\"), '') FROM ("
        " SELECT 'g:' || id || ':' || customer_id || ':' || COALESCE(customer_deleted_at, '') AS x"
        f"   FROM services_package_grant WHERE hub_id = '{hub}'"
        " UNION ALL"
        " SELECT 'r:' || id || ':' || customer_id || ':' || use_index || ':' || is_deleted"
        f"   FROM services_package_redemption WHERE hub_id = '{hub}') t"
    )


def customer_of(db: ScratchDb, table: str, row_id: str) -> str:
    return db.scalar(f"SELECT customer_id FROM {table} WHERE id = '{row_id}'")


# ── 2 · the SQL, against a real Postgres ─────────────────────────────────────


def sql_half() -> None:
    db = ScratchDb("services_merge")
    db.create()
    try:
        five = seed_package(db, HUB, "Five haircuts", 5)
        ten = seed_package(db, HUB, "Ten blow dries", 10)

        # The survivor bought «five haircuts» and spent two: use_index 1, 2.
        g_surv = grant(db, five, SURVIVOR)
        redeem(db, g_surv)
        redeem(db, g_surv)
        # The duplicate sheet bought THE SAME template and spent two too: use_index 1, 2 as well —
        # the collision a blind re-point would hit.
        g_abs = grant(db, five, ABSORBED)
        r_abs_1 = redeem(db, g_abs)
        redeem(db, g_abs)
        # A released session: soft-deleted, outside the unique index, still history to move.
        r_released = redeem(db, g_abs)
        db.psql(
            [
                "-c",
                "UPDATE services_package_redemption SET is_deleted = 1 "
                f"WHERE id = '{r_released}'",
            ],
            db=db.name,
        )
        # …and a template only the duplicate had.
        g_abs_ten = grant(db, ten, ABSORBED)
        redeem(db, g_abs_ten)
        # A stale orphan stamp on a grant that is about to get a living owner.
        db.psql(
            [
                "-c",
                "UPDATE services_package_grant SET customer_deleted_at = "
                f"'2026-08-01T00:00:00Z' WHERE id = '{g_abs_ten}'",
            ],
            db=db.name,
        )

        # A deleted customer's orphaned voucher: a degenerate event naming that sheet twice must not
        # hand it a living owner.
        g_gone = grant(db, ten, "cust-gone")
        db.psql(
            [
                "-c",
                "UPDATE services_package_grant SET customer_deleted_at = "
                f"'2026-08-02T00:00:00Z' WHERE id = '{g_gone}'",
            ],
            db=db.name,
        )

        # The hub next door: the SAME opaque ids name other people there, in EVERY table.
        n_five = seed_package(db, OTHER_HUB, "Five haircuts", 5)
        n_abs = grant(db, n_five, ABSORBED, hub=OTHER_HUB)
        redeem(db, n_abs, hub=OTHER_HUB)
        n_surv = grant(db, n_five, SURVIVOR, hub=OTHER_HUB)
        redeem(db, n_surv, hub=OTHER_HUB)
        neighbour_before = fingerprint(db, OTHER_HUB)

        print(
            "\n— the listener runs even though nothing in services knows the sheets —"
        )
        try:
            merge(db)
            check("the merge is applied (no unique violation on use_index)", True, True)
        except RuntimeError as exc:
            check(
                "the merge is applied (no unique violation on use_index)", "", str(exc)
            )
            return

        print("\n— the vouchers follow the survivor —")
        check(
            "the duplicate's grant moved",
            SURVIVOR,
            customer_of(db, "services_package_grant", g_abs),
        )
        check(
            "the duplicate's other grant moved",
            SURVIVOR,
            customer_of(db, "services_package_grant", g_abs_ten),
        )
        check(
            "the duplicate's live redemption moved",
            SURVIVOR,
            customer_of(db, "services_package_redemption", r_abs_1),
        )
        check(
            "the released (soft-deleted) redemption moved too — it is history",
            SURVIVOR,
            customer_of(db, "services_package_redemption", r_released),
        )
        check(
            "nothing is left on the absorbed id in this hub",
            "0",
            db.scalar(
                "SELECT (SELECT COUNT(*) FROM services_package_grant WHERE hub_id = "
                f"'{HUB}' AND customer_id = '{ABSORBED}') + (SELECT COUNT(*) FROM "
                f"services_package_redemption WHERE hub_id = '{HUB}' AND customer_id = '{ABSORBED}')"
            ),
        )
        rows = {r["grant_id"]: r for r in balance(db, SURVIVOR)}
        check(
            "the survivor's balance lists all three vouchers",
            {g_surv, g_abs, g_abs_ten},
            set(rows),
        )
        check("its own voucher keeps its three sessions", 3, rows[g_surv]["remaining"])
        check(
            "the absorbed five-pack keeps its three sessions",
            3,
            rows[g_abs]["remaining"],
        )
        check(
            "the absorbed ten-pack keeps its nine sessions",
            9,
            rows[g_abs_ten]["remaining"],
        )
        check("the absorbed sheet's balance is empty", [], balance(db, ABSORBED))

        print("\n— the anti-double-spend ordinal stays whole —")
        check(
            "live use_index of «five haircuts» for the survivor is 1..4, no duplicates",
            "1,2,3,4",
            db.scalar(
                "SELECT string_agg(use_index::text, ',' ORDER BY use_index) FROM "
                f"services_package_redemption WHERE hub_id = '{HUB}' AND package_id = '{five}' "
                f"AND customer_id = '{SURVIVOR}' AND is_deleted = 0"
            ),
        )
        nxt = redeem(db, g_abs)
        check(
            "the next session continues the numbering",
            "5",
            db.scalar(
                f"SELECT use_index FROM services_package_redemption WHERE id = '{nxt}'"
            ),
        )

        print("\n— the moved grant is no longer an orphan —")
        check(
            "the stale orphan stamp is cleared",
            "",
            db.scalar(
                "SELECT COALESCE(customer_deleted_at, '') FROM services_package_grant "
                f"WHERE id = '{g_abs_ten}'"
            ),
        )

        print("\n— idempotence: the outbox is at-least-once —")
        after = fingerprint(db, HUB)
        merge(db)
        check("a redelivery changes nothing", after, fingerprint(db, HUB))

        print("\n— a degenerate event (a sheet merged into itself) touches nothing —")
        merge(db, surviving=SURVIVOR, absorbed=SURVIVOR)
        check("surviving == absorbed is a no-op", after, fingerprint(db, HUB))
        merge(db, surviving="cust-gone", absorbed="cust-gone")
        check(
            "…and does not clear an orphan stamp", after, fingerprint(db, HUB)
        )

        print("\n— tenancy —")
        check(
            "hub B rows pointing at the absorbed id are NOT re-pointed",
            neighbour_before,
            fingerprint(db, OTHER_HUB),
        )
        check(
            "hub B still has its own absorbed-id grant",
            ABSORBED,
            customer_of(db, "services_package_grant", n_abs),
        )
    finally:
        db.drop()


def main() -> int:
    manifest_half()
    if container_available():
        sql_half()
    else:
        print("\n  SKIPPED: the Postgres container is not available (SQL half not run)")
        return 1 if failures else 0
    if failures:
        print(f"\n{len(failures)} FAILURE(S):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("\nall green")
    return 0


if __name__ == "__main__":
    sys.exit(main())
