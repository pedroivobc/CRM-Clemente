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
| 20 | Módulo Vendas | ~~Somente casca~~ → **superado**: virou módulo autônomo na entrega de 2026-07-25 (funil, propostas, negócios, comissões, painel próprio) | Exigência do prompt era casca na Fase 1; o cliente pediu o módulo completo em seguida. |

## Decisões acrescentadas depois da aprovação

| # | Tema | Decisão | Justificativa |
|---|---|---|---|
| 21 | **Contrato de compra e venda** | O sistema **não gera** contrato de compra e venda. Oferece uma **biblioteca de modelos** para a imobiliária escolher, editar e levar ao seu jurídico: compra e venda simples, permuta, dação em pagamento, compra com financiamento bancário e compra e venda com pagamento parcelado. Em imóvel de empreendimento, o modelo é o da construtora. | Decisão do cliente (2026-07-25). Gerar contrato de compra e venda automaticamente cria risco jurídico para o sistema e para a imobiliária: cada negócio tem particularidade (ônus, posse, condição suspensiva, regime de bens) que um gerador não enxerga. Minuta escolhida por gente e revisada por advogado ≠ contrato emitido por software. O mesmo raciocínio **não** se aplica à locação, onde o contrato é padronizado e a Lei do Inquilinato dá a moldura — por isso lá o sistema segue gerando. |
| 22 | Responsabilidade na vistoria | O comparativo entrada × saída **sugere** a responsabilidade e sempre carrega o estado de entrada e o de saída que motivaram a sugestão; a equipe confirma ou troca. Piora de um degrau fica `indefinido` (desgaste possível); de dois ou mais, sugere `locatario`; item sem registro na entrada nunca vira cobrança. | Cobrança de reparo é conversa delicada com o locatário. Um sistema que decide sozinho erra em silêncio e queima a relação; um que mostra o porquê dá à equipe argumento e espaço para discordar. |
| 23 | Alçada de aprovação de reparo | A imobiliária resolve sozinha o que está dentro do limite do tenant (padrão R$ 300,00) ou o que ela mesma paga; acima disso, quando quem paga é o proprietário, a decisão é dele. A tela sempre diz **quem aprova e por quê**. | É o dinheiro do proprietário saindo do repasse. O limite evita travar troca de resistência de chuveiro na burocracia, e o texto explícito evita que a equipe aprove no susto. |
| 24 | Custo do chamado no financeiro | Chamado concluído lança o custo por um de três caminhos, conforme quem paga: proprietário → desconto no repasse; locatário → cobrança avulsa; imobiliária → despesa própria. | Os três caminhos desembocam no financeiro central, cada um no seu lugar — sem planilha paralela para "o que a imobiliária adiantou". |

## Pontos que dependem de você (não bloqueiam a Fase 1)

1. **Domínio base** dos subdomínios (ex.: `sistema.com.br`) — necessário na Fase 6/deploy.
2. **Credenciais sandbox** (Asaas, ClickSign, Focus NFe) — necessárias a partir da Fase 2; até lá os mocks cobrem o desenvolvimento.
3. **Projeto Supabase**: usarei um projeto de desenvolvimento local (`supabase start`) na Fase 1; para publicar, precisarei das chaves do projeto real.
