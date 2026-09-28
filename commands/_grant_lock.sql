-- Queues every door that decides on ONE voucher (services#120): the first statement of the void,
-- the balance correction, the till's hold and the chair's redeem, before the statement that
-- re-checks its rule.
--
-- Each of those doors re-checks its rule inside its own transaction («no session spent or held»,
-- «never below what is spent», «sessions left, not voided»), but under READ COMMITTED a re-check
-- reads a snapshot, and the two sides of each pair write DIFFERENT rows — the till inserts a
-- redemption, the void updates the grant, the correction inserts a movement. Nothing made the
-- second door wait for the first, so both read the world before the other committed and BOTH
-- landed: a voided voucher with a session held on it, or a corrected one with fewer sessions left
-- than spent (a write skew). Locking the grant row here makes the second door wait until the
-- first commits; the NEXT statement then takes a fresh snapshot and sees what the first did.
--
-- 🔴 It has to be its OWN statement, before the guarded one. A `FOR UPDATE` inside the guarded
-- statement would not do: when an UPDATE waits on a row and re-checks it, Postgres re-evaluates
-- the row's own conditions but NOT its subqueries, which keep the old snapshot — that is exactly
-- how the void's `NOT EXISTS` missed the session a till had just committed.
--
-- No filter besides the grant and the hub: it locks a voided grant too, so a late door still
-- waits and then is refused by its own rule — the refusal stays where it always was.
SELECT g.id
  FROM services_package_grant g
 WHERE g.id = :grant_id
   AND g.hub_id = :hub_id
   FOR UPDATE;
