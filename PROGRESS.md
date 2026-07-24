# PROGRESS

## Fase 0 — Planejamento (2026-07-24)

**Feito**
- `docs/ARQUITETURA.md` — diagrama de arquitetura, multi-tenant/white label, estrutura do monorepo, fluxos críticos (cobrança com split, marca d'água, contratos), segurança e deploy.
- `docs/MODELO-DE-DADOS.md` — diagrama ER por schema (`core`, `crm`, `properties`, `rentals`, `finance`, `keys`, `inspections`, `maintenance`, `support`, `hr`, `portal`, `sales`).
- `docs/DECISOES-TECNICAS.md` — 20 decisões em formato ADR resumido + pendências que dependem do cliente.

**Decisões-chave tomadas** (detalhes no doc de decisões)
- Worker: arq (não Celery). PDF: WeasyPrint. Acesso a dados: sempre via API FastAPI, RLS como segunda defesa.
- Providers abstratos com mock/sandbox: Asaas, ClickSign, Focus NFe, Evolution API, VoIP.

**Pendências**
- ⏳ Aprovação do usuário sobre arquitetura, ER e decisões → libera a Fase 1 (Fundação).
- Credenciais sandbox (Asaas/ClickSign/Focus NFe) só serão necessárias na Fase 2.

**Próximo passo:** após aprovação, iniciar Fase 1 — scaffold do monorepo, migrations de `core`/`crm`/`properties`/`finance` com RLS, auth + RBAC, white label, cadastro de clientes e imóveis com marca d'água, financeiro central básico.
