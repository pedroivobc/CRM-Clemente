# Sites de imobiliárias de Juiz de Fora — mapeamento de campo

Levantamento feito em 25/07/2026 para desenhar a **vitrine**: como o cadastro
de imóveis do sistema chega ao site da imobiliária, ao site do corretor
autônomo e aos portais.

Foram inspecionados os sites publicados de sete imobiliárias de Juiz de Fora
mais a documentação de integração do Grupo OLX (ZAP/VivaReal/OLX).

---

## 1. Quem manda no mercado local

A descoberta mais relevante não estava nos filtros: **o mercado de JF está
concentrado em dois fornecedores de plataforma**, e o site não é um produto
separado do CRM — é uma saída dele.

| Imobiliária | Plataforma | Observação |
|---|---|---|
| [Nogueira Imóveis](https://nogueiraimoveisjf.com.br/) | Robust CRM + Inovandoweb | Fotos servidas de `robustcrm.com.br/nogueiraimoveisjf` |
| [Select Imóveis](https://selectimoveisjf.com.br/) | Robust CRM + Inovandoweb | |
| [Clientt](https://clientt.com.br/) | Robust CRM + Inovandoweb | |
| [Brasil Imóveis](https://brasilimoveisjf.com.br/) | Robust CRM (mesmo vocabulário) | |
| [Universal Imóveis](https://universalimoveis.com.br/) | Robust CRM (mesmo vocabulário) | Telefones separados por Venda/Locação |
| [Souza Gomes](https://souzagomes.com.br/) | Robust CRM (origem do produto) | Site mais autoral do conjunto |
| [Decisão](https://www.imobiliariadecisaojf.com.br/) | ImobiBrasil | Segundo fornecedor |

O [Robust CRM](https://site.robustcrm.com.br/) nasceu de consultoria com a
Souza Gomes, cobra **R$ 599 a R$ 1.499/mês (5 a 20 usuários)** e inclui site
em todos os planos. É o nosso concorrente direto de preço e de praça.

**A brecha:** a [documentação dele](https://doc.robustcrm.io/) expõe webhook
de lead publicamente, mas o acesso aos imóveis em JSON "requer permissão
explícita do cliente e contato com o suporte". Ou seja: **os dados do imóvel
são do CRM, não da imobiliária.** Quem quer o próprio site, um widget no
WordPress ou uma landing page precisa pedir licença. É aí que dá para ganhar
o cliente — API de leitura documentada e aberta, sem pedir por favor.

---

## 2. Filtros — o vocabulário que o mercado espera

Os sete sites convergem para praticamente a mesma lista. O que aparece em
todos:

**Essenciais (todos os sites têm)**
- Finalidade: **Comprar / Alugar** (botão, não select — é a primeira decisão)
- Tipo de imóvel
- Localização: campo único "rua, bairro ou condomínio" (busca textual, não
  select de bairro)
- Faixa de preço
- Quartos
- **Código do imóvel** — busca direta, muito usada: o cliente liga citando o
  código que viu no portal

**Frequentes**
- Vagas de garagem, suítes, banheiros
- Área (m²)
- Em condomínio / com elevador

**Diferenciais do padrão Robust (presentes em 6 dos 7)**
- Posição (frente, fundos, lateral, meio, subsolo)
- Vista (com vista, sem vista, vista parcial)
- **Posição solar** (leste, norte, oeste, sul)
- Piso predominante, separado por **área social / cozinha / área íntima**
- Acesso (entrada social, lateral, de serviço)
- Topografia do terreno (plana, aclive, declive)
- Acessórios: piscina, churrasqueira, ar-condicionado, automação, alarme,
  espaço gourmet, academia, mobiliado

> Posição solar e topografia parecem exagero de cadastro, mas são exatamente o
> que um cliente de imóvel de médio/alto padrão pergunta. Vale ter os campos;
> não vale obrigar o preenchimento.

### Onde o mercado local é fraco
**Ordenação de resultados praticamente não existe.** Em nenhum dos sites
inspecionados encontrei "menor preço", "maior área" ou "mais recentes" de
forma explícita. É um vazio barato de preencher e que o usuário sente na hora.

### Vocabulário de tipos — o nosso está curto
Os sites de JF trabalham com ~20 tipos; nós temos 8. E há uma convenção
local: **o número de quartos entra no nome do tipo** ("Apartamento 2 quartos",
"Casa 3 quartos") porque é assim que o cliente fala e é assim que a URL indexa
no Google.

Tipos vistos em campo e ausentes do nosso `properties.kind`:
`cobertura`, `quitinete/kitnet`, `studio`, `sobrado`, `andar_corporativo`,
`predio`, `vaga_de_garagem`, `fazenda`, `granja`, `ponto_comercial`,
`casa_geminada`, `garden`, `casa_comercial`, `lote_em_condominio`.

---

## 3. Card da listagem

Composição encontrada, em ordem de destaque:

1. Foto de capa
2. **Código do imóvel** — sempre visível, sempre em destaque
3. Tipo + quartos ("Cobertura 3 quartos")
4. Bairro, cidade, UF
5. Área privativa em m²
6. Preço
7. Trecho da descrição
8. Botão "Mais detalhes"

**A exceção que vale copiar:** a Souza Gomes põe **foto e nome do corretor**
no card, e o botão diz *"Entre sem bater"* em vez de "Ver detalhes". Para o
caso do **corretor autônomo** que você citou, isso não é enfeite — o site
dele é a marca pessoal dele. O card precisa suportar os dois modos:
imobiliária (marca da empresa) e corretor (rosto e nome da pessoa).

---

## 4. Foto com logotipo da marca

Aqui a prática de campo contraria em parte o que o briefing pediu.

**O que encontrei:** nos sites Robust, as fotos vêm de um caminho de storage
por tenant (`robustcrm.com.br/<slug-da-imobiliaria>`), mas **não observei
logotipo sobreposto** nas imagens dos sites inspecionados. A marca aparece no
cabeçalho da página, não queimada na foto.

**O que a literatura do setor recomenda:** marca d'água discreta, **no canto**,
nunca centralizada — logo centralizado atrapalha a visualização e faz o
anúncio ser descartado pelo usuário
([Conecta Imobi](https://blog.conectaimobi.com.br/como-colocar-marca-dagua-em-fotos-de-imoveis/),
[Tecimob](https://tecimob.com.br/blog/a-importancia-do-uso-da-marca-dagua-nos-imoveis/)).

**Consequência para o nosso desenho:** já geramos duas versões (original
privado + marcada pública), o que está certo. Duas correções a fazer:

1. A marca d'água deve ser **configurável por tenant** — posição, opacidade e
   se aplica ou não. Imobiliária de alto padrão costuma não querer.
2. **Portal e site podem receber versões diferentes.** Faz sentido marcar a
   foto do site (onde o concorrente copia o anúncio) e mandar a foto limpa
   para o portal (onde a foto disputa atenção em uma grade). Hoje temos uma
   versão marcada só; precisa virar escolha por canal.

> Não consegui confirmar em fonte oficial se ZAP/VivaReal **recusam** foto com
> marca d'água — a documentação pública não trata disso e as buscas só
> retornaram recomendação editorial. **Tratar como pergunta em aberto** e
> confirmar com o Canal Pro antes de fechar a regra.

---

## 5. Página do imóvel e o contato — o achado mais aproveitável

A anatomia é estável entre os sites: título descritivo, código, preço,
condomínio, características (quartos/banheiros/vagas), descrição em texto
corrido, comodidades, localização com link para o Google Maps, galeria
(9 fotos no exemplo medido), e o bloco de contato.

**O link de WhatsApp é o item mais bem resolvido do mercado local.** Formato
capturado na Nogueira Imóveis:

```
https://wa.me/5532998510706?text=Olá,+estou+no+site,+no+imóvel+cód.+16152
+e+desejo+mais+informações!+https://nogueiraimoveisjf.com.br/imovel/
apartamento_2_quartos--lourdes--juiz_de_fora--mg--venda--cod-16152
```

Três coisas certas de uma vez: **identifica o imóvel pelo código**, **manda a
URL junto** (o corretor abre e vê o que a pessoa está olhando) e **já vem
escrito** — o cliente só aperta enviar. É o padrão a replicar.

Ao lado dele, um formulário com escolha do canal — **WhatsApp / Ligação /
E-mail** — mais telefone clicável (`tel:`) e e-mail. Universal separa os
números por departamento (Venda / Locação), o que faz sentido para quem tem
os dois módulos.

### O padrão de URL é caprichado e vale copiar

```
/imovel/apartamento_2_quartos--lourdes--juiz_de_fora--mg--venda--cod-16152
        └── tipo_quartos ──┘  └bairro┘ └─cidade─┘ └uf┘ └finalidade┘ └código┘
```

Tudo que o Google precisa está na URL, e existe atalho por código
(`/imovel/15607`) para quem chega com o número na mão.

### O que falta em todos eles
Nenhum dos sites inspecionados oferece **agendar visita**, **simular
financiamento**, **favoritar** ou **comparar imóveis** de forma visível. E não
achei **área do locatário / 2ª via de boleto** exposta nos sites que consegui
ler — o que é curioso, porque é o que mais gera ligação no balcão da locação.

---

## 6. Portais: o padrão VRSync (ZAP + VivaReal + OLX)

O [Grupo OLX](https://developers.grupozap.com/) consolidou ZAP, VivaReal e OLX
em um único padrão de integração: **VRSync**, em XML. O formato antigo "ZAP"
foi desligado. O feed é lido **2× por dia** (a cada 12h), e o CRM da
imobiliária publica um XML com toda a carteira.

Campos exigidos que a nossa tabela precisa atender
([Details](https://developers.grupozap.com/feeds/vrsync/elements/details.html),
[Listing](https://developers.grupozap.com/feeds/vrsync/elements/listing.html)):

| VRSync | Obrigatório | Temos? |
|---|---|---|
| `ListingID` (único, 1–50 chars) | sim | ✅ `code` |
| `Title` (10–100 chars, em CDATA) | sim | ✅ `title` |
| `TransactionType` (For Sale / For Rent / Sale-Rent) | sim | ✅ `purpose` |
| `Description` (50–3.000 chars) | sim | ⚠️ `description` sem validação de tamanho |
| `PropertyType` | sim | ⚠️ vocabulário curto (8 × ~20) |
| `UsageType` (Residential/Commercial) | sim | ❌ não existe |
| `ListPrice` / `RentalPrice` (+`period`) | sim | ✅ |
| `PropertyAdministrationFee`, `Iptu` | — | ✅ |
| `LivingArea` (m², inteiro) | sim | ⚠️ dentro de `features` jsonb, sem tipo |
| `Bedrooms`, `Bathrooms`, `Suites`, `Garage` | sim (residencial) | ⚠️ idem |
| `LotArea`, `YearBuilt`, `Floors`, `UnitFloor` | — | ❌ |
| `Features` (lista fechada) | — | ⚠️ jsonb livre, sem mapeamento |
| `Warranties` (caução, fiador, seguro) | — | ❌ não existe no imóvel |
| `Location`: País/UF/Cidade/**Bairro** | sim | ⚠️ `address` jsonb sem garantia |
| `Location@displayAddress` (All/Street/Neighborhood) | — | ❌ **não existe** |
| `Media/Item`: **JPG**, ≤7MB, ≥1, uma `primary="true"` | sim | ⚠️ formato não garantido |
| `VirtualTourLink`, vídeo (só YouTube, 1 por imóvel) | — | ✅ `tour_url` / `property_media` |
| `ContactInfo`: Name, Email (obrigatórios) + Logo, Telephone | sim | ✅ vem do branding |

**Regra técnica que vai nos morder se ignorarmos:** a URL da imagem **precisa
mudar quando o conteúdo da imagem muda**. Se regravarmos a foto marcada no
mesmo caminho, o portal continua servindo a versão antiga em cache. O caminho
no storage tem que carregar hash do conteúdo ou versão.

---

## 7. Lacunas concretas no nosso `properties` (o que fazer)

Comparando o mapeamento com `supabase/migrations/0003_properties.sql`:

**Bloqueantes para publicar**
1. **Não existe controle de publicação.** `status` é operacional
   (`captacao`, `disponivel`…) e não diz se o imóvel vai ao ar. Precisa de
   flags independentes: `publish_site`, `publish_portals`, `is_exclusive`.
   Imóvel em captação sem autorização do proprietário **não pode** vazar para
   a vitrine.
2. **Não existe política de exibição de endereço.** Proprietário
   frequentemente não quer o número na rua exposto. Sem
   `address_visibility` (`completo` / `rua` / `bairro`) não dá para publicar
   sem risco — e o VRSync tem o campo justo para isso.
3. **`slug`** para a URL amigável no padrão medido acima.

**Necessários para o portal**
4. `usage_type` (residencial/comercial), `year_built`, `unit_floor`, `floors`,
   `lot_area`.
5. Vocabulário de `kind` ampliado (~20 tipos) + mapa `kind → PropertyType`
   do VRSync.
6. `features` jsonb continua, mas com **contrato validado** para os campos
   que o portal exige como inteiro (quartos, banheiros, suítes, vagas, área).
7. `rental_warranties` no imóvel (caução, fiador, seguro-fiança, título) —
   hoje isso só existe no contrato, mas o anúncio precisa dizer o que aceita.
8. Tabela de publicação por portal: canal, quando foi enviado, resposta,
   erro. Sem isso ninguém descobre por que o anúncio sumiu do ZAP.

**Para o site**
9. Endpoint público de captura de lead que cai no funil certo
   (venda → funil de vendas, locação → funil de locação), com honeypot e
   rate limit. É a peça que fecha o ciclo: visita no site vira lead no CRM.
10. Marca d'água configurável por tenant e por canal (site × portal).

---

## 8. Recomendação de arquitetura

O mercado local entrega **site acoplado ao CRM**. Proponho entregar as três
saídas a partir do mesmo cadastro, e deixar a imobiliária escolher:

```
                    properties.properties (um cadastro)
                    publish_site │ publish_portals
                                 ▼
        ┌────────────────┬───────────────────┬──────────────────┐
        ▼                ▼                   ▼                  
   Site pronto      API pública          Feed VRSync
   (subdomínio ou   read-only JSON       XML por tenant
   domínio próprio) + widget embed       (ZAP/VivaReal/OLX)
        │                │                   │
   quem não tem     quem já tem site     quem anuncia
   site             (WordPress, Wix)     nos portais
```

1. **Site pronto**, white label, no subdomínio do tenant ou domínio próprio —
   atende a imobiliária pequena e o corretor autônomo que não tem site.
2. **API pública documentada, read-only, por tenant** + widget `<script>` de
   embutir. É a diferença direta contra o Robust, que tranca isso atrás do
   suporte. Os dados são da imobiliária.
3. **Feed VRSync** gerado do mesmo cadastro, com registro de publicação.

Os três leem a mesma tabela e respeitam as mesmas flags. Cadastra uma vez,
publica em três lugares — que é exatamente o que o corretor de JF hoje faz
na mão, três vezes.

---

## Pontos em aberto

- ZAP/VivaReal **recusam** foto com marca d'água? A documentação pública não
  responde; confirmar com o Canal Pro.
- Regras do CRECI/COFECI para anúncio (número de inscrição visível, dados
  obrigatórios). Não consegui ler a fonte; **verificar antes de publicar
  qualquer vitrine**, porque é exigência legal e vale para site próprio e
  portal.
- Contrato comercial dos portais: o feed é gratuito, mas o plano de anúncio é
  pago pela imobiliária e definido por ela.
