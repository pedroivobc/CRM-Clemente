# Arquitetura do Sistema — SaaS de Gestão Imobiliária (Vendas + Locação)

> **Status:** proposta para aprovação (pré-Fase 1)
> **Referências de mercado estudadas:** Vista CRM, Jetimob, Kenlo, Superlógica Imobiliárias, Imoview, Arbo — funil imobiliário (captação → atendimento → visita → proposta → contrato), portais de locador/locatário e motor financeiro com repasse são os padrões que o setor espera.

---

## 1. Visão geral

Sistema multi-tenant white label para imobiliárias de 1 a 20 colaboradores, com dois módulos comercializáveis separadamente (**Locação** — implementação completa; **Vendas** — apenas casca nesta fase) sobre uma fundação comum (clientes, imóveis, financeiro central, RBAC, branding).

```mermaid
flowchart TB
    subgraph Clientes["Acesso por subdomínio do tenant (imobiliariax.sistema.com.br)"]
        SPA["App Interno<br/>React + Vite + TS<br/>Tailwind + shadcn/ui"]
        PortalLocatario["Portal do Locatário<br/>(mobile-first)"]
        PortalLocador["Portal do Locador<br/>(mobile-first)"]
        SiteTenant["Site do Tenant<br/>(SSG ou API pública)"]
    end

    subgraph Backend["Backend — FastAPI (Python)"]
        API["API REST /api/v1<br/>resolução de tenant no middleware"]
        Webhooks["Endpoints de Webhook<br/>Asaas · ClickSign · Focus NFe · Evolution"]
        PublicAPI["API Pública<br/>(API key por tenant)"]
    end

    subgraph Supabase["Supabase"]
        PG[("PostgreSQL<br/>schemas por domínio + RLS por tenant_id")]
        Auth["Supabase Auth<br/>(JWT com tenant_id e roles)"]
        Storage["Storage<br/>fotos, docs, PDFs, laudos"]
    end

    subgraph Jobs["Assíncrono"]
        Redis[("Redis")]
        Worker["Worker (arq)<br/>marca d'água · PDFs · cobranças<br/>NFS-e · WhatsApp · reajustes"]
    end

    subgraph Providers["Integrações (provider pattern + modo sandbox/mock)"]
        Asaas["PaymentProvider<br/>Asaas (split, boleto+Pix)"]
        ClickSign["SignatureProvider<br/>ClickSign API v3"]
        FocusNFe["InvoiceProvider<br/>Focus NFe (NFS-e)"]
        Evolution["MessagingProvider<br/>Evolution API / Meta Cloud"]
        Voice["VoiceProvider<br/>Zenvia / Sinch / Asterisk"]
        ViaCEP["ViaCEP (CEP)"]
    end

    SPA --> API
    PortalLocatario --> API
    PortalLocador --> API
    SiteTenant --> PublicAPI
    API --> PG
    API --> Auth
    API --> Storage
    API --> Redis
    Redis --> Worker
    Worker --> PG
    Worker --> Storage
    Worker --> Asaas
    Worker --> ClickSign
    Worker --> FocusNFe
    Worker --> Evolution
    API --> Voice
    API --> ViaCEP
    Asaas -.webhook.-> Webhooks
    ClickSign -.webhook.-> Webhooks
    FocusNFe -.webhook.-> Webhooks
    Evolution -.webhook.-> Webhooks
    Webhooks --> Redis
```

---

## 2. Multi-tenant e White Label

| Aspecto | Decisão |
|---|---|
| Isolamento | `tenant_id UUID` em todas as tabelas de negócio + **RLS no Postgres** (política por schema/tabela) |
| Resolução do tenant | Middleware FastAPI resolve pelo **subdomínio** (`Host` header) → `core.tenant_domains`; fallback por claim `tenant_id` no JWT |
| RLS na prática | Frontend acessa **somente via API** (não usa supabase-js direto contra tabelas de negócio). O backend abre a conexão e executa `SET LOCAL app.tenant_id = ...`; políticas RLS usam `current_setting('app.tenant_id')`. Supabase Auth continua emitindo os JWTs |
| Plano por tenant | `core.tenants.plan ∈ {venda, locacao, completo}` + flags em `core.tenant_modules`. Navegação, rotas e permissões são renderizadas condicionalmente — quem contrata só locação nunca vê menus de venda |
| White label | `core.tenant_branding`: logo (Storage), cores primária/secundária/acento, favicon, nome de exibição. Cores injetadas em runtime como **CSS variables** (tema shadcn). Logo aplicado no app, portais, PDFs e marca d'água das fotos |

---

## 3. Estrutura do repositório (monorepo)

```
CRM-Clemente/
├── apps/
│   ├── web/                  # React + Vite + TS (app interno + portais como rotas por papel)
│   └── api/                  # FastAPI
│       ├── app/
│       │   ├── core/         # config, tenancy, security, deps
│       │   ├── modules/      # routers/services por domínio (crm, properties, rentals, ...)
│       │   ├── providers/    # payment/, signature/, invoice/, messaging/, voice/ (base + impl + mock)
│       │   ├── workers/      # tasks arq (watermark, pdf, billing, nfse, whatsapp)
│       │   └── webhooks/     # handlers de webhook por provedor
│       └── tests/
├── supabase/
│   └── migrations/           # SQL versionado (schemas, RLS, seeds)
├── infra/
│   ├── docker-compose.yml    # api, worker, redis, caddy (VPS Ubuntu 24.04)
│   └── Caddyfile             # TLS automático + wildcard de subdomínio
├── docs/                     # este diretório
└── PROGRESS.md               # atualizado ao fim de cada fase
```

---

## 4. Fluxos críticos

### 4.1 Cobrança de aluguel com split (coração do módulo)

```mermaid
sequenceDiagram
    participant W as Worker (arq)
    participant A as Asaas (PaymentProvider)
    participant DB as Postgres
    participant Z as WhatsApp (MessagingProvider)
    participant N as Focus NFe (InvoiceProvider)

    W->>DB: job mensal lê contratos ativos
    W->>A: cria cobrança (boleto híbrido + Pix) com split<br/>taxa adm → conta imobiliária · restante → subconta proprietário
    A-->>DB: charge registrada (id externo, linha digitável, QR Code)
    Note over A: locatário paga
    A-->>W: webhook payment.confirmed (assinado, idempotente)
    W->>DB: baixa no contas a receber + agenda repasse
    W->>Z: recibo PDF p/ locatário + aviso ao proprietário
    W->>N: emite NFS-e sobre a TAXA DE ADMINISTRAÇÃO
    N-->>W: webhook nota autorizada
    W->>DB: vincula nota ↔ cobrança ↔ contrato (painel de conciliação)
```

Regras tratadas no motor: multa e juros configuráveis, desconto por pontualidade, segunda via, baixa manual (pagamento por fora), descontos de manutenção abatidos do repasse com comprovante, extrato mensal de repasse ao proprietário.

### 4.2 Upload de foto com marca d'água

Upload → Storage (original privado) → job `watermark` (Pillow aplica logo do tenant) → grava versão marcada → vitrine/portais/API pública servem **apenas a versão marcada**.

### 4.3 Contrato + assinatura

Template com variáveis (partes, imóvel, valores, índice IGP-M/IPCA, vigência, garantia) → PDF → envelope ClickSign v3 → webhooks de status (visualizado/assinado/recusado) → documento assinado no Storage → disponível nos portais. Alertas de vencimento 90/60/30 dias e reajuste anual automático pelo índice contratado (tabela de índices alimentada por job).

---

## 5. Segurança

- RLS em todas as tabelas de negócio; testes automatizados de isolamento entre tenants.
- RBAC: papéis (Admin, Gestor, Corretor, Financeiro, Atendimento, Vistoriador, RH) × permissões granulares (ver/criar/editar/excluir/aprovar) por módulo.
- Log de auditoria (`core.audit_log`) para ações sensíveis: edição de contrato, estorno, exclusões.
- Webhooks: validação de assinatura do provedor + idempotência por `event_id`.
- API pública: API key por tenant com escopo somente-leitura de imóveis + captura de leads, rate limit.
- Segredos por ambiente via `.env` (nunca commitados); modo sandbox/mock para todos os provedores em dev.

---

## 6. Deploy

- **VPS Ubuntu 24.04** com Docker Compose: `api`, `worker`, `redis`, `caddy` (reverse proxy com TLS automático e wildcard `*.sistema.com.br`).
- Frontend pode ser servido pelo Caddy no VPS ou publicado na **Vercel** (mesma origem de API via subdomínio).
- Supabase gerenciado (banco, auth, storage) — sem estado no VPS além do Redis.

---

## 7. Fases de execução

| Fase | Entrega | Status |
|---|---|---|
| 0 | Arquitetura + ER + decisões (este documento) | ✅ aguardando aprovação |
| 1 | Fundação: multi-tenant, auth, RBAC, white label, clientes, imóveis (marca d'água), financeiro central básico | — |
| 2 | Locação core: CRM de locação, contratos + ClickSign, cobrança com split (Asaas sandbox), recibos | — |
| 3 | Financeiro avançado: NFS-e + conciliação, repasses, multas/juros/reajustes, relatórios do proprietário | — |
| 4 | Operação: chaves, vistorias com laudo PDF, chamados de manutenção | — |
| 5 | Atendimento: inbox WhatsApp, chatbot, indicadores, VoIP, CS e indicações | — |
| 6 | Portais (locatário/locador) e site/API pública | — |
| 7 | RH + casca do módulo Vendas | — |
