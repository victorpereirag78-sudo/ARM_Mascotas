-- ================================================================
-- 002_PERFILES_AUTH.SQL
-- Perfiles de usuario (1:1 con auth.users), y tablas reservadas de
-- clínicas/veterinarios (sin UI propia todavía, referenciadas desde
-- mascotas en 003).
-- Todas las tablas llevan el prefijo "mascotas_" para no mezclarse
-- con tablas de otras apps en el mismo proyecto Supabase.
-- ================================================================

-- ── Perfiles ─────────────────────────────────────────────────────
create table if not exists mascotas_perfiles (
    id                          uuid primary key references auth.users(id) on delete cascade,
    rol                         rol_usuario not null default 'dueno',
    nombre                      text,
    apellido                    text,
    correo                      text,
    telefono                    text,
    whatsapp                    text,
    direccion                   text,
    ciudad                      text,
    region                      text,
    pais                        text,
    foto_url                    text,
    contacto_emergencia_nombre  text,
    contacto_emergencia_telefono text,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

create index if not exists idx_mascotas_perfiles_rol on mascotas_perfiles(rol);

-- ── Clínicas (reservado, módulo futuro) ──────────────────────────
create table if not exists mascotas_clinicas (
    id          uuid primary key default gen_random_uuid(),
    nombre      text not null,
    direccion   text,
    ciudad      text,
    region      text,
    pais        text,
    telefono    text,
    correo      text,
    logo_url    text,
    activo      boolean not null default true,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- ── Veterinarios (reservado, módulo futuro; referenciado por mascotas) ─
create table if not exists mascotas_veterinarios (
    id                  uuid primary key default gen_random_uuid(),
    perfil_id           uuid references mascotas_perfiles(id) on delete set null,
    clinica_id          uuid references mascotas_clinicas(id) on delete set null,
    nombre              text not null,
    apellido            text,
    numero_colegiatura  text,
    especialidad        text,
    telefono            text,
    correo              text,
    activo              boolean not null default true,
    created_at          timestamptz not null default now()
);

create index if not exists idx_mascotas_veterinarios_clinica on mascotas_veterinarios(clinica_id);

-- ── Trigger: auto-crear perfil al registrarse en Supabase Auth ───
create or replace function fn_crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into mascotas_perfiles (id, rol, nombre, correo)
    values (
        new.id,
        'dueno',
        coalesce(new.raw_user_meta_data ->> 'nombre', null),
        new.email
    )
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists trg_crear_perfil_nuevo_usuario on auth.users;
create trigger trg_crear_perfil_nuevo_usuario
    after insert on auth.users
    for each row execute function fn_crear_perfil_nuevo_usuario();
