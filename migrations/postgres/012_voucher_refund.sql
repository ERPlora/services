ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS refunded_at    TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS refunded_by    TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS refund_ref     TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS refund_note    TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS refund_expired INTEGER;

CREATE INDEX IF NOT EXISTS ix_services_redemption_refund
    ON services_package_redemption (hub_id, refund_ref)
    WHERE refunded_at IS NOT NULL;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_refund
  CHECK (refunded_at IS NULL
         OR (is_deleted = 1
             AND settled_at IS NOT NULL
             AND refunded_by IS NOT NULL
             AND refund_ref IS NOT NULL)) NOT VALID;

-- Services · migration 012 — a paid voucher session goes BACK to the voucher when the sale is
-- returned (services#71, ADR-0386). The prose is at the BOTTOM by house rule (hub#1137): the
-- migration guard matches a `DROP` at the START of the statement text and its splitter keeps a
-- preceding comment inside the statement, so a header above SQL is the shape that silently defeats
-- it. There is no `DROP` here — this is an `expand` and nothing is destroyed — but the shape is
-- kept so no one has to check.
--
-- WHY THIS EXISTS. Migration 011 made the voucher a tender: the session is `held` while the
-- checkout is open and `consumed` once the sale is paid, and from the settle onwards
-- `hold_release.sql` refuses — correctly, because the customer had the haircut. That leaves the
-- other half open: the sale gets RETURNED. **Mindbody** leaves the visit attached to a voucher it
-- has already refunded — «it will remain attached to the returned Pricing Option as if it were
-- still paid» — so the customer loses the session AND the voucher. **Fresha** does not even try:
-- «no changes can be made once the payment has been processed». That is the outcome this closes.
--
-- HOW THE SESSION COMES BACK, AND WHY IT IS A SOFT-DELETE AND NOT A NEW STATUS
--
-- Every count in this module — the guard of `_hold_insert.sql`, `_redeem_insert.sql`,
-- `package_balance`, `package_tender_options`, `package_redeem_check` — looks at LIVE rows only,
-- and the two unique indexes of migration 011 are partial on `is_deleted = 0`. So «give the session
-- back» already has exactly one meaning here: take the row out of the live set. A third `status`
-- would have meant editing six counts and hoping none was missed — and a missed one is a session
-- the customer paid for twice. The refund reuses the ONE mechanism that already exists.
--
-- The row is not lost by that: soft-delete keeps it, with everything it was carrying (which sale,
-- which checkout line, which service, which ordinal), and the five columns above turn it into the
-- audit trail the ADR demands. `services.packages.redemption_history` reads the soft-deleted rows
-- on purpose, which is where the refunds live.
--
--   * `refunded_at` / `refunded_by` — when the session came back and who returned it. This is what
--     separates a REFUND from a RELEASE: both soft-delete, but a release undoes a hold that was
--     never paid (`settled_at IS NULL`) and needs no authority.
--   * `refund_ref` — the return document from `sales`, opaque to this module, exactly like
--     `checkout_ref`/`line_ref`. It is what makes the movement reconcilable against the money, and
--     it is also THE IDEMPOTENCE KEY (below).
--   * `refund_note` — why, in the operator's words. Optional, because a reason invented to satisfy
--     a NOT NULL is worse than none.
--   * `refund_expired` — whether the voucher was ALREADY EXPIRED at the moment the session came
--     back. It is stored rather than derived because it stops being derivable one statement later:
--     expiry is anchored on `MIN(redeemed_at)` over the LIVE uses, and the refund itself can move
--     that anchor.
--
-- 🔴 EXPIRY NEVER BLOCKS A REFUND — decided, not left to happen
--
-- The guards of this module weigh validity against `:now`. That is right for a live sale and wrong
-- for a rectification: a ticket from three weeks ago is being undone TODAY, and asking «is the
-- voucher valid today?» would refuse the undo of an act that was perfectly valid when it happened.
-- Refusing is also the market's own failure re-created by a different door — the customer would
-- lose the session and the money path with it, and `sales`'s return would fail at confirm, which
-- ADR-0386 forbids («no elegible con su motivo, en vez de fallar al confirmar»).
--
-- So the refund path does not consult expiry as a GUARD at all. It REPORTS it:
-- `services.packages.refund_check` answers `voucher_expired` before the operator confirms, and the
-- refund stamps `refund_expired` on the row. The session goes back either way; what nobody gets is
-- a silent surprise. Validity is NOT extended and NOT reset — extending it would hand out an
-- entitlement nobody bought, and it is not ours to hand out.
--
-- What DOES move, and correctly, is the anchor. Expiry runs from the customer's FIRST LIVE use, so
-- refunding the use that started the clock un-starts it: a use that was returned is not a use. If
-- it was the only one, the voucher goes back to «not started yet» and the clock begins again on the
-- next session. That is not a loophole — it is the same rule the hold has always applied, reading a
-- set of rows that the refund honestly changed.
--
-- 🔴 IDEMPOTENCE LIVES IN THE STATEMENTS, NOT IN AN `IF`
--
-- `commands/_refund_update.sql` is a conditional UPDATE over one row (`is_deleted = 0 AND status =
-- 'consumed' AND settled_at IS NOT NULL`), and `commands/_refund_assert.sql` passes only when that
-- row now carries THIS `refund_ref`. Together:
--
--   * the same document twice — a retry, a double tap — updates ZERO rows and the assert still
--     passes, because the row already carries that ref. Nothing is written, nothing is re-stamped,
--     and the caller is not lied to;
--   * a DIFFERENT document trying to return the same session updates zero rows and the assert
--     FAILS, so the whole transaction rolls back. One session, one refund;
--   * two tills doing it at once cannot both win: the second blocks on the row and re-evaluates
--     the WHERE against the committed version. There is no read-then-decide in between, which is
--     the difference between this and Odoo#79235 — open since 2021 for the mirror-image bug.
--
-- The CHECK above is the same rule stated where no command can walk around it: a refund stamp
-- cannot exist on a row that is still live, was never settled, or names neither an author nor a
-- document. An unauditable refund is not a refund, so the schema refuses to hold one.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS. Every column is nullable and added with `IF NOT EXISTS`;
-- the index is partial on `refunded_at IS NOT NULL`, which no existing row satisfies; and the CHECK
-- is `NOT VALID` — enforced from now on, with no scan of the existing rows, so a legacy row cannot
-- make `migrate` abort and leave the module half-installed (the lesson of migration 007). Nothing
-- is renamed and nothing is dropped, so a hub that has not taken this migration keeps working
-- exactly as before: it simply has no refund door.
