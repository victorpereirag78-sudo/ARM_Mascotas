-- ================================================================
-- 012_QR_PUBLICO.SQL
-- Ficha pública de emergencia (QR): expone SOLO los campos que el
-- dueño habilitó en mascotas.qr_visibilidad, a través de una función
-- security definer — la tabla mascotas NUNCA se abre a anon vía RLS.
-- qr_visibilidad (jsonb) admite las claves: mostrar_alergias,
-- mostrar_medicamentos, mostrar_veterinario, mostrar_telefono_dueno,
-- mostrar_contacto_emergencia. Todo por defecto queda oculto ('{}').
-- ================================================================

create or replace function fn_ficha_publica_qr(p_token uuid)
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
    contacto_emergencia_telefono    text
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
            else null end as alergias,
        case when coalesce((m.qr_visibilidad->>'mostrar_medicamentos')::boolean, false)
            then (select array_agg(med.nombre) from mascotas_medicamentos med where med.mascota_id = m.id and med.recordatorio_activo = true)
            else null end as medicamentos_activos,
        case when coalesce((m.qr_visibilidad->>'mostrar_veterinario')::boolean, false) then vet.nombre else null end as veterinario_nombre,
        case when coalesce((m.qr_visibilidad->>'mostrar_veterinario')::boolean, false) then vet.telefono else null end as veterinario_telefono,
        case when coalesce((m.qr_visibilidad->>'mostrar_telefono_dueno')::boolean, false) then p.telefono else null end as dueno_telefono,
        case when coalesce((m.qr_visibilidad->>'mostrar_contacto_emergencia')::boolean, false) then p.contacto_emergencia_nombre else null end as contacto_emergencia_nombre,
        case when coalesce((m.qr_visibilidad->>'mostrar_contacto_emergencia')::boolean, false) then p.contacto_emergencia_telefono else null end as contacto_emergencia_telefono
    from mascotas m
    join mascotas_perfiles p on p.id = m.dueno_id
    left join mascotas_veterinarios vet on vet.id = m.veterinario_habitual_id
    where m.qr_token = p_token and m.activo = true;
$$;

-- ── Grants mínimos para visitantes anónimos (sin login) ──────────
-- Solo pueden EJECUTAR esta función puntual; RLS sigue bloqueando
-- cualquier select directo a las tablas para el rol anon.
grant usage on schema public to anon;
grant execute on function fn_ficha_publica_qr(uuid) to anon, authenticated;
