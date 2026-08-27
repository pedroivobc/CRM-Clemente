-- ============================================================================
-- 0005 — Provisionamento de tenant: cria tenant + branding + subdomínio +
--         módulos + RBAC + plano de contas em uma única chamada.
-- ============================================================================

-- Criar um tenant é operação de plataforma (não pertence a nenhum tenant);
-- a linha em si não dá acesso a dado algum — todo acesso depende de
-- app.tenant_id definido pela API.
create policy tenants_insert on core.tenants for insert with check (true);

create or replace function core.provision_tenant(
  p_name         text,
  p_plan         text,
  p_subdomain    text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, crm, properties, finance, public
as $$
declare
  v_tenant uuid;
begin
  insert into core.tenants (name, plan)
  values (p_name, p_plan)
  returning id into v_tenant;

  -- Contexto de tenant para satisfazer as políticas WITH CHECK dos filhos.
  perform set_config('app.tenant_id', v_tenant::text, true);

  insert into core.tenant_branding (tenant_id, display_name)
  values (v_tenant, coalesce(p_display_name, p_name));

  insert into core.tenant_domains (tenant_id, subdomain)
  values (v_tenant, p_subdomain);

  perform core.seed_tenant_modules(v_tenant, p_plan);
  perform core.seed_tenant_rbac(v_tenant);
  perform finance.seed_tenant_finance(v_tenant);

  return v_tenant;
end;
$$;

grant execute on function core.provision_tenant(text, text, text, text) to app_api;

-- Vincula um usuário do Supabase Auth como colaborador de um tenant,
-- com um papel. Usado no onboarding do primeiro Admin.
create or replace function core.attach_user(
  p_tenant       uuid,
  p_auth_user_id uuid,
  p_full_name    text,
  p_email        text,
  p_role_name    text default 'Admin'
)
returns uuid
language plpgsql
security definer
set search_path = core, public
as $$
declare
  v_user uuid;
  v_role uuid;
begin
  perform set_config('app.tenant_id', p_tenant::text, true);

  insert into core.users (tenant_id, auth_user_id, full_name, email)
  values (p_tenant, p_auth_user_id, p_full_name, p_email)
  returning id into v_user;

  select id into v_role
  from core.roles
  where tenant_id = p_tenant and name = p_role_name;

  if v_role is null then
    raise exception 'Papel % não existe no tenant %', p_role_name, p_tenant;
  end if;

  insert into core.user_roles (tenant_id, user_id, role_id)
  values (p_tenant, v_user, v_role);

  return v_user;
end;
$$;

grant execute on function core.attach_user(uuid, uuid, text, text, text) to app_api;

-- ----------------------------------------------------------------------------
-- Resolução do contexto de autenticação
-- ----------------------------------------------------------------------------
-- Descobrir a que tenant um usuário do Supabase Auth pertence é operação
-- anterior ao contexto de tenant (é ela que o define), então precisa de
-- SECURITY DEFINER. Retorna apenas o vínculo e as permissões efetivas —
-- nenhum dado de negócio.
create or replace function core.resolve_user_context(p_auth_user_id uuid)
returns table (
  user_id     uuid,
  tenant_id   uuid,
  full_name   text,
  email       text,
  tenant_name text,
  plan        text,
  roles       text[],
  permissions text[]
)
language sql
security definer
set search_path = core, public
stable
as $$
  select
    u.id,
    u.tenant_id,
    u.full_name,
    u.email,
    t.name,
    t.plan,
    coalesce(array_agg(distinct r.name) filter (where r.name is not null), '{}'),
    coalesce(
      array_agg(distinct p.module || ':' || p.action) filter (where p.id is not null),
      '{}'
    )
  from core.users u
  join core.tenants t on t.id = u.tenant_id
  left join core.user_roles ur on ur.user_id = u.id
  left join core.roles r on r.id = ur.role_id
  left join core.role_permissions rp on rp.role_id = r.id
  left join core.permissions p on p.id = rp.permission_id
  where u.auth_user_id = p_auth_user_id
    and u.status = 'active'
    and t.status = 'active'
  group by u.id, u.tenant_id, u.full_name, u.email, t.name, t.plan;
$$;

grant execute on function core.resolve_user_context(uuid) to app_api;

-- Módulos habilitados de um tenant (usado no bootstrap da sessão).
create or replace function core.tenant_enabled_modules(p_tenant uuid)
returns text[]
language sql
stable
as $$
  select coalesce(array_agg(module) filter (where enabled), '{}')
  from core.tenant_modules
  where tenant_id = p_tenant;
$$;

grant execute on function core.tenant_enabled_modules(uuid) to app_api;
