CREATE TABLE IF NOT EXISTS services_package_grant_adjustment (
    id          TEXT PRIMARY KEY,
    hub_id      TEXT NOT NULL,
    grant_id    TEXT NOT NULL,
    uses_delta  INTEGER NOT NULL DEFAULT 0,
    days_delta  INTEGER NOT NULL DEFAULT 0,
    reason      TEXT NOT NULL,
    adjusted_at TEXT NOT NULL,
    is_deleted  INTEGER NOT NULL DEFAULT 0,
    deleted_at  TEXT,
    created_by  TEXT,
    updated_by  TEXT,
    created_at  TEXT,
    updated_at  TEXT,
    FOREIGN KEY (grant_id) REFERENCES services_package_grant (id)
);

CREATE INDEX IF NOT EXISTS ix_services_grant_adjustment_grant
    ON services_package_grant_adjustment (hub_id, grant_id, is_deleted);

ALTER TABLE services_package_grant_adjustment
  ADD CONSTRAINT ck_services_grant_adjustment_moves
  CHECK (uses_delta <> 0 OR days_delta <> 0) NOT VALID;

ALTER TABLE services_package_grant_adjustment
  ADD CONSTRAINT ck_services_grant_adjustment_reason
  CHECK (TRIM(reason) <> '') NOT VALID;

-- Services · migration 019 — a sold voucher can be given more sessions or a later expiry, and the
-- change is a MOVEMENT, not a rewrite of the purchase (services#118). The prose is at the BOTTOM by
-- house rule (hub#1137/ADR-0387): the migration guard matches a `DROP` at the START of the
-- statement text and its splitter keeps a preceding comment inside the statement. There is no
-- `DROP` here — this is an `expand`.
--
-- WHAT WAS WRONG. A grant (migration 013, ADR-0390) kept the sessions and the validity it was sold
-- with forever: «one more session on the house» or «I'll extend it a month, we were closed» — the
-- courtesy every salon gives — had no door, and the only way out was SQL by hand.
--
-- WHY A TABLE OF MOVEMENTS AND NOT AN UPDATE OF `max_uses` / `validity_days`. Those two columns
-- are the SNAPSHOT of what was sold, the row an inspection reconciles the accrual against: «this
-- customer bought N sessions valid D days, this day, for this amount». Rewriting them would make
-- the purchase say something that was never sold. So each adjustment is its own row — who
-- (`created_by`), when (`adjusted_at`), why (`reason`, mandatory) and by how much — and every
-- reader counts the grant's terms as snapshot + SUM of its live movements. A NULL snapshot (an
-- unlimited voucher, or one that never expires) stays NULL: there is nothing to add to «forever».
--
-- WHY THE DELTAS ARE SIGNED. This issue only ADDS (the command refuses a negative amount), but the
-- balance correction of services#119 — a session spent twice by mistake, an imported voucher with
-- the wrong count — is the same movement with a minus sign, and it will reuse this table and this
-- arithmetic instead of inventing a second one. The CHECK only forbids a movement that moves
-- nothing and one without a reason.
--
-- A gifted session issues NO fiscal document: a voucher of N sessions is univalent (art. 30 ter.1
-- of Directive 2006/112/CE) and a courtesy has no consideration. Nothing here touches money.
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS: a new table, empty, and its CHECKs are `NOT VALID` like
-- every other in this module. An older module version ignores it. Reverting is leaving it unused.
