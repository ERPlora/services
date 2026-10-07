-- Queues the void of a PAID sale behind every door that decides on the vouchers it sold
-- (`services._on_sale_voided`, statement 1 of 3, services#151; and its full refund,
-- `services._on_sale_refunded`, statement 1 of 2, services#154). Same lock, same order and same
-- reason as `_grant_lock.sql`: the last statement voids a sold voucher only if no session of it is spent
-- or held, and under READ COMMITTED that `NOT EXISTS` reads a snapshot — a till holding a session
-- of that voucher at the same instant would land on a voided voucher (a write skew). Locking the
-- whole pair (package + customer) of every voucher this sale minted makes the till wait for the
-- void, or the void wait for the till; the next statement then takes a fresh snapshot.
--
-- A sale that sold no voucher locks nothing, which is correct: returning the sessions it SPENT
-- (statement 2) updates those redemption rows themselves, and a row lock is all that needs.
SELECT s.id
  FROM services_package_grant g
  JOIN services_package_grant s
    ON s.hub_id = g.hub_id
   AND s.package_id = g.package_id
   AND s.customer_id = g.customer_id
 WHERE g.hub_id = :hub_id
   AND g.sale_id = :sale_id
   AND g.source = 'sale'
 ORDER BY s.id
   FOR UPDATE OF s;
