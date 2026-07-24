# Decisões Técnicas (para aprovação antes da Fase 1)

Formato ADR resumido. Onde havia escolha em aberto no prompt, a recomendação está marcada com ✅ e a alternativa registrada — basta aprovar ou apontar a troca.

| # | Tema | Decisão | Justificativa |
|---|---|---|---|
| 1 | Worker de filas | ✅ **arq** (alternativa: Celery) | Nativo asyncio como o FastAPI, um único runtime Python, footprint pequeno para VPS modesta. Celery é mais maduro, mas pesado para 1–20 usuários por tenant. Interface de enfileiramento fica isolada em `app/workers/queue.py` — trocar por Celery depois custa pouco. |
| 2 | Acesso ao banco | Frontend **nunca** acessa tabelas de negócio via supabase-js; tudo passa pela API FastAPI | Regras de split, RBAC granular e auditoria precisam viver no backend. RLS permanece como **segunda linha de defesa** (conexão com `SET LOCAL app.tenant_id`). Supabase Auth continua sendo o emissor de JWT (o frontend usa supabase-js só para auth e upload direto assinado). |
| 3 | Migrations | SQL puro versionado em `supabase/migrations` (CLI do Supabase) | RLS, triggers e schemas múltiplos são mais legíveis em SQL do que via ORM; o diff de banco fica auditável no git. |
| 4 | ORM na API | SQLAlchemy 2.0 (async) + Pydantic v2 para schemas de entrada/saída | Padrão FastAPI; modelos tipados sem acoplar migrations ao ORM. |
| 5 | Pagamentos | **Asaas** como `PaymentProvider` padrão (split nativo, boleto híbrido + Pix, subcontas white label) | Exigência do prompt. Abstração permite Pagar.me/Efí/Inter depois. Dev/testes usam sandbox Asaas + `MockPaymentProvider`. |
| 6 | Assinatura eletrônica | **ClickSign API v3** como `SignatureProvider` | Exigência do prompt. Webhooks assinados; documento final no Storage. |
| 7 | NFS-e | **Focus NFe** como `InvoiceProvider` (alternativa: eNotas) | Exigência do prompt. Nota emitida **somente sobre a taxa de administração**. |
| 8 | WhatsApp | **Evolution API** padrão, `MessagingProvider` abstrai troca por Meta Cloud API | Exigência do prompt. Templates de mensagem centralizados por tenant. |
| 9 | VoIP | `VoiceProvider` abstrato; primeira implementação ✅ **Zenvia Voice** (alternativas: Sinch, Asterisk/ARI) | Click-to-call + gravação via API REST simples; decisão final só na Fase 5. |
| 10 | Geração de PDF | ✅ **WeasyPrint** (HTML/CSS → PDF) para recibos, laudos, extratos, holerites, ficha do imóvel | Templates HTML com Jinja2 reutilizam o branding (CSS vars do tenant); mais produtivo que ReportLab. |
| 11 | Marca d'água | **Pillow** no worker; original privado + versão marcada pública | Exigência do prompt (logo do tenant). |
| 12 | Frontend | React 18 + Vite + TypeScript + Tailwind v4 + shadcn/ui; TanStack Query + Router; react-hook-form + zod | Stack exigida; Query/Router/zod são o ecossistema padrão atual. Tema shadcn consome as CSS variables do branding. |
| 13 | Portais | Mesmo app `web`, com áreas separadas por papel do usuário (`/app`, `/portal/locatario`, `/portal/locador`) | Um build só, code-splitting por rota; portais mobile-first. Site público do tenant (Fase 6) é app separado. |
| 14 | Idioma/formatação | Interface 100% pt-BR; timezone `America/Sao_Paulo`; datas/moeda via `Intl` | Exigência do prompt. |
| 15 | Índices de reajuste | Tabela global `price_indexes` alimentada por job mensal (fonte: API do Banco Central/SGS) com fallback de lançamento manual | Reajuste anual automático IGP-M/IPCA precisa da série histórica. |
| 16 | Testes | pytest (unit + integração) com cobertura obrigatória no motor financeiro (split, juros, multa, repasse) e webhooks (assinatura + idempotência); Vitest no front | Exigência do prompt. Mocks de provider permitem CI sem credenciais. |
| 17 | Webhooks | Endpoint por provedor, validação de assinatura, tabela `webhook_events` com `event_id` único (idempotência), processamento assíncrono via fila | Pagamento confirmado dispara cadeia crítica (baixa → recibo → NFS-e → WhatsApp); não pode duplicar nem perder evento. |
| 18 | Subdomínios | Caddy com wildcard TLS `*.sistema.com.br`; middleware resolve tenant pelo `Host` | Exigência do prompt; Caddy simplifica certificados no VPS. |
| 19 | CI | GitHub Actions: lint (ruff, eslint), type-check (mypy, tsc), testes | Barato e garante as fases "funcionais e testadas". |
| 20 | Módulo Vendas | Somente casca: flag `module_sales`, rotas protegidas, menu condicional, tabelas `sales_*` vazias de lógica, tela "Em breve" | Exigência do prompt — nada além disso nesta fase. |

## Pontos que dependem de você (não bloqueiam a Fase 1)

1. **Domínio base** dos subdomínios (ex.: `sistema.com.br`) — necessário na Fase 6/deploy.
2. **Credenciais sandbox** (Asaas, ClickSign, Focus NFe) — necessárias a partir da Fase 2; até lá os mocks cobrem o desenvolvimento.
3. **Projeto Supabase**: usarei um projeto de desenvolvimento local (`supabase start`) na Fase 1; para publicar, precisarei das chaves do projeto real.
