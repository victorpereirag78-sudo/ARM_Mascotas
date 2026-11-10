-- ════════════════════════════════════════════════════════════════
-- 020 · Notificaciones push de los recordatorios propios
-- ════════════════════════════════════════════════════════════════
-- Hasta ahora solo llegaban al teléfono los avisos de ARM Veterinaria
-- (vet_notificaciones → vet_envios → Edge Function vet-dispatch). Lo que
-- el dueño registra en ARM Mascotas solo se veía al abrir la agenda.
--
-- Esto agrega una cola propia (mascotas_push_cola) que se llena sola cada
-- 5 minutos y la despacha la Edge Function mascotas-push-dispatch
-- (supabase/functions/mascotas-push-dispatch). Usa los mismos teléfonos
-- suscritos (vet_push_suscripciones) y las mismas claves VAPID que la
-- veterinaria, así que una sola activación sirve para todo.
--
-- Cuándo se avisa (hora de Chile):
--   · Recordatorio de la agenda → el día, a su hora o a las 9:00.
--   · Próxima dosis de vacuna   → 7 días antes y 1 día antes, a las 9:00.
--   · Próxima desparasitación   → 7 días antes y 1 día antes, a las 9:00.
--   · Medicamento con "Activar recordatorio" → cada día del tratamiento
--     a las 9:00 (dosis, frecuencia y "día N de M").
-- Reciben el dueño y quienes tienen la mascota compartida (aceptada),
-- solo si tienen un teléfono suscrito. Nunca se avisa algo que se
-- registró después de su momento de aviso, ni dos veces lo mismo.
--
-- Re-ejecutable. Ejecutar en: Supabase → SQL Editor.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.mascotas_push_cola (
    id          uuid primary key default gen_random_uuid(),
    usuario_id  uuid not null references auth.users(id) on delete cascade,
    mascota_id  uuid references public.mascotas(id) on delete cascade,
    clave       text not null,
    titulo      text not null,
    cuerpo      text,
    url         text,
    estado      text not null default 'pendiente'
                check (estado in ('pendiente', 'enviando', 'enviado', 'fallido', 'omitido')),
    intentos    integer not null default 0,
    error       text,
    creado_en   timestamptz not null default now(),
    tomado_en   timestamptz,
    enviado_en  timestamptz,
    unique (usuario_id, clave)
);
create index if not exists idx_mascotas_push_cola_pendientes
    on public.mascotas_push_cola (creado_en) where estado = 'pendiente';

-- Solo el servidor la toca: RLS sin políticas.
alter table public.mascotas_push_cola enable row level security;
revoke all on public.mascotas_push_cola from anon, authenticated;

-- ── Generador: arma los avisos que tocan ahora ───────────────────
create or replace function public.mascotas_sis_generar_avisos()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
    v_ahora timestamp := (now() at time zone 'America/Santiago');
    v_hoy   date      := (now() at time zone 'America/Santiago')::date;
    v_n     integer;
begin
    with destinatarios as (
        select m.id as mascota_id, m.nombre, m.dueno_id as usuario_id
        from public.mascotas m where m.activo
        union
        select m.id, m.nombre, c.invitado_perfil_id
        from public.mascotas m
        join public.mascotas_compartidas c on c.mascota_id = m.id
        where m.activo and c.estado = 'aceptada' and c.invitado_perfil_id is not null
    ),
    avisos as (
        -- 1) Recordatorios de la agenda: el día, a su hora o a las 9:00.
        select r.mascota_id,
               'agenda:' || r.id || ':' || r.fecha_programada || ':' || coalesce(r.hora_programada::text, '') as clave,
               r.fecha_programada + coalesce(r.hora_programada, time '09:00') as momento,
               r.created_at as creado,
               case r.tipo::text
                   when 'vacuna' then '💉' when 'medicamento' then '💊' when 'control' then '🩺'
                   when 'desparasitacion' then '🐛' when 'bano' then '🛁' when 'corte_unas' then '✂️'
                   when 'cumpleanos' then '🎂' else '📌' end as emoji,
               r.titulo as texto,
               case when r.hora_programada is not null then 'Hoy a las ' || to_char(r.hora_programada, 'HH24:MI') else 'Hoy' end
                   || coalesce(' · ' || nullif(btrim(r.descripcion), ''), '') as cuerpo,
               '/app.html?panel=agenda' as url
        from public.mascotas_agenda_recordatorios r
        where r.estado = 'pendiente' and r.fecha_programada between v_hoy - 1 and v_hoy

        union all
        -- 2) Próxima dosis de vacuna (solo la última aplicación de cada vacuna).
        select v.mascota_id,
               'vacuna:' || v.id || ':' || v.proxima_dosis_fecha || ':' || d.dias,
               (v.proxima_dosis_fecha - d.dias) + time '09:00',
               v.created_at,
               '💉',
               case d.dias when 1 then 'mañana le toca la vacuna ' else 'en una semana le toca la vacuna ' end || v.nombre,
               'Próxima dosis el ' || to_char(v.proxima_dosis_fecha, 'DD/MM/YYYY') || '. Reserva la hora con tu veterinaria.',
               '/app.html?panel=agenda'
        from (select distinct on (x.mascota_id, lower(btrim(x.nombre))) x.*
              from public.mascotas_vacunas x
              order by x.mascota_id, lower(btrim(x.nombre)), x.fecha desc, x.created_at desc) v
        cross join (values (7), (1)) as d(dias)
        where v.proxima_dosis_fecha is not null
          and v.proxima_dosis_fecha - d.dias between v_hoy - 1 and v_hoy

        union all
        -- 3) Próxima desparasitación (solo la última de cada tipo).
        select p.mascota_id,
               'despara:' || p.id || ':' || p.proxima_aplicacion || ':' || d.dias,
               (p.proxima_aplicacion - d.dias) + time '09:00',
               p.created_at,
               '🐛',
               case d.dias when 1 then 'mañana toca desparasitación ' else 'en una semana toca desparasitación ' end
                   || case when p.tipo = 'interna' then 'interna' else 'externa' end,
               'Fecha: ' || to_char(p.proxima_aplicacion, 'DD/MM/YYYY')
                   || coalesce('. La última vez usaste ' || nullif(btrim(p.producto), ''), '') || '.',
               '/app.html?panel=agenda'
        from (select distinct on (x.mascota_id, lower(btrim(x.tipo))) x.*
              from public.mascotas_desparasitaciones x
              order by x.mascota_id, lower(btrim(x.tipo)), x.fecha desc, x.created_at desc) p
        cross join (values (7), (1)) as d(dias)
        where p.proxima_aplicacion is not null
          and p.proxima_aplicacion - d.dias between v_hoy - 1 and v_hoy

        union all
        -- 4) Medicamentos con recordatorio activo: cada día del tratamiento.
        select t.mascota_id,
               'med:' || t.id || ':' || v_hoy,
               v_hoy + time '09:00',
               t.created_at,
               '💊',
               'hoy toca ' || t.nombre,
               coalesce(nullif(concat_ws(' · ',
                   nullif(btrim(t.dosis), ''),
                   nullif(btrim(t.frecuencia), ''),
                   case when t.duracion_dias is null then null
                        when v_hoy - t.inicio + 1 = t.duracion_dias then 'Último día del tratamiento'
                        else 'Día ' || (v_hoy - t.inicio + 1) || ' de ' || t.duracion_dias end), ''),
                   'Recuerda darle su medicamento.'),
               '/app.html?panel=medicamentos&m=' || t.mascota_id
        from (select x.*, coalesce(x.fecha_inicio, (x.created_at at time zone 'America/Santiago')::date) as inicio
              from public.mascotas_medicamentos x where x.recordatorio_activo) t
        where t.inicio <= v_hoy
          and (t.duracion_dias is null or t.inicio + t.duracion_dias - 1 >= v_hoy)
    )
    insert into public.mascotas_push_cola (usuario_id, mascota_id, clave, titulo, cuerpo, url)
    select d.usuario_id, a.mascota_id, a.clave,
           a.emoji || ' ' || d.nombre || ': ' || a.texto, a.cuerpo, a.url
    from avisos a
    join destinatarios d on d.mascota_id = a.mascota_id
    join public.mascotas_perfiles pf on pf.id = d.usuario_id and pf.estado_cuenta = 'aprobado'
    where v_ahora >= a.momento
      and v_ahora < a.momento + interval '6 hours'
      and (a.creado at time zone 'America/Santiago') < a.momento
      and exists (select 1 from public.vet_push_suscripciones s where s.usuario_id = d.usuario_id)
    on conflict (usuario_id, clave) do nothing;
    get diagnostics v_n = row_count;

    -- Envíos que quedaron a medias (la función se cayó) vuelven a la cola.
    update public.mascotas_push_cola
    set estado = case when intentos < 3 then 'pendiente' else 'fallido' end,
        error = coalesce(error, 'El envío no terminó')
    where estado = 'enviando' and tomado_en < now() - interval '10 minutes';
    -- Lo que no salió en un día ya no sirve.
    update public.mascotas_push_cola set estado = 'omitido', error = 'Venció sin enviarse'
    where estado = 'pendiente' and creado_en < now() - interval '1 day';
    delete from public.mascotas_push_cola where creado_en < now() - interval '90 days';

    return v_n;
end;
$$;

-- ── Para la Edge Function: tomar, marcar y validar la clave ──────
create or replace function public.mascotas_sis_push_tomar(p_limite integer default 100)
returns table (id uuid, titulo text, cuerpo text, url text, subs jsonb)
language sql
security definer
set search_path = ''
as $$
    with tomados as (
        update public.mascotas_push_cola c
        set estado = 'enviando', intentos = c.intentos + 1, tomado_en = now()
        where c.id in (select c2.id from public.mascotas_push_cola c2
                       where c2.estado = 'pendiente'
                       order by c2.creado_en
                       limit p_limite
                       for update skip locked)
        returning c.id, c.usuario_id, c.titulo, c.cuerpo, c.url
    )
    select t.id, t.titulo, t.cuerpo, t.url,
           coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                     from public.vet_push_suscripciones s where s.usuario_id = t.usuario_id), '[]'::jsonb)
    from tomados t;
$$;

create or replace function public.mascotas_sis_push_marcar(p_id uuid, p_estado text, p_error text default null)
returns void
language sql
security definer
set search_path = ''
as $$
    update public.mascotas_push_cola
    set estado = case when p_estado = 'fallido' and intentos < 3 then 'pendiente' else p_estado end,
        error = p_error,
        enviado_en = case when p_estado = 'enviado' then now() else enviado_en end
    where id = p_id;
$$;

create or replace function public.mascotas_sis_dispatch_key_ok(p_key text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
    select coalesce(p_key, '') <> ''
       and exists (select 1 from vault.decrypted_secrets
                   where name = 'mascotas_push_dispatch_key' and decrypted_secret = p_key);
$$;

-- ── Botón "Enviar prueba" (no exige estar conectado a una clínica) ─
create or replace function public.mascotas_push_prueba()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := (select auth.uid());
begin
    if v_uid is null then raise exception 'Necesitas iniciar sesión' using errcode = '42501'; end if;
    if not exists (select 1 from public.vet_push_suscripciones where usuario_id = v_uid) then
        raise exception 'Este teléfono aún no tiene las notificaciones activadas';
    end if;
    if (select count(*) from public.mascotas_push_cola
        where usuario_id = v_uid and clave like 'prueba:%' and creado_en > now() - interval '1 hour') >= 5 then
        raise exception 'Ya enviaste varias pruebas. Intenta de nuevo en un rato.';
    end if;
    insert into public.mascotas_push_cola (usuario_id, clave, titulo, cuerpo, url)
    values (v_uid, 'prueba:' || gen_random_uuid(), '¡Notificaciones activas! 🐾',
            'Así te avisaremos de tus recordatorios, vacunas, tratamientos y de tu veterinaria.', '/app.html?panel=agenda');
end;
$$;

revoke all on function public.mascotas_sis_generar_avisos() from public, anon, authenticated;
revoke all on function public.mascotas_sis_push_tomar(integer) from public, anon, authenticated;
revoke all on function public.mascotas_sis_push_marcar(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mascotas_sis_dispatch_key_ok(text) from public, anon, authenticated;
grant execute on function public.mascotas_sis_generar_avisos() to service_role;
grant execute on function public.mascotas_sis_push_tomar(integer) to service_role;
grant execute on function public.mascotas_sis_push_marcar(uuid, text, text) to service_role;
grant execute on function public.mascotas_sis_dispatch_key_ok(text) to service_role;
revoke all on function public.mascotas_push_prueba() from public, anon;
grant execute on function public.mascotas_push_prueba() to authenticated;

-- ── Clave compartida entre el cron y la Edge Function ────────────
do $$
begin
    if not exists (select 1 from vault.secrets where name = 'mascotas_push_dispatch_key') then
        perform vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
                                    'mascotas_push_dispatch_key', 'Clave del cron mascotas-push-dispatch');
    end if;
end $$;

-- ── Crons ────────────────────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname in ('mascotas-avisos', 'mascotas-push-dispatch');

select cron.schedule('mascotas-avisos', '*/5 * * * *', $c$ select public.mascotas_sis_generar_avisos(); $c$);

select cron.schedule('mascotas-push-dispatch', '* * * * *', $c$
    select net.http_post(
        url := 'https://rhggndoqjnlzmfxsllto.functions.supabase.co/mascotas-push-dispatch',
        headers := jsonb_build_object('content-type', 'application/json',
            'x-dispatch-key', (select decrypted_secret from vault.decrypted_secrets where name = 'mascotas_push_dispatch_key')),
        body := '{}'::jsonb,
        timeout_milliseconds := 25000)
    where exists (select 1 from public.mascotas_push_cola where estado = 'pendiente');
$c$);
