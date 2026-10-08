-- Queues the void of a PAID sale behind every door that decides on the vouchers it sold
-- (`services._on_sale_voided`, statement 1 of 3, services#151; and its full refund,
-- `services._on_sale_refunded`, statement 1 of 3, services#154, services#158). Same lock and same order as
-- `_grant_lock.sql`, which every till takes before it holds a session: the last statement voids
-- every voucher this sale minted, used or not (services#157), and a till holding a session of one
-- of them at the same instant must not slip a new hold onto a voucher that is being voided.
-- Locking the whole pair (package + customer) of every voucher this sale minted makes the till wait
-- for the void and then read the voucher voided («Este bono está anulado»), or the void wait for
-- the till; either way the hold already made stays made, like every visit before it.
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
