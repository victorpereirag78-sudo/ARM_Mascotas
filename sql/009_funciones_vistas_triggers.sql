-- ================================================================
-- 009_FUNCIONES_VISTAS_TRIGGERS.SQL
-- updated_at automático, cálculo de edad, timeline automático
-- (reservado), y vistas de resumen para dashboard/agenda/SOS.
-- ================================================================

-- ── updated_at automático ─────────────────────────────────────────
create or replace function fn_actualizar_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
declare
    t text;
begin
    foreach t in array array[
        'mascotas_perfiles', 'mascotas_clinicas', 'mascotas', 'mascotas_consultas',
        'mascotas_vacunas', 'mascotas_cirugias', 'mascotas_diagnosticos',
        'mascotas_hospitalizaciones', 'mascotas_medicamentos', 'mascotas_agenda_recordatorios'
    ]
    loop
        execute format('drop trigger if exists trg_updated_at on %I', t);
        execute format(
            'create trigger trg_updated_at before update on %I for each row execute function fn_actualizar_updated_at()',
            t
        );
    end loop;
end $$;

-- ── Cálculo de edad (espejo del cliente Utils.calcularEdadMascota) ─
-- Fórmula veterinaria no lineal para perro/gato: año 1 ≈ 15 años humanos,
-- año 2 suma ≈9, cada año siguiente suma ≈4-5. 'otro' no tiene equivalencia.
create or replace function fn_calcular_edad_mascota(fecha_nacimiento date, especie especie_mascota)
returns table (anios int, meses int, edad_humana_equivalente int)
language plpgsql
immutable
as $$
declare
    v_anios int;
    v_meses int;
    v_humana numeric;
begin
    if fecha_nacimiento is null then
        return query select null::int, null::int, null::int;
        return;
    end if;

    v_anios := extract(year from age(current_date, fecha_nacimiento))::int;
    v_meses := extract(month from age(current_date, fecha_nacimiento))::int;

    if especie = 'otro' then
        return query select v_anios, v_meses, null::int;
        return;
    end if;

    if v_anios <= 0 then
        -- menor a un año: interpolación simple sobre los primeros 15 años humanos
        v_humana := round((extract(epoch from age(current_date, fecha_nacimiento)) / (365.25 * 86400)) * 15);
    elsif v_anios = 1 then
        v_humana := 15;
    elsif v_anios = 2 then
        v_humana := 24;
    else
        v_humana := 24 + (v_anios - 2) * 4;
    end if;

    return query select v_anios, v_meses, v_humana::int;
end;
$$;

-- ── Auto-inserción en la línea de vida (reservado, módulo futuro) ─
-- Se define ahora la función genérica; los triggers que la disparan
-- se agregan en el módulo clínico cuando existan formularios que
-- escriban en mascotas_vacunas/mascotas_cirugias/mascotas_evolucion_mediciones, etc.
create or replace function fn_insertar_evento_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into mascotas_timeline_eventos (mascota_id, tipo_evento, titulo, fecha_evento, tabla_origen, id_origen, creado_por)
    values (
        new.mascota_id,
        case TG_TABLE_NAME
            when 'mascotas_vacunas' then 'vacuna'
            when 'mascotas_cirugias' then 'cirugia'
            when 'mascotas_evolucion_mediciones' then 'cambio_peso'
            else 'otro'
        end,
        coalesce(new.nombre, TG_TABLE_NAME),
        now(),
        TG_TABLE_NAME,
        new.id,
        new.registrado_por
    );
    return new;
end;
$$;

-- ── Vistas ─────────────────────────────────────────────────────────
-- Nombres de vista sin prefijo (a diferencia de las tablas): quedan
-- diferenciadas por el propio prefijo "vista_" y por su contenido,
-- que ya referencia solo tablas mascotas_*.

-- Resumen de mascota: alimenta el dashboard del Módulo 1
create or replace view vista_resumen_mascota as
select
    m.id,
    m.dueno_id,
    m.nombre,
    m.especie,
    m.raza,
    m.foto_url,
    m.fecha_nacimiento,
    m.peso_actual,
    edad.anios,
    edad.meses,
    edad.edad_humana_equivalente,
    (extract(doy from age(
        date_trunc('year', current_date) + (m.fecha_nacimiento - date_trunc('year', m.fecha_nacimiento)),
        current_date
    )) is not null) as tiene_cumpleanos_valido,
    (
        make_date(
            extract(year from current_date)::int
            + case when (extract(month from m.fecha_nacimiento), extract(day from m.fecha_nacimiento))
                        < (extract(month from current_date), extract(day from current_date))
                   then 1 else 0 end,
            extract(month from m.fecha_nacimiento)::int,
            extract(day from m.fecha_nacimiento)::int
        ) - current_date
    ) as dias_para_cumpleanos,
    (select min(ar.fecha_programada) from mascotas_agenda_recordatorios ar
        where ar.mascota_id = m.id and ar.estado = 'pendiente') as proximo_recordatorio_fecha,
    (select ev.peso_kg from mascotas_evolucion_mediciones ev
        where ev.mascota_id = m.id order by ev.fecha desc limit 1) as ultimo_peso_registrado
from mascotas m
cross join lateral fn_calcular_edad_mascota(m.fecha_nacimiento, m.especie) as edad
where m.activo = true;

-- Agenda pendiente (reservado, módulo futuro)
create or replace view vista_agenda_pendiente as
select
    ar.id,
    ar.mascota_id,
    m.nombre as mascota_nombre,
    m.dueno_id,
    ar.tipo,
    ar.titulo,
    ar.fecha_programada,
    ar.hora_programada,
    ar.estado
from mascotas_agenda_recordatorios ar
join mascotas m on m.id = ar.mascota_id
where ar.estado = 'pendiente'
order by ar.fecha_programada;

-- Vista SOS (reservado, módulo futuro): ficha de emergencia denormalizada
create or replace view vista_sos_mascota as
select
    m.id as mascota_id,
    m.nombre,
    m.foto_url,
    m.especie,
    m.raza,
    (select array_agg(a.nombre) from mascotas_alergias a where a.mascota_id = m.id) as alergias,
    (select array_agg(med.nombre) from mascotas_medicamentos med
        where med.mascota_id = m.id and med.recordatorio_activo = true) as medicamentos_activos,
    v.nombre as veterinario_nombre,
    v.telefono as veterinario_telefono,
    p.nombre as dueno_nombre,
    p.telefono as dueno_telefono,
    p.contacto_emergencia_nombre,
    p.contacto_emergencia_telefono
from mascotas m
join mascotas_perfiles p on p.id = m.dueno_id
left join mascotas_veterinarios v on v.id = m.veterinario_habitual_id
where m.activo = true;
