-- The voucher SOLD on a line of a sale is voided when a refund gives that line back, used or not
-- (`services._on_sale_refunded`, statement 3 of 3, services#158 / SERVICES-F14).
--
-- `sale.refunded` names the lines that went back with the money (`lines`: line, product and
-- quantity, SALES-F31). A line whose product is a voucher of this catalogue sold on this sale takes
-- back as many of those vouchers as units went back — the same void as the full refund
-- (statement 2): who refunded, when and the refund's reason. A line of a haircut, or of anything
-- that is not a voucher, matches no grant and voids nothing; a refund that names no line (money
-- only, or a `sales` older than services#158, which binds NULL) voids nothing here either.
--
-- WHICH voucher. `sale.completed` does not say which sale line minted which grant (its `sale_ref`
-- is the position of the line in that event, not the line's id), so the vouchers of one package
-- sold on one sale are interchangeable and they are taken in a stable order: the intact ones first
-- — of two identical vouchers the customer gives back the one she has not used — then the oldest.
-- Two lines of the same package in one refund take DIFFERENT vouchers: each line takes the slots
-- after the units the lines before it took.
--
-- 🔴 Used or not (services#157), as in the full refund: the visits already made stay made — no
-- session is touched here — and what was left is lost. The till says so before the operator
-- confirms (`services.packages.sold_on_sale`, slot `sales.reversal.notice`). Statement 1
-- (`sale_void_lock.sql`) queued this on the voucher's pair, so a till holding a session of it waits.
--
-- IDEMPOTENT. Each voided voucher is stamped with the refund line it answered (`void_refund_id`,
-- `void_sale_item_id`, migration 021): a redelivered event finds its lines answered and voids
-- nothing more, and a later refund of ANOTHER line of the same package takes the next live voucher.
-- `sales` refuses to return a line twice (`sales.refund_line_already_returned`). A full refund that
-- also names lines has voided everything in statement 2, so this one finds nothing live.
--
-- Only `source = 'sale'` rows carry the sale that minted them; a manual grant naming a sale id is
-- an operator's note.
WITH returned AS (
    SELECT l.value ->> 'line_id'    AS line_id,
           l.value ->> 'product_id' AS package_id,
           CAST(GREATEST(1, FLOOR(COALESCE(CAST(NULLIF(l.value ->> 'quantity', '') AS NUMERIC), 1000000)
                                  / 1000000)) AS BIGINT) AS units,
           l.ord
      FROM jsonb_array_elements(CAST(COALESCE(CAST(:lines AS TEXT), '[]') AS jsonb))
           WITH ORDINALITY AS l(value, ord)
     WHERE COALESCE(l.value ->> 'line_id', '') <> ''
       AND NOT EXISTS (
           SELECT 1
             FROM services_package_grant d
            WHERE d.hub_id = :hub_id
              AND d.void_refund_id = CAST(:refund_id AS TEXT)
              AND d.void_sale_item_id = l.value ->> 'line_id'
       )
),
wanted AS (
    SELECT CAST(:hub_id AS TEXT) AS hub_id,
           r.line_id,
           r.package_id,
           r.units,
           CAST(SUM(r.units) OVER (PARTITION BY r.package_id ORDER BY r.ord) AS BIGINT)
               - r.units AS taken_before
      FROM returned r
),
candidates AS (
    SELECT g.id,
           g.hub_id,
           g.package_id,
           ROW_NUMBER() OVER (
               PARTITION BY g.package_id
               ORDER BY EXISTS (
                            SELECT 1
                              FROM services_package_redemption r
                             WHERE r.hub_id = g.hub_id
                               AND r.grant_id = g.id
                               AND r.is_deleted = 0
                        ),
                        g.granted_at, g.sale_ref, g.id
           ) AS slot
      FROM services_package_grant g
     WHERE g.hub_id = :hub_id
       AND g.sale_id = CAST(:sale_id AS TEXT)
       AND g.source = 'sale'
       AND g.is_deleted = 0
       AND g.voided_at IS NULL
),
picked AS (
    SELECT c.id, w.line_id
      FROM candidates c
      JOIN wanted w
        ON w.hub_id = c.hub_id
       AND w.package_id = c.package_id
       AND c.slot > w.taken_before
       AND c.slot <= w.taken_before + w.units
)
UPDATE services_package_grant AS g
   SET is_deleted = 1,
       deleted_at = :now,
       voided_at = :now,
       voided_by = COALESCE(NULLIF(TRIM(CAST(:refunded_by AS TEXT)), ''), :current_user_id),
       void_reason = COALESCE(TRIM(CAST(:reason AS TEXT)), ''),
       void_refund_id = CAST(:refund_id AS TEXT),
       void_sale_item_id = p.line_id,
       updated_by = :current_user_id,
       updated_at = :now
  FROM picked p
 WHERE g.hub_id = :hub_id
   AND g.id = p.id;
