-- ============================================================================
-- 0003 — Schema PROPERTIES: imóveis, fotos (original + marca d'água), mídias,
--         proprietários (N:N com clientes).
-- ============================================================================

create schema if not exists properties;

create table properties.properties (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants (id) on delete cascade,
  code             text not null,   -- código amigável por tenant (ex.: IM-0001)
  kind             text not null check (kind in
    ('casa', 'apartamento', 'sala_comercial', 'loja', 'galpao', 'terreno', 'sitio_chacara', 'outro')),
  purpose          text not null check (purpose in ('venda', 'locacao', 'ambos')),
  status           text not null default 'captacao' check (status in
    ('captacao', 'disponivel', 'reservado', 'alugado', 'vendido', 'em_manutencao', 'inativo')),
  title            text not null,
  description      text,
  address          jsonb not null default '{}',
  registry_number  text,   -- matrícula
  iptu_code        text,   -- inscrição municipal
  features         jsonb not null default '{}',  -- {quartos, suites, banheiros, vagas, area_util, area_total, mobiliado, pet, ...}
  sale_price       numeric(14,2),
  rent_price       numeric(14,2),
  condo_fee        numeric(14,2),
  iptu_amount      numeric(14,2),
  tour_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, code)
);

create table properties.property_photos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references core.tenants (id) on delete cascade,
  property_id      uuid not null references properties.properties (id) on delete cascade,
  original_path    text not null,   -- bucket privado
  watermarked_path text,            -- gerado pelo worker (público)
  watermark_status text not null default 'pending'
    check (watermark_status in ('pending', 'done', 'error')),
  is_cover         boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

create table properties.property_media (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  property_id uuid not null references properties.properties (id) on delete cascade,
  kind        text not null check (kind in ('video', 'tour_virtual', 'planta', 'documento')),
  title       text,
  url         text,
  storage_path text,
  created_at  timestamptz not null default now()
);

create table properties.property_owners (
  property_id   uuid not null references properties.properties (id) on delete cascade,
  client_id     uuid not null references crm.clients (id) on delete cascade,
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  ownership_pct numeric(7,4) not null default 100,
  is_payee      boolean not null default true,  -- recebe repasse (Fase 2+)
  primary key (property_id, client_id)
);

select core.apply_tenant_rls(t)
from unnest(array[
  'properties.properties', 'properties.property_photos',
  'properties.property_media', 'properties.property_owners'
]::regclass[]) as t;

select core.apply_updated_at('properties.properties');

create index on properties.properties (tenant_id, status);
create index on properties.properties (tenant_id, purpose);
create index on properties.property_photos (tenant_id, property_id, sort_order);
create index on properties.property_photos (watermark_status)
  where watermark_status = 'pending';

-- Sequencial de código amigável por tenant.
create table properties.property_code_counters (
  tenant_id uuid primary key references core.tenants (id) on delete cascade,
  last_code int not null default 0
);
alter table properties.property_code_counters enable row level security;
alter table properties.property_code_counters force row level security;
create policy tenant_isolation on properties.property_code_counters
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

create or replace function properties.next_property_code(p_tenant uuid)
returns text
language plpgsql
as $$
declare
  n int;
begin
  insert into properties.property_code_counters (tenant_id, last_code)
  values (p_tenant, 1)
  on conflict (tenant_id) do update
    set last_code = properties.property_code_counters.last_code + 1
  returning last_code into n;
  return 'IM-' || lpad(n::text, 4, '0');
end;
$$;

grant usage on schema properties to app_api;
grant select, insert, update, delete on all tables in schema properties to app_api;
grant usage, select on all sequences in schema properties to app_api;
alter default privileges in schema properties
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema properties
  grant usage, select on sequences to app_api;
grant execute on all functions in schema properties to app_api;
