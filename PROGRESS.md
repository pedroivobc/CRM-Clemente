# PROGRESS

## Módulo de Vendas (2026-07-25) ✅

O módulo de Vendas deixa de ser casca e passa a ser **autônomo**: operação,
indicadores e financeiro próprios. Uma imobiliária que contrate apenas vendas
tem o produto completo, sem depender de nada da locação — e vice-versa.

### Entregue

**Banco (`supabase/migrations/0008_sales.sql`)**
- Funil próprio: `pipelines`, `pipeline_stages`, `leads`, `lead_stage_history`,
  `visits`, `loss_reasons` — separados dos de locação.
- `proposals` com contraproposta encadeada (`parent_id` + `round`), preço
  pedido × oferta, sinal e forma de pagamento.
- `deals` com valor da venda, forma de pagamento, escritura e entrega de
  chaves; `commissions` com o rateio; `commission_rules` com a regra do tenant.
- Provisionamento condicional: o tenant recebe o funil de vendas apenas se o
  plano incluir o módulo.

**Motor de vendas (`app/domain/sales.py`)** — funções puras
- Comissão sobre o valor da venda com rateio entre imobiliária, corretor
  captador e corretor vendedor, fechando no centavo.
- Cota de corretor sem dono volta para a imobiliária em vez de ficar órfã.
- Avaliação da proposta contra o preço pedido, inclusive ágio (oferta acima
  do pedido aparece como diferença negativa, não zero).
- Conversão do funil e indicadores do período (VGV, ticket médio, ciclo).

**API** — 16 rotas novas (83 no total)
- Funil, propostas (criar, contrapor, aceitar, recusar), negócios (fechar,
  concluir, cancelar), pagamento de comissão e regra de rateio.
- `/sales/dashboard`: VGV, ticket médio, comissão gerada, ciclo médio, valor
  em negociação, conversão do funil e ranking de corretores.
- `/rentals/dashboard`: carteira administrada, receita recorrente prevista,
  inadimplência, repasses do mês, vigências a vencer e reajustes devidos.

**Frontend**
- Funil de vendas em kanban, propostas com contraproposta e decisão, negócios
  com o rateio da comissão expansível e pagamento por corretor.
- Painel inicial montado conforme o plano: com um módulo só, abre direto nele;
  com os dois, abas separam Carteira, Locação e Vendas.

### Autonomia entre módulos (coberta por teste)
- Funis, etapas e motivos de perda são independentes: "Negociação" só existe
  em vendas, "Análise cadastral" só em locação.
- Um lead de venda não aparece no funil de locação.
- Plano `locacao` recebe 403 em toda rota de vendas e não tem sequer o funil
  de vendas criado no banco; plano `venda` não recebe o funil de locação.
- Os painéis não emprestam número um do outro: o de vendas não conhece
  contratos, o de locação não conhece VGV.
- Ponto de encontro deliberado: os dois alimentam o **mesmo financeiro
  central**, cada um pela sua conta — taxa de administração na conta 1.01
  (centro de custo Locação) e comissão de venda na 1.02 (centro Vendas).

### Verificação
- 182 testes passando: 19 do motor de comissões, 26 do fluxo de vendas e da
  autonomia, 35 do motor de locação, 12 dos webhooks, mais os da fundação.
- `ruff` limpo, build do frontend OK, telas conferidas por captura nos três
  planos (só vendas, só locação, completo).

### Pendências
- Credenciais de sandbox seguem ausentes por opção do cliente; todos os
  provedores rodam em mock (Asaas, ClickSign, Focus NFe, Evolution).
- Vendas: contrato de compra e venda com assinatura eletrônica e o
  acompanhamento de financiamento junto ao banco ainda não existem.
- Locação: NFS-e sobre a taxa, extrato de repasse em PDF e informe de
  rendimentos (Fase 3).

---

## Fase 2 — Locação core (2026-07-24) ✅

CRM de locação, contratos com assinatura e o motor de cobrança com split.

**Entregue:** schema `rentals` com RLS; motor financeiro em funções puras
(taxa sobre o aluguel e não sobre encargos, multa e juros por atraso, desconto
por pontualidade, rateio entre coproprietários, extrato de repasse com
abatimento de manutenção, reajuste pelo índice acumulado); funil com SLA e
round-robin; contratos com template, assinatura, ativação e reajuste;
cobranças com geração mensal idempotente, boleto e Pix, segunda via e baixa
manual; webhooks de pagamento e assinatura com idempotência.

**Descobertas:** o webhook chega sem contexto de tenant e o RLS bloqueava a
busca — resolvido com funções `SECURITY DEFINER` que devolvem só o vínculo; o
`input type="month"` é rotulado pelo idioma do navegador, então a competência
virou selects próprios.

---

## Fase 1 — Fundação (2026-07-24) ✅

Multi-tenant, autenticação, RBAC, white label, clientes e imóveis (com marca
d'água) e financeiro central básico.

**Decisões:** testes rodam com papel comum de banco (superusuário ignora RLS
silenciosamente); dados só pela API, RLS como segunda defesa; identificadores
e dinheiro em monoespaçada com etiqueta de código.

---

## Fase 0 — Planejamento (2026-07-24) ✅

`docs/ARQUITETURA.md`, `docs/MODELO-DE-DADOS.md` e `docs/DECISOES-TECNICAS.md`
aprovados pelo cliente.

---

## Próximos passos possíveis

1. **Fase 3 — Financeiro avançado:** NFS-e sobre a taxa de administração com
   painel de conciliação, fechamento e pagamento dos repasses com extrato em
   PDF, informe anual de rendimentos.
2. **Vendas — contrato e financiamento:** contrato de compra e venda com
   assinatura eletrônica, acompanhamento do processo junto ao banco.
3. **Fase 4 — Operação:** chaves, vistorias com laudo em PDF e chamados de
   manutenção com prestadores.
