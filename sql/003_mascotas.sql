-- ================================================================
-- 003_MASCOTAS.SQL
-- Núcleo del producto: la ficha de la mascota, compartir con
-- familiares, autorización de veterinarios, y caché de info de raza.
-- "mascotas" y "mascotas_compartidas" ya nacen con el nombre del
-- producto; el resto de las tablas lleva el prefijo "mascotas_"
-- explícito para no mezclarse con tablas de otras apps.
-- ================================================================

-- ── Mascotas ─────────────────────────────────────────────────────
create table if not exists mascotas (
    id                          uuid primary key default gen_random_uuid(),
    dueno_id                    uuid not null references mascotas_perfiles(id) on delete cascade,
    foto_url                    text,
    nombre                      text not null,
    especie                     especie_mascota not null,
    raza                        text,
    sexo                        sexo_mascota,
    fecha_nacimiento            date,
    edad_estimada               boolean not null default false,
    peso_actual                 numeric(5,2),
    color                       text,
    estado_reproductivo         estado_reproductivo not null default 'desconocido',
    microchip                   text unique,
    caracteristicas_fisicas     text,
    veterinario_habitual_id     uuid references mascotas_veterinarios(id) on delete set null,
    clinica_habitual_id         uuid references mascotas_clinicas(id) on delete set null,
    observaciones               text,
    qr_token                    uuid not null default gen_random_uuid() unique,
    qr_visibilidad              jsonb not null default '{}'::jsonb,
    activo                      boolean not null default true,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists idx_mascotas_dueno on mascotas(dueno_id);
create index if not exists idx_mascotas_qr_token on mascotas(qr_token);
create index if not exists idx_mascotas_activo on mascotas(activo) where activo = true;

-- ── Compartir mascota con familiares ─────────────────────────────
create table if not exists mascotas_compartidas (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    invitado_email      text not null,
    invitado_perfil_id  uuid references mascotas_perfiles(id) on delete set null,
    nivel_permiso       nivel_permiso not null default 'lectura',
    estado              estado_invitacion not null default 'pendiente',
    invitado_por        uuid not null references mascotas_perfiles(id),
    created_at          timestamptz not null default now(),
    respondido_at       timestamptz,
    unique (mascota_id, invitado_email)
);

create index if not exists idx_mascotas_compartidas_mascota on mascotas_compartidas(mascota_id);
create index if not exists idx_mascotas_compartidas_invitado on mascotas_compartidas(invitado_perfil_id);
create index if not exists idx_mascotas_compartidas_email on mascotas_compartidas(invitado_email);

-- ── Autorización de veterinarios (reservado, módulo futuro) ──────
create table if not exists mascotas_autorizaciones_veterinario (
    id                  uuid primary key default gen_random_uuid(),
    mascota_id          uuid not null references mascotas(id) on delete cascade,
    veterinario_id      uuid not null references mascotas_veterinarios(id) on delete cascade,
    autorizado_por      uuid not null references mascotas_perfiles(id),
    nivel_permiso       nivel_permiso not null default 'lectura',
    activo              boolean not null default true,
    created_at          timestamptz not null default now(),
    revocado_at         timestamptz,
    unique (mascota_id, veterinario_id)
);

create index if not exists idx_mascotas_autorizaciones_vet_mascota on mascotas_autorizaciones_veterinario(mascota_id);
create index if not exists idx_mascotas_autorizaciones_vet_veterinario on mascotas_autorizaciones_veterinario(veterinario_id);

-- ── Caché de información de raza (poblada por IA, módulo futuro) ─
create table if not exists mascotas_raza_info (
    id                          uuid primary key default gen_random_uuid(),
    especie                     especie_mascota not null,
    raza                        text not null,
    historia                    text,
    origen                      text,
    temperamento                text,
    esperanza_vida_min_anios    int,
    esperanza_vida_max_anios    int,
    peso_ideal_min_kg           numeric(5,2),
    peso_ideal_max_kg           numeric(5,2),
    nivel_energia               text,
    compatibilidad_ninos        text,
    compatibilidad_mascotas     text,
    problemas_frecuentes        text[],
    alimentacion_recomendada    text,
    ejercicio_recomendado       text,
    consejos                    text,
    fuente                      text,
    actualizado_at              timestamptz not null default now(),
    unique (especie, raza)
);
