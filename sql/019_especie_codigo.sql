-- ================================================================
-- 019 — Especie fina de la mascota (catálogo compartido con ARM Veterinaria)
--
-- mascotas.especie (enum perro/gato/otro) se conserva; mascotas.especie_codigo
-- guarda el código del catálogo vet_especies (conejo, ave, caballo…) para
-- mostrar la especie real. El catálogo (vet_especies / vet_razas), el trigger
-- que mantiene ambos coherentes y el relleno de datos viven en la migración
-- 027 de ARM Veterinaria (supabase/migrations/027_especies_razas.sql), porque
-- dependen de esas tablas. Este archivo deja la columna documentada aquí.
-- Re-ejecutable.
-- ================================================================
alter table mascotas add column if not exists especie_codigo text;
alter table mascotas drop constraint if exists mascotas_especie_codigo_check;
alter table mascotas add constraint mascotas_especie_codigo_check check (especie_codigo ~ '^[a-z_]{2,30}$');
