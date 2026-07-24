-- ============================================================================
-- 0004 — Schema FINANCE: plano de contas, centros de custo, contas a pagar e
--         receber, visões de fluxo de caixa (90 dias) e DRE por competência.
-- ============================================================================

create schema if not exists finance;

create table finance.chart_of_accounts (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  code       text not null,               -- ex.: 1.01, 2.03
  name       text not null,
  kind       text not null check (kind in ('receita', 'despesa')),
  parent_id  uuid references finance.chart_of_accounts (id) on delete set null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table finance.cost_centers (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references core.tenants (id) on delete cascade,
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table finance.payables (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenants (id) on delete cascade,
  description     text not null,
  supplier_id     uuid references crm.clients (id),
  account_id      uuid references finance.chart_of_accounts (id),
  cost_center_id  uuid references finance.cost_centers (id),
  due_date        date not null,
  competence_date date not null,
  amount          numeric(14,2) not null check (amount > 0),
  status          text not null default 'pendente'
    check (status in ('pendente', 'pago', 'cancelado')),
  paid_at         date,
  paid_amount     numeric(14,2),
  recurrence      text not null default 'nenhuma'
    check (recurrence in ('nenhuma', 'mensal', 'anual')),
  proof_path      text,   -- comprovante anexado
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table finance.receivables (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references core.tenants (id) on delete cascade,
  description     text not null,
  payer_id        uuid references crm.clients (id),
  account_id      uuid references finance.chart_of_accounts (id),
  cost_center_id  uuid references finance.cost_centers (id),
  due_date        date not null,
  competence_date date not null,
  amount          numeric(14,2) not null check (amount > 0),
  status          text not null default 'pendente'
    check (status in ('pendente', 'recebido', 'cancelado')),
  paid_at         date,
  paid_amount     numeric(14,2),
  source          text not null default 'manual',  -- manual | rental_charge (Fase 2)
  source_id       uuid,                            -- charge de locação (Fase 2)
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

select core.apply_tenant_rls(t)
from unnest(array[
  'finance.chart_of_accounts', 'finance.cost_centers',
  'finance.payables', 'finance.receivables'
]::regclass[]) as t;

select core.apply_updated_at('finance.payables');
select core.apply_updated_at('finance.receivables');

create index on finance.payables (tenant_id, status, due_date);
create index on finance.receivables (tenant_id, status, due_date);
create index on finance.payables (tenant_id, competence_date);
create index on finance.receivables (tenant_id, competence_date);

-- Fluxo de caixa projetado: saldo diário de entradas − saídas pendentes/realizadas.
create view finance.v_cashflow as
select tenant_id, due_date as day, 'in' as direction, sum(amount) as amount
from finance.receivables
where status <> 'cancelado'
group by tenant_id, due_date
union all
select tenant_id, due_date as day, 'out' as direction, sum(amount) as amount
from finance.payables
where status <> 'cancelado'
group by tenant_id, due_date;

-- DRE simplificado por competência (mês × conta).
create view finance.v_dre as
select r.tenant_id,
       date_trunc('month', r.competence_date)::date as month,
       coalesce(a.name, 'Sem classificação') as account,
       'receita' as kind,
       sum(r.amount) as amount
from finance.receivables r
left join finance.chart_of_accounts a on a.id = r.account_id
where r.status <> 'cancelado'
group by 1, 2, 3
union all
select p.tenant_id,
       date_trunc('month', p.competence_date)::date as month,
       coalesce(a.name, 'Sem classificação') as account,
       'despesa' as kind,
       sum(p.amount) as amount
from finance.payables p
left join finance.chart_of_accounts a on a.id = p.account_id
where p.status <> 'cancelado'
group by 1, 2, 3;

-- Views herdam o RLS das tabelas-base (security_invoker).
alter view finance.v_cashflow set (security_invoker = true);
alter view finance.v_dre set (security_invoker = true);

-- Plano de contas e centros de custo padrão de um tenant novo.
create or replace function finance.seed_tenant_finance(p_tenant uuid)
returns void
language plpgsql
as $$
begin
  insert into finance.cost_centers (tenant_id, name) values
    (p_tenant, 'Locação'), (p_tenant, 'Vendas'), (p_tenant, 'Administrativo');

  insert into finance.chart_of_accounts (tenant_id, code, name, kind) values
    (p_tenant, '1.01', 'Taxa de administração de aluguel', 'receita'),
    (p_tenant, '1.02', 'Comissão de venda', 'receita'),
    (p_tenant, '1.03', 'Taxa de contrato', 'receita'),
    (p_tenant, '1.99', 'Outras receitas', 'receita'),
    (p_tenant, '2.01', 'Pessoal e encargos', 'despesa'),
    (p_tenant, '2.02', 'Aluguel e ocupação', 'despesa'),
    (p_tenant, '2.03', 'Marketing e portais', 'despesa'),
    (p_tenant, '2.04', 'Software e tecnologia', 'despesa'),
    (p_tenant, '2.05', 'Impostos e taxas', 'despesa'),
    (p_tenant, '2.99', 'Outras despesas', 'despesa');
end;
$$;

grant usage on schema finance to app_api;
grant select, insert, update, delete on all tables in schema finance to app_api;
grant select on finance.v_cashflow, finance.v_dre to app_api;
grant usage, select on all sequences in schema finance to app_api;
alter default privileges in schema finance
  grant select, insert, update, delete on tables to app_api;
alter default privileges in schema finance
  grant usage, select on sequences to app_api;
grant execute on all functions in schema finance to app_api;
