-- 0019_activity_feed.sql
-- Feed de atividade — o "Twitter interno" da imobiliária. Cada linha é um
-- evento visível para o time inteiro: lead criado, proposta enviada, negócio
-- fechado, contrato assinado. Cria pressão positiva de acompanhamento sem
-- precisar de reunião. O gerente vê o pulso no painel, o corretor vê que a
-- equipe está se mexendo.
--
-- Deliberadamente simples: uma tabela append-only, um índice por tempo, sem
-- anexos ou reações. Se virar problema, particiona por mês.

create table core.activity_feed (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  actor_id     uuid references core.users (id) on delete set null,
  event_type   text not null,
  subject_type text,
  subject_id   uuid,
  summary      text not null,
  meta         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

comment on table core.activity_feed is
  'Feed de eventos do time — leads, propostas, negócios, contratos.';
comment on column core.activity_feed.event_type is
  'Slug do evento, ex: lead.created, proposal.sent, deal.closed, contract.signed.';
comment on column core.activity_feed.summary is
  'Frase pronta para o feed. Fica gravada no evento, imune a renames.';

create index activity_feed_tenant_time_idx
  on core.activity_feed (tenant_id, created_at desc);

alter table core.activity_feed enable row level security;

create policy activity_feed_tenant_isolation on core.activity_feed
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

grant select, insert on core.activity_feed to app_api;
