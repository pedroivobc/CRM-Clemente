-- ============================================================================
-- 0006 — Schema SALES (apenas estrutura).
-- Tabelas base vazias de lógica; a especificação do módulo de Vendas virá em
-- fase posterior. Nada além da casca é implementado aqui.
-- ============================================================================

create schema if not exists sales;

create table sales.sales_leads (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  client_id   uuid references crm.clients (id) on delete set null,
  property_id uuid references properties.properties (id) on delete set null,
  source      text,
  status      text not null default 'novo',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table sales.sales_proposals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  sales_lead_id uuid references sales.sales_leads (id) on delete cascade,
  amount        numeric(14,2),
  status        text not null default 'rascunho',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table sales.sales_deals (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants (id) on delete cascade,
  sales_proposal_id uuid references sales.sales_proposals (id) on delete set null,
  status            text not null default 'em_andamento',
  closed_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

select core.apply_tenant_rls(t)
from unnest(array[
  'sales.sales_leads', 'sales.sales_proposals', 'sales.sales_deals'
]::regclass[]) as t;

select core.apply_updated_at(t)
from unnest(array[
  'sales.sales_leads', 'sales.sales_proposals', 'sales.sales_deals'
]::regclass[]) as t;

grant usage on schema sales to app_api;
grant select, insert, update, delete on all tables in schema sales to app_api;
alter default privileges in schema sales
  grant select, insert, update, delete on tables to app_api;
