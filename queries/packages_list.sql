-- The hub's voucher catalogue with its number of lines, for **Bonos y paquetes**.
--
-- `status`: 'retired' (deleted from the catalogue), 'inactive' (deactivated) or 'active'. It is a
-- LIST query: the runtime wraps this SELECT and composes search/filter/sort/pagination from the
-- `list` block of module.json, so `status` is filterable like any projected column.
--
-- `:include_retired` — the SCOPE, not a filter (services#153, same pattern as `:include_archived`
-- in `services_list.sql`). By default this query answers what it always did, because the
-- `sale.completed` listener (`services._on_sale_completed`) reads it with no params to know which
-- lines of a ticket are vouchers being SOLD: a deleted package must never be sold again. The
-- catalogue asks for the retired ones EXPLICITLY, and only gets those somebody bought: deleting a
-- package stops selling it, but its «Bonos vendidos» and «Movimientos» still have to be reachable
-- (Square, Fresha, Booksy, Mindbody, Vagaro: a retired package keeps its sold vouchers visible).
-- A retired package nobody bought has nothing left to show and stays out.
--
-- `CAST(... AS TEXT)`: a `<select>` sends strings and a command sends numbers. Absent = NULL =
-- default scope.
SELECT p.id, p.name, p.slug, p.discount_type, p.discount_percent_bp, p.discount_amount_cents,
       p.fixed_price, p.is_active,
       CASE
         WHEN p.is_deleted = 1 THEN 'retired'
         WHEN p.is_active = 0 THEN 'inactive'
         ELSE 'active'
       END AS status,
       -- Lines as sold: a retired package's lines were deleted with it and still count.
       (SELECT COUNT(*)
        FROM services_packageitem i
        WHERE i.package_id = p.id AND i.hub_id = p.hub_id
          AND (i.is_deleted = 0 OR p.is_deleted = 1)) AS items
FROM services_package p
WHERE p.hub_id = :hub_id
  AND (
    p.is_deleted = 0
    OR (
      COALESCE(CAST(:include_retired AS TEXT), '0') IN ('1', 'true')
      AND EXISTS (SELECT 1 FROM services_package_grant g
                   WHERE g.hub_id = p.hub_id AND g.package_id = p.id)
    )
  )
