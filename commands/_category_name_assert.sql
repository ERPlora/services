-- Refuses a second LIVE service category with the same name in the hub (services#107).
--
-- The owner created «Peinados de fiesta» twice and nothing stopped it; from then on the category
-- picker of the service form showed two entries nobody could tell apart. Square refuses a
-- duplicate category name at save time, and so does this module now.
--
-- Runs as the LAST statement of `services.categories.create` and `services.categories.update`,
-- after the write. `me.updated_at = :now` pins the check to "the row THIS command just wrote" —
-- the runtime binds `:now` once per command (the pattern of taxes' `_rule_overlap_assert.sql`). A
-- write that did not apply (a parent refused, a category of another hub) leaves no row with that
-- `:now`, so this statement is a no-op and the command's own `expect_rows` speaks instead.
--
-- Same name = trimmed, case-insensitive, inner runs of whitespace collapsed: «Peinados de fiesta»,
-- « peinados DE fiesta » and «Peinados  de fiesta» are the same entry in a picker. Accents are
-- NOT folded («Uñas» ≠ «Unas»): they are different words in Spanish.
--
-- Scope: the same hub, other LIVE rows (`is_deleted = 0`; an inactive category still counts — it
-- can be reactivated, and then there would be two). A deleted category frees its name.
--
-- Legacy duplicates written before this guard are never touched and never block an unrelated
-- write: `me` is only the row this command wrote. Re-saving one of them without a new name IS
-- refused — the owner has to tell them apart at that point, which is the whole point.
--
-- A 2-row constant set selected only when a twin EXISTS: no twin -> 0 rows -> nothing happens;
-- twin -> 2 identical rows -> the second violates `services_category_name_taken` (migration 017)
-- -> 23505 -> `on_unique` -> `services.category_name_taken` -> the command rolls back.
--
-- Known limit: two sessions creating the SAME new name in the same instant both pass (each
-- transaction cannot see the other's uncommitted row). Not worth a table lock for a label; the
-- next save of either one is refused and the owner renames it.
INSERT INTO services__name_gate (gate)
SELECT 'category_name_taken'
FROM (SELECT 1 AS n UNION ALL SELECT 2 AS n) AS twice
WHERE EXISTS (
  SELECT 1
  FROM services_category me
  JOIN services_category o
    ON o.hub_id = me.hub_id
   AND o.id <> me.id
   AND o.is_deleted = 0
   AND regexp_replace(lower(btrim(o.name)), '\s+', ' ', 'g')
     = regexp_replace(lower(btrim(me.name)), '\s+', ' ', 'g')
  WHERE me.hub_id = :hub_id
    AND me.is_deleted = 0
    AND me.updated_at = :now
);
