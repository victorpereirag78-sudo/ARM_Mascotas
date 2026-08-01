-- ================================================================
-- 004_CLINICO.SQL
-- RESERVADO — módulo clínico futuro (consultas, vacunas, cirugías,
-- diagnósticos, hospitalizaciones, alergias, exámenes, medicamentos,
-- desparasitación, alimentación). Se crea ahora para que el ER quede
-- completo y el RLS (008) no tenga que retocarse más adelante.
-- Sin UI en el Módulo 1: estas tablas quedan vacías.
-- Todas llevan el prefijo "mascotas_" para no mezclarse con tablas
-- de otras apps en el mismo proyecto Supabase.
-- ================================================================

create table if not exists mascotas_consultas (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    veterinario_id  uuid references mascotas_veterinarios(id) on delete set null,
    fecha           timestamptz not null default now(),
    motivo          text,
    diagnostico     text,
    tratamiento     text,
    observaciones   text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_consultas_mascota on mascotas_consultas(mascota_id);

create table if not exists mascotas_vacunas (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    veterinario_id      uuid references mascotas_veterinarios(id) on delete set null,
    nombre              text not null,
    fecha               date not null,
    lote                text,
    proxima_dosis_fecha date,
    certificado_url     text,
    registrado_por      uuid references mascotas_perfiles(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_mascotas_vacunas_mascota on mascotas_vacunas(mascota_id);

create table if not exists mascotas_cirugias (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    veterinario_id  uuid references mascotas_veterinarios(id) on delete set null,
    nombre          text not null,
    fecha           timestamptz not null default now(),
    resultado       text,
    complicaciones  text,
    indicaciones    text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_cirugias_mascota on mascotas_cirugias(mascota_id);

create table if not exists mascotas_diagnosticos (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    veterinario_id  uuid references mascotas_veterinarios(id) on delete set null,
    nombre          text not null,
    fecha           date not null default current_date,
    descripcion     text,
    estado          text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_diagnosticos_mascota on mascotas_diagnosticos(mascota_id);

create table if not exists mascotas_hospitalizaciones (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    clinica_id          uuid references mascotas_clinicas(id) on delete set null,
    fecha_ingreso       timestamptz not null,
    fecha_alta          timestamptz,
    motivo              text,
    tratamiento         text,
    registrado_por      uuid references mascotas_perfiles(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_mascotas_hospitalizaciones_mascota on mascotas_hospitalizaciones(mascota_id);

create table if not exists mascotas_alergias (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    nombre          text not null,
    severidad       text,
    observaciones   text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_alergias_mascota on mascotas_alergias(mascota_id);

create table if not exists mascotas_examenes_adjuntos (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    tipo_archivo    text,
    archivo_url     text not null,
    tabla_origen    text,
    id_origen       uuid,
    descripcion     text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_examenes_mascota on mascotas_examenes_adjuntos(mascota_id);

create table if not exists mascotas_medicamentos (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    nombre              text not null,
    dosis               text,
    frecuencia          text,
    duracion_dias       int,
    fecha_inicio        date,
    recordatorio_activo boolean not null default false,
    observaciones       text,
    registrado_por      uuid references mascotas_perfiles(id),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
create index if not exists idx_mascotas_medicamentos_mascota on mascotas_medicamentos(mascota_id);

create table if not exists mascotas_medicamento_administraciones (
    id              uuid primary key default gen_random_uuid(),
    medicamento_id  uuid not null references mascotas_medicamentos(id) on delete cascade,
    fecha_hora      timestamptz not null default now(),
    confirmado_por  uuid references mascotas_perfiles(id),
    observaciones   text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_medicamento_admin_medicamento on mascotas_medicamento_administraciones(medicamento_id);

create table if not exists mascotas_desparasitaciones (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    tipo                text not null, -- 'interna' | 'externa'
    producto             text,
    fecha               date not null,
    proxima_aplicacion  date,
    registrado_por      uuid references mascotas_perfiles(id),
    created_at          timestamptz not null default now()
);
create index if not exists idx_mascotas_desparasitaciones_mascota on mascotas_desparasitaciones(mascota_id);

create table if not exists mascotas_alimentacion_historial (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    marca           text,
    tipo            text,
    cantidad_diaria text,
    restricciones   text,
    vigente_desde   date not null default current_date,
    vigente_hasta   date,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_alimentacion_mascota on mascotas_alimentacion_historial(mascota_id);
