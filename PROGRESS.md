# PROGRESS

## Fase 1 — Fundação (2026-07-24) ✅

Multi-tenant, autenticação, RBAC, white label, cadastro de clientes e imóveis
(com marca d'água) e financeiro central básico.

### Entregue

**Banco (`supabase/migrations/`)**
- `0001_core` — tenants, branding, subdomínios, módulos, usuários, papéis,
  permissões, auditoria, chaves de API. Infraestrutura de RLS
  (`core.current_tenant_id()`, `core.apply_tenant_rls()`) e papel `app_api`.
- `0002_crm` — clientes PF/PJ, papéis acumuláveis, contatos, documentos com
  validade, timeline de interações.
- `0003_properties` — imóveis, fotos (original + marcada), mídias,
  proprietários, código sequencial por tenant (`IM-0001`).
- `0004_finance` — plano de contas, centros de custo, contas a pagar/receber,
  views de fluxo de caixa e DRE por competência.
- `0005_provisioning` — `provision_tenant`, `attach_user`,
  `resolve_user_context`, `tenant_enabled_modules`.
- `0006_sales` — casca do módulo de Vendas (tabelas vazias de lógica).

**API (`apps/api/`)** — FastAPI, 51 rotas em `/api/v1`
- Tenancy por subdomínio + JWT do Supabase; RBAC granular (módulo × ação);
  auditoria na mesma transação da operação auditada.
- Clientes: validação de CPF/CNPJ, endereço por CEP (ViaCEP), documentos com
  alerta de vencimento, timeline.
- Imóveis: CRUD, proprietários, upload de fotos com marca d'água em fila.
- Financeiro: lançamentos, baixa, cancelamento, comprovante, fluxo de caixa
  de 90 dias e DRE.
- Providers abstratos (pagamento, assinatura, NFS-e, mensageria, voz) com
  implementações mock.

**Worker (`app/workers/`)** — arq + Redis; marca d'água com Pillow (logo do
tenant), reprocessamento em lote quando o logo muda.

**Frontend (`apps/web/`)** — React + Vite + TS + Tailwind v4
- Login com a marca do tenant, navegação condicional por plano e permissão,
  painel, clientes (lista/ficha/documentos/timeline), imóveis (lista/ficha/
  fotos), financeiro (lançamentos, fluxo de caixa, DRE), configurações
  (identidade visual, equipe, auditoria), casca de Vendas.
- Branding aplicado em runtime via CSS variables.

**Infra** — Docker Compose (api, worker, redis, caddy), Caddyfile com wildcard
de subdomínio, CI no GitHub Actions com Postgres de serviço.

### Verificação
- 66 testes passando contra Postgres real: isolamento entre tenants, RBAC,
  gating de módulo, motor financeiro (baixa, cancelamento, fluxo, DRE) e
  marca d'água. `ruff check` e `ruff format` limpos; build do frontend OK.
- Interface conferida por captura de tela em desktop e mobile.

### Decisões tomadas nesta fase
- **Testes rodam com papel comum de banco, não superusuário.** Superusuário
  ignora RLS silenciosamente; testar assim mascararia falhas de isolamento.
  O fixture cria `crm_test_api` dentro de `app_api`, igual à produção.
- **Consulta de dados só pela API.** O frontend usa o Supabase apenas para
  autenticação; RLS é a segunda linha de defesa, não a primeira.
- **Identificadores e dinheiro em monoespaçada**, com etiqueta de código
  (`IM-0001`) como elemento visual recorrente — espelha a etiqueta física do
  chaveiro e alinha números em coluna.

### Correções encontradas na verificação
- Busca de clientes por termo sem dígitos casava com todo cliente que tivesse
  CPF/CNPJ preenchido (cláusula `like '%%'`).
- `_USER_SELECT.format()` colidia com o literal `'{}'` do SQL.
- Situação do imóvel era comunicada só por cor; virou selo com texto.
- Cores de "Reservado" e "Em manutenção" eram indistinguíveis na barra da
  carteira.

### Pendências para as próximas fases
- Credenciais sandbox (Asaas, ClickSign, Focus NFe) — necessárias na Fase 2.
- Projeto Supabase real (URL, chaves, buckets de Storage) para publicar.
- Domínio base dos subdomínios, para o wildcard TLS no Caddy.
- Convite de colaborador por e-mail (hoje o vínculo com o Supabase Auth é
  feito no primeiro acesso).

---

## Fase 0 — Planejamento (2026-07-24) ✅

- `docs/ARQUITETURA.md`, `docs/MODELO-DE-DADOS.md`, `docs/DECISOES-TECNICAS.md`
  aprovados pelo cliente.

---

## Próximo: Fase 2 — Locação core

CRM de locação (funil próprio, kanban, SLA, distribuição de leads), contratos
com ClickSign e motor de cobrança com split via Asaas em sandbox, recibos.
