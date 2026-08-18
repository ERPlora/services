-- Archive a service (row contract §2.5): soft-delete + `is_active = 0`. It stops being offered and
-- bookable; its history stays, and the appointments already booked keep their own snapshot of
-- name/price/duration — archiving never rewrites them (services#2, what Fresha/Square/Vagaro do).
--
-- The upcoming-appointments WARNING is not here: `services` cannot read `appointments` (its table
-- is private, and `reads` only reaches `depends_on` — appointments depends on services, so the
-- reverse would be a cycle). The screen asks the public query
-- `appointments.appointments.count_active_for_service` before confirming; a hub without
-- appointments archives without the line. 0 rows affected ⇒ `services.service_not_found`
-- (`expect_rows`), never a silent OK.
UPDATE services_service
SET is_deleted = 1, deleted_at = :now, is_active = 0,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :service_id AND hub_id = :hub_id;
