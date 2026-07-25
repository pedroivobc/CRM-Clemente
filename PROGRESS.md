# PROGRESS

## Fase 2 — Locação core (2026-07-24) ✅

CRM de locação, contratos com assinatura eletrônica e o motor de cobrança com
split — o coração do módulo.

### Entregue

**Banco (`supabase/migrations/0007_rentals.sql`)**
- Funil próprio: `pipelines`, `pipeline_stages` (com SLA por etapa),
  `leads`, `lead_stage_history`, `visits`, `loss_reasons`, `credit_analyses`.
- Contratos: `contracts` (taxa de administração por contrato, índice de
  reajuste, multa, juros, garantia), `contract_parties`, `contract_templates`,
  `contract_adjustments`, `signature_requests`.
- Cobrança: `charges`, `charge_items`, `charge_splits`, `payments`.
- Repasse: `payouts`, `payout_items`.
- `price_indexes` (IGP-M/IPCA, global) e `webhook_events` (idempotência).
- Funil, motivos de perda e template de contrato semeados no provisionamento
  de todo tenant com locação.

**Motor financeiro (`app/domain/`)** — funções puras, sem banco nem rede
- `billing.py`: composição da cobrança, multa e juros por atraso, desconto por
  pontualidade, split e extrato de repasse.
- `adjustment.py`: índice acumulado composto, reajuste anual, aniversário do
  contrato e marcos de alerta de vigência (90/60/30 dias).

**API** — 31 rotas novas (67 no total)
- `rentals`: quadro do funil com tempo por etapa e SLA, movimentação entre
  etapas com histórico, perda com motivo, distribuição de leads por
  round-robin, análise cadastral com renda mínima configurável.
- `contracts`: criação com partes, texto gerado do template, envio para
  assinatura, ativação, encerramento, prévia e aplicação do reajuste,
  alertas de vigência e de reajuste devido.
- `billing`: geração mensal idempotente, boleto e Pix, segunda via, baixa
  manual, cancelamento, repasses e lançamento de descontos de manutenção.
- `webhooks`: pagamento e assinatura, fora de `/api/v1`, com verificação de
  assinatura e idempotência por evento.

**Frontend**
- Funil kanban com arrastar-e-soltar entre etapas, marcação de SLA estourado,
  corretor responsável e registro de perda com motivo.
- Contratos: lista com situação, alerta de vigências a vencer, ficha com
  valores, partes, condições, texto gerado e reajuste com prévia do índice.
- Cobranças: competência do mês, indicadores (em aberto, recebido, taxa de
  administração), tabela com split por linha, segunda via com cópia da linha
  digitável e do Pix, baixa manual avisando quando haverá multa, e o extrato
  de repasse por proprietário com lançamento de desconto.

### Regras do dinheiro (cobertas por teste)
- A taxa de administração incide **sobre o aluguel**, nunca sobre condomínio
  e IPTU — esses são repasse integral ao proprietário.
- Multa percentual única + juros diários proporcionais ao atraso; pagamento em
  dia ou adiantado não gera encargo.
- Desconto por pontualidade só vale até o vencimento.
- Rateio entre coproprietários fecha no centavo: a última cota absorve a sobra.
- Repasse pode ficar negativo (reparo maior que o aluguel) e o extrato mostra
  o saldo devedor em vez de zerar em silêncio.
- Reajuste usa o índice **acumulado** de doze meses, composto
  multiplicativamente; deflação é aplicada como vem.

### Verificação
- 137 testes passando: 35 do motor financeiro, 12 dos webhooks, 27 do fluxo de
  locação ponta a ponta, além dos 63 da Fase 1. `ruff` limpo, build do
  frontend OK, telas conferidas por captura.

### Decisões e descobertas
- **Webhook chega sem tenant.** É ele que precisa descobrir a que imobiliária
  a cobrança pertence, então a resolução usa funções `SECURITY DEFINER` que
  devolvem só o vínculo (id + tenant), nunca dado de negócio — mesmo padrão da
  resolução de usuário.
- **Idempotência antes do processamento.** O evento é gravado com
  `(provider, event_id)` único antes de qualquer efeito; reentrega responde
  200 e não credita de novo.
- **Baixa manual usa as mesmas regras do fluxo automático**, para os dois
  caminhos darem o mesmo número.
- **Falha no gateway não perde a cobrança**: ela fica registrada localmente e
  pode ser reemitida.
- O seletor de competência virou dois selects: o `input type="month"` é
  rotulado pelo idioma do navegador, e a interface é toda em português.

### Pendências
- Credenciais sandbox (Asaas, ClickSign) para trocar os mocks pelas
  integrações reais — tudo já roda contra as interfaces definidas.
- Série do IGP-M/IPCA: a tabela existe e o cálculo está pronto, falta o job
  que importa os índices do Banco Central.
- Recibo de quitação em PDF e notificação por WhatsApp no pagamento
  confirmado (dependem da Fase 3 e da Fase 5).

---

## Fase 1 — Fundação (2026-07-24) ✅

Multi-tenant, autenticação, RBAC, white label, cadastro de clientes e imóveis
(com marca d'água) e financeiro central básico.

**Entregue:** migrations `core`/`crm`/`properties`/`finance` + casca de
`sales` com RLS; API FastAPI com tenancy por subdomínio, JWT do Supabase,
RBAC granular e auditoria; worker arq com marca d'água (Pillow); providers
abstratos com mock; frontend React com white label em runtime, painel,
clientes, imóveis, financeiro e configurações; infra Docker Compose, Caddy e
CI com Postgres de serviço.

**Decisões:** testes rodam com papel comum de banco (superusuário ignora RLS
silenciosamente); dados só pela API, RLS como segunda defesa; identificadores
e dinheiro em monoespaçada com etiqueta de código.

**Correções encontradas na verificação:** busca por termo sem dígitos casava
com todo cliente com CPF preenchido; `str.format` colidia com o literal
`'{}'` do SQL; situação do imóvel comunicada só por cor; cores de "Reservado"
e "Em manutenção" indistinguíveis.

---

## Fase 0 — Planejamento (2026-07-24) ✅

`docs/ARQUITETURA.md`, `docs/MODELO-DE-DADOS.md` e `docs/DECISOES-TECNICAS.md`
aprovados pelo cliente.

---

## Próximo: Fase 3 — Financeiro avançado

NFS-e automatizada sobre a taxa de administração com painel de conciliação,
fechamento e pagamento dos repasses com extrato em PDF, e relatórios do
proprietário (incluindo informe de rendimentos).
