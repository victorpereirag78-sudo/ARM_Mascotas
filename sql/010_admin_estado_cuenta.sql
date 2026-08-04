-- ================================================================
-- 010_ADMIN_ESTADO_CUENTA.SQL
-- Aprobación manual de cuentas nuevas por un Administrador ARM.
-- Toda cuenta nace en 'pendiente' y no puede crear mascotas (por lo
-- tanto tampoco nada que dependa de una mascota) hasta ser aprobada.
-- ================================================================

do $$ begin
    create type estado_cuenta_usuario as enum ('pendiente', 'aprobado', 'rechazado', 'suspendido');
exception when duplicate_object then null; end $$;

alter table mascotas_perfiles
    add column if not exists estado_cuenta estado_cuenta_usuario not null default 'pendiente';

create index if not exists idx_mascotas_perfiles_estado_cuenta on mascotas_perfiles(estado_cuenta);

-- ── Evitar que un usuario se auto-apruebe o se cambie el rol ────────
-- Si la actualización viene de la API (hay auth.uid()) y quien la
-- ejecuta no es admin, se ignoran los cambios a estos dos campos.
-- Si no hay auth.uid() (ej. SQL Editor / service role), se deja pasar:
-- es el canal que usa el dueño del proyecto para el bootstrap inicial.
create or replace function fn_proteger_campos_privilegiados()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is not null and not fn_es_admin() then
        new.estado_cuenta := old.estado_cuenta;
        new.rol := old.rol;
    end if;
    return new;
end;
$$;

drop trigger if exists trg_proteger_campos_privilegiados on mascotas_perfiles;
create trigger trg_proteger_campos_privilegiados
    before update on mascotas_perfiles
    for each row execute function fn_proteger_campos_privilegiados();

-- ── Helper: la cuenta que llama está aprobada (o es admin) ──────────
create or replace function fn_cuenta_aprobada()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
    select exists (
        select 1 from mascotas_perfiles
        where id = auth.uid() and (estado_cuenta = 'aprobado' or rol = 'admin')
    );
$$;

-- ── Gate principal: sin cuenta aprobada no se puede crear mascotas ──
-- Todo lo demás (vacunas, gastos, compartir, etc.) cuelga de una
-- mascota vía fn_puede_acceder_mascota, así que bloquear el alta de
-- mascotas ya cierra el resto de la superficie de escritura para una
-- cuenta pendiente.
drop policy if exists mascotas_insert on mascotas;
create policy mascotas_insert on mascotas for insert
    with check (dueno_id = auth.uid() and fn_cuenta_aprobada());
