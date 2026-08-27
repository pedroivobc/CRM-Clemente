-- ============================================================================
-- 0011 — Vitrine pública: chave publicável e dados de contato.
--
-- A API pública é lida sem login, por qualquer site (o da imobiliária num
-- subdomínio, ou um widget embutido num WordPress de domínio alheio). Ela
-- precisa de duas coisas que ainda não existiam: uma **chave publicável** que
-- diga de quem é a vitrine, e o **contato** que o visitante usa para falar com
-- a imobiliária. A chave não é segredo — só dá acesso ao que já foi publicado.
-- ============================================================================

create table core.tenant_public (
  tenant_id            uuid primary key references core.tenants (id) on delete cascade,
  -- Identificador publicável, exposto na URL do widget. Trocável se vazar
  -- (não protege nada sigiloso, mas permite invalidar um embed antigo).
  public_key           text not null unique,
  whatsapp             text,
  phone                text,
  email                text,
  headline             text,   -- chamada curta do topo da vitrine
  lead_capture_enabled boolean not null default true,
  updated_at           timestamptz not null default now()
);

-- A vitrine é pública: sem RLS de tenant, porque a resolução da chave já
-- restringe o acesso a um tenant só, feita por função SECURITY DEFINER.
alter table core.tenant_public enable row level security;
-- Nenhuma política de leitura para app_api aqui: o acesso público passa pela
-- função de resolução; o app autenticado lê/gera a config por rota própria.
create policy tenant_public_self on core.tenant_public
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

select core.apply_updated_at('core.tenant_public');


-- Gera uma chave publicável no formato pub_<32 hex>. Baseada em UUID: não é
-- segredo, só precisa ser única e difícil de adivinhar em massa.
create or replace function core.new_public_key()
returns text
language sql
as $$
  select 'pub_' || replace(gen_random_uuid()::text, '-', '');
$$;


-- Resolve o tenant a partir da chave publicável. SECURITY DEFINER porque roda
-- sem contexto de tenant (a requisição pública ainda não tem nenhum), e por
-- isso devolve **apenas** o id de um tenant ativo — nada de dados de negócio.
create or replace function core.resolve_public_tenant(p_key text)
returns uuid
language sql
security definer
set search_path = core, public
as $$
  select t.id
  from core.tenants t
  join core.tenant_public tp on tp.tenant_id = t.id
  where tp.public_key = p_key and t.status = 'active';
$$;

revoke all on function core.resolve_public_tenant(text) from public;
grant execute on function core.resolve_public_tenant(text) to app_api;


-- Semeadura no provisionamento de todo tenant.
create or replace function core.seed_tenant_public(p_tenant uuid)
returns void
language plpgsql
as $$
begin
  insert into core.tenant_public (tenant_id, public_key)
  values (p_tenant, core.new_public_key())
  on conflict (tenant_id) do nothing;
end;
$$;

grant select, insert, update, delete on core.tenant_public to app_api;
grant execute on function core.new_public_key() to app_api;
grant execute on function core.seed_tenant_public(uuid) to app_api;

-- Backfill dos tenants existentes.
insert into core.tenant_public (tenant_id, public_key)
select id, core.new_public_key() from core.tenants
on conflict (tenant_id) do nothing;


-- Provisionamento passa a criar a linha pública (todos os planos têm vitrine).
create or replace function core.provision_tenant(
  p_name         text,
  p_plan         text,
  p_subdomain    text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, crm, properties, finance, rentals, sales, maintenance, public
as $$
declare
  v_tenant uuid;
begin
  insert into core.tenants (name, plan)
  values (p_name, p_plan)
  returning id into v_tenant;

  perform set_config('app.tenant_id', v_tenant::text, true);

  insert into core.tenant_branding (tenant_id, display_name)
  values (v_tenant, coalesce(p_display_name, p_name));

  insert into core.tenant_domains (tenant_id, subdomain)
  values (v_tenant, p_subdomain);

  perform core.seed_tenant_modules(v_tenant, p_plan);
  perform core.seed_tenant_rbac(v_tenant);
  perform core.seed_tenant_public(v_tenant);
  perform finance.seed_tenant_finance(v_tenant);
  perform properties.seed_tenant_publishing(v_tenant);

  if p_plan in ('locacao', 'completo') then
    perform rentals.seed_tenant_rentals(v_tenant);
    -- Chaves, vistorias e chamados servem à operação da locação.
    perform maintenance.seed_tenant_operations(v_tenant);
  end if;

  if p_plan in ('venda', 'completo') then
    perform sales.seed_tenant_sales(v_tenant);
  end if;

  return v_tenant;
end;
$$;
