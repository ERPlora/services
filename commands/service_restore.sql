-- Reactivar un servicio archivado (services#44): deshace exactamente lo que hizo
-- `commands/service_delete.sql` — quita el soft-delete, borra la marca de tiempo y lo vuelve a
-- poner en oferta. Nada más: nombre, precio, duración, categoría y su historial siguen donde
-- estaban, porque archivar nunca los tocó.
--
-- Hace falta un command PROPIO y no vale `services.services.update`: esa sentencia exige
-- `is_deleted = 0`, así que la puerta de edición no alcanza a un servicio archivado. Ese era el
-- callejón sin salida — se archivaba desde la pantalla y solo se podía volver por la base de datos.
--
-- Las DOS banderas en la condición porque hay dos formas de estar fuera de la oferta: archivado
-- (`is_deleted = 1`, que es lo que hace la pantalla) y desactivado (`is_active = 0`). Reactivar
-- significa «vuelve a ofrecerse», sea cual sea la que lo escondía.
--
-- 0 filas ⇒ `services.service_not_archived` (`expect_rows`): el servicio no existe en este negocio,
-- o ya estaba en oferta. Nunca un OK silencioso sobre una fila que no se tocó.
UPDATE services_service
SET is_deleted = 0, deleted_at = NULL, is_active = 1,
    updated_by = :current_user_id, updated_at = :now
WHERE id = :service_id AND hub_id = :hub_id
  AND (is_deleted = 1 OR is_active = 0);
