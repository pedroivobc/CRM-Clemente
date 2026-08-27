-- ============================================================================
-- 0010 — Publicação de imóveis: vitrine (site próprio), portais (VRSync) e o
--         controle do que pode ir ao ar.
--
-- O cadastro do imóvel passa a ser a fonte única de três saídas: o site da
-- imobiliária/corretor, uma API pública de leitura e o feed dos portais
-- (ZAP/VivaReal/OLX). Nada vai ao ar sem autorização explícita, e o endereço
-- só aparece no nível que o proprietário permitir.
-- ============================================================================

-- ── Vocabulário de tipos ampliado ───────────────────────────────────────────
-- O mercado de JF trabalha com ~20 tipos; tínhamos 8. Os novos cobrem o que
-- aparece nos sites locais e no PropertyType do VRSync.
alter table properties.properties drop constraint properties_kind_check;
alter table properties.properties add constraint properties_kind_check check (kind in (
  'casa', 'casa_geminada', 'casa_condominio', 'sobrado', 'apartamento',
  'cobertura', 'kitnet', 'studio', 'flat', 'garden', 'loft',
  'sala_comercial', 'loja', 'ponto_comercial', 'galpao', 'andar_corporativo',
  'predio', 'hotel_pousada', 'terreno', 'lote_condominio', 'sitio_chacara',
  'fazenda', 'vaga_garagem', 'outro'
));

-- ── Campos de anúncio e do VRSync ───────────────────────────────────────────
alter table properties.properties
  add column slug              text,
  add column usage_type        text not null default 'residencial'
    check (usage_type in ('residencial', 'comercial', 'ambos')),
  add column year_built         int,
  add column floors             int,   -- andares do prédio
  add column unit_floor         int,   -- andar da unidade
  add column lot_area           numeric(14, 2),  -- área do terreno (VRSync LotArea)
  -- Garantias de locação que o imóvel aceita — o anúncio precisa informar,
  -- separado do que de fato foi usado num contrato.
  add column rental_warranties  text[] not null default '{}',
  -- Controle de publicação. Independente do status operacional: um imóvel
  -- "disponível" só vai ao ar quando alguém marca, e some quando desmarca.
  add column publish_site       boolean not null default false,
  add column publish_portals    boolean not null default false,
  add column is_exclusive       boolean not null default false,
  add column published_at        timestamptz,
  -- Até onde o endereço aparece na vitrine. Espelha o displayAddress do VRSync
  -- (All / Street / Neighborhood). Padrão conservador: só o bairro.
  add column address_visibility text not null default 'bairro'
    check (address_visibility in ('completo', 'rua', 'bairro'));

comment on column properties.properties.publish_site is
  'Autoriza aparecer no site/API pública da imobiliária.';
comment on column properties.properties.publish_portals is
  'Autoriza entrar no feed VRSync dos portais.';
comment on column properties.properties.address_visibility is
  'Nível de exibição do endereço na vitrine: completo, rua (sem número) ou só bairro.';

-- Garantias válidas: caução, fiador, seguro-fiança, título de capitalização.
-- Checagem por gatilho, já que é um array (o CHECK não cobre elemento a elemento).
create or replace function properties.check_rental_warranties()
returns trigger
language plpgsql
as $$
begin
  if new.rental_warranties is not null
     and not (new.rental_warranties <@ array[
       'caucao', 'fiador', 'seguro_fianca', 'titulo_capitalizacao'
     ]::text[]) then
    raise exception 'Garantia de locação inválida em %', new.rental_warranties;
  end if;
  return new;
end;
$$;

create trigger trg_check_rental_warranties
  before insert or update of rental_warranties on properties.properties
  for each row execute function properties.check_rental_warranties();

-- Slug único por tenant, quando preenchido. Como o slug carrega o código do
-- imóvel (único por tenant), a colisão é teórica — o índice é a rede.
create unique index properties_tenant_slug_uk
  on properties.properties (tenant_id, slug)
  where slug is not null;

-- Listagem da vitrine: filtra por publicação sem varrer a carteira inteira.
create index properties_publish_site_idx
  on properties.properties (tenant_id, publish_site)
  where publish_site;
create index properties_publish_portals_idx
  on properties.properties (tenant_id, publish_portals)
  where publish_portals;

-- ── Publicação nos portais (rastreio por canal) ─────────────────────────────
-- Uma linha por (imóvel, portal): quando saiu, se o portal aceitou, e o erro
-- quando recusou. Sem isso ninguém descobre por que um anúncio sumiu do ZAP.
create table properties.portal_publications (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  property_id    uuid not null references properties.properties (id) on delete cascade,
  portal         text not null check (portal in ('zap', 'vivareal', 'olx', 'site_proprio')),
  status         text not null default 'pendente'
    check (status in ('pendente', 'publicado', 'erro', 'removido')),
  external_id    text,            -- id do anúncio no portal, quando ele devolve
  last_synced_at timestamptz,
  error          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (property_id, portal)
);

-- ── Marca d'água configurável por tenant e por canal ────────────────────────
-- Descoberta da pesquisa: imobiliária de alto padrão não quer logo na foto, e
-- faz sentido marcar a foto do site (onde o concorrente copia) mas mandar a
-- foto limpa ao portal (onde ela disputa atenção numa grade).
create table properties.watermark_settings (
  tenant_id        uuid primary key references core.tenants (id) on delete cascade,
  enabled          boolean not null default true,
  position         text not null default 'bottom-right'
    check (position in ('bottom-right', 'bottom-left', 'top-right', 'top-left', 'center')),
  opacity          numeric(3, 2) not null default 0.65 check (opacity between 0 and 1),
  apply_on_site    boolean not null default true,
  apply_on_portals boolean not null default false,
  updated_at       timestamptz not null default now()
);

-- RLS e updated_at nos padrões do projeto.
select core.apply_tenant_rls(t)
from unnest(array[
  'properties.portal_publications', 'properties.watermark_settings'
]::regclass[]) as t;

select core.apply_updated_at('properties.portal_publications');
select core.apply_updated_at('properties.watermark_settings');

create index on properties.portal_publications (tenant_id, property_id);
create index on properties.portal_publications (tenant_id, status);

-- Toda imobiliária nasce com a configuração padrão de marca d'água.
insert into properties.watermark_settings (tenant_id)
select id from core.tenants
on conflict (tenant_id) do nothing;

-- Novos tenants recebem a linha no provisionamento.
create or replace function properties.seed_tenant_publishing(p_tenant uuid)
returns void
language plpgsql
as $$
begin
  insert into properties.watermark_settings (tenant_id)
  values (p_tenant)
  on conflict (tenant_id) do nothing;
end;
$$;

grant select, insert, update, delete
  on properties.portal_publications, properties.watermark_settings to app_api;
grant execute on function properties.seed_tenant_publishing(uuid) to app_api;

-- Provisionamento passa a semear a configuração de publicação (vale para todos
-- os planos, já que todo tenant cadastra imóveis).
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
