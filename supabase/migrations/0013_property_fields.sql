-- ============================================================================
-- 0013 — Campos obrigatórios de imóvel + flags de perfil (pet, república, lazer).
--
-- Até aqui, quartos/vagas/banheiros/área viviam soltos em `features` (jsonb):
-- o portal exige inteiros validados, o filtro precisa comparar em SQL, e o
-- gerador de legenda tem que saber o que existe. Viraram colunas tipadas.
-- ``features`` continua como campo livre para o que for específico.
-- ============================================================================

alter table properties.properties
  add column area_util           numeric(10, 2),  -- m²
  add column bedrooms            int,
  add column suites              int,
  add column bathrooms           int,
  add column parking_spots       int,
  -- Perfis frequentes na locação de Juiz de Fora (universitários, famílias
  -- com pet). Booleanos anuláveis: "não informado" ≠ "não permite".
  add column pet_allowed         boolean,
  add column republic_allowed    boolean,
  add column has_leisure_area    boolean;

comment on column properties.properties.area_util is
  'Área útil em m². Obrigatória para publicar; alimenta LivingArea do VRSync.';
comment on column properties.properties.pet_allowed is
  'Aceita pet (relevante para locação). NULL = não informado.';
comment on column properties.properties.republic_allowed is
  'Aceita república (relevante para locação universitária). NULL = não informado.';
comment on column properties.properties.has_leisure_area is
  'Condomínio com área de lazer (piscina, salão de festas, playground, etc).';

-- Backfill do que já vinha em features jsonb, para não perder o cadastrado.
update properties.properties
   set area_util     = coalesce(area_util, nullif(features->>'area_util', '')::numeric),
       bedrooms      = coalesce(bedrooms, nullif(features->>'quartos', '')::int),
       suites        = coalesce(suites, nullif(features->>'suites', '')::int),
       bathrooms     = coalesce(bathrooms, nullif(features->>'banheiros', '')::int),
       parking_spots = coalesce(parking_spots, nullif(features->>'vagas', '')::int)
 where features is not null;

-- Índices para os filtros mais frequentes na vitrine.
create index properties_bedrooms_idx
  on properties.properties (tenant_id, bedrooms)
  where publish_site;
create index properties_area_idx
  on properties.properties (tenant_id, area_util)
  where publish_site;
