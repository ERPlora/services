-- Setup status of the catalogue (services#26). Read by `hub.setup.status`, slot 31 of the
-- onboarding checklist — contract in `architecture/hub/setup-status.md` §6.
--
-- ONE row, always. The runtime evaluates `configured_when` against the FIRST row and treats "no
-- row" as "not configured" (ADR-0063), so a status query that answers nothing would be
-- indistinguishable from one that failed. COUNT over an empty catalogue is 0, which the runtime
-- reads as loosely false: a fresh hub reports the item as pending, by the count and not by the
-- absence of an answer.
--
-- "Sellable" is exactly the catalogue `services.services.list` shows: alive (soft-delete, §2.5)
-- and active. `is_bookable` is deliberately NOT part of it — a service charged over the counter
-- without an online booking slot still fills the till, and asking for one would leave a shop with
-- a working price list stuck on a checklist item it has already done.
SELECT COUNT(*) AS sellable_services
FROM services_service
WHERE hub_id = :hub_id AND is_deleted = 0 AND is_active = 1;
