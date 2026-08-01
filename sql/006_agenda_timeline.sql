-- ================================================================
-- 006_AGENDA_TIMELINE.SQL
-- RESERVADO — módulo futuro: línea de vida (timeline_eventos) y
-- recordatorios (agenda_recordatorios). Sin UI en el Módulo 1.
-- Todas llevan el prefijo "mascotas_" para no mezclarse con tablas
-- de otras apps en el mismo proyecto Supabase.
-- ================================================================

create table if not exists mascotas_timeline_eventos (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    tipo_evento     tipo_evento_timeline not null default 'otro',
    titulo          text not null,
    descripcion     text,
    fecha_evento    timestamptz not null default now(),
    tabla_origen    text,
    id_origen       uuid,
    icono           text,
    creado_por      uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_timeline_mascota_fecha on mascotas_timeline_eventos(mascota_id, fecha_evento desc);

create table if not exists mascotas_agenda_recordatorios (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    tipo                tipo_recordatorio not null default 'otro',
    titulo              text not null,
    descripcion         text,
    fecha_programada    date not null,
    hora_programada     time,
    repetir_cada_dias   int,
    estado              estado_recordatorio not null default 'pendiente',
    creado_por          uuid references mascotas_perfiles(id),
    completado_at       timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_mascotas_agenda_estado_fecha on mascotas_agenda_recordatorios(estado, fecha_programada);
create index if not exists idx_mascotas_agenda_mascota on mascotas_agenda_recordatorios(mascota_id);
