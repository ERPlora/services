-- A paid voucher session goes BACK to the voucher because the sale was returned (statement 1 of 3
-- of `services.packages.refund_redemption`, services#71 / ADR-0386). Conditional UPDATE: it only
-- moves the row when it really is a delivered session — live, `consumed`, and stamped with the sale
-- that paid for it. If any of that is false it touches nothing and the assert
-- (`_refund_assert.sql`) decides whether that was a harmless retry or a second refund to refuse.
--
-- The runtime injects :hub_id, :current_user_id and :now. The WASM handler of
-- `services.packages.refund_redemption` supplies :redemption_id, :refund_ref and :refund_note from
-- the payload it has already verified against `services.packages.refund_check`.
--
-- 🔴 The soft-delete IS the session coming back. Every count in this module reads live rows only
-- and both unique indexes of migration 011 are partial on `is_deleted = 0`, so taking the row out
-- of the live set gives the session back through the ONE mechanism that already exists — no sixth
-- count to remember, no `status` to add and forget somewhere. The row itself survives with the five
-- refund columns, which is what makes the movement auditable instead of a silent decrement.
--
-- 🔴 No fiscal document comes out of here, and that is law. A voucher of N sessions is UNIVALENT:
-- art. 30 ter.1 of Directive 2006/112/CE says the supply made in exchange for it «shall not be
-- regarded as an independent transaction», so the fiscal record was issued when the voucher was
-- SOLD. Giving a session back moves a balance inside that already-taxed voucher; it emits nothing
-- and rectifies nothing. The money side of the return is `sales`' rectificativa, not this.
--
-- `refund_expired` is computed here, in the same statement, because one statement later it is no
-- longer computable: expiry is anchored on `MIN(redeemed_at)` over the LIVE uses and this very
-- UPDATE can move that anchor. The subquery reads the statement's snapshot, so the row being
-- returned still counts — the flag answers «was the voucher expired at the moment the session came
-- back?», which is the question an auditor asks. A voucher with no validity, or whose clock never
-- started, is not expired: the date bridge over a NULL anchor yields NULL, the comparison is NULL,
-- and the CASE falls to 0 rather than to a guess. (The anchor is written as a subquery and never as
-- a bridge call inside this prose: the runtime lowers every `erp_*` call it finds in the statement
-- TEXT, comments included, so a bridge named in a comment is a bridge it tries to lower.)
--
-- `services_package` is joined but NOT filtered on `is_deleted`/`is_active` on purpose: archiving
-- or deleting the voucher template must not trap a customer's refund. The row is only there for
-- `validity_days`.
UPDATE services_package_redemption AS r
   SET is_deleted = 1,
       deleted_at = :now,
       refunded_at = :now,
       refunded_by = :current_user_id,
       refund_ref = :refund_ref,
       refund_note = COALESCE(:refund_note, ''),
       refund_expired = CASE
           WHEN p.validity_days IS NOT NULL
                AND erp_dt(:now) > erp_dateadd(
                      (SELECT MIN(a.redeemed_at)
                         FROM services_package_redemption a
                        WHERE a.hub_id = r.hub_id
                          AND a.package_id = r.package_id
                          AND a.customer_id = r.customer_id
                          AND a.is_deleted = 0),
                      p.validity_days, 'days')
           THEN 1 ELSE 0 END,
       updated_by = :current_user_id,
       updated_at = :now
  FROM services_package p
 WHERE r.id = :redemption_id
   AND r.hub_id = :hub_id
   AND p.id = r.package_id
   AND p.hub_id = r.hub_id
   AND r.is_deleted = 0
   AND r.status = 'consumed'
   AND r.settled_at IS NOT NULL;
