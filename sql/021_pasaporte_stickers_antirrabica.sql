-- ================================================================
-- 021_PASAPORTE_STICKERS_ANTIRRABICA.SQL
-- Pasaporte Digital: fotos de los stickers de las vacunas (los
-- autoadhesivos del carnet) y número de serie de la vacuna
-- antirrábica.
--
--   mascotas.serie_antirrabica     texto libre (serie del sticker)
--   mascotas_pasaporte_stickers    una fila por foto subida
--
-- Las fotos van al bucket público fotos-mascotas, en la carpeta
-- {mascota_id}/stickers/, que ya cubren las políticas de storage de
-- 008_rls_policies.sql (primer segmento = id de la mascota).
--
-- El pasaporte compartido (fn_pasaporte_publico) las muestra junto a
-- las vacunas, solo si el dueño incluyó esa sección en el enlace.
-- Re-ejecutable.
-- ================================================================

alter table mascotas add column if not exists serie_antirrabica text;
do $$ begin
    if not exists (select 1 from pg_constraint where conname = 'mascotas_serie_antirrabica_largo') then
        alter table mascotas add constraint mascotas_serie_antirrabica_largo
            check (serie_antirrabica is null or length(serie_antirrabica) <= 60);
    end if;
end $$;

create table if not exists mascotas_pasaporte_stickers (
    id          uuid primary key default gen_random_uuid(),
    mascota_id  uuid not null references mascotas(id) on delete cascade,
    url         text not null check (length(url) <= 500),
    ruta        text check (length(ruta) <= 300),
    subido_por  uuid references mascotas_perfiles(id) on delete set null,
    created_at  timestamptz not null default now()
);
create index if not exists idx_mascotas_stickers_mascota on mascotas_pasaporte_stickers(mascota_id, created_at);

alter table mascotas_pasaporte_stickers enable row level security;

drop policy if exists mascotas_stickers_select on mascotas_pasaporte_stickers;
create policy mascotas_stickers_select on mascotas_pasaporte_stickers for select
    using (fn_puede_acceder_mascota(mascota_id));

drop policy if exists mascotas_stickers_insert on mascotas_pasaporte_stickers;
create policy mascotas_stickers_insert on mascotas_pasaporte_stickers for insert
    with check (fn_puede_acceder_mascota(mascota_id, true));

drop policy if exists mascotas_stickers_delete on mascotas_pasaporte_stickers;
create policy mascotas_stickers_delete on mascotas_pasaporte_stickers for delete
    using (fn_puede_acceder_mascota(mascota_id, true));

revoke all on mascotas_pasaporte_stickers from anon;
revoke all on mascotas_pasaporte_stickers from authenticated;
grant select, insert, delete on mascotas_pasaporte_stickers to authenticated;

-- Tope de fotos por mascota: evita que el pasaporte se vuelva un álbum.
create or replace function fn_tg_tope_stickers()
returns trigger language plpgsql set search_path = public as $$
begin
    if (select count(*) from mascotas_pasaporte_stickers s where s.mascota_id = new.mascota_id) >= 12 then
        raise exception 'El pasaporte admite hasta 12 fotos de stickers. Elimina alguna para subir otra.';
    end if;
    return new;
end $$;

drop trigger if exists trg_tope_stickers on mascotas_pasaporte_stickers;
create trigger trg_tope_stickers before insert on mascotas_pasaporte_stickers
    for each row execute function fn_tg_tope_stickers();

-- ── Pasaporte compartido: se agregan la serie y las fotos ─────────
-- Cambia el tipo de retorno, por eso se elimina antes de recrearla.
drop function if exists fn_pasaporte_publico(uuid);
create function fn_pasaporte_publico(p_token uuid)
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
    contacto_emergencia_telefono    text,
    serie_antirrabica               text,
    stickers                        jsonb
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
        case when coalesce((v_secciones->>'contactos')::boolean, true) then p.contacto_emergencia_telefono else null end,
        case when coalesce((v_secciones->>'vacunas')::boolean, true) then m.serie_antirrabica else null end,
        case when coalesce((v_secciones->>'vacunas')::boolean, true) then
            (select jsonb_agg(jsonb_build_object('url', s.url) order by s.created_at) from mascotas_pasaporte_stickers s where s.mascota_id = m.id)
        else null end
    from mascotas m
    join mascotas_perfiles p on p.id = m.dueno_id
    left join mascotas_veterinarios vet on vet.id = m.veterinario_habitual_id
    where m.id = v_share.mascota_id;
end;
$$;

revoke all on function fn_pasaporte_publico(uuid) from public;
grant execute on function fn_pasaporte_publico(uuid) to anon, authenticated;
