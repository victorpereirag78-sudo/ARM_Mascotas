-- ================================================================
-- 001_EXTENSIONES_ENUMS.SQL
-- Extensiones de Postgres y tipos enumerados usados por todo el
-- esquema de ARM Mascotas. Ejecutar primero.
-- ================================================================

-- ── Extensiones ───────────────────────────────────────────────────
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- búsqueda difusa (nombre, raza) en módulos futuros

-- ── Roles del sistema ────────────────────────────────────────────
do $$ begin
    create type rol_usuario as enum ('dueno', 'veterinario', 'clinica', 'admin');
exception when duplicate_object then null; end $$;

-- ── Mascotas ─────────────────────────────────────────────────────
do $$ begin
    create type especie_mascota as enum ('perro', 'gato', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
    create type sexo_mascota as enum ('macho', 'hembra');
exception when duplicate_object then null; end $$;

do $$ begin
    create type estado_reproductivo as enum ('entero', 'esterilizado', 'desconocido');
exception when duplicate_object then null; end $$;

-- ── Compartir / autorizaciones ───────────────────────────────────
do $$ begin
    create type nivel_permiso as enum ('lectura', 'edicion', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
    create type estado_invitacion as enum ('pendiente', 'aceptada', 'rechazada');
exception when duplicate_object then null; end $$;

-- ── Línea de vida / agenda (reservado, módulos futuros) ──────────
do $$ begin
    create type tipo_evento_timeline as enum (
        'nacimiento', 'foto', 'bano', 'cambio_alimento', 'vacuna', 'control',
        'urgencia', 'cirugia', 'medicamento', 'cumpleanos', 'viaje',
        'cambio_peso', 'otro'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type tipo_recordatorio as enum (
        'vacuna', 'medicamento', 'control', 'desparasitacion', 'bano',
        'corte_unas', 'cumpleanos', 'otro'
    );
exception when duplicate_object then null; end $$;

do $$ begin
    create type estado_recordatorio as enum ('pendiente', 'completado', 'vencido', 'cancelado');
exception when duplicate_object then null; end $$;

-- ── Gastos (reservado, módulo futuro) ────────────────────────────
do $$ begin
    create type categoria_gasto as enum (
        'alimentacion', 'veterinario', 'medicamentos', 'higiene',
        'accesorios', 'otro'
    );
exception when duplicate_object then null; end $$;
