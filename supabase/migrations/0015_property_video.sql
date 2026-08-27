-- ============================================================================
-- 0015 — URL de vídeo do imóvel (YouTube ou Vimeo).
--
-- O tour_url que já existia é para tour virtual 360°. Aqui é o vídeo comum
-- de apresentação — o que a imobiliária grava com o celular e sobe no
-- YouTube. Nasce sobretudo para vendas, mas vale para locação também.
-- ============================================================================

alter table properties.properties
  add column video_url text;

comment on column properties.properties.video_url is
  'URL de vídeo (YouTube ou Vimeo) exibido na página do imóvel.';
