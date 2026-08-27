-- 0016_mcmv.sql
-- MCMV nativo: identifica o imóvel por faixa e guarda a renda declarada do lead
-- para o simulador embutido na vitrine e na ficha administrativa.
--
-- Faixas 1..4 seguem a nomenclatura corrente do programa; nulo = não se aplica.
-- Não confundir com o valor do imóvel — a faixa é o encaixe comercial (perfil
-- de renda + limite do programa + tipo). O simulador vive na aplicação para
-- não travar aqui quando as regras mudarem.

alter table properties.properties
  add column mcmv_faixa text
    check (mcmv_faixa is null or mcmv_faixa in ('faixa_1', 'faixa_2', 'faixa_3', 'faixa_4'));

comment on column properties.properties.mcmv_faixa is
  'Faixa do Minha Casa Minha Vida para a qual o imóvel se enquadra. Nulo = fora do programa.';

create index properties_mcmv_idx
  on properties.properties (mcmv_faixa)
  where mcmv_faixa is not null;


alter table sales.leads
  add column renda_familiar_bruta numeric(12, 2);

comment on column sales.leads.renda_familiar_bruta is
  'Renda bruta declarada da família, para simulação de MCMV e recomendação de imóvel.';
