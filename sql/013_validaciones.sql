-- ================================================================
-- 013_VALIDACIONES.SQL
-- Reglas de integridad que hasta ahora solo vivían en el formulario
-- del cliente. Se agregan a nivel de base para que valgan también si
-- alguien llama a la API directamente.
-- ================================================================

alter table mascotas
    drop constraint if exists chk_mascotas_fecha_nacimiento_no_futura;

alter table mascotas
    add constraint chk_mascotas_fecha_nacimiento_no_futura
    check (fecha_nacimiento is null or fecha_nacimiento <= current_date);
