-- ================================================================
-- 015_PERDIDA_Y_QR_REFINADO.SQL
-- Módulo "Mascota perdida": reutiliza el mismo QR permanente del
-- collar (qr_token) en vez de crear un link nuevo — cuando hay una
-- alerta activa, la misma página pública (qr.html) muestra el aviso
-- de emergencia. También suma "condiciones especiales" (observaciones)
-- como campo configurable del QR.
-- ================================================================

create table if not exists mascotas_alertas_perdida (
    id                      uuid primary key default gen_random_uuid(),
    mascota_id              uuid not null references mascotas(id) on delete cascade,
    activa                  boolean not null default true,
    fecha_hora              timestamptz not null default now(),
    ultima_ubicacion_lat    numeric(9,6),
    ultima_ubicacion_lng    numeric(9,6),
    ultima_ubicacion_texto  text,
    descripcion             text,
    contacto_nombre         text,
    contacto_telefono       text,
    creado_por              uuid references mascotas_perfiles(id),
    encontrada_at           timestamptz
);

create index if not exists idx_mascotas_alertas_perdida_mascota on mascotas_alertas_perdida(mascota_id);

-- Como mucho una alerta activa por mascota (el cliente actualiza la
-- existente en vez de crear otra si ya hay una vigente).
create unique index if not exists uq_mascotas_alertas_perdida_una_activa
    on mascotas_alertas_perdida(mascota_id) where activa = true;

alter table mascotas_alertas_perdida enable row level security;

drop policy if exists mascotas_alertas_perdida_select on mascotas_alertas_perdida;
create policy mascotas_alertas_perdida_select on mascotas_alertas_perdida for select
    using (fn_puede_acceder_mascota(mascota_id));

drop policy if exists mascotas_alertas_perdida_insert on mascotas_alertas_perdida;
create policy mascotas_alertas_perdida_insert on mascotas_alertas_perdida for insert
    with check (fn_puede_acceder_mascota(mascota_id, true));

drop policy if exists mascotas_alertas_perdida_update on mascotas_alertas_perdida;
create policy mascotas_alertas_perdida_update on mascotas_alertas_perdida for update
    using (fn_puede_acceder_mascota(mascota_id, true));

grant select, insert, update on mascotas_alertas_perdida to authenticated;

-- ── Ficha pública del QR: se agregan condiciones especiales y el
-- estado de la alerta de pérdida activa (si existe). El cambio en
-- las columnas de retorno obliga a recrear la función.
drop function if exists fn_ficha_publica_qr(uuid);

create function fn_ficha_publica_qr(p_token uuid)
returns table (
    nombre                          text,
    especie                         especie_mascota,
    raza                            text,
    foto_url                        text,
    alergias                        text[],
    medicamentos_activos            text[],
    veterinario_nombre              text,
    veterinario_telefono            text,
    dueno_telefono                  text,
    contacto_emergencia_nombre      text,
    contacto_emergencia_telefono    text,
    condiciones_especiales          text,
    perdida_activa                  boolean,
    perdida_descripcion             text,
    perdida_ultima_ubicacion        text,
    perdida_fecha_hora              timestamptz,
    perdida_contacto_nombre         text,
    perdida_contacto_telefono       text
)
language sql
security definer
stable
set search_path = public
as $$
    select
        m.nombre,
        m.especie,
        m.raza,
        m.foto_url,
        case when coalesce((m.qr_visibilidad->>'mostrar_alergias')::boolean, false)
            then (select array_agg(a.nombre) from mascotas_alergias a where a.mascota_id = m.id)
            else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_medicamentos')::boolean, false)
            then (select array_agg(med.nombre) from mascotas_medicamentos med where med.mascota_id = m.id and med.recordatorio_activo = true)
            else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_veterinario')::boolean, false) then vet.nombre else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_veterinario')::boolean, false) then vet.telefono else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_telefono_dueno')::boolean, false) then p.telefono else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_contacto_emergencia')::boolean, false) then p.contacto_emergencia_nombre else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_contacto_emergencia')::boolean, false) then p.contacto_emergencia_telefono else null end,
        case when coalesce((m.qr_visibilidad->>'mostrar_observaciones')::boolean, false) then m.observaciones else null end,
        alerta.activa,
        alerta.descripcion,
        alerta.ultima_ubicacion_texto,
        alerta.fecha_hora,
        alerta.contacto_nombre,
        alerta.contacto_telefono
    from mascotas m
    join mascotas_perfiles p on p.id = m.dueno_id
    left join mascotas_veterinarios vet on vet.id = m.veterinario_habitual_id
    left join mascotas_alertas_perdida alerta on alerta.mascota_id = m.id and alerta.activa = true
    where m.qr_token = p_token and m.activo = true;
$$;

grant execute on function fn_ficha_publica_qr(uuid) to anon, authenticated;
