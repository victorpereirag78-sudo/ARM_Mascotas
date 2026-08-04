-- ================================================================
-- 011_HISTORIAL_TRIGGERS.SQL
-- Activa la línea de vida automática (fn_insertar_evento_timeline,
-- definida en 009) para las tablas que ahora tienen formulario en el
-- Módulo Dueño: vacunas, medicamentos, cirugías, evolución y diario.
-- También sincroniza mascotas.peso_actual con la última medición.
-- ================================================================

-- ── Reescribe la función para resolver tipo/título/autor por tabla ─
-- (la versión de 009 solo cubría new.nombre, que no existe en todas
-- las tablas de origen; aquí cada rama arma su propio texto).
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
    foreach t in array array[
        'mascotas_vacunas', 'mascotas_medicamentos', 'mascotas_cirugias',
        'mascotas_evolucion_mediciones', 'mascotas_diario_entradas'
    ]
    loop
        execute format('drop trigger if exists trg_timeline_evento on %I', t);
        execute format(
            'create trigger trg_timeline_evento after insert on %I for each row execute function fn_insertar_evento_timeline()',
            t
        );
    end loop;
end $$;

-- ── Mantener mascotas.peso_actual al día con la última medición ────
create or replace function fn_sync_peso_actual()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.peso_kg is not null then
        update mascotas set peso_actual = new.peso_kg where id = new.mascota_id;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_sync_peso_actual on mascotas_evolucion_mediciones;
create trigger trg_sync_peso_actual
    after insert on mascotas_evolucion_mediciones
    for each row execute function fn_sync_peso_actual();
