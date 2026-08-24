CREATE TABLE IF NOT EXISTS services_package_grant (
    id               TEXT PRIMARY KEY,
    hub_id           TEXT NOT NULL,
    package_id       TEXT NOT NULL,
    customer_id      TEXT NOT NULL,
    granted_at       TEXT NOT NULL,
    source           TEXT NOT NULL DEFAULT 'manual',
    sale_id          TEXT,
    sale_ref         TEXT NOT NULL DEFAULT '',
    amount_cents     INTEGER NOT NULL DEFAULT 0,
    net_amount_cents INTEGER NOT NULL DEFAULT 0,
    tax_amount_cents INTEGER NOT NULL DEFAULT 0,
    max_uses         INTEGER,
    validity_days    INTEGER,
    note             TEXT NOT NULL DEFAULT '',
    is_deleted       INTEGER NOT NULL DEFAULT 0,
    deleted_at       TEXT,
    created_by       TEXT,
    updated_by       TEXT,
    created_at       TEXT,
    updated_at       TEXT,
    FOREIGN KEY (package_id) REFERENCES services_package (id)
);

CREATE INDEX IF NOT EXISTS ix_services_grant_customer
    ON services_package_grant (hub_id, customer_id, is_deleted);

CREATE INDEX IF NOT EXISTS ix_services_grant_package
    ON services_package_grant (hub_id, package_id, is_deleted);

CREATE UNIQUE INDEX IF NOT EXISTS uq_services_grant_sale_ref
    ON services_package_grant (hub_id, sale_ref)
    WHERE is_deleted = 0 AND sale_ref <> '';

ALTER TABLE services_package_grant
  ADD CONSTRAINT ck_services_grant_source
  CHECK (source IN ('sale', 'manual', 'legacy')) NOT VALID;

ALTER TABLE services_package_grant
  ADD CONSTRAINT ck_services_grant_uses
  CHECK (max_uses IS NULL OR max_uses > 0) NOT VALID;

ALTER TABLE services_package_grant
  ADD CONSTRAINT ck_services_grant_amounts
  CHECK (amount_cents >= 0 AND net_amount_cents >= 0 AND tax_amount_cents >= 0) NOT VALID;

ALTER TABLE services_package_grant
  ADD CONSTRAINT ck_services_grant_sold
  CHECK (source <> 'sale' OR sale_ref <> '') NOT VALID;

ALTER TABLE services_package_redemption ADD COLUMN IF NOT EXISTS grant_id TEXT;

INSERT INTO services_package_grant
  (id, hub_id, package_id, customer_id, granted_at, source, sale_id, sale_ref,
   amount_cents, net_amount_cents, tax_amount_cents, max_uses, validity_days,
   note, is_deleted, deleted_at, created_by, updated_by, created_at, updated_at)
SELECT
    gen_random_uuid()::text,
    r.hub_id,
    r.package_id,
    r.customer_id,
    COALESCE(MIN(r.redeemed_at) FILTER (WHERE r.is_deleted = 0), MIN(r.redeemed_at)),
    'legacy',
    NULL,
    '',
    0, 0, 0,
    MIN(p.max_uses),
    MIN(p.validity_days),
    '',
    0,
    NULL,
    'migration-013',
    'migration-013',
    MIN(r.created_at),
    MIN(r.created_at)
FROM services_package_redemption r
JOIN services_package p ON p.id = r.package_id AND p.hub_id = r.hub_id
WHERE r.grant_id IS NULL
GROUP BY r.hub_id, r.package_id, r.customer_id;

UPDATE services_package_redemption AS r
   SET grant_id = g.id
  FROM services_package_grant g
 WHERE r.grant_id IS NULL
   AND g.hub_id = r.hub_id
   AND g.package_id = r.package_id
   AND g.customer_id = r.customer_id
   AND g.source = 'legacy';

CREATE INDEX IF NOT EXISTS ix_services_redemption_grant
    ON services_package_redemption (hub_id, grant_id, is_deleted);

ALTER TABLE services_package_redemption
  ADD CONSTRAINT ck_services_redemption_grant
  CHECK (grant_id IS NOT NULL) NOT VALID;

ALTER TABLE services_package_redemption
  ADD CONSTRAINT fk_services_redemption_grant
  FOREIGN KEY (grant_id) REFERENCES services_package_grant (id) NOT VALID;

-- Services · migration 013 — the ENTITLEMENT becomes a ROW (services#73, ADR-0390). The prose is
-- at the BOTTOM by house rule (hub#1137/ADR-0387): the migration guard matches a `DROP` at the
-- START of the statement text and its splitter keeps a preceding comment inside the statement, so
-- a header above SQL is the shape that silently defeats it. There is no `DROP` here — this is an
-- `expand` and nothing is destroyed — but the shape is kept so no one has to check.
--
-- WHAT WAS WRONG, AND WHY IT WAS MONEY
--
-- `services_package` is a CATALOGUE row. Until this migration the relationship customer<->voucher
-- did not exist as data: it was materialised by the FIRST REDEMPTION, and `max_uses` was counted
-- per customer over the catalogue package. So EVERY customer of the hub had their own N sessions of
-- every voucher, for free, without anyone having sold them anything — a customer who had never
-- bought «five haircuts» could redeem it, and the one who HAD bought it could redeem five more
-- next month. The module's own documentation said so out loud («selling a package does not create
-- the entitlement») and it was true; what it did not say is that the redemption door was open to
-- everybody in the meantime.
--
-- 🔴 AND IT COLLIDED WITH THE ACCRUAL. A voucher of N sessions is UNIVALENT: art. 30 ter.1 of
-- Directive 2006/112/CE says the supply made in exchange for it «shall not be regarded as an
-- independent transaction», so the fiscal record comes out WHEN THE VOUCHER IS SOLD, with the
-- service's VAT, and the redemption issues nothing (ADR-0386, decision 5). That sentence presumes a
-- SALE OF THE VOUCHER, and there was no row carrying one: no date, no amount, no document. Nothing
-- to accrue and nothing an inspection could reconcile a redemption against. (Vouchers are not in
-- the Spanish LIVA — Directive 2016/1065 was never transposed — so what governs is the Directive
-- plus the DGT Resolution of 28/12/2018.)
--
-- WHAT THE GRANT IS, AND WHY EACH COLUMN EXISTS
--
--   * `package_id` / `customer_id` — WHO owns WHICH voucher. This pair used to be inferred from the
--     redemption ledger; now it is asserted before a single session can be spent.
--   * `granted_at` — the moment the right was sold. It is the expiry anchor (below) and the date an
--     auditor matches against the fiscal record of the sale.
--   * `source` — `sale` (the till sold it, `sale.completed`), `manual` (an operator granted it, and
--     the money — or the goodwill — is recorded elsewhere) or `legacy` (minted by this migration,
--     see the backfill). Kept as data rather than derived from `sale_id IS NULL` because «we do not
--     know how this got here» and «this was given away» are different facts and only one of them is
--     an incident.
--   * `sale_id` / `sale_ref` — the sale that paid for it and the exact line-and-unit of that sale,
--     opaque to this module exactly like `checkout_ref`/`line_ref` are. `sale_ref` is also THE
--     IDEMPOTENCE KEY of the listener: `uq_services_grant_sale_ref` means a redelivered
--     `sale.completed` cannot mint the voucher twice.
--   * `amount_cents` / `net_amount_cents` / `tax_amount_cents` — what was actually charged for THIS
--     voucher, base and VAT apart. This is the half the accrual needs: «this customer bought this
--     voucher, this day, for this amount, with this VAT».
--   * `max_uses` / `validity_days` — a SNAPSHOT of the terms sold, not a pointer to the catalogue.
--     Editing the template afterwards must not shorten a voucher somebody already paid for; that is
--     the contract, and a contract that changes under the customer is not one. The expiry DATE is
--     not stored next to them on purpose: every reader in this module already computes it with the
--     portable `erp_dateadd` bridge (ADR-0007), and freezing it as text would need `to_char`, which
--     is native Postgres and not portable ERPlora SQL. The snapshot is the pair, not the result.
--
-- 🔴 THE EXPIRY CLOCK MOVES FROM THE FIRST USE TO THE PURCHASE, and that is the market's answer,
-- not ours (the full table of references is in the pull request of services#73). It is also the
-- only anchor that can exist here: an unstarted voucher has no first use, so under the old rule a
-- voucher bought a year ago and never touched had not expired and never would.
--
-- WHY THE USE ORDINAL IS **NOT** TOUCHED
--
-- `uq_services_redemption_use` stays exactly as migration 011 wrote it — `(hub_id, package_id,
-- customer_id, use_index)`, partial on the live rows — and `MAX(use_index) + 1` still spans every
-- grant of that pair. It was tempting to make the ordinal per-grant, and it would have been wrong
-- twice over: it needs a `DROP INDEX` (this is an `expand`), and it would NARROW the anti-
-- double-spend guard that services#70 put in the schema. Two grants of the same voucher simply
-- continue the same numbering — 1..5 on the first, 6..10 on the second — so the index still lets
-- exactly one of two concurrent tills commit. The one cost is named rather than hidden: two tills
-- spending from DIFFERENT grants of the same customer and voucher at the same instant serialise,
-- and one is refused and retried. That is a stricter guard than strictly necessary, on purpose.
--
-- What DOES become per-grant is the COUNT: `max_uses` is now read from the grant's snapshot and
-- counted over `grant_id`, which is what makes two grants coexist instead of sharing one pool.
--
-- THE BACKFILL — A HUB THAT ALREADY REDEEMED KEEPS EVERY BALANCE IT HAD
--
-- One `legacy` grant per distinct `(hub_id, package_id, customer_id)` that has any redemption,
-- soft-deleted rows included, so no redemption is left without a grant and the CHECK below can be
-- enforced from now on. Each one is anchored on the FIRST LIVE USE — the very anchor those rows
-- were already being judged by — falling back to the first use of any kind for a pair whose uses
-- were all returned. `max_uses` and `validity_days` are copied from the template as it stands
-- today, which is also what the old counts were reading. The result: after this migration every
-- existing customer has exactly the sessions and exactly the expiry they had before it, and every
-- NEW voucher is anchored on its purchase.
--
-- `amount_cents` is 0 on a legacy grant and stays 0. Nobody recorded what those vouchers were sold
-- for, and inventing a number that an inspection could read as a declared amount would be worse
-- than the honest zero the `legacy` source explains.
--
-- The grouping is written as a plain `GROUP BY` over the module's own tables and never as
-- `FROM (SELECT …)`: `validate-migration-guard`'s table linter anchors on `FROM` in a non-SELECT
-- statement and reads the `(SELECT` of a derived table as a table named `select`, which is not a
-- `services_` table, so the migration would be REJECTED before a hub ever saw it (the lesson
-- migration 011 already paid for).
--
-- SAFE ON A HUB THAT ALREADY HAS ROWS. The table is new; the one added column is nullable and
-- backfilled before anything is enforced; every CHECK and the foreign key are `NOT VALID`, so they
-- bind new rows without scanning the old ones and a legacy row cannot make `migrate` abort and
-- leave the module half-installed (the lesson of migration 007). `services_package_grant`'s foreign
-- key to `services_package` carries no `ON DELETE`: deleting a voucher template here is a
-- soft-delete (`commands/package_delete.sql`), so it never fires — and if a hard delete ever
-- reached it, refusing is the right answer. A paid entitlement must not disappear because somebody
-- tidied the catalogue.
