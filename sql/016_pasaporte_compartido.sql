-- ================================================================
-- 016_PASAPORTE_COMPARTIDO.SQL
-- "Compartir ficha" del Pasaporte Digital: enlace/QR temporal con
-- vencimiento, distinto del QR permanente del collar. El dueño elige
-- qué secciones incluir; por defecto van todas (a diferencia del QR
-- del collar, que es opt-in porque lo puede escanear un desconocido,
-- este lo genera el dueño a propósito para compartir con alguien
-- puntual — ej. un cuidador o un veterinario nuevo).
-- ================================================================

create table if not exists mascotas_pasaporte_compartido (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    token           uuid not null default gen_random_uuid() unique,
    secciones       jsonb not null default '{}'::jsonb,
    expira_at       timestamptz not null,
    creado_por      uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);

create index if not exists idx_mascotas_pasaporte_token on mascotas_pasaporte_compartido(token);
create index if not exists idx_mascotas_pasaporte_mascota on mascotas_pasaporte_compartido(mascota_id);

alter table mascotas_pasaporte_compartido enable row level security;

drop policy if exists mascotas_pasaporte_select on mascotas_pasaporte_compartido;
create policy mascotas_pasaporte_select on mascotas_pasaporte_compartido for select
    using (fn_puede_acceder_mascota(mascota_id));

drop policy if exists mascotas_pasaporte_insert on mascotas_pasaporte_compartido;
create policy mascotas_pasaporte_insert on mascotas_pasaporte_compartido for insert
    with check (fn_puede_acceder_mascota(mascota_id, true));

drop policy if exists mascotas_pasaporte_delete on mascotas_pasaporte_compartido;
create policy mascotas_pasaporte_delete on mascotas_pasaporte_compartido for delete
    using (fn_puede_acceder_mascota(mascota_id, true));

grant select, insert, delete on mascotas_pasaporte_compartido to authenticated;

-- ── Resolución pública del enlace temporal ───────────────────────
-- security definer: el visitante (anon) nunca toca las tablas base
-- directamente, solo esta función, y solo mientras no haya expirado.
create or replace function fn_pasaporte_publico(p_token uuid)
returns table (
    nombre                          text,
    especie                         especie_mascota,
    raza                            text,
    sexo                            sexo_mascota,
    fecha_nacimiento                date,
    peso_actual                     numeric,
    color                           text,
    microchip                       text,
    foto_url                        text,
    vacunas                         jsonb,
    desparasitaciones               jsonb,
    medicamentos                    jsonb,
    alergias                        jsonb,
    diagnosticos                    jsonb,
    cirugias                        jsonb,
    consultas                       jsonb,
    dueno_nombre                    text,
    dueno_telefono                  text,
    veterinario_nombre              text,
    veterinario_telefono            text,
    contacto_emergencia_nombre      text,
    contacto_emergencia_telefono    text
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
    v_share mascotas_pasaporte_compartido;
    v_secciones jsonb;
begin
    select * into v_share from mascotas_pasaporte_compartido
    where token = p_token and expira_at > now();

    if not found then
        return;
    end if;
    v_secciones := v_share.secciones;

    return query
    select
        m.nombre, m.especie, m.raza, m.sexo, m.fecha_nacimiento, m.peso_actual, m.color, m.microchip, m.foto_url,
        case when coalesce((v_secciones->>'vacunas')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('nombre', v.nombre, 'fecha', v.fecha)) from mascotas_vacunas v where v.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'desparasitaciones')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'producto', d.producto, 'fecha', d.fecha)) from mascotas_desparasitaciones d where d.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'medicamentos')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('nombre', med.nombre, 'dosis', med.dosis, 'activo', med.recordatorio_activo)) from mascotas_medicamentos med where med.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'alergias')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('nombre', a.nombre, 'severidad', a.severidad)) from mascotas_alergias a where a.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'diagnosticos')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('nombre', dg.nombre, 'fecha', dg.fecha, 'estado', dg.estado)) from mascotas_diagnosticos dg where dg.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'cirugias')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('nombre', c.nombre, 'fecha', c.fecha, 'resultado', c.resultado)) from mascotas_cirugias c where c.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'consultas')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('motivo', co.motivo, 'fecha', co.fecha, 'diagnostico', co.diagnostico)) from mascotas_consultas co where co.mascota_id = m.id)
        else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then trim(p.nombre || ' ' || coalesce(p.apellido, '')) else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then p.telefono else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then vet.nombre else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then vet.telefono else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then p.contacto_emergencia_nombre else null end,
        case when coalesce((v_secciones->>'contactos')::boolean, true) then p.contacto_emergencia_telefono else null end
    from mascotas m
    join mascotas_perfiles p on p.id = m.dueno_id
    left join mascotas_veterinarios vet on vet.id = m.veterinario_habitual_id
    where m.id = v_share.mascota_id;
end;
$$;

grant execute on function fn_pasaporte_publico(uuid) to anon, authenticated;
