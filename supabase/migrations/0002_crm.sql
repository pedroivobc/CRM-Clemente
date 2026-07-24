-- ============================================================================
-- 0002 — Schema CRM (base): clientes PF/PJ, papéis, contatos, documentos,
--         timeline de interações. (Funis de locação/vendas chegam na Fase 2.)
-- ============================================================================

create schema if not exists crm;

create table crm.clients (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  kind        text not null check (kind in ('PF', 'PJ')),
  name        text not null,
  cpf_cnpj    text,          -- somente dígitos; validado na API
  rg_ie       text,
  birth_date  date,
  address     jsonb not null default '{}',  -- {cep, logradouro, numero, complemento, bairro, cidade, uf}
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index clients_cpf_cnpj_uk
  on crm.clients (tenant_id, cpf_cnpj)
  where cpf_cnpj is not null;

create table crm.client_roles (
  client_id  uuid not null references crm.clients (id) on delete cascade,
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  role       text not null check (role in
    ('proprietario', 'locatario', 'fiador', 'comprador', 'vendedor', 'lead', 'fornecedor')),
  primary key (client_id, role)
);

create table crm.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  client_id   uuid not null references crm.clients (id) on delete cascade,
  kind        text not null check (kind in ('phone', 'whatsapp', 'email')),
  value       text not null,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now()
);

create table crm.client_documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  client_id    uuid not null references crm.clients (id) on delete cascade,
  doc_type     text not null,   -- RG, CPF, comprovante de renda, certidão...
  file_name    text not null,
  storage_path text not null,
  valid_until  date,            -- alerta de vencimento quando definido
  created_at   timestamptz not null default now()
);

create table crm.interactions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  client_id   uuid not null references crm.clients (id) on delete cascade,
  user_id     uuid references core.users (id),
  channel     text not null check (channel in
    ('whatsapp', 'ligacao', 'email', 'visita', 'proposta', 'chamado', 'nota')),
  direction   text check (direction in ('in', 'out')),
  summary     text not null,
  payload     jsonb not null default '{}',
  occurred_at timestamptz not null default now()
);

select core.apply_tenant_rls(t)
from unnest(array[
  'crm.clients', 'crm.client_roles', 'crm.client_contacts',
  'crm.client_documents', 'crm.interactions'
]::regclass[]) as t;

select core.apply_updated_at('crm.clients');

create index on crm.clients (tenant_id, name);
create index on crm.client_contacts (tenant_id, client_id);
create index on crm.client_documents (tenant_id, valid_until)
  where valid_until is not null;
create index on crm.interactions (tenant_id, client_id, occurred_at desc);

grant usage on schema crm to app_api;
grant select, insert, update, delete on all tables in schema crm to app_api;
grant usage, select on all sequences in schema crm to app_api;
alter default privileges in schema crm
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema crm
  grant usage, select on sequences to app_api;
