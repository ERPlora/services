"""Plumbing shared by the `*.hub.test.py` batteries — the ones that talk to a REAL kernel.

`erplora test <dir> --against-hub` (module-toolkit#110) starts the published hub image with its
own Postgres, installs the module through `POST /api/modules/install` and hands the url over in
`ERPLORA_HUB_BASE_URL`. Everything below is the thin layer between a battery and that runtime:
the two doors (`/api/query`, `/api/command`), the error envelope, the event shape, and the one
piece of bookkeeping every battery needs — a `check()` that records a failure instead of dying on
it, so a red run names EVERY broken assertion and not just the first.

Why HTTP and not a scratch Postgres: these batteries replace the hub's own
`services_package_redeem_e2e.rs` (ERPlora/hub#1264, contract «El Hub se CIERRA como KERNEL» §5).
What they assert is what happens INSIDE the runtime — the dispatcher pre-loading the `reads` the
WASM handler refuses without, the handler mapping a gate reason to a namespaced domain code, ids
minted by the host, the transaction that the `services__gate` CHECK rolls back, and the event that
leaves after the commit. None of that exists in a hand-written harness that binds `:hub_id` itself.
The Postgres batteries next door (`*.postgres.test.py`) keep proving the SQL in isolation —
`package_grant.postgres.test.py` owns the entitlement rules, `redeem_reasons.postgres.test.py` owns
the reason each guard computes; these prove the module against the kernel that RUNS it, which is
the only place the code on the wire and the emitted event can be observed.

Two facts of the runtime a battery has to know, both resolved here so no battery hard-codes them:

  * THE TENANT. Module seeds (the tax catalogue `services` depends on) land under the RUNTIME's own
    `hub_id`, not under whatever `X-Hub-Id` a request carries (that is how hub#594 was found).
    `GET /api/hub/context` says which id that is, and every request goes out under it — a battery
    sending `local` would look at an empty hub and read every absence as a bug of the module.
  * THE SESSION USER. Dev auth trusts `X-User-Id`. Each run mints its own, because batteries share
    one hub for the length of the run and every row records `created_by`.

Batteries also share the hub's CATALOGUE, so anything a test owns has to be unique to it: use
`tag()` for a customer id (opaque to `services` — no FK, no `customers` module needed) and a unique
package name. A test that reused `cust-1` would inherit the sessions another test had already spent.

It refuses to skip. Without a runtime a battery FAILS: a check that excuses itself is the green
that proves nothing this whole toolkit exists to remove (module-toolkit#50).
"""

import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = (
    os.environ.get("SERVICES_HUB_BASE_URL")
    or os.environ.get("ERPLORA_HUB_BASE_URL")
    or ""
).rstrip("/")

# Quantities travel in 10^6 fixed point (ADR-0147): one session of a package line is `ONE`, not 1.
# `schemas/package_create.json` refuses anything below the whole scale on purpose (services#51).
ONE = 1_000_000


class Hub:
    """One battery's view of the live runtime."""

    def __init__(self, battery: str, needs: tuple[str, ...] = ("services",)):
        self.battery = battery
        self.failures: list[str] = []
        if not BASE:
            print(
                f"{battery}: no runtime at the other end (ERPLORA_HUB_BASE_URL is empty)."
            )
            print(
                "Run it with `erplora test <dir> --against-hub`; without a hub this is NOT a skip, "
                "it is a failure."
            )
            sys.exit(1)
        self.user = f"u-{uuid.uuid4().hex[:8]}"
        self.hub_id = self._runtime_hub_id()
        self._require_installed(needs)

    # ── transport ────────────────────────────────────────────────────────────────────────

    def _request(self, method: str, path: str, body=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(
            f"{BASE}{path}",
            data=data,
            headers={
                "content-type": "application/json",
                "x-hub-id": self.hub_id,
                "x-user-id": self.user,
            },
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return res.status, json.loads(res.read().decode() or "null")
        except urllib.error.HTTPError as err:
            raw = err.read().decode()
            try:
                return err.code, json.loads(raw or "null")
            except json.JSONDecodeError:
                return err.code, {"raw": raw}

    def _runtime_hub_id(self) -> str:
        req = urllib.request.Request(f"{BASE}/api/hub/context", method="GET")
        with urllib.request.urlopen(req, timeout=60) as res:
            body = json.loads(res.read().decode())
        hub_id = body.get("hub_id")
        if not hub_id:
            print(
                f"{self.battery}: GET /api/hub/context did not say the hub_id: {body}"
            )
            sys.exit(1)
        return hub_id

    def _require_installed(self, needs: tuple[str, ...]) -> None:
        status, body = self._request("GET", "/api/modules")
        installed = (
            {m["id"] for m in (body or {}).get("data", [])} if status == 200 else set()
        )
        missing = [m for m in needs if m not in installed]
        if missing:
            print(
                f"{self.battery}: the runtime at {BASE} does not have {missing} installed "
                f"(installed: {sorted(installed)}). The harness has to install every dependency "
                "through the same door before the module. Not a skip: nothing below can be "
                "trusted without them."
            )
            sys.exit(1)

    # ── the two doors ────────────────────────────────────────────────────────────────────

    def query(self, name: str, params: dict | None = None) -> list:
        """Rows of a query. A query with a `list` block answers `{rows,total,…}`; the rest answer
        the bare array. Both come back as the list of rows."""
        status, body = self._request(
            "POST", "/api/query", {"name": name, "params": params or {}}
        )
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"query {name} answered {status}: {body}")
        data = body["data"]
        if isinstance(data, dict) and "rows" in data:
            return data["rows"]
        return data

    def command(self, name: str, payload: dict):
        """`(status, body)` of a command, whatever the runtime answered."""
        return self._request("POST", "/api/command", {"name": name, "payload": payload})

    def run(self, name: str, payload: dict) -> dict:
        """A command that MUST succeed. Its `data` (`result`, `new_ids`, …)."""
        status, body = self.command(name, payload)
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"command {name} answered {status}: {body}")
        return body["data"]

    def refused(self, label: str, name: str, payload: dict, code: str) -> None:
        """The runtime must REFUSE the command with exactly this domain code — the code, never the
        prose: the till translates the code (`locales/*.json`), nobody parses the sentence. Asserting
        only «it failed» is how a rejected payload (422) passes for a business refusal (409)."""
        status, body = self.command(name, payload)
        got = (
            ((body or {}).get("error") or {}).get("code")
            if isinstance(body, dict)
            else None
        )
        if status == 200:
            self.failures.append(
                f"{label} — expected refusal `{code}`, the command SUCCEEDED: {body}"
            )
            print(f"  FAIL: {label} — expected refusal `{code}`, got success: {body}")
        elif got != code:
            self.failures.append(
                f"{label} — expected code [{code}], got [{got}] (HTTP {status}: {body})"
            )
            print(
                f"  FAIL: {label} — expected code [{code}], got [{got}] (HTTP {status})"
            )
        else:
            print(f"  ok: {label} refused with `{code}` (HTTP {status})")

    # ── what the hub says about its events ───────────────────────────────────────────────

    def event_shape(self, event_name: str) -> dict | None:
        """`GET /api/hub/events/shape?name=…` — the fields of the NEWEST events of that name in this
        hub, each with one sample unless withheld (hub#715). `None` when the hub has never heard of
        the event. It is the only read of an emitted payload the runtime offers, and it is enough:
        a sample is the value of the most recent event, which is the one the battery just caused."""
        status, body = self._request(
            "GET", f"/api/hub/events/shape?name={event_name}&limit=1"
        )
        if status == 404:
            return None
        if status != 200 or not (body or {}).get("ok"):
            raise AssertionError(f"events/shape {event_name} answered {status}: {body}")
        return body["data"]

    def event_field(self, event_name: str, path: str) -> dict | None:
        shape = self.event_shape(event_name)
        if shape is None:
            return None
        return next((f for f in shape.get("fields", []) if f.get("path") == path), None)

    def last_seen(self, event_name: str) -> str | None:
        """When this hub last recorded an event of that name, or `None` if it never has."""
        shape = self.event_shape(event_name)
        return None if shape is None else shape.get("last_seen_at")

    def wait_for_new_event(
        self,
        event_name: str,
        since: str | None,
        timeout: float = 8.0,
        interval: float = 0.1,
    ) -> dict:
        """Polls until this hub has recorded an event of that name NEWER than `since` (the value
        `last_seen()` returned before the command ran), and answers its shape.

        A declared `emit` is written to the outbox INSIDE the command's transaction, so it is
        normally there the instant the command answers — but the projection this endpoint reads is
        fed by the relay, which ticks once a second, so asserting immediately would be racing it.

        🔴 Why the ARRIVAL and not the sample: an assertion on `sample` is not deterministic. The
        hub withholds the example of any string its heuristic reads as personal, and one UUID in
        nine trips it (`event_shape.rs::value_looks_personal` reads `ed5096de-…` as an IBAN and a
        compacted UUID's digit runs as a phone — hub#1358). The field would come back
        `redacted: true` with no sample on ~11 % of runs, for a defect that has nothing to do with
        the module. `last_seen_at` moving is the same proof and does not flake: batteries are
        sequential, so the only thing that can have emitted since `since` is the command just run.

        Fails LOUDLY on timeout, naming what it saw — a helper that gave up quietly would be
        indistinguishable from the event never being emitted at all."""
        deadline = time.monotonic() + timeout
        seen = None
        while time.monotonic() < deadline:
            shape = self.event_shape(event_name)
            if shape is not None:
                seen = shape.get("last_seen_at")
                if seen != since:
                    return shape
            time.sleep(interval)
        raise AssertionError(
            f"timed out after {timeout}s waiting for a `{event_name}` newer than {since!r}; "
            f"the hub still reports {seen!r}"
        )

    # ── bookkeeping ──────────────────────────────────────────────────────────────────────

    def check(self, label: str, got, want) -> None:
        if got != want:
            self.failures.append(f"{label} — expected [{want!r}], got [{got!r}]")
            print(f"  FAIL: {label} — expected [{want!r}], got [{got!r}]")
        else:
            print(f"  ok: {label} = {got!r}")

    def check_true(self, label: str, condition: bool, detail="") -> None:
        if not condition:
            self.failures.append(f"{label} — {detail}" if detail else label)
            print(f"  FAIL: {label} {detail}")
        else:
            print(f"  ok: {label}")

    def finish(self, verdict: str) -> int:
        print()
        if self.failures:
            print(f"✗ {self.battery}: {len(self.failures)} failure(s):")
            for f in self.failures:
                print(f"  - {f}")
            return 1
        print(f"✓ {self.battery}: {verdict}")
        return 0


def tag(prefix: str) -> str:
    """An id unique to THIS run. Batteries share one hub, and a customer id is an opaque string to
    `services` (no FK, no `customers` module needed — `commands/_grant_insert.sql` stores whatever
    it is given), so two tests reusing `cust-1` would spend each other's sessions."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def catalog_service(hub: Hub, name: str = "Corte") -> str:
    """A REAL service of THIS hub's catalogue, to put on a package line.

    `services.packages.create` declares `reads` on `services.services.list` (ADR-0069): the
    dispatcher pre-loads the catalogue and the handler REFUSES a line naming something that is not
    in it (services#42), so an invented id would not exercise the happy path at all. Find-or-create,
    because every battery in a run shares this hub."""
    rows = hub.query("services.services.list")
    found = next((s for s in rows if s.get("name") == name), None)
    if found is not None:
        return found["id"]
    # `tax_category_key` is mandatory (ADR-0085): a service is sold as a sale line with its VAT, and
    # `service.generic` is the key the `taxes` seed guarantees in every hub.
    hub.run(
        "services.services.create",
        {"name": name, "tax_category_key": "service.generic", "price": 1000},
    )
    rows = hub.query("services.services.list")
    found = next((s for s in rows if s.get("name") == name), None)
    if found is None:
        raise AssertionError(
            f"the service `{name}` is not in the catalogue after creating it"
        )
    return found["id"]


def create_package(
    hub: Hub,
    name: str,
    max_uses: int | None,
    validity_days: int | None,
    service_id: str | None = None,
) -> str:
    """Creates a voucher through the WASM handler `create_package` and returns its id.

    The id comes off the command's OWN `result`, never off `packages.list`: this hub is shared for
    the length of the run and the list's `default_sort` is `name`, so «the last row» is whichever
    package happens to sort last, not the one just created.

    The voucher carries at least ONE line, which `schemas/package_create.json` requires
    (`minItems: 1`, services#42): a voucher that describes nothing sellable is not a product, and
    the runtime refuses the payload with 422 before the handler ever runs."""
    svc = service_id or catalog_service(hub)
    out = hub.run(
        "services.packages.create",
        {
            "name": name,
            "discount_type": "percentage",
            "discount_percent_bp": 1000,
            "max_uses": max_uses,
            "validity_days": validity_days,
            "items": [{"service_id": svc, "quantity": ONE}],
        },
    )
    return out["result"]["id"]


def grant(
    hub: Hub,
    package_id: str,
    customer_id: str,
    granted_at: str | None = None,
) -> str:
    """Sells the voucher to a customer and returns the `grant_id` — the PURCHASE row without which
    no session can be spent (services#73). The id comes off the command's own `result`.

    `granted_at` is accepted by `schemas/package_grant.json` because the instant that counts is when
    the voucher was SOLD, not when the statement ran (the `sale.completed` listener arrives by the
    outbox, possibly minutes later). A battery uses it to buy a voucher in the past — which is the
    only way to observe expiry through the public door, and a truer test than the hub e2e's raw
    `UPDATE … SET granted_at`: the clock is set by the same door a real sale sets it with."""
    payload = {"package_id": package_id, "customer_id": customer_id}
    if granted_at is not None:
        payload["granted_at"] = granted_at
    out = hub.run("services.packages.grant", payload)
    return out["result"]["grant_id"]


def balance_of(hub: Hub, customer_id: str, grant_id: str) -> dict:
    """The one row of `services.packages.balance` that belongs to `grant_id`.

    The query answers ONE ROW PER GRANT since services#73 — a customer who bought the same voucher
    twice has two — so a battery must name the grant it means instead of taking `[0]`."""
    rows = hub.query("services.packages.balance", {"customer_id": customer_id})
    row = next((r for r in rows if r.get("grant_id") == grant_id), None)
    if row is None:
        raise AssertionError(
            f"the grant {grant_id} is not in the balance of {customer_id}: {rows}"
        )
    return row
