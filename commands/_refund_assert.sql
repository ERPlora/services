-- Assert of the refund (statement 2 of 3). Same guard table as the redeem — SQLite has no RAISE
-- outside a trigger, so the CHECK (ok = 1) of `services__gate` is the portable declarative abort:
-- ok = 0 violates it and the WHOLE transaction rolls back (no row moved, no event emitted).
--
-- 🔴 This is where IDEMPOTENCE is decided, and it is decided on the DOCUMENT, not on the row count.
-- The gate passes when the session is now returned AND carries THIS `refund_ref`, which sorts the
-- three cases the UPDATE above cannot tell apart on its own:
--
--   * it moved the row → the ref matches → pass;
--   * it moved nothing because the row was ALREADY returned against this same document (a retry, a
--     double tap, a redelivered event) → the ref still matches → pass, having written nothing. The
--     caller gets the truth and no second session comes back;
--   * it moved nothing because the session is not returnable, or because ANOTHER document already
--     returned it → the ref does not match (or there is no row at all) → FAIL. One session, one
--     refund, and a second attempt is refused instead of silently overwriting the first one's
--     trail.
--
-- Under two concurrent tills the second one blocks on the row and re-reads the committed version,
-- so it lands in one of those three cases rather than in a snapshot of its own — there is no
-- read-then-decide window, which is exactly what Odoo#79235 has had open since 2021.
--
-- `ok` is INTEGER: EXISTS() is boolean in Postgres (which refuses to insert it into an INTEGER) and
-- integer in SQLite, so it is wrapped in CASE … THEN 1 ELSE 0 END — portable in both dialects
-- without `::int`, which SQLite does not understand.
INSERT INTO services__gate (gate, ok)
SELECT 'redemption_refunded',
       CASE WHEN EXISTS (SELECT 1 FROM services_package_redemption
                          WHERE id = :redemption_id
                            AND hub_id = :hub_id
                            AND is_deleted = 1
                            AND refunded_at IS NOT NULL
                            AND refund_ref = :refund_ref)
            THEN 1 ELSE 0 END;
