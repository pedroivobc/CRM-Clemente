import {
  MockDashboard,
  MockDunning,
  MockFeed,
  MockRanking,
  MockSegundaVia,
  MockShowcase,
} from "./mockups";

export function Home() {
  return (
    <>
      <TopBar />
      <Hero />
      <ProblemSection />
      <FeaturesSection />
      <CompareSection />
      <PricingSection />
      <FaqSection />
      <FinalCta />
      <Footer />
    </>
  );
}

/* ── Topbar ──────────────────────────────────────────────────────────── */
function TopBar() {
  return (
    <header className="top">
      <div className="inner">
        <a className="brand" href="#top">
          <span className="brand-mark">C</span>
          Clemente
        </a>
        <nav>
          <a href="#features">Recursos</a>
          <a href="#compare">Comparar</a>
          <a href="#pricing">Preços</a>
          <a href="#faq">Perguntas</a>
        </nav>
        <div className="cta">
          <a className="btn btn-ghost" href="/app">
            Entrar
          </a>
          <a className="btn btn-primary" href="#pricing">
            Criar conta grátis
          </a>
        </div>
      </div>
    </header>
  );
}

/* ── Hero ────────────────────────────────────────────────────────────── */
function Hero() {
  return (
    <section className="hero" id="top" style={{ padding: "80px 0 60px" }}>
      <div className="container">
        <div className="grid">
          <div>
            <span className="eyebrow">
              <span className="dot" />
              Feito para imobiliária de bairro e corretor autônomo
            </span>
            <h1>
              O sistema da sua imobiliária <span className="accent">sem
              pagar mais que um jantar</span>.
            </h1>
            <p className="lead">
              CRM de vendas e locação, vitrine própria com sua marca, cobrança
              automática, 2ª via por WhatsApp sem senha, ranking do time e
              suporte a MCMV. Tudo pronto no dia que você entra.
            </p>
            <div className="actions">
              <a className="btn btn-primary btn-lg" href="#pricing">
                Começar grátis por 14 dias
              </a>
              <a className="btn btn-ghost btn-lg" href="#features">
                Ver como funciona
              </a>
            </div>
            <div className="trust">
              <span>
                <strong>Sem cartão</strong> para testar
              </span>
              <span>
                <strong>Sem instalação</strong>
              </span>
              <span>
                <strong>Feito em Juiz de Fora</strong>
              </span>
            </div>
          </div>

          <div className="mockup">
            <div className="win-bar">
              <span /> <span /> <span />
            </div>
            <div className="win-body">
              <MockDashboard />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Problema ────────────────────────────────────────────────────────── */
function ProblemSection() {
  return (
    <section className="problem">
      <div className="container">
        <p className="kicker">O buraco entre o corretor e o CRM</p>
        <h2>Ou você paga R$ 1.500 por mês e usa 15% do sistema, ou não paga
        nada e vira suporte por WhatsApp.</h2>
        <p className="desc">
          Os sistemas grandes cobram como se toda imobiliária tivesse dez
          corretores e escritório em avenida. Os pequenos ficam sem CRM,
          controlando aluguel em planilha e boleto por e-mail. Nascemos pra
          resolver esse buraco.
        </p>

        <div className="cards">
          <div className="card">
            <div className="num">70%</div>
            <h3>Dos corretores autônomos não usam nenhum CRM</h3>
            <p>
              Pesquisa CRECI 2024. O motivo mais citado: preço. Perde-se o
              controle de leads que já entraram três vezes pelo Instagram.
            </p>
          </div>
          <div className="card">
            <div className="num">R$ 1,8k</div>
            <h3>Mensalidade média dos concorrentes grandes</h3>
            <p>
              Kenlo, Robust, Imoview e afins cobram por corretor + módulos
              contratados. Para 3 pessoas, passa fácil de R$ 1.500.
            </p>
          </div>
          <div className="card">
            <div className="num">3×</div>
            <h3>Ligações por dia pedindo 2ª via</h3>
            <p>
              A recepção repete os mesmos passos várias vezes por semana. Cada
              chamada tira 5 minutos de quem devia estar fechando negócio.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Features ────────────────────────────────────────────────────────── */
function FeaturesSection() {
  return (
    <section className="features" id="features">
      <div className="container">
        <p className="kicker">O que já vem funcionando</p>
        <h2>Tudo pronto no dia que você entra. Sem consultor, sem
        implantação, sem contrato de fidelidade.</h2>

        <div className="row">
          <div>
            <h3>Vitrine própria com sua marca</h3>
            <p>
              Cada imobiliária ganha um site pronto no ar em minutos —
              seunome.imob.br ou domínio próprio — com sua logo, sua cor e
              seus imóveis publicados automaticamente.
            </p>
            <ul>
              <li>Grade de imóveis com filtro por bairro, quartos e preço</li>
              <li>Página do imóvel com galeria, vídeo (YouTube/Vimeo) e formulário</li>
              <li>Widget embutível para colar no WordPress ou site atual</li>
              <li>SEO amigável — cada imóvel tem URL própria</li>
            </ul>
          </div>
          <MockShowcase />
        </div>

        <div className="row">
          <div>
            <h3>Painel manhã de segunda para o dono</h3>
            <p>
              Seis números para ler antes do primeiro café: receita da semana,
              inadimplência, contratos vencendo, leads em aberto, propostas
              esperando resposta e imóveis anunciados. Um clique leva direto
              ao assunto.
            </p>
            <ul>
              <li>Ranking do time por vendas, leads e comissão gerada</li>
              <li>Feed de atividade em tempo (quase) real</li>
              <li>Comparativo com o período anterior para leitura de tendência</li>
              <li>Aba separada por módulo — vendas e locação nunca se misturam</li>
            </ul>
          </div>
          <MockRanking />
        </div>

        <div className="row">
          <div>
            <h3>Régua de cobrança e 2ª via por WhatsApp</h3>
            <p>
              Configure D-3, D0, D+3 e D+7. Todo dia a lista de "a cobrar hoje"
              aparece no painel com um botão WhatsApp por linha. O cliente
              recebe um link mágico e abre a 2ª via sem senha, sem app, com
              Pix pronto para copiar. Fim do telefone tocando.
            </p>
            <ul>
              <li>Templates com placeholders para nome, valor, vencimento e link</li>
              <li>Link válido por 15 minutos, com branding da sua imobiliária</li>
              <li>Pix copia-e-cola e linha digitável do boleto</li>
              <li>Sem cobrar automático — você controla o disparo e o tom</li>
            </ul>
          </div>
          <MockDunning />
        </div>

        <div className="row">
          <div>
            <h3>Cliente abre a 2ª via em 3 toques</h3>
            <p>
              O WhatsApp já chega com o link. O inquilino abre no celular e vê
              o valor grande, o Pix pronto para colar no banco e o boleto para
              baixar em PDF. Sem cadastro, sem app para instalar.
            </p>
            <ul>
              <li>Página com sua marca (logo e cor primária)</li>
              <li>Funciona em qualquer celular, sem instalação</li>
              <li>Rate limit e expiração cuidam da segurança</li>
              <li>Você sabe quando o cliente abriu o link</li>
            </ul>
          </div>
          <MockSegundaVia />
        </div>

        <div className="row">
          <div>
            <h3>Feito para o mercado do MCMV</h3>
            <p>
              Cada imóvel se enquadra em uma faixa. O visitante da vitrine
              coloca a renda familiar e vê se cabe no bolso, com parcela
              estimada. Quando ele deixa o contato, você recebe o lead já com
              a renda declarada para atender pela faixa certa.
            </p>
            <ul>
              <li>Faixas 1 a 4 com renda máxima, teto de imóvel e taxa vigente</li>
              <li>Simulador Price com prazo até 420 meses</li>
              <li>Selo MCMV no card e filtro dedicado na vitrine</li>
              <li>Legenda pronta para Instagram e Facebook em um clique</li>
            </ul>
          </div>
          <MockFeed />
        </div>
      </div>
    </section>
  );
}

/* ── Comparativo ─────────────────────────────────────────────────────── */
function CompareSection() {
  return (
    <section className="compare" id="compare">
      <div className="container">
        <p className="kicker">Compare com o que você paga hoje</p>
        <h2>Robust, Kenlo e Imoview são bons — só que caros para quem tem 20
        contratos e 4 corretores.</h2>
        <p className="desc">
          Aqui está uma comparação honesta com os planos base dos concorrentes
          mais citados por imobiliárias de bairro. Os preços dos concorrentes
          são os divulgados nos sites em 2026 para até 3 usuários.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Robust</th>
                <th>Kenlo Imob</th>
                <th>Imoview</th>
                <th className="us">Clemente</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="txt">Preço para 3 usuários</td>
                <td>R$ 890/mês</td>
                <td>R$ 1.190/mês</td>
                <td>R$ 990/mês</td>
                <td className="us">
                  <span className="price">R$ 149<small>/mês</small></span>
                </td>
              </tr>
              <tr>
                <td className="txt">Vitrine e site próprio</td>
                <td className="partial">Módulo extra</td>
                <td className="partial">Módulo extra</td>
                <td className="yes">Sim</td>
                <td className="us yes">Já vem</td>
              </tr>
              <tr>
                <td className="txt">2ª via por WhatsApp sem senha</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">Filtro e simulador MCMV nativo</td>
                <td className="no">Não</td>
                <td className="partial">Parcial</td>
                <td className="no">Não</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">Legenda para Instagram e Facebook</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">Régua de cobrança configurável</td>
                <td className="yes">Sim</td>
                <td className="yes">Sim</td>
                <td className="yes">Sim</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">Feed em tempo real da equipe</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">PWA instalável com sua marca</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="no">Não</td>
                <td className="us yes">Sim</td>
              </tr>
              <tr>
                <td className="txt">Contrato de fidelidade</td>
                <td>12 meses</td>
                <td>12 meses</td>
                <td>12 meses</td>
                <td className="us yes">Sem fidelidade</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="desc" style={{ marginTop: 24, fontSize: 13, color: "var(--muted)" }}>
          Preços dos concorrentes conforme material comercial público em 2026,
          plano base. Podem variar por módulos adicionais e volume.
        </p>
      </div>
    </section>
  );
}

/* ── Preços ──────────────────────────────────────────────────────────── */
function PricingSection() {
  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <p className="kicker">Preço direto</p>
        <h2>Sem plano gratuito eterno, sem taxa de setup, sem letra miúda.</h2>
        <p className="desc">
          Você paga como assinatura de streaming — mensal, com 14 dias grátis
          e cancelamento em um clique.
        </p>

        <div className="plans">
          <div className="plan">
            <h3>Corretor autônomo</h3>
            <p className="who">Para quem trabalha sozinho ou com um parceiro</p>
            <div className="price">
              R$ 39
              <small>por mês · usuário único</small>
            </div>
            <div className="divider" />
            <ul>
              <li>Até 50 imóveis publicados</li>
              <li>Vitrine própria em seunome.imob.br</li>
              <li>Widget embutível para site atual</li>
              <li>CRM de vendas completo</li>
              <li>Legenda pronta para Instagram e Facebook</li>
              <li>Suporte por WhatsApp em horário comercial</li>
            </ul>
            <a className="btn btn-ghost" href="#final">
              Começar grátis
            </a>
            <p className="fine">14 dias sem cartão. R$ 39 depois.</p>
          </div>

          <div className="plan featured">
            <span className="tag">Mais escolhido</span>
            <h3>Imobiliária</h3>
            <p className="who">Para equipes de 2 a 8 pessoas — vendas + locação</p>
            <div className="price">
              R$ 149
              <small>por mês · até 5 usuários</small>
            </div>
            <div className="divider" />
            <ul>
              <li>Imóveis ilimitados</li>
              <li>Vitrine com domínio próprio (www.suaimob.com.br)</li>
              <li>CRM de vendas e locação</li>
              <li>Régua de cobrança e 2ª via por WhatsApp</li>
              <li>Repasse e conciliação bancária</li>
              <li>Ranking do time e feed de atividade</li>
              <li>PWA com sua marca no celular do corretor</li>
              <li>Suporte prioritário</li>
            </ul>
            <a className="btn btn-primary" href="#final">
              Começar grátis
            </a>
            <p className="fine">14 dias sem cartão. R$ 149 depois. Usuário extra R$ 20.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ ─────────────────────────────────────────────────────────────── */
function FaqSection() {
  const items: { q: string; a: string }[] = [
    {
      q: "Preciso instalar alguma coisa?",
      a: "Não. Roda no navegador do computador e do celular. No celular, dá para instalar o app à tela de início com um toque — ele fica com a marca da sua imobiliária.",
    },
    {
      q: "Meus imóveis atuais aparecem na vitrine automaticamente?",
      a: "Sim. Cada imóvel cadastrado vira uma página no seu site (seunome.imob.br) e também aparece no widget que você cola no seu site atual, se preferir manter o layout.",
    },
    {
      q: "E o WhatsApp — precisa integrar com algum serviço?",
      a: "Não. A gente monta a mensagem pronta e abre o WhatsApp do inquilino/cliente com um clique. Você continua usando o WhatsApp Business normal, sem número novo, sem gateway.",
    },
    {
      q: "Como funciona a 2ª via sem senha?",
      a: "Você clica em 'WhatsApp' na cobrança, o sistema gera um link válido por 15 minutos e abre a conversa com a mensagem pronta e o link. O inquilino abre no celular e vê valor, Pix copia-e-cola e boleto, com o branding da sua imobiliária.",
    },
    {
      q: "Aceita MCMV?",
      a: "Sim, e é nativo. Você marca a faixa do imóvel no cadastro, ele ganha um selo na vitrine, e o visitante consegue simular a parcela com a renda dele. Quando vira lead, você já sabe a faixa.",
    },
    {
      q: "Contrato de fidelidade?",
      a: "Não. Assinatura mensal, cancela em um clique. Se você resolver sair, seus dados podem ser exportados em CSV a qualquer momento.",
    },
    {
      q: "Rodam em Juiz de Fora / MG?",
      a: "O sistema roda em todo o Brasil, mas nascemos aqui e começamos atendendo o mercado de JF. Conhecemos as prefeituras da região.",
    },
    {
      q: "Suporte fala com humano ou é bot?",
      a: "WhatsApp direto com a gente. Sem CAPTCHA, sem 'fale com nosso assistente virtual', sem enrolação.",
    },
  ];
  return (
    <section className="faq" id="faq">
      <div className="container">
        <p className="kicker" style={{ textAlign: "center" }}>Perguntas frequentes</p>
        <h2 style={{ textAlign: "center", margin: "0 auto 12px" }}>
          O que a gente ouve com mais frequência.
        </h2>
        <div className="list">
          {items.map((item) => (
            <details key={item.q}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── CTA final ───────────────────────────────────────────────────────── */
function FinalCta() {
  return (
    <section className="cta-final" id="final">
      <div className="container">
        <h2>Comece hoje. Cancele amanhã se quiser.</h2>
        <p>
          14 dias grátis. Sem cartão de crédito. Sua vitrine já entra no ar no
          primeiro imóvel cadastrado.
        </p>
        <div className="actions">
          <a className="btn btn-primary btn-lg" href="/app/cadastro">
            Criar minha imobiliária
          </a>
          <a className="btn btn-ghost btn-lg" href="https://wa.me/5532998510706">
            Falar com a gente
          </a>
        </div>
        <p className="fine">Feito em Juiz de Fora, para imobiliária de bairro e corretor autônomo.</p>
      </div>
    </section>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */
function Footer() {
  return (
    <footer className="foot">
      <div className="inner">
        <div>© {new Date().getFullYear()} Clemente Assessoria · Juiz de Fora / MG</div>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="#compare">Comparar</a>
          <a href="#pricing">Preços</a>
          <a href="#faq">Perguntas</a>
          <a href="/termos">Termos</a>
          <a href="/privacidade">Privacidade</a>
        </div>
      </div>
    </footer>
  );
}
