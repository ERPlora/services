ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS expires_at     TEXT;
ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS release_reason TEXT NOT NULL DEFAULT '';

UPDATE services_package_redemption
   SET expires_at = (redeemed_at::timestamptz + interval '1 day')::text
 WHERE is_deleted = 0
   AND status = 'held'
   AND settled_at IS NULL
   AND expires_at IS NULL;

UPDATE services_package_redemption
   SET release_reason = 'released'
 WHERE is_deleted = 1
   AND status = 'held'
   AND settled_at IS NULL
   AND refunded_at IS NULL
   AND release_reason = '';

CREATE INDEX IF NOT EXISTS ix_services_redemption_deadline
    ON services_package_redemption (hub_id, expires_at)
    WHERE is_deleted = 0 AND status = 'held';

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_release_reason
  CHECK (release_reason IN ('', 'released', 'expired')) NOT VALID;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_reason_deleted
  CHECK (release_reason = '' OR is_deleted = 1) NOT VALID;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_deadline
  CHECK (expires_at IS NULL OR settled_at IS NULL) NOT VALID;

-- Services · migration 014 — an ABANDONED hold gives the session back, and the ledger says whether
-- somebody decided or the day simply ended (services#77, ADR-0386). The prose is at the BOTTOM by
-- house rule (hub#1137/ADR-0387): the migration guard matches a `DROP` at the START of the
-- statement text and its splitter keeps a preceding comment inside the statement, so a header above
-- SQL is the shape that silently defeats it. There is no `DROP` here — this is an `expand` and
-- nothing is destroyed — but the shape is kept so no one has to check.
--
-- WHAT WAS WRONG. `services.packages.hold_for_line` spends the session the instant the cashier taps
-- «pay with voucher», and nothing ever took it back on its own. A checkout that was never finished
-- — the tablet reloaded, the cart line was removed, the shift ended with the screen open — left a
-- `held` row counting against `max_uses` FOREVER. Square's own community has the same shape
-- unresolved: inventory stuck as «committed» to a ticket closed weeks earlier, which support could
-- not release from the interface either. A reservation with no owner and no deadline is not a
-- reservation, it is a leak.
--
-- 🔴 WHY A DAY, AND NOT A HANDFUL OF MINUTES
--
-- Decided by the market, not by us (13 references; the full table is in the pull request of
-- services#77). The minutes-long hold — Shopify's checkout reservation, Magento's quote lifetime,
-- WooCommerce's `Hold Stock` — exists to arbitrate between CONCURRENT STRANGERS on a website. At a
-- counter there is one receptionist, one customer and one till: there is nobody to race, so a short
-- timer buys nothing and introduces the one failure it was meant to prevent — the voucher letting
-- go of itself while the customer is still paying, after the till has already stopped charging for
-- that line.
--
-- What the counter products actually do is sweep at the END OF THE DAY OR SHIFT: **Toast**
-- auto-captures checks left open at 4:00 a.m.; **Dynamics 365 Commerce** offers «Void when closing
-- shift» so a suspended transaction must be finished or voided before the till closes;
-- **WooCommerce** runs a DAILY cleanup that deletes draft orders that are no longer active. The
-- ones that sweep NOTHING — Odoo POS, Lightspeed, Clover — are the ones whose forums are full of
-- «I cannot close the register», with drafts that have to be deleted by hand.
--
-- So the deadline is ONE DAY from the moment the session was held. It is comfortably longer than
-- any real checkout, which is what makes it impossible for it to fire under a live sale, and
-- comfortably shorter than forever. It is expressed as a day rather than as «4 a.m.» because a
-- clock hour needs a timezone this module does not have and would fire at lunchtime for whoever
-- runs it elsewhere; a full day since the hold says the same thing — the day it belonged to is
-- over — in every timezone at once.
--
--   * `expires_at` — the deadline, an ABSOLUTE instant computed by the server from the `:now` the
--     runtime injects. The payload has no way to propose it: a caller that chose its own deadline
--     could park a customer's voucher for a month. It is stored rather than derived at read time
--     because that is the difference between comparing two UTC instants and comparing a local clock
--     against one, which is the WooCommerce HPOS bug that cancelled orders instantly while its own
--     60-minute setting said otherwise. It is NULL on a session spent at the chair
--     (`services.packages.redeem`, born `consumed`) and cleared by the settle: a delivered session
--     has no deadline, and `ck_services_redemption_deadline` is that sentence where no command can
--     walk around it.
--   * `release_reason` — `released` when somebody decided (the cashier tapped undo) and `expired`
--     when nobody came back. Both soft-delete, so without this column the ledger could not tell an
--     operator's choice from a timeout, and `services.packages.redemption_history` would show a
--     salon two identical rows for two very different events. `''` on a live row, which is what
--     `ck_services_redemption_reason_deleted` pins down.
--
-- 🔴 THE SWEEP IS NOT WHAT FREES THE SESSION, AND THAT IS THE WHOLE DESIGN
--
-- `services.packages.expire_holds` runs on a schedule to keep the table honest, but the session
-- comes back WITHOUT IT. Two independent paths, both already in this transaction's reach:
--
--   1. the READS stop counting a hold the moment its deadline passes — `tender_options`, `balance`,
--      `redeem_check` and `holds_for_checkout` all carry the same predicate — so the till offers the
--      voucher again at the exact second it frees up, not at the next cron tick;
--   2. `commands/hold_expire.sql` is the FIRST statement of `services._hold` and `services._redeem`,
--      inside their own transaction, so the stale row is soft-deleted before anything is counted.
--      The session is reclaimed by the very act of trying to use it.
--
-- That ordering is the lesson WooCommerce paid for and appointments#69 already wrote down here:
-- WooCommerce frees held stock from a cron scheduled at the SAME interval as the hold, so the real
-- release lands somewhere between T+x and T+2x — and when the cron does not run (loopback or REST
-- blocked, a classic) the stock stays blocked forever. A guard that depends on a worker is not a
-- guard.
--
-- It is also what keeps the two unique indexes of migration 011 honest.
-- `uq_services_redemption_line` is partial on `is_deleted = 0`, so an expired hold left LIVE would
-- refuse the retry on the very line the cashier is standing in front of. The expiry soft-deletes,
-- which is the one mechanism that already means «give the session back» everywhere in this module,
-- and the freed ordinal is safe because `_hold_insert.sql` computes `MAX(use_index) + 1` and never
-- `COUNT + 1` (migration 011).
--
-- AND THE SETTLE STILL WINS. `hold_settle.sql` does not consult the deadline: a settle IS somebody
-- coming back, and refusing it would charge the salon a whole service — the till has already
-- stopped billing that line. It clears `expires_at` instead, because a delivered session is final.
-- There is no window for a double spend: the reclaimed session can only be TAKEN through
-- `services._hold` or `services._redeem`, and both soft-delete the stale row first, in the same
-- transaction, so by the time anyone can hold it the old row is already out of the settle's WHERE.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS. Both columns are added with `IF NOT EXISTS`, one nullable
-- and one with a default; the backfill gives every hold that is live TODAY the same one-day
-- deadline counted from when it was taken — so the sessions stuck by this very bug come back on the
-- first sweep instead of needing a support script — and stamps `released` on the holds a cashier
-- had already undone, which is what they were. The index is partial on the live holds, of which a
-- hub has a handful at any instant. The three CHECKs are `NOT VALID`: enforced from now on, with no
-- scan of the existing rows, so a legacy row cannot make `migrate` abort and leave the module
-- half-installed (the lesson of migration 007). Nothing is renamed and nothing is dropped, so a hub
-- that has not taken this migration keeps working exactly as before: its holds simply never expire.
