#!/usr/bin/env python3
"""services#120 — a void or a correction racing a till on the same voucher, through a REAL kernel.

`grant_race.postgres.test.py` proves, with two sessions against Postgres, that the doors of one
voucher queue behind each other. Only a runtime proves what a CALLER receives when it arrives
second — and two things of the kernel that a psql mirror cannot see:

  * the runtime runs the queueing statement (`commands/_grant_lock.sql`, a `SELECT … FOR UPDATE`)
    inside the command's transaction, and the door really WAITS;
  * the refusal of the late door reaches the caller as its domain code. The void's and the
    correction's `expect_rows` are ANCHORED to their guarded statement (hub#1091): the lock
    statement also reports one row, and without the anchor the batch SUM (1 + 0) would pass the
    gate and answer `200 ok` for a void that voided nothing.

The first door is the till's own SQL, run by hand in the hub's database and left UNCOMMITTED — the
«other till» in the middle of its transaction. The second door is the command, through
`/api/command`, from a thread. The battery checks that the command is still waiting, commits the
till, and reads what the command answered and what the database kept.

The hub's database is the one the HARNESS hands over in `ERPLORA_HUB_PSQL` (services#134): both
runners that start a hub for a battery — `erplora test --against-hub` (module-toolkit#405) and the
hub's CI `scripts/ci/run-module-hub-batteries.sh` (hub#2367) — set it to a psql session on the
database that hub writes to. The battery never guesses it, and without it the battery fails.

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110), and the hub's
CI runs it through `scripts/ci/run-module-hub-batteries.sh` against a native kernel (services#130).
Never on its own: without a runtime it fails, it does not skip.
"""

import os
import shlex
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import NamedTuple

from hub_harness import Hub, balance_of, catalog_service, create_package, grant, tag
from pg_harness import script_for

# The most the battery waits for a side of the race to park (the till inside its transaction, the
# command on the voucher's lock). It is polled, so a quiet machine does not pay it.
SETTLE_TIMEOUT = 30


class HubDatabase(NamedTuple):
    """A psql session on the database THIS run's hub writes to, as the harness hands it over."""

    words: tuple[str, ...]

    @classmethod
    def from_env(cls, env=os.environ) -> "HubDatabase":
        words = tuple(shlex.split(env.get("ERPLORA_HUB_PSQL", "")))
        if not words:
            print(
                "grant_race.hub: hub_psql_missing — ERPLORA_HUB_PSQL is empty. The runner that "
                "starts the hub (`erplora test --against-hub`, or the hub's "
                "`run-module-hub-batteries.sh`) hands over a psql session on its database; "
                "without it this is NOT a skip, it is a failure."
            )
            sys.exit(1)
        return cls(words)

    def psql(self, *args: str) -> list[str]:
        return [*self.words, *args]

    def open_session(self) -> list[str]:
        """The session that keeps a till's transaction open. The handed-over words carry
        `-v ON_ERROR_STOP=1`, and with it psql EXITS at the first failing statement read from
        stdin: a till that failed would die before its COMMIT and the battery would read a broken
        pipe instead of the till's error. psql applies `-v` in order, so this one wins."""
        return self.psql("-v", "ON_ERROR_STOP=0")


def prove_hub_database(db: HubDatabase, hub: Hub, probe_package_id: str) -> None:
    """The handed-over database holds the package THIS run just created through `/api/command`,
    under this hub's `hub_id`. Acting on any other database would prove nothing (the till's SQL
    would lock a voucher the hub never reads)."""
    done = subprocess.run(
        db.psql(
            "-tAc",
            "SELECT count(*) FROM services_package "
            f"WHERE id = '{probe_package_id}' AND hub_id = '{hub.hub_id}'",
        ),
        capture_output=True,
        text=True,
    )
    found = done.stdout.strip() if done.returncode == 0 else done.stderr.strip()
    if found != "1":
        raise AssertionError(
            f"ERPLORA_HUB_PSQL does not open this hub's database: package {probe_package_id} "
            f"of hub {hub.hub_id} → {found!r}"
        )


class OpenTransaction:
    """A psql session on the hub's database with a transaction left open on purpose."""

    def __init__(self, db: HubDatabase):
        self.proc = subprocess.Popen(
            db.open_session(),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )

    def begin(self, command: str, params: dict, hub_id: str) -> None:
        # 🔴 The runtime's clock, not the harness's fixed `NOW`: a hold is born with a one-day
        # deadline, and one stamped on the harness's date is ALREADY EXPIRED for a kernel running
        # on today's date — the void would rightly ignore it, and the battery would read a race
        # that never happened.
        now = datetime.now(timezone.utc).isoformat(timespec="milliseconds")
        body = (
            script_for(command, {"now": now, **params}, hub=hub_id)
            .replace("BEGIN;\n", "", 1)
            .replace("\nCOMMIT;", "", 1)
        )
        self.proc.stdin.write("BEGIN;\n" + body + "\n")
        self.proc.stdin.flush()

    def commit(self) -> str:
        self.proc.stdin.write("COMMIT;\n")
        self.proc.stdin.flush()
        self.proc.stdin.close()
        self.proc.wait(timeout=30)
        self.output = self.proc.stdout.read() or ""
        return (self.proc.stderr.read() or "").strip()

    def kill(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()


def scalar(db: HubDatabase, sql: str) -> str:
    return subprocess.run(
        db.psql("-tAc", sql),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.strip()


def in_background(hub: Hub, name: str, payload: dict) -> tuple[threading.Thread, dict]:
    answer: dict = {}

    def call():
        answer["status"], answer["body"] = hub.command(name, payload)

    worker = threading.Thread(target=call, daemon=True)
    worker.start()
    return worker, answer


def parked(db: HubDatabase, condition: str) -> int:
    return int(
        scalar(
            db,
            "SELECT count(*) FROM pg_stat_activity "
            f"WHERE datname = current_database() AND pid <> pg_backend_pid() AND {condition}",
        )
    )


def settle(db: HubDatabase, condition: str, done=lambda: False) -> None:
    """Poll until a backend of the hub's database meets `condition` (or `done()` says the other
    side already finished). 🔴 Not a fixed sleep: on a loaded machine `docker exec` can take longer
    than any sleep to start psql, the command then locks the voucher FIRST and the race read is
    the opposite one."""
    deadline = time.monotonic() + SETTLE_TIMEOUT
    while time.monotonic() < deadline:
        if done() or parked(db, condition) > 0:
            return
        time.sleep(0.1)
    raise TimeoutError(f"the hub's database never reached: {condition}")


def race(hub: Hub, db: HubDatabase, till: tuple[str, dict], command: tuple[str, dict]) -> dict:
    """The till's SQL runs first and stays uncommitted; the command arrives; the till commits."""
    other_till = OpenTransaction(db)
    try:
        other_till.begin(*till, hub_id=hub.hub_id)
        # The till has run its statements and sits on whatever it locked, uncommitted.
        settle(db, "state LIKE 'idle in transaction%'")
        worker, answer = in_background(hub, *command)
        # The command is queued behind the till's lock — or, unqueued, already answered.
        settle(db, "wait_event_type = 'Lock'", done=lambda: not worker.is_alive())
        answer["waited"] = worker.is_alive()
        till_err = other_till.commit()
        worker.join(timeout=60)
        if worker.is_alive():
            raise AssertionError(
                f"{command[0]} never answered after the till committed"
            )
        answer["till_error"] = till_err if "ERROR" in till_err else ""
        return answer
    finally:
        other_till.kill()


def code_of(answer: dict) -> str | None:
    body = answer.get("body")
    return (
        ((body or {}).get("error") or {}).get("code")
        if isinstance(body, dict)
        else None
    )


def hold_sql(grant_id: str, service_id: str) -> tuple[str, dict]:
    return "services._hold", {
        "redemption_id": str(uuid.uuid4()),
        "grant_id": grant_id,
        "service_id": service_id,
        "checkout_ref": tag("chk"),
        "line_ref": "l1",
        "note": "",
    }


def test_0_a_failing_till_statement_is_read_not_a_dead_session(
    hub: Hub, db: HubDatabase
) -> None:
    print("\n0 · a till statement fails inside the open session → its error is read, psql goes on")
    session = OpenTransaction(db)
    try:
        try:
            session.proc.stdin.write("BEGIN;\nSELECT 1/0;\n")
            session.proc.stdin.flush()
            error = session.commit()
        except OSError as exc:
            error, session.output = f"session died: {exc!r}", ""
    finally:
        session.kill()
    hub.check("the till's error reaches the battery", "division by zero" in error, True)
    # The till's COMMIT still reached psql: an aborted transaction answers it with ROLLBACK.
    hub.check(
        "the session lived to read the till's COMMIT",
        [session.proc.returncode, "ROLLBACK" in session.output],
        [0, True],
    )


def test_1_the_void_waits_for_the_till_and_is_refused(hub: Hub, db: HubDatabase) -> None:
    print(
        "\n1 · a till is holding a session when the void arrives → the void waits and is refused"
    )
    customer = tag("cust-race-void")
    service = catalog_service(hub)
    grant_id = grant(hub, create_package(hub, tag("Bono carrera"), 5, None), customer)

    answer = race(
        hub,
        db,
        hold_sql(grant_id, service),
        (
            "services.packages.void_grant",
            {"grant_id": grant_id, "reason": "Sold twice"},
        ),
    )
    hub.check("the till committed its hold", answer["till_error"], "")
    hub.check("the void WAITED for the till", answer["waited"], True)
    hub.check(
        "the void is refused by name, not answered ok",
        [answer["status"] != 200, code_of(answer)],
        [True, "services.grant_not_voidable"],
    )
    hub.check(
        "the voucher is NOT voided",
        scalar(
            db,
            f"SELECT voided_at IS NULL FROM services_package_grant WHERE id = '{grant_id}'",
        ),
        "t",
    )
    hub.check(
        "…and the held session is still there",
        balance_of(hub, customer, grant_id)["remaining"],
        4,
    )


def test_2_a_correction_waits_for_the_till_and_is_refused(hub: Hub, db: HubDatabase) -> None:
    print(
        "\n2 · a till takes the LAST session while a correction of −1 arrives → refused"
    )
    customer = tag("cust-race-fix")
    service = catalog_service(hub)
    grant_id = grant(
        hub, create_package(hub, tag("Bono corrección"), 2, None), customer
    )
    hub.run("services.packages.redeem", {"grant_id": grant_id})

    answer = race(
        hub,
        db,
        hold_sql(grant_id, service),
        (
            "services.packages.adjust_grant",
            {"grant_id": grant_id, "uses_delta": -1, "reason": "Spent twice"},
        ),
    )
    hub.check("the till committed its hold", answer["till_error"], "")
    hub.check("the correction WAITED for the till", answer["waited"], True)
    hub.check(
        "the correction is refused by name, not answered ok",
        [answer["status"] != 200, code_of(answer)],
        [True, "services.grant_not_adjustable"],
    )
    hub.check(
        "no movement was written",
        scalar(
            db,
            "SELECT count(*) FROM services_package_grant_adjustment "
            f"WHERE grant_id = '{grant_id}'",
        ),
        "0",
    )
    row = balance_of(hub, customer, grant_id)
    hub.check(
        "the voucher keeps its 2 sessions, both spent",
        [row["max_uses"], row["remaining"]],
        [2, 0],
    )


def test_3_the_till_waits_for_the_void_and_spends_nothing(hub: Hub, db: HubDatabase) -> None:
    print(
        "\n3 · the void is mid-transaction when a session is spent at the chair → nothing spent"
    )
    customer = tag("cust-void-first")
    grant_id = grant(hub, create_package(hub, tag("Bono anulado"), 5, None), customer)

    answer = race(
        hub,
        db,
        ("services._void_grant", {"grant_id": grant_id, "reason": "Sold twice"}),
        ("services.packages.redeem", {"grant_id": grant_id}),
    )
    hub.check("the void committed", answer["till_error"], "")
    hub.check("the redeem WAITED for the void", answer["waited"], True)
    # services#128: refused BY NAME. The redeem's pre-check said yes before the void committed, so
    # the refusal comes from inside the transaction — and it still reaches the caller as the reason
    # it would have read one second later, not as the kernel's generic `db`.
    hub.check(
        "the redeem is told the voucher was VOIDED",
        [answer["status"] != 200, code_of(answer)],
        [True, "services.package_voided"],
    )
    hub.check(
        "no session was spent on the voided voucher",
        scalar(
            db,
            "SELECT count(*) FROM services_package_redemption "
            f"WHERE grant_id = '{grant_id}' AND is_deleted = 0",
        ),
        "0",
    )


def last_session_race(hub: Hub, db: HubDatabase, label: str, late: str) -> None:
    """services#128: another till holds the LAST session of a voucher and has not committed yet;
    the late door (`late`, the chair's redeem or the till's hold) arrives, waits, and loses."""
    customer = tag(f"cust-last-{label}")
    service = catalog_service(hub)
    grant_id = grant(hub, create_package(hub, tag(f"Bono último {label}"), 2, None), customer)
    hub.run("services.packages.redeem", {"grant_id": grant_id})

    command = (
        ("services.packages.redeem", {"grant_id": grant_id})
        if late == "redeem"
        else (
            "services.packages.hold_for_line",
            {
                "grant_id": grant_id,
                "customer_id": customer,
                "service_id": service,
                "checkout_ref": tag("chk-late"),
                "line_ref": "l1",
            },
        )
    )
    answer = race(hub, db, hold_sql(grant_id, service), command)
    hub.check("the other till committed its hold", answer["till_error"], "")
    hub.check(f"the {late} WAITED for the other till", answer["waited"], True)
    hub.check(
        f"the {late} is told the voucher has NO SESSIONS LEFT, not «could not complete»",
        [answer["status"] != 200, code_of(answer)],
        [True, "services.package_no_uses_left"],
    )
    row = balance_of(hub, customer, grant_id)
    hub.check(
        "exactly the voucher's 2 sessions are spent",
        [row["max_uses"], row["remaining"]],
        [2, 0],
    )


def test_4_the_chair_loses_the_last_session_to_a_till(hub: Hub, db: HubDatabase) -> None:
    print("\n4 · a till holds the LAST session when the chair redeems it → «no sessions left»")
    last_session_race(hub, db, "chair", "redeem")


def test_5_a_till_loses_the_last_session_to_another_till(hub: Hub, db: HubDatabase) -> None:
    print("\n5 · two tills cover a line with the LAST session → the late one reads «no sessions left»")
    last_session_race(hub, db, "till", "hold")


def main() -> int:
    # Before the hub: a battery without the database has nothing to race on.
    db = HubDatabase.from_env()
    hub = Hub("grant_race.hub", needs=("taxes", "services"))
    # A voucher written through the hub's own API proves the handed-over database is the hub's.
    prove_hub_database(db, hub, create_package(hub, tag("Bono sonda"), 1, None))
    for test in (
        test_0_a_failing_till_statement_is_read_not_a_dead_session,
        test_1_the_void_waits_for_the_till_and_is_refused,
        test_2_a_correction_waits_for_the_till_and_is_refused,
        test_3_the_till_waits_for_the_void_and_spends_nothing,
        test_4_the_chair_loses_the_last_session_to_a_till,
        test_5_a_till_loses_the_last_session_to_another_till,
    ):
        try:
            test(hub, db)
        except AssertionError as exc:
            hub.failures.append(f"{test.__name__}: {exc}")
            print(f"  FAIL: {exc}")
    return hub.finish(
        "the doors of one voucher queue in the kernel, and the late one is told why"
    )


if __name__ == "__main__":
    sys.exit(main())
