-- ════════════════════════════════════════════════════════════════
-- 018 · Integración con ARM Veterinaria
-- ════════════════════════════════════════════════════════════════
-- ARM Mascotas pasa a ser la "App Mascotas" del ecosistema
-- VETERINARIA + APP MASCOTAS. Los datos clínicos que registra una
-- veterinaria viven en las tablas vet_* (proyecto ARM-Veterinaria,
-- supabase/migrations/008_app_mascotas.sql) y esta app los LEE con las
-- funciones vet_app_* — no se copian a las tablas mascotas_*.
--
-- Único cambio en el lado de ARM Mascotas: cuando un dueño acepta la
-- invitación de su veterinaria (vet_app_aceptar_invitacion), su cuenta
-- queda aprobada sin esperar al administrador — la clínica responde por
-- su cliente. La función de la veterinaria enciende el flag de sesión
-- vet.aprobacion_clinica solo durante ese update; desde el navegador no
-- se puede encender (set_config no está expuesto por la API).
--
-- Re-ejecutable. Ejecutar en: Supabase → SQL Editor (después de 017 y de
-- la migración 008 de ARM-Veterinaria).
-- ════════════════════════════════════════════════════════════════

create or replace function fn_proteger_campos_privilegiados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is not null and not fn_es_admin()
       and not (
           coalesce(current_setting('vet.aprobacion_clinica', true), '') = 'on'
           and new.id = auth.uid()
           and old.estado_cuenta = 'pendiente'
           and new.estado_cuenta = 'aprobado'
           and new.rol = old.rol
       ) then
        new.estado_cuenta := old.estado_cuenta;
        new.rol := old.rol;
    end if;
    return new;
end;
$$;
