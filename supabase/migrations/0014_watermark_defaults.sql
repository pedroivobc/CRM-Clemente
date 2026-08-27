-- ============================================================================
-- 0014 — Marca d'água discreta por padrão.
--
-- Na migration 0010 o padrão era 0.65 (o comum do mercado), e o worker
-- ignorava o campo. Agora o worker lê o valor por tenant e o padrão baixa
-- para 0.35, que é onde o logo assina sem competir com a foto.
-- ============================================================================

alter table properties.watermark_settings alter column opacity set default 0.35;

-- Tenants que nunca ajustaram (opacidade == valor antigo do default) migram
-- para o novo padrão. Quem já mexeu, não é tocado.
update properties.watermark_settings
   set opacity = 0.35, updated_at = now()
 where opacity = 0.65;
