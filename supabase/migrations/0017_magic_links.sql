-- 0017_magic_links.sql
-- Link mágico: URL curta que autentica o cliente final (inquilino, proprietário
-- ou comprador) por uns minutos, sem senha. O corretor envia por WhatsApp e o
-- cliente abre a 2ª via de boleto/extrato direto no navegador — quem tem 20
-- contratos não quer o suporte de senha do cliente.
--
-- O token é a chave única no sistema. Consulta pública roda sem contexto de
-- tenant e resolve daqui pra saber quem é o dono do target.

create table core.magic_links (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references core.tenants (id) on delete cascade,
  token        text not null unique,
  target_type  text not null check (target_type in ('charge', 'statement', 'receipt')),
  target_id    uuid not null,
  created_by   uuid references core.users (id),
  expires_at   timestamptz not null,
  used_at      timestamptz,
  created_at   timestamptz not null default now()
);

comment on table core.magic_links is
  'Tokens efêmeros para o cliente final abrir 2ª via / extrato sem senha.';
comment on column core.magic_links.expires_at is
  'Depois desta data o token não vale mais, mesmo que ainda não tenha sido usado.';
comment on column core.magic_links.used_at is
  'Carimbo do primeiro uso. Não bloqueia reuso — o token continua válido até expirar.';

create index magic_links_token_idx on core.magic_links (token);
create index magic_links_expires_idx on core.magic_links (expires_at)
  where used_at is null;

alter table core.magic_links enable row level security;

create policy magic_links_tenant_isolation on core.magic_links
  using (tenant_id = core.current_tenant_id())
  with check (tenant_id = core.current_tenant_id());

grant select, insert, update, delete on core.magic_links to app_api;
