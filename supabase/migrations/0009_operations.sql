-- ============================================================================
-- 0009 — Operação: chaves, vistorias e chamados de manutenção.
--
-- Estes três assuntos são o que faz a locação funcionar no dia a dia e são
-- justamente os que costumam viver fora do sistema — chave anotada em papel,
-- vistoria em caderno, reparo combinado por WhatsApp pessoal. O desenho aqui
-- assume o contrário: tudo que acontece fica registrado onde a equipe inteira
-- enxerga.
-- ============================================================================

create schema if not exists keys;
create schema if not exists inspections;
create schema if not exists maintenance;

-- ----------------------------------------------------------------------------
-- Chaves
-- ----------------------------------------------------------------------------
create table keys.property_keys (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  property_id    uuid not null references properties.properties (id) on delete cascade,
  label          text not null,               -- "Chave principal", "Portão", "Caixa de correio"
  copies         int not null default 1 check (copies > 0),
  board_position text,                        -- posição física no chaveiro (ex.: "A-14")
  notes          text,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table keys.key_movements (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references core.tenants (id) on delete cascade,
  key_id             uuid not null references keys.property_keys (id) on delete cascade,

  -- Quem levou: colaborador, cliente cadastrado, prestador ou alguém avulso.
  taken_by_user_id   uuid references core.users (id),
  taken_by_client_id uuid references crm.clients (id),
  taken_by_name      text,
  taken_by_document  text,
  taken_by_phone     text,

  purpose            text not null,           -- visita, vistoria, reparo, entrega
  taken_at           timestamptz not null default now(),
  due_back_at        timestamptz not null,    -- prazo combinado de devolução
  returned_at        timestamptz,
  returned_to        uuid references core.users (id),
  signature_path     text,                    -- assinatura desenhada na tela
  notes              text,
  created_by         uuid references core.users (id),
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Vistorias
-- ----------------------------------------------------------------------------
create table inspections.inspections (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants (id) on delete cascade,
  property_id       uuid not null references properties.properties (id) on delete cascade,
  contract_id       uuid,                     -- referência lógica a rentals.contracts
  kind              text not null check (kind in ('entrada', 'saida', 'periodica')),
  inspector_user_id uuid references core.users (id),
  scheduled_at      timestamptz,
  performed_at      timestamptz,
  status            text not null default 'agendada'
    check (status in ('agendada', 'em_andamento', 'concluida', 'cancelada')),
  general_notes     text,
  report_path       text,                     -- laudo em PDF
  -- Vistoria de saída se compara com a de entrada do mesmo contrato.
  compared_with_id  uuid references inspections.inspections (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table inspections.rooms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  inspection_id uuid not null references inspections.inspections (id) on delete cascade,
  name          text not null,
  sort_order    int not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

create table inspections.items (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  room_id    uuid not null references inspections.rooms (id) on delete cascade,
  name       text not null,                   -- "Piso", "Pintura", "Tomadas"
  condition  text check (condition in ('otimo', 'bom', 'regular', 'ruim')),
  notes      text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table inspections.photos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  inspection_id uuid not null references inspections.inspections (id) on delete cascade,
  item_id       uuid references inspections.items (id) on delete cascade,
  storage_path  text not null,
  caption       text,
  created_at    timestamptz not null default now()
);

create table inspections.meter_readings (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references core.tenants (id) on delete cascade,
  inspection_id uuid not null references inspections.inspections (id) on delete cascade,
  meter         text not null check (meter in ('agua', 'luz', 'gas')),
  reading       text not null,
  photo_path    text,
  created_at    timestamptz not null default now()
);

-- Pendências levantadas na vistoria de saída, com responsabilidade sugerida.
create table inspections.issues (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references core.tenants (id) on delete cascade,
  inspection_id  uuid not null references inspections.inspections (id) on delete cascade,
  item_id        uuid references inspections.items (id) on delete set null,
  room_name      text,
  description    text not null,
  responsibility text not null default 'indefinido'
    check (responsibility in ('locatario', 'proprietario', 'indefinido')),
  estimated_cost numeric(14,2),
  -- Registro do que motivou a sugestão, para a equipe poder contestar.
  entry_condition text,
  exit_condition  text,
  resolved       boolean not null default false,
  created_at     timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Prestadores e chamados
-- ----------------------------------------------------------------------------
create table maintenance.service_providers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  client_id  uuid references crm.clients (id) on delete set null,
  name       text not null,
  document   text,
  phone      text,
  email      text,
  notes      text,
  avg_rating numeric(3,2),
  jobs_done  int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table maintenance.provider_specialties (
  provider_id uuid not null references maintenance.service_providers (id) on delete cascade,
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  specialty   text not null check (specialty in
    ('pintura', 'eletrica', 'hidraulica', 'reforma', 'marcenaria', 'chaveiro',
     'limpeza', 'jardinagem', 'ar_condicionado', 'gas', 'outro')),
  primary key (provider_id, specialty)
);

create table maintenance.tickets (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references core.tenants (id) on delete cascade,
  code                text not null,
  property_id         uuid not null references properties.properties (id) on delete cascade,
  contract_id         uuid,                   -- referência lógica a rentals.contracts
  opened_by_client_id uuid references crm.clients (id),   -- locatário pelo portal
  opened_by_user_id   uuid references core.users (id),    -- ou a própria equipe
  title               text not null,
  description         text,
  specialty           text,
  priority            text not null default 'normal'
    check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  status              text not null default 'aberto' check (status in
    ('aberto', 'triagem', 'orcamento', 'aprovacao', 'execucao', 'concluido', 'cancelado')),

  -- Quem paga o serviço; definido na triagem e confirmado na aprovação.
  payer               text check (payer in ('proprietario', 'locatario', 'imobiliaria')),
  approved_by_user_id uuid references core.users (id),
  approved_at         timestamptz,
  approved_quote_id   uuid,
  final_cost          numeric(14,2),
  scheduled_for       date,
  completed_at        timestamptz,
  closed_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, code)
);

create table maintenance.quotes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  ticket_id   uuid not null references maintenance.tickets (id) on delete cascade,
  provider_id uuid not null references maintenance.service_providers (id),
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  lead_days   int,                            -- prazo de execução em dias
  valid_until date,
  status      text not null default 'pendente'
    check (status in ('pendente', 'aprovado', 'recusado')),
  created_at  timestamptz not null default now()
);

-- Linha do tempo do chamado: tudo que aconteceu fica aqui, inclusive as
-- mensagens trocadas com o prestador por WhatsApp.
create table maintenance.events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references core.tenants (id) on delete cascade,
  ticket_id   uuid not null references maintenance.tickets (id) on delete cascade,
  kind        text not null check (kind in
    ('abertura', 'triagem', 'orcamento', 'aprovacao', 'agendamento', 'execucao',
     'mensagem', 'conclusao', 'avaliacao', 'cancelamento', 'nota')),
  user_id     uuid references core.users (id),
  summary     text not null,
  payload     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table maintenance.photos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  ticket_id    uuid not null references maintenance.tickets (id) on delete cascade,
  moment       text not null check (moment in ('antes', 'depois')),
  storage_path text not null,
  caption      text,
  created_at   timestamptz not null default now()
);

create table maintenance.ratings (
  ticket_id  uuid primary key references maintenance.tickets (id) on delete cascade,
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  score      int not null check (score between 1 and 5),
  comment    text,
  rated_at   timestamptz not null default now()
);

-- Até que valor a imobiliária aprova sozinha; acima disso, o proprietário decide.
create table maintenance.approval_rules (
  tenant_id            uuid primary key references core.tenants (id) on delete cascade,
  agency_limit_amount  numeric(14,2) not null default 300,
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- RLS + triggers
-- ----------------------------------------------------------------------------
select core.apply_tenant_rls(t)
from unnest(array[
  'keys.property_keys', 'keys.key_movements',
  'inspections.inspections', 'inspections.rooms', 'inspections.items',
  'inspections.photos', 'inspections.meter_readings', 'inspections.issues',
  'maintenance.service_providers', 'maintenance.provider_specialties',
  'maintenance.tickets', 'maintenance.quotes', 'maintenance.events',
  'maintenance.photos', 'maintenance.ratings'
]::regclass[]) as t;

alter table maintenance.approval_rules enable row level security;
alter table maintenance.approval_rules force row level security;
create policy tenant_isolation on maintenance.approval_rules
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

select core.apply_updated_at(t)
from unnest(array[
  'keys.property_keys', 'inspections.inspections',
  'maintenance.service_providers', 'maintenance.tickets'
]::regclass[]) as t;

create index on keys.property_keys (tenant_id, property_id);
create index on keys.key_movements (tenant_id, key_id, returned_at);
create index on keys.key_movements (tenant_id, due_back_at) where returned_at is null;
create index on inspections.inspections (tenant_id, property_id, kind);
create index on inspections.inspections (tenant_id, status);
create index on inspections.rooms (tenant_id, inspection_id, sort_order);
create index on inspections.items (tenant_id, room_id, sort_order);
create index on maintenance.tickets (tenant_id, status, priority);
create index on maintenance.tickets (tenant_id, property_id);
create index on maintenance.quotes (tenant_id, ticket_id);
create index on maintenance.events (tenant_id, ticket_id, created_at);

-- ----------------------------------------------------------------------------
-- Numeração dos chamados
-- ----------------------------------------------------------------------------
create table maintenance.code_counters (
  tenant_id uuid primary key references core.tenants (id) on delete cascade,
  last_code int not null default 0
);
alter table maintenance.code_counters enable row level security;
alter table maintenance.code_counters force row level security;
create policy tenant_isolation on maintenance.code_counters
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

create or replace function maintenance.next_ticket_code(p_tenant uuid)
returns text
language plpgsql
as $$
declare
  n int;
begin
  insert into maintenance.code_counters (tenant_id, last_code)
  values (p_tenant, 1)
  on conflict (tenant_id) do update
    set last_code = maintenance.code_counters.last_code + 1
  returning last_code into n;
  return 'CH-' || lpad(n::text, 4, '0');
end;
$$;

-- ----------------------------------------------------------------------------
-- Semente da operação
-- ----------------------------------------------------------------------------
create or replace function maintenance.seed_tenant_operations(p_tenant uuid)
returns void
language plpgsql
as $$
begin
  insert into maintenance.approval_rules (tenant_id) values (p_tenant);
end;
$$;

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

grant usage on schema keys, inspections, maintenance to app_api;
grant select, insert, update, delete on all tables in schema keys to app_api;
grant select, insert, update, delete on all tables in schema inspections to app_api;
grant select, insert, update, delete on all tables in schema maintenance to app_api;
grant usage, select on all sequences in schema keys to app_api;
grant usage, select on all sequences in schema inspections to app_api;
grant usage, select on all sequences in schema maintenance to app_api;
alter default privileges in schema keys
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema inspections
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema maintenance
  grant select, insert, update, delete on tables to app_api;
grant execute on all functions in schema maintenance to app_api;
