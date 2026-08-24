-- An ABANDONED voucher hold gives its session back (services#77, ADR-0386). Soft-deletes every
-- live hold of this hub whose deadline has passed, which is what returns the session: every count
-- in this module — the guard of `_hold_insert.sql`, `tender_options`, `balance`, `redeem_check` —
-- looks at live rows only.
--
-- ONE STATEMENT, TWO CALLERS, on purpose:
--
--   1. `services.packages.expire_holds`, on a schedule. This is the janitor, and it is the SMALLER
--      half of the job: it keeps the table honest so a salon's ledger does not fill with dead
--      `held` rows, and so `redemption_history` can say «nobody came back» rather than showing a
--      session that simply never moved again.
--   2. 🔴 the FIRST statement of `services._hold` and `services._redeem`, inside their own
--      transaction. This is what actually guarantees the session comes back: it is reclaimed by
--      the very act of somebody trying to use it, with no worker in the picture. WooCommerce frees
--      held stock from a cron scheduled at the same interval as the hold, so when the cron does not
--      run — loopback or REST blocked, a classic — the stock stays blocked FOREVER; appointments#69
--      already wrote that lesson down in this codebase. A guard that depends on a worker is not a
--      guard.
--
-- It also frees `uq_services_redemption_line`, which is partial on `is_deleted = 0`: an expired
-- hold left live would refuse the retry on the very line the cashier is standing in front of. And
-- the freed use ordinal is safe to leave behind, because `_hold_insert.sql` computes
-- `MAX(use_index) + 1` and never `COUNT + 1` (migration 011).
--
-- 🔴 IDEMPOTENT AND ATOMIC BY SHAPE, not by an `IF`. It is one conditional UPDATE over the live
-- holds: running it twice touches zero rows the second time, and it races the release and the
-- settle over the same rows the way those two already race each other — whoever commits first
-- takes the row out of the other's WHERE. There is no read-then-decide anywhere in between, which
-- is the difference between «cannot happen» and «unlikely».
--
-- `release_reason` is what separates this from a release: both soft-delete, but `expired` means
-- nobody came back and `released` means the cashier decided. A salon reading its voucher history
-- must not see one as the other. It is stamped only where it is still empty, so a sweep can never
-- re-label a hold somebody had already undone.
--
-- The deadline is compared through `erp_dt` (ADR-0007) rather than as text: both sides are UTC
-- instants written from the runtime's `:now`, and comparing them as strings would depend on their
-- formatting rather than on time.
UPDATE services_package_redemption
   SET is_deleted     = 1,
       deleted_at     = :now,
       release_reason = 'expired',
       updated_by     = :current_user_id,
       updated_at     = :now
 WHERE hub_id = :hub_id
   AND is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL
   AND expires_at IS NOT NULL
   AND erp_dt(expires_at) <= erp_dt(:now);
