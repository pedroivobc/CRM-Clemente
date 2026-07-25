-- ============================================================================
-- 0008 — Schema SALES completo.
--
-- A migration 0006 criou apenas a casca (tabelas vazias de lógica). Aqui elas
-- dão lugar ao módulo real: funil próprio, propostas com contraproposta,
-- negócios com forma de pagamento e comissões rateadas.
--
-- O módulo é autônomo: tem operação, indicadores e financeiro próprios. Uma
-- imobiliária que contrate só vendas tem um produto completo, sem depender de
-- nada da locação.
-- ============================================================================

drop table if exists sales.sales_deals;
drop table if exists sales.sales_proposals;
drop table if exists sales.sales_leads;

-- ----------------------------------------------------------------------------
-- Funil de vendas
-- ----------------------------------------------------------------------------
create table sales.pipelines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table sales.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  pipeline_id uuid not null references sales.pipelines (id) on delete cascade,
  key         text not null,
  name        text not null,
  sort_order  int not null,
  sla_hours   int,
  is_won      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (pipeline_id, key)
);

create table sales.loss_reasons (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references core.tenants (id) on delete cascade,
  name      text not null,
  active    boolean not null default true,
  unique (tenant_id, name)
);

create table sales.leads (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  pipeline_id    uuid not null references sales.pipelines (id) on delete cascade,
  stage_id       uuid not null references sales.pipeline_stages (id),
  client_id      uuid references crm.clients (id) on delete set null,
  property_id    uuid references properties.properties (id) on delete set null,
  name           text not null,
  phone          text,
  email          text,
  source         text,
  -- Faixa de interesse: orienta a busca de imóveis para o comprador.
  budget_min     numeric(14,2),
  budget_max     numeric(14,2),
  -- Como pretende pagar: muda todo o encaminhamento do atendimento.
  financing_type text check (financing_type in
    ('a_vista', 'financiamento', 'fgts', 'consorcio', 'permuta', 'misto')),
  assigned_to    uuid references core.users (id),
  status         text not null default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  loss_reason_id uuid references sales.loss_reasons (id),
  notes          text,
  stage_since    timestamptz not null default now(),
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table sales.lead_stage_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  lead_id        uuid not null references sales.leads (id) on delete cascade,
  from_stage_id  uuid references sales.pipeline_stages (id),
  to_stage_id    uuid not null references sales.pipeline_stages (id),
  user_id        uuid references core.users (id),
  hours_in_stage numeric(10,2),
  moved_at       timestamptz not null default now()
);

create table sales.visits (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  lead_id      uuid references sales.leads (id) on delete cascade,
  property_id  uuid not null references properties.properties (id) on delete cascade,
  broker_id    uuid references core.users (id),
  scheduled_at timestamptz not null,
  status       text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada', 'nao_compareceu')),
  feedback     text,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Propostas e contrapropostas
-- ----------------------------------------------------------------------------
create table sales.proposals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  code           text not null,
  lead_id        uuid references sales.leads (id) on delete set null,
  property_id    uuid not null references properties.properties (id),
  buyer_id       uuid references crm.clients (id),
  broker_id      uuid references core.users (id),

  asking_price   numeric(14,2) not null check (asking_price > 0),  -- preço pedido
  offer_amount   numeric(14,2) not null check (offer_amount > 0),  -- oferta do comprador
  down_payment   numeric(14,2),                                    -- sinal / entrada
  financing_type text check (financing_type in
    ('a_vista', 'financiamento', 'fgts', 'consorcio', 'permuta', 'misto')),
  financing_bank text,
  conditions     text,
  valid_until    date,

  status         text not null default 'aberta' check (status in
    ('aberta', 'contraproposta', 'aceita', 'recusada', 'expirada', 'cancelada')),
  -- Encadeamento das contrapropostas: cada rodada aponta para a anterior.
  parent_id      uuid references sales.proposals (id) on delete set null,
  round          int not null default 1,
  decided_by     uuid references core.users (id),
  decided_at     timestamptz,
  decision_notes text,

  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, code)
);

-- ----------------------------------------------------------------------------
-- Negócios fechados
-- ----------------------------------------------------------------------------
create table sales.deals (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  code           text not null,
  proposal_id    uuid references sales.proposals (id) on delete set null,
  property_id    uuid not null references properties.properties (id),
  buyer_id       uuid references crm.clients (id),
  seller_id      uuid references crm.clients (id),

  sale_amount    numeric(14,2) not null check (sale_amount > 0),
  down_payment   numeric(14,2),
  financing_type text check (financing_type in
    ('a_vista', 'financiamento', 'fgts', 'consorcio', 'permuta', 'misto')),
  financing_bank text,

  -- Comissão total sobre o valor da venda (5% a 6% é o usual no Brasil).
  commission_pct numeric(7,4) not null default 6
    check (commission_pct >= 0 and commission_pct <= 100),

  closed_at      date not null default current_date,
  deed_date      date,        -- data prevista/realizada da escritura
  keys_handed_at date,        -- entrega das chaves

  status         text not null default 'em_andamento' check (status in
    ('em_andamento', 'concluido', 'cancelado')),
  cancel_reason  text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, code)
);

-- Rateio da comissão. A soma dos percentuais dos participantes fecha 100% do
-- valor da comissão — quem capta, quem vende e a imobiliária.
create table sales.commissions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  deal_id     uuid not null references sales.deals (id) on delete cascade,
  beneficiary text not null check (beneficiary in ('agency', 'lister', 'seller_broker', 'partner')),
  user_id     uuid references core.users (id),
  client_id   uuid references crm.clients (id),
  share_pct   numeric(7,4) not null,
  amount      numeric(14,2) not null,
  status      text not null default 'pendente'
    check (status in ('pendente', 'pago', 'cancelado')),
  paid_at     date,
  created_at  timestamptz not null default now()
);

-- Regra padrão de rateio do tenant, aplicada quando o negócio é fechado.
create table sales.commission_rules (
  tenant_id            uuid primary key references core.tenants (id) on delete cascade,
  default_pct          numeric(7,4) not null default 6,
  agency_share_pct     numeric(7,4) not null default 50,
  lister_share_pct     numeric(7,4) not null default 20,   -- corretor que captou
  seller_share_pct     numeric(7,4) not null default 30,   -- corretor que vendeu
  updated_at           timestamptz not null default now(),
  check (agency_share_pct + lister_share_pct + seller_share_pct = 100)
);

-- ----------------------------------------------------------------------------
-- RLS + triggers
-- ----------------------------------------------------------------------------
select core.apply_tenant_rls(t)
from unnest(array[
  'sales.pipelines', 'sales.pipeline_stages', 'sales.loss_reasons',
  'sales.leads', 'sales.lead_stage_history', 'sales.visits',
  'sales.proposals', 'sales.deals', 'sales.commissions'
]::regclass[]) as t;

alter table sales.commission_rules enable row level security;
alter table sales.commission_rules force row level security;
create policy tenant_isolation on sales.commission_rules
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

select core.apply_updated_at(t)
from unnest(array[
  'sales.leads', 'sales.proposals', 'sales.deals'
]::regclass[]) as t;

create index on sales.leads (tenant_id, stage_id, status);
create index on sales.leads (tenant_id, assigned_to);
create index on sales.proposals (tenant_id, status);
create index on sales.proposals (tenant_id, property_id);
create index on sales.deals (tenant_id, status, closed_at);
create index on sales.commissions (tenant_id, deal_id);
create index on sales.commissions (tenant_id, status);

-- ----------------------------------------------------------------------------
-- Numeração de propostas e negócios
-- ----------------------------------------------------------------------------
create table sales.code_counters (
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  kind           text not null check (kind in ('proposal', 'deal')),
  last_code      int not null default 0,
  primary key (tenant_id, kind)
);
alter table sales.code_counters enable row level security;
alter table sales.code_counters force row level security;
create policy tenant_isolation on sales.code_counters
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

create or replace function sales.next_code(p_tenant uuid, p_kind text)
returns text
language plpgsql
as $$
declare
  n int;
begin
  insert into sales.code_counters (tenant_id, kind, last_code)
  values (p_tenant, p_kind, 1)
  on conflict (tenant_id, kind) do update
    set last_code = sales.code_counters.last_code + 1
  returning last_code into n;
  return case p_kind when 'proposal' then 'PROP-' else 'VEN-' end
         || lpad(n::text, 4, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Semente do tenant com módulo de vendas
-- ----------------------------------------------------------------------------
create or replace function sales.seed_tenant_sales(p_tenant uuid)
returns void
language plpgsql
as $$
declare
  v_pipeline uuid;
begin
  insert into sales.pipelines (tenant_id, name, is_default)
  values (p_tenant, 'Funil de vendas', true)
  returning id into v_pipeline;

  -- Funil imobiliário de venda, na ordem em que a equipe trabalha.
  insert into sales.pipeline_stages
    (tenant_id, pipeline_id, key, name, sort_order, sla_hours, is_won)
  values
    (p_tenant, v_pipeline, 'lead',             'Lead',              1, 4,    false),
    (p_tenant, v_pipeline, 'qualificacao',     'Qualificação',      2, 24,   false),
    (p_tenant, v_pipeline, 'visita_agendada',  'Visita agendada',   3, 72,   false),
    (p_tenant, v_pipeline, 'visita_realizada', 'Visita realizada',  4, 48,   false),
    (p_tenant, v_pipeline, 'proposta',         'Proposta',          5, 48,   false),
    (p_tenant, v_pipeline, 'negociacao',       'Negociação',        6, 72,   false),
    (p_tenant, v_pipeline, 'fechamento',       'Venda fechada',     7, null, true);

  insert into sales.loss_reasons (tenant_id, name) values
    (p_tenant, 'Comprou de outra imobiliária'),
    (p_tenant, 'Não conseguiu financiamento'),
    (p_tenant, 'Proposta recusada pelo vendedor'),
    (p_tenant, 'Valor acima do orçamento'),
    (p_tenant, 'Desistiu da compra'),
    (p_tenant, 'Sem retorno do interessado');

  insert into sales.commission_rules (tenant_id) values (p_tenant);
end;
$$;

-- Passa a fazer parte do provisionamento de tenants com o módulo de vendas.
create or replace function core.provision_tenant(
  p_name         text,
  p_plan         text,
  p_subdomain    text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, crm, properties, finance, rentals, sales, public
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

  if p_plan in ('locacao', 'completo') then
    perform rentals.seed_tenant_rentals(v_tenant);
  end if;

  if p_plan in ('venda', 'completo') then
    perform sales.seed_tenant_sales(v_tenant);
  end if;

  return v_tenant;
end;
$$;

grant usage on schema sales to app_api;
grant select, insert, update, delete on all tables in schema sales to app_api;
grant usage, select on all sequences in schema sales to app_api;
alter default privileges in schema sales
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema sales
  grant usage, select on sequences to app_api;
grant execute on all functions in schema sales to app_api;
