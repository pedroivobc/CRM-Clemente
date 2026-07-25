-- ============================================================================
-- 0007 — Schema RENTALS: funil de locação, contratos, cobranças com split,
--         repasses ao proprietário e índices de reajuste.
-- ============================================================================

create schema if not exists rentals;

-- ----------------------------------------------------------------------------
-- Funil de locação
-- ----------------------------------------------------------------------------
create table rentals.pipelines (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  module     text not null default 'rentals' check (module in ('rentals', 'sales')),
  name       text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table rentals.pipeline_stages (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  pipeline_id uuid not null references rentals.pipelines (id) on delete cascade,
  key         text not null,
  name        text not null,
  sort_order  int not null,
  sla_hours   int,                    -- prazo esperado na etapa
  is_won      boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (pipeline_id, key)
);

create table rentals.loss_reasons (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  unique (tenant_id, name)
);

create table rentals.leads (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  pipeline_id    uuid not null references rentals.pipelines (id) on delete cascade,
  stage_id       uuid not null references rentals.pipeline_stages (id),
  client_id      uuid references crm.clients (id) on delete set null,
  property_id    uuid references properties.properties (id) on delete set null,
  name           text not null,          -- nome do interessado quando ainda não há cadastro
  phone          text,
  email          text,
  source         text,                   -- portal, site, indicação, balcão...
  assigned_to    uuid references core.users (id),
  status         text not null default 'aberto' check (status in ('aberto', 'ganho', 'perdido')),
  loss_reason_id uuid references rentals.loss_reasons (id),
  notes          text,
  stage_since    timestamptz not null default now(),  -- base do cálculo de SLA
  closed_at      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table rentals.lead_stage_history (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  lead_id       uuid not null references rentals.leads (id) on delete cascade,
  from_stage_id uuid references rentals.pipeline_stages (id),
  to_stage_id   uuid not null references rentals.pipeline_stages (id),
  user_id       uuid references core.users (id),
  hours_in_stage numeric(10,2),
  moved_at      timestamptz not null default now()
);

create table rentals.visits (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  lead_id      uuid references rentals.leads (id) on delete cascade,
  property_id  uuid not null references properties.properties (id) on delete cascade,
  broker_id    uuid references core.users (id),
  scheduled_at timestamptz not null,
  status       text not null default 'agendada'
    check (status in ('agendada', 'realizada', 'cancelada', 'nao_compareceu')),
  feedback     text,
  created_at   timestamptz not null default now()
);

-- Análise cadastral do pretendente a locatário.
create table rentals.credit_analyses (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenants (id) on delete cascade,
  lead_id             uuid references rentals.leads (id) on delete cascade,
  client_id           uuid references crm.clients (id) on delete set null,
  property_id         uuid references properties.properties (id) on delete set null,
  rent_amount         numeric(14,2) not null,
  income_multiplier   numeric(7,4) not null default 3,   -- renda mínima = 3x aluguel
  declared_income     numeric(14,2),
  guarantee_type      text check (guarantee_type in
    ('fiador', 'caucao', 'seguro_fianca', 'titulo_capitalizacao')),
  guarantee_notes     text,
  doc_checklist       jsonb not null default '{}',
  result              text not null default 'pendente'
    check (result in ('pendente', 'aprovado', 'reprovado')),
  decided_by          uuid references core.users (id),
  decided_at          timestamptz,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Índices de reajuste (globais, sem tenant)
-- ----------------------------------------------------------------------------
create table rentals.price_indexes (
  index_name      text not null check (index_name in ('IGPM', 'IPCA')),
  reference_month date not null,
  monthly_pct     numeric(9,6) not null,
  primary key (index_name, reference_month)
);

alter table rentals.price_indexes enable row level security;
alter table rentals.price_indexes force row level security;
create policy price_indexes_read on rentals.price_indexes for select using (true);

-- ----------------------------------------------------------------------------
-- Contratos
-- ----------------------------------------------------------------------------
create table rentals.contract_templates (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  name       text not null,
  body       text not null,     -- corpo com variáveis {{locatario_nome}}, {{valor_aluguel}}...
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table rentals.contracts (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references core.tenants (id) on delete cascade,
  code                  text not null,
  property_id           uuid not null references properties.properties (id),
  template_id           uuid references rentals.contract_templates (id),

  rent_amount           numeric(14,2) not null check (rent_amount > 0),
  condo_fee             numeric(14,2) not null default 0,
  iptu_amount           numeric(14,2) not null default 0,
  insurance_amount      numeric(14,2) not null default 0,

  -- Taxa de administração da imobiliária, por contrato (10–13% é o usual).
  admin_fee_pct         numeric(7,4) not null default 10
    check (admin_fee_pct >= 0 and admin_fee_pct <= 100),

  price_index           text not null default 'IGPM' check (price_index in ('IGPM', 'IPCA')),
  start_date            date not null,
  end_date              date not null,
  due_day               int not null default 10 check (due_day between 1 and 28),

  guarantee_type        text check (guarantee_type in
    ('fiador', 'caucao', 'seguro_fianca', 'titulo_capitalizacao')),
  guarantee_amount      numeric(14,2),

  late_fine_pct         numeric(7,4) not null default 2,      -- multa sobre o total
  daily_interest_pct    numeric(9,6) not null default 0.033,  -- juros ao dia (≈1% a.m.)
  punctuality_discount  numeric(14,2) not null default 0,     -- desconto por pontualidade

  status                text not null default 'rascunho' check (status in
    ('rascunho', 'em_assinatura', 'ativo', 'encerrado', 'cancelado')),
  signed_doc_path       text,
  last_adjustment_at    date,
  terminated_at         date,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (tenant_id, code),
  check (end_date > start_date)
);

create table rentals.contract_parties (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  contract_id uuid not null references rentals.contracts (id) on delete cascade,
  client_id   uuid not null references crm.clients (id),
  role        text not null check (role in ('locatario', 'locador', 'fiador')),
  -- Proprietário que recebe o repasse; subconta no gateway (split).
  is_payee    boolean not null default false,
  share_pct   numeric(7,4) not null default 100,
  wallet_id   text,
  unique (contract_id, client_id, role)
);

create table rentals.contract_adjustments (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  contract_id    uuid not null references rentals.contracts (id) on delete cascade,
  applied_at     date not null,
  index_name     text not null,
  accumulated_pct numeric(9,6) not null,
  previous_rent  numeric(14,2) not null,
  new_rent       numeric(14,2) not null,
  applied_by     uuid references core.users (id),
  created_at     timestamptz not null default now()
);

create table rentals.signature_requests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  contract_id    uuid not null references rentals.contracts (id) on delete cascade,
  provider       text not null default 'clicksign',
  envelope_id    text not null,
  status         text not null default 'enviado'
    check (status in ('enviado', 'visualizado', 'assinado', 'recusado', 'cancelado')),
  signers        jsonb not null default '[]',
  document_path  text,
  sent_at        timestamptz not null default now(),
  finished_at    timestamptz,
  unique (tenant_id, envelope_id)
);

-- ----------------------------------------------------------------------------
-- Cobranças, split e pagamentos
-- ----------------------------------------------------------------------------
create table rentals.charges (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenants (id) on delete cascade,
  contract_id         uuid not null references rentals.contracts (id) on delete cascade,
  competence          date not null,           -- mês de referência (dia 1)
  due_date            date not null,
  gross_amount        numeric(14,2) not null,  -- soma dos itens
  status              text not null default 'pendente' check (status in
    ('pendente', 'pago', 'vencido', 'baixado_manual', 'cancelado')),

  provider            text not null default 'mock',
  provider_charge_id  text,
  boleto_line         text,
  boleto_url          text,
  pix_copy_paste      text,
  pix_qrcode          text,

  receipt_path        text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (contract_id, competence)
);

-- Composição da cobrança. Descontos entram com valor negativo.
create table rentals.charge_items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  charge_id  uuid not null references rentals.charges (id) on delete cascade,
  kind       text not null check (kind in
    ('aluguel', 'condominio', 'iptu', 'seguro', 'multa', 'juros', 'desconto', 'outro')),
  description text,
  amount     numeric(14,2) not null,
  -- Itens da imobiliária não entram no repasse ao proprietário.
  beneficiary text not null default 'owner' check (beneficiary in ('owner', 'agency')),
  created_at timestamptz not null default now()
);

create table rentals.charge_splits (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  charge_id   uuid not null references rentals.charges (id) on delete cascade,
  beneficiary text not null check (beneficiary in ('agency', 'owner')),
  client_id   uuid references crm.clients (id),
  wallet_id   text,
  amount      numeric(14,2) not null,
  created_at  timestamptz not null default now()
);

create table rentals.payments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  charge_id    uuid not null references rentals.charges (id) on delete cascade,
  paid_amount  numeric(14,2) not null,
  paid_at      date not null,
  method       text not null check (method in ('boleto', 'pix', 'transferencia', 'dinheiro', 'outro')),
  is_manual    boolean not null default false,  -- baixa manual (pagamento por fora)
  provider_ref text,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Repasses ao proprietário
-- ----------------------------------------------------------------------------
create table rentals.payouts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenants (id) on delete cascade,
  owner_client_id uuid not null references crm.clients (id),
  reference_month date not null,
  gross_amount    numeric(14,2) not null default 0,   -- recebido dos locatários
  admin_fee       numeric(14,2) not null default 0,   -- taxa de administração
  deductions      numeric(14,2) not null default 0,   -- manutenção e outros abatimentos
  net_amount      numeric(14,2) not null default 0,
  status          text not null default 'aberto'
    check (status in ('aberto', 'fechado', 'pago', 'cancelado')),
  statement_path  text,
  paid_at         date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, owner_client_id, reference_month)
);

create table rentals.payout_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  payout_id   uuid not null references rentals.payouts (id) on delete cascade,
  charge_id   uuid references rentals.charges (id) on delete set null,
  contract_id uuid references rentals.contracts (id) on delete set null,
  kind        text not null check (kind in
    ('aluguel', 'encargos', 'taxa_adm', 'desconto_manutencao', 'multa', 'juros', 'outro')),
  description text,
  amount      numeric(14,2) not null,   -- positivo credita, negativo debita
  receipt_path text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Webhooks (idempotência)
-- ----------------------------------------------------------------------------
-- Sem tenant_id: o evento chega antes de sabermos a que tenant pertence.
create table rentals.webhook_events (
  id            bigserial primary key,
  provider      text not null,
  event_id      text not null,
  event_type    text,
  payload       jsonb not null,
  status        text not null default 'recebido'
    check (status in ('recebido', 'processado', 'erro', 'ignorado')),
  error_message text,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  unique (provider, event_id)
);

alter table rentals.webhook_events enable row level security;
alter table rentals.webhook_events force row level security;
create policy webhook_events_all on rentals.webhook_events for all using (true) with check (true);

-- Um webhook chega sem contexto de tenant — é justamente ele que precisamos
-- descobrir para então abrir a transação com RLS. Estas funções devolvem
-- apenas o vínculo (identificador + tenant), nunca dado de negócio.
create or replace function rentals.resolve_charge_tenant(p_provider_charge_id text)
returns table (charge_id uuid, tenant_id uuid)
language sql
security definer
set search_path = rentals, public
stable
as $$
  select id, tenant_id from rentals.charges
  where provider_charge_id = p_provider_charge_id
  limit 1;
$$;

create or replace function rentals.resolve_envelope_tenant(p_envelope_id text)
returns table (request_id uuid, tenant_id uuid, contract_id uuid)
language sql
security definer
set search_path = rentals, public
stable
as $$
  select id, tenant_id, contract_id from rentals.signature_requests
  where envelope_id = p_envelope_id
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- RLS + triggers
-- ----------------------------------------------------------------------------
select core.apply_tenant_rls(t)
from unnest(array[
  'rentals.pipelines', 'rentals.pipeline_stages', 'rentals.loss_reasons',
  'rentals.leads', 'rentals.lead_stage_history', 'rentals.visits',
  'rentals.credit_analyses', 'rentals.contract_templates', 'rentals.contracts',
  'rentals.contract_parties', 'rentals.contract_adjustments',
  'rentals.signature_requests', 'rentals.charges', 'rentals.charge_items',
  'rentals.charge_splits', 'rentals.payments', 'rentals.payouts',
  'rentals.payout_items'
]::regclass[]) as t;

select core.apply_updated_at(t)
from unnest(array[
  'rentals.leads', 'rentals.credit_analyses', 'rentals.contract_templates',
  'rentals.contracts', 'rentals.charges', 'rentals.payouts'
]::regclass[]) as t;

create index on rentals.leads (tenant_id, stage_id, status);
create index on rentals.leads (tenant_id, assigned_to);
create index on rentals.charges (tenant_id, status, due_date);
create index on rentals.charges (tenant_id, competence);
create index on rentals.charges (provider_charge_id);
create index on rentals.contracts (tenant_id, status, end_date);
create index on rentals.payouts (tenant_id, reference_month, status);
create index on rentals.payout_items (tenant_id, payout_id);

-- ----------------------------------------------------------------------------
-- Numeração de contratos por tenant
-- ----------------------------------------------------------------------------
create table rentals.contract_code_counters (
  tenant_id uuid primary key references core.tenants (id) on delete cascade,
  last_code int not null default 0
);
alter table rentals.contract_code_counters enable row level security;
alter table rentals.contract_code_counters force row level security;
create policy tenant_isolation on rentals.contract_code_counters
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

create or replace function rentals.next_contract_code(p_tenant uuid)
returns text
language plpgsql
as $$
declare
  n int;
begin
  insert into rentals.contract_code_counters (tenant_id, last_code)
  values (p_tenant, 1)
  on conflict (tenant_id) do update
    set last_code = rentals.contract_code_counters.last_code + 1
  returning last_code into n;
  return 'LOC-' || lpad(n::text, 4, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Funil padrão, motivos de perda e template de contrato de um tenant novo
-- ----------------------------------------------------------------------------
create or replace function rentals.seed_tenant_rentals(p_tenant uuid)
returns void
language plpgsql
as $$
declare
  v_pipeline uuid;
begin
  insert into rentals.pipelines (tenant_id, module, name, is_default)
  values (p_tenant, 'rentals', 'Funil de locação', true)
  returning id into v_pipeline;

  -- Etapas do funil imobiliário de locação, na ordem em que a equipe trabalha.
  insert into rentals.pipeline_stages
    (tenant_id, pipeline_id, key, name, sort_order, sla_hours, is_won)
  values
    (p_tenant, v_pipeline, 'lead',            'Lead',              1, 4,   false),
    (p_tenant, v_pipeline, 'qualificacao',    'Qualificação',      2, 24,  false),
    (p_tenant, v_pipeline, 'visita_agendada', 'Visita agendada',   3, 72,  false),
    (p_tenant, v_pipeline, 'visita_realizada','Visita realizada',  4, 48,  false),
    (p_tenant, v_pipeline, 'analise',         'Análise cadastral', 5, 72,  false),
    (p_tenant, v_pipeline, 'proposta',        'Proposta',          6, 48,  false),
    (p_tenant, v_pipeline, 'contrato',        'Contrato assinado', 7, null, true);

  insert into rentals.loss_reasons (tenant_id, name) values
    (p_tenant, 'Escolheu outro imóvel'),
    (p_tenant, 'Valor acima do orçamento'),
    (p_tenant, 'Reprovado na análise cadastral'),
    (p_tenant, 'Sem garantia aceita'),
    (p_tenant, 'Desistiu da locação'),
    (p_tenant, 'Sem retorno do interessado');

  insert into rentals.contract_templates (tenant_id, name, body, is_default)
  values (
    p_tenant,
    'Contrato de locação residencial',
    'CONTRATO DE LOCAÇÃO RESIDENCIAL' || E'\n\n' ||
    'LOCADOR: {{locador_nome}}, CPF/CNPJ {{locador_documento}}.' || E'\n' ||
    'LOCATÁRIO: {{locatario_nome}}, CPF/CNPJ {{locatario_documento}}.' || E'\n\n' ||
    'IMÓVEL: {{imovel_endereco}} (código {{imovel_codigo}}).' || E'\n\n' ||
    'VALOR DO ALUGUEL: {{valor_aluguel}}, com vencimento todo dia {{dia_vencimento}}.' || E'\n' ||
    'ENCARGOS: condomínio {{valor_condominio}} e IPTU {{valor_iptu}}.' || E'\n\n' ||
    'VIGÊNCIA: de {{data_inicio}} a {{data_fim}}.' || E'\n' ||
    'REAJUSTE: anual, pelo {{indice_reajuste}}.' || E'\n' ||
    'GARANTIA: {{garantia}}.' || E'\n\n' ||
    'MULTA POR ATRASO: {{multa_atraso}} sobre o valor devido, com juros de ' ||
    '{{juros_dia}} ao dia.' || E'\n\n' ||
    'ADMINISTRAÇÃO: a locação é administrada por {{imobiliaria_nome}}, ' ||
    'mediante taxa de {{taxa_administracao}} sobre o aluguel.',
    true
  );
end;
$$;

-- Passa a fazer parte do provisionamento de todo tenant com locação.
create or replace function core.provision_tenant(
  p_name         text,
  p_plan         text,
  p_subdomain    text,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = core, crm, properties, finance, rentals, public
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

  return v_tenant;
end;
$$;

grant usage on schema rentals to app_api;
grant select, insert, update, delete on all tables in schema rentals to app_api;
grant usage, select on all sequences in schema rentals to app_api;
alter default privileges in schema rentals
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema rentals
  grant usage, select on sequences to app_api;
grant execute on all functions in schema rentals to app_api;
