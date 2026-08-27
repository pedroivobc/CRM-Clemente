# PROGRESS

## Vitrine — melhorias em série (2026-07-26) ✅

Cinco entregas empacotadas depois do briefing do Pedro Ivo. Cada etapa
comitada em separado para facilitar reversão.

**Etapa 1 — Campos tipados.** `area_util`, `bedrooms`, `suites`, `bathrooms`,
`parking_spots`, `pet_allowed`, `republic_allowed`, `has_leisure_area`
promovidos de `features` (jsonb) para colunas. Filtros SQL diretos na vitrine
pública e nos portais. Backfill de tudo que já estava no jsonb. Impedimentos
de publicação passaram a exigir área útil, quartos (exceto para tipologias
não-residenciais como terreno) e IPTU (zero conta como isento).

**Etapa 2 — Marca d'água sutil.** Padrão baixou de 0.65 para 0.35, logo caiu
para 15% da largura da foto e margem para 2%. O worker lê `watermark_settings`
por tenant (opacidade, posição, ligado/desligado, aplicar em site/portal). Ao
editar as preferências, reprocessa toda a carteira do tenant.

**Etapa 3 — Vídeo do imóvel.** Coluna `video_url` (YouTube ou Vimeo). Helper
`video_embed_url` do domínio deriva o formato de embed; site pronto e widget
renderizam num iframe 16:9 abaixo da galeria. Admin cadastra via URL.

**Etapa 4 — Legenda para Instagram e Facebook.** Gerador determinístico em
`app/domain/social.py`: headline (tipo/quartos/bairro/finalidade), preço em
BRL, descrição condensada, quadro de specs, diferenciais (pet, república,
lazer), CTA com WhatsApp e URL, hashtags derivadas de bairro/cidade/UF/tipo.
Instagram recebe a lista completa (limite prático 30, 2.200 chars); Facebook
fica com 5 e 4.000 chars. Endpoint `GET /properties/{id}/caption?platform=` e
botão "Copiar legenda" na ficha administrativa.

**Etapa 5 — Feeds VRSync e Chaves na Mão.** `app/domain/feeds.py` produz XML
pronto para ZAP/VivaReal/OLX (via VRSync) e para Chaves na Mão. Endpoints
públicos `/public/{key}/feed/vrsync.xml` e `/feed/chavesnamao.xml` só listam
imóveis com `publish_portals`, respeitando `address_visibility` (cidade,
bairro e UF nunca somem; rua e número dependem da política do proprietário).
Fotos vêm marcadas ou limpas conforme `watermark_settings.apply_on_portals`.

### Verificação
Suite total: **353 passes** (307 antes + 15 do social + 14 dos feeds
puros + 2 dos feeds via HTTP + 15 novos). Ruff limpo. Build do painel e do
site pronto sem erros.

### Ainda em aberto
- UI para editar `watermark_settings` (hoje só via API).
- Painel para acompanhar `portal_publications` (feed é read-only; o portal
  ingesta e responde).
- Botão "Copiar" que também abra o Instagram/Facebook nativos (deeplink).

---

## Vitrine — site pronto (`apps/site`) (2026-07-25) ✅

Terceira das três saídas do cadastro: um site inteiro para a imobiliária que
não tem site nenhum ou quer trocar o atual. Sobe num subdomínio do sistema
(`aurora.sistema.com.br`) ou em domínio próprio (`www.aurora.com.br`),
descobre a própria vitrine pelo host e consome só a API pública. O mesmo
build serve todas as imobiliárias.

### Entregue

**Banco (`0012_resolve_by_host.sql`)** — `core.resolve_public_key_by_host`
(SECURITY DEFINER) aceita subdomínio nu, host completo ou custom_domain e
devolve a chave pública. Só tenants ativos.

**API pública** — endpoint `GET /public/by-host?host=...` na sub-app pública,
protegido pelo mesmo rate limit da leitura.

**Site (`apps/site`)** — SPA React dedicada (200 KB, 65 KB gzip), sem
dependência do painel administrativo:
- Home com hero (chamada do tenant + busca rápida) e grade de destaques.
- `/imoveis` — grade com filtros (finalidade, tipo, bairro, teto de preço) e
  ordenação; paginação "carregar mais"; querystring sincronizada.
- `/imoveis/:slug` — galeria, chips com specs, descrição, ficha em duas
  colunas, sidebar sticky com preço, WhatsApp (deep link com o código do
  imóvel), telefone clicável e formulário de lead com honeypot.
- `/contato` — telefone, WhatsApp, e-mail e mensagem geral.
- Cor primária do tenant injetada como variável CSS a partir de `/showcase`.

### Verificação
- 3 testes do endpoint `/by-host` (subdomínio nu, host completo, host
  desconhecido → 404), somando 284 no total. Build limpo.
- Home, listagem, detalhe, contato e mobile conferidos por captura, sem
  erros de console.

### Próximo da vitrine
- Feed VRSync para ZAP/VivaReal/OLX.
- Rotação da chave pública.
- Aplicar `watermark_settings` no worker (hoje a opacidade é fixa).
- Pré-renderização/SSR para SEO pleno.

---

## Vitrine — widget embutível (2026-07-25) ✅

Script `widget.js` que a imobiliária cola no HTML do site (WordPress, Wix ou
próprio) e vê a grade dos seus imóveis renderizada, consumindo a API pública.
Fecha a segunda das três saídas do cadastro: para quem já tem site, é só uma
linha de código.

### Entregue
- `apps/web/public/widget.js` — vanilla, ~19 KB, sem dependências, isolado do
  CSS anfitrião por **Shadow DOM** (o CSS do site não vaza para o widget e
  vice-versa).
- Filtros (finalidade, tipo, bairro, teto de preço) e ordenação (recentes,
  menor/maior preço, maior área) montados a partir das facetas devolvidas por
  `/showcase`. Paginação "carregar mais". Cor primária herdada da marca do
  tenant.
- Detalhe em modal: galeria com scroll horizontal, ficha, botão de WhatsApp
  já com o código do imóvel na mensagem, formulário de lead com honeypot e
  roteamento por finalidade (venda→vendas, locação→locação).
- Página de demonstração em `apps/web/public/widget-demo.html` — simula um
  site de terceiro (fonte serifada, cabeçalho próprio) e mostra o widget
  isolado. Link "Ver funcionando" na aba Vitrine e API das Configurações.
- Proxy dev do Vite mapeia `/public` para a API.

### Verificação
- Grade, detalhe e mobile conferidos por captura, sem erros de console.
- Medição direta pelo Playwright confirma o sheet centralizado em 860 px
  quando a viewport tem 1200 px; o resto do teste visual da coisa aqui foi
  ilusão de escala em captura 2×.

---

## Vitrine — API pública de imóveis (2026-07-25) ✅

A primeira das três saídas do cadastro: uma API de leitura, sem login, que o
site da imobiliária, o do corretor autônomo e um widget embutido consomem para
exibir os imóveis. É o diferencial direto contra o Robust CRM, que tranca esse
acesso atrás do suporte — aqui os dados são da imobiliária.
Detalhes em `docs/API-PUBLICA-VITRINE.md`.

### Entregue

**Banco (`0011_public_showcase.sql`)**
- `core.tenant_public`: chave publicável (`pub_<32 hex>`) e contato da vitrine
  (whatsapp, phone, email, headline, `lead_capture_enabled`), semeada no
  provisionamento e no backfill.
- `core.resolve_public_tenant` (`SECURITY DEFINER`): resolve chave → tenant
  ativo devolvendo só o id, sem vazar dado de negócio.

**API pública (`app/modules/public_showcase.py`)** — sub-app isolada em
`/public`, CORS aberto (o widget roda no domínio do cliente), rate limit em
memória por IP (`app/core/ratelimit.py`).
- `GET /{key}/showcase`: marca, contato e facetas de filtro.
- `GET /{key}/properties`: só o publicado, filtros (finalidade, tipo, cidade,
  bairro, quartos, faixa de preço, busca) e ordenação (recentes, menor/maior
  preço, maior área); endereço no nível permitido; `whatsapp_url` pronto por
  imóvel.
- `GET /{key}/properties/{slug}`: detalhe por slug ou código.
- `POST /{key}/leads`: cai no funil certo (venda/locação), com honeypot e
  rate limit apertado.

**API autenticada**: `GET/PUT /properties/settings/showcase` para a imobiliária
ler a chave e editar o contato.

**Frontend**: aba **Vitrine e API** em Configurações — chave copiável,
endpoints, snippet do widget e o formulário de contato.

### Verificação
- 281 testes (10 do fluxo público, incluindo isolamento entre tenants,
  honeypot e roteamento de lead por finalidade). `ruff`/`tsc`/build OK, aba
  conferida por captura.

### Próximo da vitrine
- O `widget.js` que consome estes endpoints e desenha a grade no site do
  cliente (o snippet já é mostrado).
- Site pronto hospedado; feed VRSync para os portais; rotação da chave.

---

## Vitrine — fundação da publicação de imóveis (2026-07-25) ✅

Primeiro passo da integração do cadastro com o site da imobiliária/corretor e
com os portais. Antecedido por pesquisa de campo nos sites de JF
(`docs/PESQUISA-SITES-IMOBILIARIAS-JF.md`), que apontou os dois bloqueios
reais: não havia controle de publicação nem política de exibição de endereço.

### Entregue

**Banco (`0010_publishing.sql`)**
- Flags de publicação por imóvel (`publish_site`, `publish_portals`,
  `is_exclusive`, `published_at`), independentes do status operacional.
- `address_visibility` (completo / rua / bairro), espelhando o displayAddress
  do VRSync — o proprietário decide até onde o endereço aparece.
- Campos do VRSync: `usage_type`, `year_built`, `floors`, `unit_floor`,
  `lot_area`, `rental_warranties` (com gatilho de validação), `slug`.
- Vocabulário de tipos ampliado de 8 para 24, cobrindo o que o mercado usa.
- `portal_publications`: rastreio por canal (ZAP/VivaReal/OLX/site), com erro
  e data de sincronização — para saber por que um anúncio sumiu do portal.
- `watermark_settings`: marca d'água configurável por tenant **e por canal**
  (marcar no site, foto limpa no portal), semeada no provisionamento.

**Domínio (`app/domain/publishing.py`)** — funções puras
- `build_slug` no padrão SEO dos sites de JF (tipo-quartos-bairro-cidade-uf-
  transação-código), com o código garantindo unicidade.
- `public_address` aplica a política de exibição; cidade, bairro e UF nunca
  são escondidos (o portal os exige).
- `publication_blockers`: o que falta para o imóvel ir ao ar, cruzando
  exigência comercial (foto, preço) com a do portal (título, descrição,
  bairro) e o bom senso (imóvel vendido não fica anunciado).
- `whatsapp_link` no padrão capturado na pesquisa (código + URL na mensagem).
- Mapa `kind → PropertyType` do VRSync.

**API** — o cadastro ganhou os campos novos; publicar (`POST
/properties/{id}/publish`) é **recusado com a lista do que falta** quando há
impedimento, e despublicar nunca é barrado. A ficha devolve `slug`,
`public_address`, `publish_blockers` e `is_publishable`. Configuração de marca
d'água em `GET/PUT /properties/settings/watermark`.

**Frontend** — painel de Publicação na ficha do imóvel: interruptores de site
e portais (travados enquanto houver pendência, com a lista visível), seleção
do nível de endereço com prévia do que o visitante vê, exclusividade e o
caminho público do anúncio.

### Verificação
- 271 testes (20 do domínio da vitrine, 13 do fluxo de publicação, mais os das
  fases anteriores). `ruff` limpo, `tsc` e build OK, painel conferido por
  captura nos estados no ar, bloqueado e endereço liberado.

### Próximos passos da vitrine (não entregues aqui)
- Endpoint público read-only por tenant + widget de embutir (a peça que ganha
  do Robust CRM, que tranca isso atrás do suporte).
- Geração do site pronto (subdomínio/domínio próprio) e do feed VRSync.
- Aplicar `watermark_settings` no worker (hoje a marca usa opacidade fixa).
- Confirmar com o Canal Pro a regra de marca d'água e as exigências do CRECI
  antes de publicar de fato.

---

## Fase 4 — Operação (2026-07-25) ✅

Chaves, vistorias e chamados de manutenção: a parte do dia a dia que hoje vive
em caderno, grupo de WhatsApp e memória de quem atendeu.

### Entregue

**Banco (`supabase/migrations/0009_operations.sql`)** — 17 tabelas
- `keys`: `property_keys` com posição no quadro, `key_movements` com prazo de
  devolução e assinatura de quem levou.
- `inspections`: vistoria → cômodos → itens → fotos, mais leitura de medidores
  e `issues` com responsabilidade, estado de entrada e estado de saída.
- `maintenance`: prestadores com especialidades e nota, chamados com código
  `CH-0001`, orçamentos, eventos, fotos antes/depois, avaliações e a regra de
  alçada do tenant (padrão R$ 300,00).

**Domínio (`app/domain/operations.py`)** — funções puras
- `compare_inspections`: aponta o que piorou entre entrada e saída e **sugere**
  a responsabilidade, sempre carregando os dois estados que motivaram a
  sugestão. Piora de um degrau fica indefinida (pode ser desgaste); de dois ou
  mais, sugere locatário; item que não existia na entrada não vira cobrança.
- `who_approves`: quem precisa aprovar o orçamento, e por quê.
- `key_status`, `inspection_progress`, `cheapest_quote`, `quote_spread`,
  `average_rating`.

**API** — 26 rotas novas (109 no total)
- Chaveiro: cadastro, retirada com assinatura desenhada na tela, devolução,
  histórico e alerta de chave fora do prazo.
- Vistorias: roteiro padrão de 5 cômodos, estado por item, foto por item,
  medidores, conclusão com comparativo automático e **laudo em PDF com a marca
  da imobiliária** (WeasyPrint, fotos embutidas como data URI).
- Chamados: abertura, triagem (define quem paga), até três orçamentos,
  aprovação conforme a alçada, execução, conclusão com lançamento no
  financeiro e avaliação do prestador.

**Frontend**
- Chaveiro com alerta de atraso no topo e devolução em um clique.
- Tela de vistoria **mobile-first**: cabeçalho fixo com o progresso, quatro
  botões grandes de estado por item, câmera do celular por item, cômodo
  concluído recolhe sozinho.
- Chamado com trilha do fluxo, comparação de orçamentos com o menor destacado,
  aviso de quem aprova e por quê, histórico em ordem cronológica e avaliação.

### Descobertas
- Uma chave fora do prazo tinha botão de devolver, mas a que estava só
  emprestada não: a listagem vinha do chaveiro, e é a **retirada** que carrega
  o identificador usado para devolver. A seção passou a ler as retiradas em
  aberto.
- `payload.notes or f"..." if cost else "..."` descartava silenciosamente a
  observação da equipe quando o chamado era concluído sem custo — precedência
  de operador, corrigida e coberta por teste.
- Valores apareciam como `1180.00` no histórico e nos campos de formulário.
  Interface em português escreve `R$ 1.180,00` e aceita vírgula: criados
  `app/core/format.brl` no backend e `toDecimalInput`/`toDecimalString` no
  frontend (aplicados também ao desconto de repasse, que já sofria disso).

### Verificação
- 238 testes passando (30 do fluxo de operação, 26 do domínio de vistoria e
  alçada, mais os das fases anteriores).
- `ruff` limpo, `tsc` e build do frontend OK, telas conferidas por captura em
  1440px e em 390px.

### Pendências
- Prestador ainda não recebe o pedido de orçamento por WhatsApp: depende da
  Evolution API, sem credencial.
- Laudo de vistoria ainda não é assinado eletronicamente (ClickSign).

---

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
2. **Vendas — biblioteca de modelos de contrato:** compra e venda simples,
   permuta, dação em pagamento, compra com financiamento bancário e compra e
   venda com pagamento parcelado, como minutas para a imobiliária escolher e
   levar ao jurídico. Imóvel de empreendimento usa o modelo da construtora. O
   sistema **não** gera contrato de compra e venda (ver ADR 21).
3. **Acompanhamento de financiamento:** etapas do processo junto ao banco,
   ligadas ao negócio fechado.
4. **Integrações reais:** substituir os mocks assim que houver credenciais de
   sandbox (Asaas, ClickSign, Focus NFe, Evolution).
