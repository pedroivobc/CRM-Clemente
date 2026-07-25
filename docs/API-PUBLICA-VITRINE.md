# API pública da vitrine

API de leitura, sem autenticação, que o site da imobiliária, o site do corretor
autônomo e o widget embutido consomem para exibir os imóveis. É a peça que
devolve à imobiliária o controle dos próprios dados — em vez de ficarem presos
no CRM (o diferencial contra o Robust CRM, que tranca esse acesso atrás do
suporte).

Montada como **sub-aplicação isolada** em `/public`, com CORS aberto (o widget
roda no domínio do cliente). O resto da API segue restrito ao tenant.

## Autenticação: chave publicável

Cada imobiliária tem uma `public_key` (`pub_<32 hex>`), visível em
**Configurações → Vitrine e API**. Ela identifica a vitrine na URL e **não é
segredo**: só dá acesso ao que já foi publicado (`publish_site = true`). Se
vazar, basta trocá-la para invalidar embeds antigos.

A resolução `chave → tenant` passa por `core.resolve_public_tenant`
(`SECURITY DEFINER`), que devolve apenas o id de um tenant ativo. A partir daí
as consultas rodam sob RLS do tenant, então a vitrine de uma imobiliária nunca
enxerga o imóvel de outra.

## Endpoints

Base: `https://<host>/public/{public_key}`

### `GET /showcase`
Configuração da vitrine para o widget montar: marca (nome, cores, logo),
contato (whatsapp, phone, email, headline), `lead_capture_enabled` e as
**facetas** de filtro presentes na carteira publicada — finalidades, tipos,
cidades, bairros e a faixa de preço.

### `GET /properties`
Listagem paginada. Só imóveis com `publish_site = true`. O endereço sai no
nível definido em cada imóvel (`completo` / `rua` / `bairro`).

Filtros: `purpose` (venda|locacao), `kind`, `city`, `neighborhood`,
`bedrooms` (mínimo), `min_price`, `max_price`, `q` (busca em título, código e
bairro). Ordenação `sort`: `recentes` (padrão), `menor_preco`, `maior_preco`,
`maior_area`. Paginação: `page`, `page_size` (≤ 48).

Cada item traz `whatsapp_url` já pronto — o deep link com o código do imóvel e
o caminho do anúncio na mensagem.

### `GET /properties/{slug}`
Detalhe por slug (ou por código, para links curtos). Inclui descrição,
fotos com marca d'água, ficha e garantias de locação aceitas.

### `POST /leads`
Captura o interesse do visitante e joga no funil certo: **venda → funil de
vendas, locação → funil de locação**, deduzido pelo campo `interest` ou pela
finalidade do imóvel citado. Fonte gravada como `site`.

Corpo: `name`, `phone` (obrigatórios), `email`, `message`, `interest`,
`property_code`, e o campo-armadilha `website` (honeypot: se vier preenchido, a
requisição é aceita e **descartada** em silêncio). Responde `202`.

## Proteções

- **Honeypot** no formulário de lead descarta bots sem lhes dar retorno de erro.
- **Rate limit** em memória por IP: leitura 120/min, envio de lead 5/min. É a
  primeira barreira, por instância; em produção o Caddy à frente soma o limite
  de borda.
- **`lead_capture_enabled`** permite à imobiliária desligar a captação.
- Chave inválida → `404`; nenhuma informação sobre a existência do tenant.

## Configuração pela imobiliária

`GET`/`PUT /api/v1/properties/settings/showcase` (autenticado) leem e editam o
contato e a chamada da vitrine, e expõem a `public_key` para copiar. A chave é
gerada no provisionamento e não é editável por essa rota.

## O que ainda falta (roadmap da vitrine)

- O `widget.js` em si (o snippet já é exibido; falta o script que consome estes
  endpoints e renderiza a grade no site do cliente).
- Site pronto hospedado (subdomínio ou domínio próprio).
- Feed VRSync gerado destes mesmos dados para ZAP/VivaReal/OLX.
- Endpoint para rotacionar a `public_key`.
