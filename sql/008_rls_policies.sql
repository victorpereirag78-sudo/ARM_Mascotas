-- ================================================================
-- 008_RLS_POLICIES.SQL
-- Row Level Security para todas las tablas. Las políticas de las
-- tablas clínicas/agenda/gastos/evolución/diario quedan escritas
-- ahora (usando el mismo helper) aunque no tengan UI en el Módulo 1,
-- para no tener que retocar seguridad cuando lleguen esos módulos.
-- ================================================================

-- ── Helpers ──────────────────────────────────────────────────────
create or replace function fn_es_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from mascotas_perfiles where id = auth.uid() and rol = 'admin'
    );
$$;

create or replace function fn_puede_acceder_mascota(p_mascota_id uuid, p_requiere_edicion boolean default false)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from mascotas m
        where m.id = p_mascota_id
        and (
            -- Dueño: acceso total
            m.dueno_id = auth.uid()
            -- Compartido con este usuario y aceptado
            or exists (
                select 1 from mascotas_compartidas mc
                where mc.mascota_id = m.id
                and mc.invitado_perfil_id = auth.uid()
                and mc.estado = 'aceptada'
                and (not p_requiere_edicion or mc.nivel_permiso in ('edicion', 'admin'))
            )
            -- Veterinario autorizado
            or exists (
                select 1 from mascotas_autorizaciones_veterinario av
                join mascotas_veterinarios v on v.id = av.veterinario_id
                where av.mascota_id = m.id
                and v.perfil_id = auth.uid()
                and av.activo = true
                and (not p_requiere_edicion or av.nivel_permiso in ('edicion', 'admin'))
            )
        )
    ) or fn_es_admin();
$$;

-- ── Activar RLS en todas las tablas ──────────────────────────────
alter table mascotas_perfiles enable row level security;
alter table mascotas_clinicas enable row level security;
alter table mascotas_veterinarios enable row level security;
alter table mascotas enable row level security;
alter table mascotas_compartidas enable row level security;
alter table mascotas_autorizaciones_veterinario enable row level security;
alter table mascotas_raza_info enable row level security;
alter table mascotas_consultas enable row level security;
alter table mascotas_vacunas enable row level security;
alter table mascotas_cirugias enable row level security;
alter table mascotas_diagnosticos enable row level security;
alter table mascotas_hospitalizaciones enable row level security;
alter table mascotas_alergias enable row level security;
alter table mascotas_examenes_adjuntos enable row level security;
alter table mascotas_medicamentos enable row level security;
alter table mascotas_medicamento_administraciones enable row level security;
alter table mascotas_desparasitaciones enable row level security;
alter table mascotas_alimentacion_historial enable row level security;
alter table mascotas_evolucion_mediciones enable row level security;
alter table mascotas_diario_entradas enable row level security;
alter table mascotas_gastos enable row level security;
alter table mascotas_timeline_eventos enable row level security;
alter table mascotas_agenda_recordatorios enable row level security;
alter table mascotas_audit_log enable row level security;

-- ── Perfiles ─────────────────────────────────────────────────────
drop policy if exists mascotas_perfiles_select on mascotas_perfiles;
create policy mascotas_perfiles_select on mascotas_perfiles for select
    using (id = auth.uid() or fn_es_admin());

drop policy if exists mascotas_perfiles_update on mascotas_perfiles;
create policy mascotas_perfiles_update on mascotas_perfiles for update
    using (id = auth.uid() or fn_es_admin());

-- El insert lo hace el trigger fn_crear_perfil_nuevo_usuario (security definer);
-- no se habilita insert directo desde el cliente.

-- ── Clínicas / veterinarios (lectura pública básica, sin escritura en Módulo 1) ─
drop policy if exists mascotas_clinicas_select on mascotas_clinicas;
create policy mascotas_clinicas_select on mascotas_clinicas for select using (true);

drop policy if exists mascotas_veterinarios_select on mascotas_veterinarios;
create policy mascotas_veterinarios_select on mascotas_veterinarios for select using (true);

-- ── Mascotas ─────────────────────────────────────────────────────
drop policy if exists mascotas_select on mascotas;
create policy mascotas_select on mascotas for select
    using (fn_puede_acceder_mascota(id));

drop policy if exists mascotas_insert on mascotas;
create policy mascotas_insert on mascotas for insert
    with check (dueno_id = auth.uid());

drop policy if exists mascotas_update on mascotas;
create policy mascotas_update on mascotas for update
    using (fn_puede_acceder_mascota(id, true));

drop policy if exists mascotas_delete on mascotas;
create policy mascotas_delete on mascotas for delete
    using (dueno_id = auth.uid() or fn_es_admin());

-- ── Mascotas compartidas ──────────────────────────────────────────
drop policy if exists mascotas_compartidas_select on mascotas_compartidas;
create policy mascotas_compartidas_select on mascotas_compartidas for select
    using (
        invitado_perfil_id = auth.uid()
        or invitado_email = (select correo from mascotas_perfiles where id = auth.uid())
        or exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
        or fn_es_admin()
    );

drop policy if exists mascotas_compartidas_insert on mascotas_compartidas;
create policy mascotas_compartidas_insert on mascotas_compartidas for insert
    with check (
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
    );

drop policy if exists mascotas_compartidas_update on mascotas_compartidas;
create policy mascotas_compartidas_update on mascotas_compartidas for update
    using (
        -- el dueño puede editar/revocar
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
        -- el invitado puede aceptar/rechazar su propia invitación
        or invitado_perfil_id = auth.uid()
        or invitado_email = (select correo from mascotas_perfiles where id = auth.uid())
    );

drop policy if exists mascotas_compartidas_delete on mascotas_compartidas;
create policy mascotas_compartidas_delete on mascotas_compartidas for delete
    using (
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
    );

-- ── Autorizaciones de veterinario (reservado) ────────────────────
drop policy if exists mascotas_autorizaciones_vet_select on mascotas_autorizaciones_veterinario;
create policy mascotas_autorizaciones_vet_select on mascotas_autorizaciones_veterinario for select
    using (
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
        or exists (select 1 from mascotas_veterinarios v where v.id = veterinario_id and v.perfil_id = auth.uid())
        or fn_es_admin()
    );

drop policy if exists mascotas_autorizaciones_vet_insert on mascotas_autorizaciones_veterinario;
create policy mascotas_autorizaciones_vet_insert on mascotas_autorizaciones_veterinario for insert
    with check (
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
    );

drop policy if exists mascotas_autorizaciones_vet_update on mascotas_autorizaciones_veterinario;
create policy mascotas_autorizaciones_vet_update on mascotas_autorizaciones_veterinario for update
    using (
        exists (select 1 from mascotas m where m.id = mascota_id and m.dueno_id = auth.uid())
    );

-- ── Raza info: lectura pública, escritura solo backend/servicio ──
drop policy if exists mascotas_raza_info_select on mascotas_raza_info;
create policy mascotas_raza_info_select on mascotas_raza_info for select using (true);

-- ── Tablas clínicas / agenda / gastos / evolución / diario ───────
-- Reservadas para módulos futuros: política ya lista con el mismo
-- helper, para no tocar RLS cuando se construya la UI.
do $$
declare
    t text;
begin
    foreach t in array array[
        'mascotas_consultas', 'mascotas_vacunas', 'mascotas_cirugias',
        'mascotas_diagnosticos', 'mascotas_hospitalizaciones', 'mascotas_alergias',
        'mascotas_examenes_adjuntos', 'mascotas_medicamentos', 'mascotas_desparasitaciones',
        'mascotas_alimentacion_historial', 'mascotas_evolucion_mediciones',
        'mascotas_diario_entradas', 'mascotas_gastos', 'mascotas_timeline_eventos',
        'mascotas_agenda_recordatorios'
    ]
    loop
        execute format('drop policy if exists %I_select on %I', t, t);
        execute format(
            'create policy %I_select on %I for select using (fn_puede_acceder_mascota(mascota_id))',
            t, t
        );
        execute format('drop policy if exists %I_insert on %I', t, t);
        execute format(
            'create policy %I_insert on %I for insert with check (fn_puede_acceder_mascota(mascota_id))',
            t, t
        );
        execute format('drop policy if exists %I_update on %I', t, t);
        execute format(
            'create policy %I_update on %I for update using (fn_puede_acceder_mascota(mascota_id, true))',
            t, t
        );
        execute format('drop policy if exists %I_delete on %I', t, t);
        execute format(
            'create policy %I_delete on %I for delete using (fn_puede_acceder_mascota(mascota_id, true))',
            t, t
        );
    end loop;
end $$;

-- mascotas_medicamento_administraciones no tiene mascota_id directo (cuelga de mascotas_medicamentos)
drop policy if exists mascotas_medicamento_administraciones_select on mascotas_medicamento_administraciones;
create policy mascotas_medicamento_administraciones_select on mascotas_medicamento_administraciones for select
    using (
        exists (
            select 1 from mascotas_medicamentos med
            where med.id = medicamento_id and fn_puede_acceder_mascota(med.mascota_id)
        )
    );

drop policy if exists mascotas_medicamento_administraciones_insert on mascotas_medicamento_administraciones;
create policy mascotas_medicamento_administraciones_insert on mascotas_medicamento_administraciones for insert
    with check (
        exists (
            select 1 from mascotas_medicamentos med
            where med.id = medicamento_id and fn_puede_acceder_mascota(med.mascota_id, true)
        )
    );

-- ── Audit log: solo inserta el trigger; lectura admin + dueño del registro ─
drop policy if exists mascotas_audit_log_select on mascotas_audit_log;
create policy mascotas_audit_log_select on mascotas_audit_log for select
    using (actor_id = auth.uid() or fn_es_admin());

-- Sin policy de insert/update/delete para clientes: solo el trigger
-- (security definer) escribe en mascotas_audit_log.

-- ================================================================
-- Políticas de Supabase Storage
-- Requiere que los buckets avatares-perfil, fotos-mascotas y
-- adjuntos-clinicos ya existan (creados manualmente, ver 007_audit.sql).
-- Convención de ruta: primer segmento del path = id del dueño de la carpeta.
-- ================================================================

drop policy if exists storage_avatares_select on storage.objects;
create policy storage_avatares_select on storage.objects for select
    using (bucket_id = 'avatares-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_avatares_write on storage.objects;
create policy storage_avatares_write on storage.objects for insert
    with check (bucket_id = 'avatares-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_avatares_update on storage.objects;
create policy storage_avatares_update on storage.objects for update
    using (bucket_id = 'avatares-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_avatares_delete on storage.objects;
create policy storage_avatares_delete on storage.objects for delete
    using (bucket_id = 'avatares-perfil' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists storage_fotos_mascotas_select on storage.objects;
create policy storage_fotos_mascotas_select on storage.objects for select
    using (
        bucket_id = 'fotos-mascotas'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists storage_fotos_mascotas_write on storage.objects;
create policy storage_fotos_mascotas_write on storage.objects for insert
    with check (
        bucket_id = 'fotos-mascotas'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid, true)
    );

drop policy if exists storage_fotos_mascotas_update on storage.objects;
create policy storage_fotos_mascotas_update on storage.objects for update
    using (
        bucket_id = 'fotos-mascotas'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid, true)
    );

drop policy if exists storage_fotos_mascotas_delete on storage.objects;
create policy storage_fotos_mascotas_delete on storage.objects for delete
    using (
        bucket_id = 'fotos-mascotas'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid, true)
    );

-- adjuntos-clinicos: reservado, mismas reglas que fotos-mascotas (módulo futuro)
drop policy if exists storage_adjuntos_clinicos_select on storage.objects;
create policy storage_adjuntos_clinicos_select on storage.objects for select
    using (
        bucket_id = 'adjuntos-clinicos'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid)
    );

drop policy if exists storage_adjuntos_clinicos_write on storage.objects;
create policy storage_adjuntos_clinicos_write on storage.objects for insert
    with check (
        bucket_id = 'adjuntos-clinicos'
        and fn_puede_acceder_mascota(((storage.foldername(name))[1])::uuid, true)
    );

-- ================================================================
-- Grants de nivel de tabla
-- RLS (arriba) filtra fila por fila, pero antes de eso el rol debe
-- tener el privilegio base sobre la tabla — sin este GRANT, Postgres
-- devuelve "permission denied" (403) incluso para una fila que la
-- política sí permitiría. No siempre se hereda automáticamente en
-- tablas creadas desde el SQL Editor, así que se otorga explícito.
-- ================================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on
    mascotas, mascotas_compartidas,
    mascotas_perfiles, mascotas_clinicas, mascotas_veterinarios,
    mascotas_autorizaciones_veterinario, mascotas_raza_info,
    mascotas_consultas, mascotas_vacunas, mascotas_cirugias, mascotas_diagnosticos,
    mascotas_hospitalizaciones, mascotas_alergias, mascotas_examenes_adjuntos,
    mascotas_medicamentos, mascotas_medicamento_administraciones,
    mascotas_desparasitaciones, mascotas_alimentacion_historial,
    mascotas_evolucion_mediciones, mascotas_diario_entradas, mascotas_gastos,
    mascotas_timeline_eventos, mascotas_agenda_recordatorios
to authenticated;

-- audit_log: solo lectura para el cliente (el trigger security definer es quien inserta)
grant select on mascotas_audit_log to authenticated;

-- Vistas de solo lectura
grant select on vista_resumen_mascota, vista_agenda_pendiente, vista_sos_mascota to authenticated;
