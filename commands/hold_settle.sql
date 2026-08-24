-- A held voucher session becomes FINAL because the sale was paid (`services.packages.settle_hold`,
-- services#70 / ADR-0386). From here the session is delivered: the hold can no longer be released,
-- and giving it back is a REFUND, which is services#71 and goes through its own audited door.
--
-- 🔴 No second fiscal document comes out of here, and that is law, not convenience. A voucher of N
-- sessions is UNIVALENT: art. 30 ter.1 of Directive 2006/112/CE says the actual supply made in
-- exchange for the voucher «shall not be regarded as an independent transaction», so the fiscal
-- record was already issued WHEN THE VOUCHER WAS SOLD, with the service's VAT. Issuing another one
-- at redemption would be double taxation. (Vouchers are not in the Spanish LIVA — Directive
-- 2016/1065 was never transposed — so what governs is the Directive plus the DGT Resolution of
-- 28/12/2018.) This statement moves a balance and stamps a sale id. Nothing else.
--
-- Same conditional-UPDATE guard as the release, and deliberately the same shape: settle and
-- release race over one row and only one of them can take it. Settling twice touches nothing.
--
-- 🔴 THE SETTLE DOES NOT CONSULT THE DEADLINE, and that is deliberate (services#77). A settle IS
-- somebody coming back, so refusing a hold whose day had turned would charge the SALON a whole
-- service — the till stopped billing that line the moment the voucher was applied. It clears
-- `expires_at` instead, because a delivered session is final and `ck_services_redemption_deadline`
-- says so in the schema. There is no window for a double spend either: a reclaimed session can only
-- be TAKEN through `services._hold` or `services._redeem`, and both soft-delete the stale row in
-- their own transaction before counting, so by then this UPDATE no longer matches anything.
UPDATE services_package_redemption
   SET status = 'consumed',
       settled_at = :now,
       expires_at = NULL,
       sale_id = :sale_id,
       updated_by = :current_user_id,
       updated_at = :now
 WHERE id = :redemption_id
   AND hub_id = :hub_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL;
