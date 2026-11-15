-- ════════════════════════════════════════════════════════════════
-- 022 · Marcar qué perfiles son realmente de ARM Mascotas
-- ════════════════════════════════════════════════════════════════
-- Antes de 017, cualquier registro en CUALQUIER app del proyecto
-- compartido de Supabase creaba acá un perfil. 017 cortó eso hacia
-- adelante, pero los perfiles "fantasma" ya creados siguieron
-- apareciendo en el panel de administración.
--
-- usa_mascotas = false  → perfil heredado de otra app, sin rastro de
--                         uso en ARM Mascotas. El panel admin lo oculta
--                         (queda en la pestaña "Otras apps").
-- usa_mascotas = true   → registrado desde ARM Mascotas o entró a la app.
--
-- Default true: desde 017 un perfil solo nace si el registro viene de
-- ARM Mascotas o si la persona entra a la app. Si un perfil marcado
-- false entra de verdad a la app, auth.js (cargarSesionActual) lo pasa
-- a true.
--
-- Re-ejecutable. Ejecutar en: Supabase → SQL Editor (después de 021).
-- ════════════════════════════════════════════════════════════════

alter table mascotas_perfiles
    add column if not exists usa_mascotas boolean not null default true;

-- Backfill: perfiles sin marca de producto y sin ningún rastro de uso.
update mascotas_perfiles p
set usa_mascotas = false
from auth.users u
where u.id = p.id
  and p.usa_mascotas
  and p.rol = 'dueno'
  and coalesce(u.raw_user_meta_data ->> 'producto', '') = ''
  and p.apellido is null and p.telefono is null and p.ciudad is null
  and p.direccion is null and p.foto_url is null
  and not exists (select 1 from mascotas m where m.dueno_id = p.id)
  and not exists (select 1 from mascotas_audit_log a where a.actor_id = p.id)
  and not exists (select 1 from mascotas_compartidas c where c.invitado_perfil_id = p.id)
  and not exists (select 1 from mascotas_veterinarios v where v.perfil_id = p.id);
