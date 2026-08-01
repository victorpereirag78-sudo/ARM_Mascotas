-- ================================================================
-- 007_AUDIT.SQL
-- Auditoría genérica de cambios + documentación de los buckets de
-- Supabase Storage (se crean vía dashboard/API, no por SQL).
-- ================================================================

create table if not exists mascotas_audit_log (
    id                  uuid primary key default gen_random_uuid(),
    tabla               text not null,
    registro_id         uuid not null,
    accion              text not null, -- 'INSERT' | 'UPDATE' | 'DELETE'
    actor_id            uuid references mascotas_perfiles(id),
    datos_anteriores    jsonb,
    datos_nuevos        jsonb,
    fecha               timestamptz not null default now()
);

create index if not exists idx_mascotas_audit_tabla_registro on mascotas_audit_log(tabla, registro_id);
create index if not exists idx_mascotas_audit_actor_fecha on mascotas_audit_log(actor_id, fecha desc);

-- ── Función de trigger genérica ──────────────────────────────────
create or replace function fn_registrar_auditoria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into mascotas_audit_log (tabla, registro_id, accion, actor_id, datos_anteriores, datos_nuevos)
    values (
        TG_TABLE_NAME,
        coalesce(new.id, old.id),
        TG_OP,
        auth.uid(),
        case when TG_OP in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
        case when TG_OP in ('UPDATE', 'INSERT') then to_jsonb(new) else null end
    );
    return coalesce(new, old);
end;
$$;

-- ── Aplicada en Módulo 1 a las tablas activas ────────────────────
drop trigger if exists trg_auditoria_mascotas on mascotas;
create trigger trg_auditoria_mascotas
    after insert or update or delete on mascotas
    for each row execute function fn_registrar_auditoria();

drop trigger if exists trg_auditoria_mascotas_perfiles on mascotas_perfiles;
create trigger trg_auditoria_mascotas_perfiles
    after insert or update or delete on mascotas_perfiles
    for each row execute function fn_registrar_auditoria();

drop trigger if exists trg_auditoria_mascotas_compartidas on mascotas_compartidas;
create trigger trg_auditoria_mascotas_compartidas
    after insert or update or delete on mascotas_compartidas
    for each row execute function fn_registrar_auditoria();

-- ================================================================
-- Buckets de Supabase Storage (crear manualmente en el dashboard,
-- Storage → New bucket → "Private". No se crean por SQL):
--
--   avatares-perfil    → ruta {perfil_id}/{archivo}     (fotos de dueño)
--   fotos-mascotas     → ruta {mascota_id}/{archivo}    (fotos de mascota)
--   adjuntos-clinicos  → ruta {mascota_id}/{tabla_origen}/{archivo}
--                         (reservado, módulo clínico futuro — vacío en Módulo 1)
--
-- Las políticas RLS de cada bucket se agregan en 008_rls_policies.sql
-- ================================================================
