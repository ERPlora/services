-- Undo of a voucher hold while the sale is NOT settled (`services.packages.release_hold`,
-- services#70 / ADR-0386). Soft-deletes the hold, which is what gives the session back: every
-- count in this module — the guard of `_hold_insert.sql`, `package_balance`, `tender_options` —
-- looks at live rows only.
--
-- 🔴 The guard IS this WHERE, and that is the whole point. Releasing and settling are the same
-- conditional UPDATE over the same row, so they cannot both win: whichever commits first takes
-- the row out of the other's WHERE. There is no read-then-decide in between, which is what makes
-- «undo a session that was already delivered» impossible rather than unlikely. `settled_at IS
-- NOT NULL` means the customer walked out having had the service — Fresha says it plainly
-- («no changes can be made once the payment has been processed») and it is right.
--
-- Zero rows touched is the refusal: the manifest declares `expect_rows min 1`, so the dispatcher
-- raises `services.hold_not_releasable` instead of reporting a silent success.
--
-- `release_reason = 'released'` is what separates a DECISION from a timeout (services#77). An
-- abandoned hold is soft-deleted by exactly the same mechanism (`commands/hold_expire.sql`), so
-- without this stamp a salon reading its voucher history would see «the cashier undid it» and
-- «nobody ever came back» as the same row.
UPDATE services_package_redemption
   SET is_deleted     = 1,
       deleted_at     = :now,
       release_reason = 'released',
       updated_by     = :current_user_id,
       updated_at     = :now
 WHERE id = :redemption_id
   AND hub_id = :hub_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL;
