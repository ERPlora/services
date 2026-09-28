#!/usr/bin/env python3
"""sales#100 — the `cashier` role is DECLARED by `sales` (a job / permission set, never an identity:
Toast, Square, Mindbody, Vagaro — decided in ERPlora/pm#9) and every module the till touches
GRANTS to that key what a cashier needs there. The runtime does not inherit from `employee`
(`permissions_for_role` = union of what each active module grants to the key), so a hub that
switches the role on and installs this module without this grant hands the cashier an empty screen.

Contract: what services grants to `cashier`, and what it must NOT (reports, settings, catalogue edits).
Usage: tests/cashier_role.contract.test.py   (exit 0 = green)
"""
import json, pathlib, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
m = json.loads((ROOT / "module.json").read_text())
grants = m.get("role_permissions", {}).get("cashier")
MUST = [
    "services.view_service",
    "services.view_category",
    "services.view_package",
    "services.view_package_balance",
    "services.redeem_package"
]
MUST_NOT = [
    "services.add_service",
    "services.change_service",
    "services.delete_service",
    "services.manage_settings",
    # services#71 — giving a PAID session back to the voucher is the voucher's half of a return,
    # and returns are a manager decision everywhere the market has one (`sales.void_sale` is
    # manager+admin here, and this is the same authority through another door). The cashier holds
    # and settles; a refund carries a document and an author. Pinned here so it cannot be widened
    # by accident.
    "services.refund_package",
    # services#82 — voiding a voucher sold by mistake undoes a sale's entitlement: manager+admin,
    # like `sales.void_sale`, never the person who rang it up.
    "services.void_grant",
    # services#118 — giving sessions or days away is a courtesy with a cost to the business (the
    # same authority as a void): manager+admin, never the till. services#119 — correcting the
    # balance (taking sessions away) goes through the same door and the same authority.
    "services.adjust_grant"
]

errors = []
if grants is None:
    errors.append("role_permissions.cashier is not declared")
else:
    for p in MUST:
        if p not in grants: errors.append(f"cashier lacks {p}")
    for p in MUST_NOT:
        if p in grants: errors.append(f"cashier must not get {p}")
    if "*" in grants: errors.append("cashier must never get *")
    for p in MUST_NOT:
        if p not in m["permissions"]: errors.append(f"{p} is pinned away from the cashier but the module does not declare it")
    for p in grants:
        if p not in m["permissions"]: errors.append(f"cashier is granted {p}, which this module does not declare")
for e in errors: print("FAIL:", e)
print("cashier role grants:", "OK" if not errors else f"{len(errors)} error(s)")
sys.exit(1 if errors else 0)
