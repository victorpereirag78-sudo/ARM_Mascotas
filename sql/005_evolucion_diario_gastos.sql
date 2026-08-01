-- ================================================================
-- 005_EVOLUCION_DIARIO_GASTOS.SQL
-- RESERVADO — módulos futuros: evolución (peso/altura + gráficos),
-- diario (fotos/videos/notas) y gastos. Sin UI en el Módulo 1.
-- Todas llevan el prefijo "mascotas_" para no mezclarse con tablas
-- de otras apps en el mismo proyecto Supabase.
-- ================================================================

create table if not exists mascotas_evolucion_mediciones (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    fecha           date not null default current_date,
    peso_kg         numeric(5,2),
    altura_cm       numeric(5,2),
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_evolucion_mascota_fecha on mascotas_evolucion_mediciones(mascota_id, fecha desc);

create table if not exists mascotas_diario_entradas (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    tipo            text not null, -- 'foto' | 'video' | 'nota' | 'evento'
    contenido       text,
    archivo_url     text,
    fecha           timestamptz not null default now(),
    autor_id        uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_diario_mascota_fecha on mascotas_diario_entradas(mascota_id, fecha desc);

create table if not exists mascotas_gastos (
    id              uuid primary key default gen_random_uuid(),
    mascota_id      uuid not null references mascotas(id) on delete cascade,
    categoria       categoria_gasto not null default 'otro',
    descripcion     text,
    monto           numeric(10,2) not null,
    moneda          text not null default 'CLP',
    fecha           date not null default current_date,
    comprobante_url text,
    registrado_por  uuid references mascotas_perfiles(id),
    created_at      timestamptz not null default now()
);
create index if not exists idx_mascotas_gastos_mascota_fecha on mascotas_gastos(mascota_id, fecha desc);
