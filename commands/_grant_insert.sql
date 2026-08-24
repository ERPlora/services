-- The PURCHASE of a voucher: this customer now owns N uses of this package (statement 1 of 3 of
-- `services.packages.grant` and of the `sale.completed` listener, services#73 / ADR-0390).
-- Conditional INSERT: it only writes when the template really exists in THIS hub and is being
-- offered. If it does not, nothing is written and the assert (`_grant_assert.sql`) rolls the whole
-- transaction back — no grant, no event, no entitlement out of thin air.
--
-- The runtime injects :hub_id, :current_user_id and :now. The WASM handler supplies :grant_id (from
-- `context.new_ids`, so the command can hand the id back and the assert can verify exactly the row
-- the handler said it wrote) and :package_id, :customer_id, :source, :granted_at, :sale_id,
-- :sale_ref, the three amounts and :note.
--
-- 🔴 THE TERMS ARE SNAPSHOTTED, NOT REFERENCED. `max_uses` and `validity_days` are copied from the
-- template into the grant, so editing the catalogue afterwards cannot shorten a voucher somebody
-- already paid for. That is the contract sold to the customer, and a contract that changes under
-- them is not one. Everything else about the voucher — its name, its lines — is still read live,
-- because those are presentation, not terms.
--
-- 🔴 THIS IS WHERE THE VAT WAS ALREADY ACCRUED. A voucher of N sessions is UNIVALENT: art. 30 ter.1
-- of Directive 2006/112/CE says the supply made in exchange for it «shall not be regarded as an
-- independent transaction», so the fiscal record came out with the SALE that produced this row,
-- with the service's VAT — and the redemption issues nothing. (Vouchers are not in the Spanish
-- LIVA: Directive 2016/1065 was never transposed, so what governs is the Directive plus the DGT
-- Resolution of 28/12/2018.) The three amount columns are what makes that reconcilable: this grant
-- says which sale paid for it and for how much, base and VAT apart. Writing this row emits NO
-- fiscal document of its own — `sales` already did, and a second one would be double taxation.
--
-- `granted_at` defaults to `:now` but is accepted from the caller, because the moment that matters
-- is when the voucher was SOLD, not when this statement ran: the listener of `sale.completed` is
-- delivered by the outbox and can legitimately run seconds — or, after a retry, minutes — later.
--
-- The integer binds are CAST to BIGINT INSIDE the `COALESCE`, and the order is the point: that is
-- the type the runtime puts on the wire, and pinning it on the PARAMETER is what stops Postgres
-- from inferring `int4` from the `0` literal for a value the payload omits. Wrapping the whole
-- COALESCE instead casts the RESULT and leaves the slot as `int4`, which is the shape that pushed
-- 8 bytes into a 4-byte slot in services#50. `tests/bind_types.postgres.test.py` PREPAREs every
-- statement and refuses the wrong one. Full story in commands/service_create.sql.
INSERT INTO services_package_grant
  (id, hub_id, package_id, customer_id, granted_at, source, sale_id, sale_ref,
   amount_cents, net_amount_cents, tax_amount_cents, max_uses, validity_days, note,
   is_deleted, created_by, updated_by, created_at, updated_at)
SELECT
  :grant_id, :hub_id, p.id, :customer_id, COALESCE(:granted_at, :now),
  COALESCE(:source, 'manual'), :sale_id, COALESCE(:sale_ref, ''),
  COALESCE(CAST(:amount_cents AS BIGINT), 0),
  COALESCE(CAST(:net_amount_cents AS BIGINT), 0),
  COALESCE(CAST(:tax_amount_cents AS BIGINT), 0),
  p.max_uses, p.validity_days, COALESCE(:note, ''),
  0, :current_user_id, :current_user_id, :now, :now
FROM services_package p
WHERE p.id = :package_id AND p.hub_id = :hub_id AND p.is_deleted = 0 AND p.is_active = 1
  -- 🔴 IDEMPOTENCE ON THE DOCUMENT, not on a retry counter. `sale_ref` names the exact line and
  -- unit of the sale that paid for this voucher, and the outbox is at-least-once: a redelivered
  -- `sale.completed` must not mint the voucher a second time. This skips it, `_grant_assert.sql`
  -- still passes on the no-op, and `uq_services_grant_sale_ref` (migration 013) settles the race
  -- between two deliveries that reach the check at the same moment. A manual grant carries no ref,
  -- so the condition is inert for it — an operator granting the same voucher twice on purpose is
  -- selling two vouchers, which is exactly what two grants mean.
  AND NOT EXISTS (
    SELECT 1 FROM services_package_grant g
     WHERE g.hub_id = :hub_id AND g.is_deleted = 0
       AND g.sale_ref <> '' AND g.sale_ref = COALESCE(:sale_ref, '')
  );
