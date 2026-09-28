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

Usage: `erplora test <dir> --against-hub [dev|stable|sha256:…]` (module-toolkit#110). Never on its
own: without a runtime it fails, it does not skip.
"""

import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from urllib.parse import urlparse

import hub_harness
from hub_harness import Hub, balance_of, catalog_service, create_package, grant, tag
from pg_harness import script_for

# The most the battery waits for a side of the race to park (the till inside its transaction, the
# command on the voucher's lock). It is polled, so a quiet machine does not pay it.
SETTLE_TIMEOUT = 30


def hub_database_container() -> str:
    """The Postgres container of THIS run's hub.

    `--against-hub` starts the hub inside the network namespace of its scratch Postgres and
    publishes the hub's port on THAT container, so the container whose ports carry the port of
    `ERPLORA_HUB_BASE_URL` is the database the runtime writes to. Anything but exactly one match is
    a failure: acting on the wrong database would prove nothing."""
    port = urlparse(hub_harness.BASE).port
    out = subprocess.run(
        ["docker", "ps", "--format", "{{.Names}}\t{{.Ports}}"],
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    found = [
        line.split("\t")[0]
        for line in out.splitlines()
        if f":{port}->" in line.split("\t", 1)[-1]
    ]
    if len(found) != 1:
        raise AssertionError(
            f"expected ONE container publishing port {port} (the hub's database), found {found}"
        )
    return found[0]


class OpenTransaction:
    """A psql session on the hub's database with a transaction left open on purpose."""

    def __init__(self, container: str):
        self.container = container
        self.proc = subprocess.Popen(
            [
                "docker",
                "exec",
                "-i",
                container,
                "psql",
                "-U",
                "postgres",
                "-d",
                "postgres",
            ],
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
        return (self.proc.stderr.read() or "").strip()

    def kill(self) -> None:
        if self.proc.poll() is None:
            self.proc.kill()


def scalar(container: str, sql: str) -> str:
    return subprocess.run(
        [
            "docker",
            "exec",
            "-i",
            container,
            "psql",
            "-U",
            "postgres",
            "-d",
            "postgres",
            "-tAc",
            sql,
        ],
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


def parked(db: str, condition: str) -> int:
    return int(
        scalar(
            db,
            "SELECT count(*) FROM pg_stat_activity "
            f"WHERE datname = 'postgres' AND pid <> pg_backend_pid() AND {condition}",
        )
    )


def settle(db: str, condition: str, done=lambda: False) -> None:
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


def race(hub: Hub, db: str, till: tuple[str, dict], command: tuple[str, dict]) -> dict:
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


def test_1_the_void_waits_for_the_till_and_is_refused(hub: Hub, db: str) -> None:
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


def test_2_a_correction_waits_for_the_till_and_is_refused(hub: Hub, db: str) -> None:
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


def test_3_the_till_waits_for_the_void_and_spends_nothing(hub: Hub, db: str) -> None:
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
    # Refused, but not yet by name: the redeem's pre-check said yes before the void committed, so
    # the refusal comes from the `services__gate` CHECK inside the transaction, and the kernel
    # answers every database refusal with its generic `db` code (services#128).
    hub.check_true(
        "the redeem is refused, not answered ok",
        answer["status"] != 200,
        f"(HTTP {answer['status']}: {answer['body']})",
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


def main() -> int:
    hub = Hub("grant_race.hub", needs=("taxes", "services"))
    db = hub_database_container()
    for test in (
        test_1_the_void_waits_for_the_till_and_is_refused,
        test_2_a_correction_waits_for_the_till_and_is_refused,
        test_3_the_till_waits_for_the_void_and_spends_nothing,
    ):
        try:
            test(hub, db)
        except AssertionError as exc:
            hub.failures.append(f"{test.__name__}: {exc}")
            print(f"  FAIL: {exc}")
    return hub.finish(
        "the doors of one voucher queue in the kernel, and the late one is refused"
    )


if __name__ == "__main__":
    sys.exit(main())
