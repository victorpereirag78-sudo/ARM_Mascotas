-- ================================================================
-- 014_VETERINARIO_ROL.SQL
-- Habilita el alta de veterinarios. mascotas_veterinarios solo tenía
-- policy de lectura pública (008); faltaba quién puede escribir ahí.
-- Lo crea el Administrador ARM al promover una cuenta existente a
-- rol='veterinario' (ver módulo Admin).
-- ================================================================

drop policy if exists mascotas_veterinarios_insert on mascotas_veterinarios;
create policy mascotas_veterinarios_insert on mascotas_veterinarios for insert
    with check (fn_es_admin());

drop policy if exists mascotas_veterinarios_update on mascotas_veterinarios;
create policy mascotas_veterinarios_update on mascotas_veterinarios for update
    using (fn_es_admin());

-- ── Sumar consultas y diagnósticos a la línea de vida automática ────
-- (vacunas/medicamentos/cirugías/evolución/diario ya quedaron
-- conectados en 011_historial_triggers.sql)
create or replace function fn_insertar_evento_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_tipo tipo_evento_timeline;
    v_titulo text;
    v_creado_por uuid;
begin
    case TG_TABLE_NAME
        when 'mascotas_vacunas' then
            v_tipo := 'vacuna';
            v_titulo := 'Vacuna: ' || new.nombre;
            v_creado_por := new.registrado_por;
        when 'mascotas_medicamentos' then
            v_tipo := 'medicamento';
            v_titulo := 'Medicamento: ' || new.nombre;
            v_creado_por := new.registrado_por;
        when 'mascotas_cirugias' then
            v_tipo := 'cirugia';
            v_titulo := 'Cirugía: ' || new.nombre;
            v_creado_por := new.registrado_por;
        when 'mascotas_evolucion_mediciones' then
            v_tipo := 'cambio_peso';
            v_titulo := 'Nuevo peso registrado: ' || coalesce(new.peso_kg::text || ' kg', '—');
            v_creado_por := new.registrado_por;
        when 'mascotas_diario_entradas' then
            v_tipo := case when new.tipo in ('foto', 'video') then 'foto' else 'otro' end;
            v_titulo := coalesce(nullif(left(new.contenido, 60), ''), initcap(new.tipo));
            v_creado_por := new.autor_id;
        when 'mascotas_consultas' then
            v_tipo := 'control';
            v_titulo := 'Consulta: ' || coalesce(new.motivo, 'sin motivo registrado');
            v_creado_por := new.registrado_por;
        when 'mascotas_diagnosticos' then
            v_tipo := 'otro';
            v_titulo := 'Diagnóstico: ' || new.nombre;
            v_creado_por := new.registrado_por;
        else
            v_tipo := 'otro';
            v_titulo := TG_TABLE_NAME;
            v_creado_por := null;
    end case;

    insert into mascotas_timeline_eventos (mascota_id, tipo_evento, titulo, fecha_evento, tabla_origen, id_origen, creado_por)
    values (new.mascota_id, v_tipo, v_titulo, now(), TG_TABLE_NAME, new.id, v_creado_por);

    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array['mascotas_consultas', 'mascotas_diagnosticos']
    loop
        execute format('drop trigger if exists trg_timeline_evento on %I', t);
        execute format(
            'create trigger trg_timeline_evento after insert on %I for each row execute function fn_insertar_evento_timeline()',
            t
        );
    end loop;
end $$;
