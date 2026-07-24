-- Seed de DESENVOLVIMENTO — não executar em produção.
-- Cria um tenant demo com plano completo e subdomínio "demo".
select core.provision_tenant('Imobiliária Demo', 'completo', 'demo', 'Imobiliária Demo');
