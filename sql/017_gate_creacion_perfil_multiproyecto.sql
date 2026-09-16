-- ════════════════════════════════════════════════════════════════
-- 017 · No crear perfil de ARM Mascotas para registros de OTRAS apps
-- ════════════════════════════════════════════════════════════════
-- Este proyecto de Supabase es compartido por varias apps (Mi Vehículo,
-- MiFran, Emprendedores, Drive, ARM Mascotas y otra de pacientes), cada
-- una con su propio trigger AFTER INSERT en auth.users.
-- fn_crear_perfil_nuevo_usuario() se disparaba para CUALQUIER registro
-- en CUALQUIERA de esas apps, creando acá un perfil (rol 'dueno') para
-- gente que nunca abrió ARM Mascotas.
--
-- Arreglo (mismo patrón aplicado en Mi Vehículo):
--   1. fn_crear_perfil_nuevo_usuario() solo actúa si el registro trae
--      la marca {"producto": "mascotas"} en sus metadatos — la pone el
--      propio formulario de registro (auth.js → registrarDueno()).
--   2. cargarSesionActual() (se llama en cada carga de la app) se
--      vuelve autosuficiente: si quien tiene sesión no tiene perfil
--      todavía (porque ya tenía cuenta de OTRA app y esta es su primera
--      vez real en ARM Mascotas), llama a fn_asegurar_mi_perfil_mascotas()
--      para crearlo ahí mismo.
--
-- Los nombres de función llevan sufijo "_mascotas" (a diferencia del
-- resto de este archivo, que no prefija) porque el esquema es
-- compartido con otras apps y varias usan nombres genéricos tipo
-- fn_es_admin(): sin el sufijo, dos apps podrían pisarse una función.
--
-- Re-ejecutable. Ejecutar en: Supabase → SQL Editor (después de 016).
-- ════════════════════════════════════════════════════════════════

-- ── 1. Lógica de alta, ahora reutilizable ───────────────────────────
create or replace function fn_provisionar_perfil_mascotas(
  _id     uuid,
  _correo text,
  _meta   jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into mascotas_perfiles (id, rol, nombre, correo)
    values (
        _id,
        'dueno',
        coalesce(_meta ->> 'nombre', null),
        _correo
    )
    on conflict (id) do nothing;
end;
$$;

-- Nunca directo desde el cliente: recibe un _id arbitrario y no valida
-- que sea el del llamante. Solo la usan las funciones de abajo, que sí
-- lo acotan a auth.uid() / new.id.
revoke all on function fn_provisionar_perfil_mascotas(uuid, text, jsonb) from public, anon, authenticated;


-- ── 2. Trigger: solo para registros marcados como de ARM Mascotas ───
create or replace function fn_crear_perfil_nuevo_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if coalesce(new.raw_user_meta_data ->> 'producto', '') = 'mascotas' then
        perform fn_provisionar_perfil_mascotas(new.id, new.email, new.raw_user_meta_data);
    end if;
    return new;
end;
$$;


-- ── 3. Autoprovisión al entrar: envoltorio seguro sin parámetro de id,
--      así solo puede provisionar la sesión propia. La llama el
--      frontend (cargarSesionActual en auth.js) cuando el select a
--      mascotas_perfiles no encuentra fila.
create or replace function fn_asegurar_mi_perfil_mascotas()
returns mascotas_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
    uid      uuid := auth.uid();
    v_perfil mascotas_perfiles;
begin
    if uid is null then
        raise exception 'Sin sesión válida' using errcode = 'insufficient_privilege';
    end if;

    perform fn_provisionar_perfil_mascotas(
        uid,
        (select email from auth.users where id = uid),
        (select raw_user_meta_data from auth.users where id = uid)
    );

    select * into v_perfil from mascotas_perfiles where id = uid;
    return v_perfil;
end;
$$;

revoke all on function fn_asegurar_mi_perfil_mascotas() from public, anon;
grant execute on function fn_asegurar_mi_perfil_mascotas() to authenticated;
