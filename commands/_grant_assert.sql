-- Assert of the grant (statement 2 of 3). Same guard table as the redeem and the refund — SQLite
-- has no RAISE outside a trigger, so the CHECK (ok = 1) of `services__gate` is the portable
-- declarative abort: ok = 0 violates it and the WHOLE transaction rolls back (no grant row, no
-- event emitted, no entitlement).
--
-- The row is verified by :grant_id — the same id the handler put in `_grant_insert.sql` — so the
-- assert checks exactly the row the handler said it wrote, and the command can hand that id back to
-- the caller (hub#70).
--
-- 🔴 …OR by the DOCUMENT, which is what makes a redelivered `sale.completed` harmless. The INSERT
-- skips a `sale_ref` a live grant already holds, so on a retry it writes nothing and there is no
-- row under this `grant_id` — and failing there would dead-letter an event whose work is already
-- done, forever. The second branch passes exactly that case and nothing else: it needs a NON-EMPTY
-- ref, so a manual grant that inserted nothing (unknown or archived voucher) still fails and still
-- rolls back. Same shape as `_refund_assert.sql`: idempotence lives in the statements, not in an
-- `IF`, and it is keyed on the document rather than on the row count.
--
-- `ok` is INTEGER: EXISTS() is boolean in Postgres (which refuses to insert it into an INTEGER) and
-- integer in SQLite, so it is wrapped in CASE … THEN 1 ELSE 0 END — portable in both dialects
-- without `::int`, which SQLite does not understand.
INSERT INTO services__gate (gate, ok)
SELECT 'package_granted',
       CASE WHEN EXISTS (SELECT 1 FROM services_package_grant
                          WHERE id = :grant_id AND hub_id = :hub_id)
              OR EXISTS (SELECT 1 FROM services_package_grant
                          WHERE hub_id = :hub_id AND is_deleted = 0
                            AND sale_ref <> '' AND sale_ref = COALESCE(:sale_ref, ''))
            THEN 1 ELSE 0 END;
