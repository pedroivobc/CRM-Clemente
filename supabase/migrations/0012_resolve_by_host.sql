-- ============================================================================
-- 0012 — Resolução da chave pública pelo host.
--
-- O site pronto sobe num subdomínio do sistema (`aurora.sistema.com.br`) ou
-- em domínio próprio da imobiliária (`www.aurora.com.br`). Ele carrega sem
-- login e precisa descobrir sua vitrine só a partir do host que o navegador
-- pediu. Esta função devolve a chave publicável; a partir daí o cliente segue
-- o mesmo caminho de `core.resolve_public_tenant`.
-- ============================================================================

create or replace function core.resolve_public_key_by_host(p_host text)
returns text
language sql
security definer
set search_path = core, public
as $$
  -- Considera três formas do que chega em `Host`:
  --   1. exatamente o custom_domain gravado
  --   2. o subdomínio nu (para `aurora` bater em `aurora`)
  --   3. o primeiro rótulo do host (para `aurora.sistema.com.br`)
  with candidato as (
    select
      lower(coalesce(nullif(p_host, ''), '')) as h,
      lower(split_part(coalesce(nullif(p_host, ''), ''), '.', 1)) as sub
  )
  select tp.public_key
    from candidato c
    join core.tenant_domains d
      on lower(d.custom_domain) = c.h
      or lower(d.subdomain) = c.sub
      or lower(d.subdomain) = c.h
    join core.tenants t on t.id = d.tenant_id
    join core.tenant_public tp on tp.tenant_id = t.id
   where t.status = 'active'
   limit 1;
$$;

revoke all on function core.resolve_public_key_by_host(text) from public;
grant execute on function core.resolve_public_key_by_host(text) to app_api;
