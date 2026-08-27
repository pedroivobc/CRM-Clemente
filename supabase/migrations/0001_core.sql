-- ============================================================================
-- 0001 — Schema CORE: tenants, branding, domínios, módulos, usuários, RBAC,
--         auditoria e infraestrutura de RLS multi-tenant.
-- ============================================================================

create extension if not exists pgcrypto;

create schema if not exists core;

-- ----------------------------------------------------------------------------
-- Infraestrutura de tenancy
-- ----------------------------------------------------------------------------
-- A API define, por transação: SET LOCAL app.tenant_id = '<uuid>'.
-- Todas as políticas RLS derivam desta função.
create or replace function core.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function core.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Aplica o padrão de isolamento por tenant (RLS + FORCE, para valer inclusive
-- para o owner das tabelas) e o trigger de updated_at.
create or replace function core.apply_tenant_rls(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format(
    'create policy tenant_isolation on %s as permissive for all '
    'using (tenant_id = core.current_tenant_id()) '
    'with check (tenant_id = core.current_tenant_id())',
    tbl
  );
end;
$$;

create or replace function core.apply_updated_at(tbl regclass)
returns void
language plpgsql
as $$
begin
  execute format(
    'create trigger set_updated_at before update on %s '
    'for each row execute function core.tg_set_updated_at()',
    tbl
  );
end;
$$;

-- Papel de banco usado pela API/worker (sem BYPASSRLS). No deploy, criar o
-- login: CREATE ROLE crm_api LOGIN PASSWORD '...' IN ROLE app_api;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'app_api') then
    create role app_api nologin;
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tenants
-- ----------------------------------------------------------------------------
create table core.tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  plan        text not null default 'locacao' check (plan in ('venda', 'locacao', 'completo')),
  status      text not null default 'active' check (status in ('active', 'suspended')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table core.tenant_branding (
  tenant_id        uuid primary key references core.tenants (id) on delete cascade,
  display_name     text not null,
  logo_path        text,
  favicon_path     text,
  color_primary    text not null default '#0f766e',
  color_secondary  text not null default '#134e4a',
  color_accent     text not null default '#f59e0b',
  updated_at       timestamptz not null default now()
);

create table core.tenant_domains (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  subdomain      text not null unique check (subdomain ~ '^[a-z0-9][a-z0-9-]{1,61}$'),
  custom_domain  text unique,
  created_at     timestamptz not null default now()
);

create table core.tenant_modules (
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  module     text not null,
  enabled    boolean not null default true,
  primary key (tenant_id, module)
);

-- Tenants/domínios/branding/módulos precisam ser legíveis ANTES do contexto de
-- tenant existir (resolução por subdomínio e theming da tela de login),
-- portanto: leitura liberada, escrita restrita ao próprio tenant.
alter table core.tenants enable row level security;
alter table core.tenants force row level security;
create policy tenants_read on core.tenants for select using (true);
create policy tenants_write on core.tenants for update
  using (id = core.current_tenant_id())
  with check (id = core.current_tenant_id());

alter table core.tenant_branding enable row level security;
alter table core.tenant_branding force row level security;
create policy branding_read on core.tenant_branding for select using (true);
create policy branding_write on core.tenant_branding for all
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

alter table core.tenant_domains enable row level security;
alter table core.tenant_domains force row level security;
create policy domains_read on core.tenant_domains for select using (true);
create policy domains_write on core.tenant_domains for all
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

alter table core.tenant_modules enable row level security;
alter table core.tenant_modules force row level security;
create policy modules_read on core.tenant_modules for select using (true);
create policy modules_write on core.tenant_modules for all
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

select core.apply_updated_at('core.tenants');

-- ----------------------------------------------------------------------------
-- Usuários (colaboradores) e RBAC
-- ----------------------------------------------------------------------------
create table core.users (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  -- Referência lógica a auth.users (Supabase). Sem FK física para manter as
  -- migrations aplicáveis em Postgres puro (dev/testes).
  auth_user_id  uuid unique,
  full_name     text not null,
  email         text not null,
  phone         text,
  status        text not null default 'active' check (status in ('active', 'inactive')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, email)
);

create table core.roles (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  name       text not null,
  is_system  boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

-- Catálogo global de permissões (sem tenant): módulo × ação.
create table core.permissions (
  id      serial primary key,
  module  text not null,
  action  text not null check (action in ('view', 'create', 'edit', 'delete', 'approve')),
  unique (module, action)
);

create table core.role_permissions (
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  role_id        uuid not null references core.roles (id) on delete cascade,
  permission_id  int not null references core.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table core.user_roles (
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  user_id    uuid not null references core.users (id) on delete cascade,
  role_id    uuid not null references core.roles (id) on delete cascade,
  primary key (user_id, role_id)
);

create table core.audit_log (
  id          bigserial primary key,
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  user_id     uuid references core.users (id),
  entity      text not null,
  entity_id   text,
  action      text not null,
  before      jsonb,
  after       jsonb,
  ip          inet,
  occurred_at timestamptz not null default now()
);

create table core.api_keys (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  name        text not null,
  key_hash    text not null unique,
  scopes      text[] not null default '{properties:read,leads:write}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

select core.apply_tenant_rls(t)
from unnest(array[
  'core.users', 'core.roles', 'core.role_permissions',
  'core.user_roles', 'core.audit_log', 'core.api_keys'
]::regclass[]) as t;

select core.apply_updated_at('core.users');

-- Permissões são catálogo global somente-leitura.
alter table core.permissions enable row level security;
alter table core.permissions force row level security;
create policy permissions_read on core.permissions for select using (true);

create index on core.users (tenant_id);
create index on core.audit_log (tenant_id, occurred_at desc);
create index on core.audit_log (tenant_id, entity, entity_id);

-- ----------------------------------------------------------------------------
-- Catálogo de permissões
-- ----------------------------------------------------------------------------
insert into core.permissions (module, action)
select m, a
from unnest(array[
  'clientes', 'imoveis', 'financeiro', 'locacao', 'vendas',
  'atendimento', 'vistorias', 'chaves', 'manutencao', 'rh',
  'relatorios', 'configuracoes'
]) as m
cross join unnest(array['view', 'create', 'edit', 'delete', 'approve']) as a;

-- Papéis padrão + permissões de cada papel, criados para um tenant.
create or replace function core.seed_tenant_rbac(p_tenant uuid)
returns void
language plpgsql
as $$
declare
  r_admin uuid; r_gestor uuid; r_corretor uuid; r_financeiro uuid;
  r_atendimento uuid; r_vistoriador uuid; r_rh uuid;
begin
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Admin', true) returning id into r_admin;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Gestor', true) returning id into r_gestor;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Corretor', true) returning id into r_corretor;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Financeiro', true) returning id into r_financeiro;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Atendimento', true) returning id into r_atendimento;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'Vistoriador', true) returning id into r_vistoriador;
  insert into core.roles (tenant_id, name, is_system) values
    (p_tenant, 'RH', true) returning id into r_rh;

  -- Admin: tudo.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_admin, id from core.permissions;

  -- Gestor: tudo, exceto configurações destrutivas.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_gestor, id from core.permissions
  where not (module = 'configuracoes' and action = 'delete');

  -- Corretor: operação comercial.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_corretor, id from core.permissions
  where (module in ('clientes', 'imoveis') and action in ('view', 'create', 'edit'))
     or (module in ('locacao', 'vendas', 'chaves') and action in ('view', 'create', 'edit'))
     or (module = 'atendimento' and action in ('view', 'create'));

  -- Financeiro.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_financeiro, id from core.permissions
  where module in ('financeiro', 'relatorios')
     or (module in ('clientes', 'locacao') and action = 'view');

  -- Atendimento.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_atendimento, id from core.permissions
  where module = 'atendimento'
     or (module in ('clientes', 'manutencao') and action in ('view', 'create', 'edit'))
     or (module in ('imoveis', 'locacao') and action = 'view');

  -- Vistoriador.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_vistoriador, id from core.permissions
  where module = 'vistorias'
     or (module in ('imoveis', 'chaves') and action = 'view');

  -- RH.
  insert into core.role_permissions (tenant_id, role_id, permission_id)
  select p_tenant, r_rh, id from core.permissions
  where module = 'rh';
end;
$$;

-- Flags de módulo conforme o plano contratado.
create or replace function core.seed_tenant_modules(p_tenant uuid, p_plan text)
returns void
language plpgsql
as $$
begin
  insert into core.tenant_modules (tenant_id, module, enabled) values
    (p_tenant, 'module_rentals', p_plan in ('locacao', 'completo')),
    (p_tenant, 'module_sales',   p_plan in ('venda', 'completo'));
end;
$$;

-- ----------------------------------------------------------------------------
-- Grants para o papel da API
-- ----------------------------------------------------------------------------
grant usage on schema core to app_api;
grant select, insert, update, delete on all tables in schema core to app_api;
grant usage, select on all sequences in schema core to app_api;
alter default privileges in schema core
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema core
  grant usage, select on sequences to app_api;
grant execute on all functions in schema core to app_api;
