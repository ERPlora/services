-- Queues every door that decides on a voucher (services#120, services#133): the first statement of the void,
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
-- 🔴 It locks EVERY grant of the voucher's pair (package + customer), not only `:grant_id`
-- (services#133). The anti-double-spend ordinal of the hold and the redeem (`use_index`, migration
-- 011) is numbered over the pair, so two tills on two grants of the same pair — a customer who
-- bought the same voucher twice — both computed the same `MAX + 1` and the late one died on
-- `uq_services_redemption_use`: the generic «could not complete» with sessions left on its own
-- voucher. Queued on the pair, the late till waits and then numbers after the first. The rows are
-- locked in `id` order so two doors of the same pair always take them in the same order and
-- cannot deadlock.
--
-- Both sides of the pair are scoped to the hub: `g` by `:hub_id`, the siblings by `g`'s hub, so a
-- grant of another hub carrying the same package and customer ids is never queued with this one.
-- No other filter: it locks voided grants too, so a late door still waits and then is refused by
-- its own rule — the refusal stays where it always was.
SELECT s.id
  FROM services_package_grant g
  JOIN services_package_grant s
    ON s.hub_id = g.hub_id
   AND s.package_id = g.package_id
   AND s.customer_id = g.customer_id
 WHERE g.id = :grant_id
   AND g.hub_id = :hub_id
 ORDER BY s.id
   FOR UPDATE OF s;
