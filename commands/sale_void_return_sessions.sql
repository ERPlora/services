-- Every voucher session spent on a sale goes BACK to its voucher when that sale is voided
-- (`services._on_sale_voided`, statement 2 of 3, services#151 / SERVICES-F27).
--
-- `sales.void` undoes a COMPLETED sale as a whole: it refuses a sale that already has a return and
-- one that carries a full invoice, so whatever reaches this listener reverses the entire ticket.
-- For the voucher that is a full return (the market this module adopted — Mindbody, Vagaro,
-- Boulevard, Fresha — and this module's own rule «what was charged only comes back through a
-- return»), so it is written exactly as `_refund_update.sql` writes one: the soft-delete IS the
-- session coming back, the row keeps the five refund columns, and the ledger reads it as
-- `refunded` (**Devuelta**). The return document is the voided SALE itself (`refund_ref`), the
-- note is the void's reason and the actor is whoever voided it — the operator, not the listener.
--
-- Idempotent by construction: a redelivered `sale.voided` finds the rows already out of the live
-- set and touches nothing. A session another return already gave back is out of the live set too,
-- so a session never comes back twice.
--
-- 🔴 No fiscal document and no money: the void's money side is `sales`', and a univalent voucher's
-- record came out when it was SOLD (art. 30 ter.1 of Directive 2006/112/CE).
--
-- The grant is joined (hub-matched, NOT filtered on `is_deleted`, as in the refund) only for the
-- terms that say whether the voucher had expired at the moment the session came back.
UPDATE services_package_redemption AS r
   SET is_deleted = 1,
       deleted_at = :now,
       refunded_at = :now,
       refunded_by = COALESCE(NULLIF(TRIM(CAST(:voided_by AS TEXT)), ''), :current_user_id),
       refund_ref = CAST(:sale_id AS TEXT),
       refund_note = COALESCE(TRIM(CAST(:reason AS TEXT)), ''),
       refund_expired = CASE
           WHEN g.validity_days IS NOT NULL
                AND erp_dt(:now) > erp_dateadd(g.granted_at, (g.validity_days + COALESCE(adj.days_delta, 0)), 'days')
           THEN 1 ELSE 0 END,
       updated_by = :current_user_id,
       updated_at = :now
  FROM services_package_grant g
  LEFT JOIN (SELECT hub_id, grant_id, CAST(SUM(days_delta) AS BIGINT) AS days_delta
               FROM services_package_grant_adjustment
              WHERE is_deleted = 0
              GROUP BY hub_id, grant_id) adj
         ON adj.grant_id = g.id AND adj.hub_id = g.hub_id
 WHERE r.hub_id = :hub_id
   AND r.sale_id = CAST(:sale_id AS TEXT)
   AND g.id = r.grant_id
   AND g.hub_id = r.hub_id
   AND r.is_deleted = 0
   AND r.status = 'consumed'
   AND r.settled_at IS NOT NULL;
