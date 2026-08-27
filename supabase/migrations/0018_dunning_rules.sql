-- 0018_dunning_rules.sql
-- Régua de cobrança: quando falar com o inquilino e o que dizer. Cada linha é
-- uma regra em relação ao vencimento (offset em dias: negativo antes, positivo
-- depois). O disparo aqui é manual — a UI mostra "a cobrar hoje" e o corretor
-- clica pra abrir o WhatsApp já com o link mágico. Deixamos o motor pronto pra
-- automação depois (worker + schedule), mas o MVP economiza infra.

create table rentals.dunning_rules (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references core.tenants (id) on delete cascade,
  offset_days       int not null,
  channel           text not null default 'whatsapp'
                        check (channel in ('whatsapp', 'email', 'sms')),
  message_template  text not null,
  enabled           boolean not null default true,
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, offset_days, channel)
);

comment on table rentals.dunning_rules is
  'Régua de cobrança do tenant: templates de mensagem por offset em relação ao vencimento.';
comment on column rentals.dunning_rules.offset_days is
  'Dias em relação ao vencimento (negativo = lembrete antes, positivo = cobrança após).';
comment on column rentals.dunning_rules.message_template is
  'Texto da mensagem. Placeholders: {{inquilino}}, {{valor}}, {{vencimento}}, {{link}}, {{imobiliaria}}.';

create index dunning_rules_tenant_idx on rentals.dunning_rules (tenant_id, enabled);

alter table rentals.dunning_rules enable row level security;

create policy dunning_rules_tenant_isolation on rentals.dunning_rules
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

grant select, insert, update, delete on rentals.dunning_rules to app_api;
