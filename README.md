# Clemente Assessoria — Website Institucional

Website institucional para a **Clemente Assessoria**, empresa de assessoria imobiliária, correspondente bancário e despachante imobiliário.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **shadcn/ui** (base-ui)
- **Supabase** (banco de dados + RLS)
- **React Hook Form + Zod** (validação de formulários)
- **Nodemailer** (envio de e-mails SMTP)

---

## Páginas

| Rota | Descrição |
|------|-----------|
| `/` | Home com hero, serviços, estatísticas, depoimentos e CTA |
| `/simulador` | Simulador de financiamento imobiliário |
| `/servicos` | Detalhamento dos serviços oferecidos |
| `/sobre` | Quem somos e valores da empresa |
| `/blog` | Listagem de artigos |
| `/blog/[slug]` | Artigo individual |
| `/contato` | Formulário de contato |
| `/politica-de-privacidade` | Política de privacidade (LGPD) |

---

## Funcionalidades

- Simulador de financiamento imobiliário com cálculo de parcela (Price), enquadramento MCMV/SBPE e CTA pré-preenchido para WhatsApp
- Formulário de contato com captura de lead no Supabase + notificação por e-mail
- Botão fixo de WhatsApp com mensagem contextual
- SEO básico com metadata e Open Graph
- Layout 100% responsivo
- Performance alta (páginas estáticas onde possível)

---

## Instalação

### Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com)
- Conta de e-mail SMTP (Gmail com App Password, Resend, SendGrid etc.)

### Passos

```bash
cd website
npm install
cp .env.local .env.local.example   # copie como referência
# Edite .env.local com suas credenciais reais
npm run dev
```

---

## Variáveis de Ambiente

Crie/edite o arquivo `website/.env.local`:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# SMTP (e-mail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@gmail.com
SMTP_PASS=sua_app_password
EMAIL_FROM=noreply@clementeassessoria.com.br
EMAIL_TO=contato@clementeassessoria.com.br

# WhatsApp (número com DDI, sem espaços ou símbolos)
NEXT_PUBLIC_WHATSAPP_NUMBER=5511999999999

# URL do site em produção
NEXT_PUBLIC_SITE_URL=https://clementeassessoria.com.br
```

### Gmail App Password

1. Ative a verificação em duas etapas na conta Google
2. Acesse: myaccount.google.com/apppasswords
3. Crie uma senha de app para "Mail" e use em `SMTP_PASS`

---

## Banco de Dados (Supabase)

1. Crie um projeto no Supabase (app.supabase.com)
2. Acesse **SQL Editor** e execute o arquivo `website/supabase/schema.sql`
3. Copie a URL e as chaves em **Settings > API** para o `.env.local`

Tabelas criadas:

| Tabela | Descrição |
|--------|-----------|
| `simulation_leads` | Leads captados pelo simulador |
| `contact_leads` | Mensagens do formulário de contato |
| `blog_posts` | Artigos do blog (gerenciável via Supabase Studio) |

---

## Deploy na Vercel

1. Faça push do repositório para o GitHub
2. Acesse vercel.com → **New Project** → importe o repositório
3. Defina o **Root Directory** como `website`
4. Adicione todas as variáveis de ambiente em **Settings > Environment Variables**
5. Clique em **Deploy**

Após o deploy, vá em **Settings > Domains** e adicione o domínio desejado.

---

## Estrutura do Projeto

```
website/
├── src/
│   ├── app/                    # Páginas (App Router)
│   │   ├── page.tsx            # Home
│   │   ├── simulador/
│   │   ├── servicos/
│   │   ├── sobre/
│   │   ├── blog/
│   │   ├── contato/
│   │   ├── politica-de-privacidade/
│   │   └── api/
│   │       ├── simulate/       # POST /api/simulate
│   │       └── contact/        # POST /api/contact
│   ├── components/
│   │   ├── layout/             # Navbar, Footer, WhatsAppButton
│   │   ├── sections/           # Hero, Serviços, Depoimentos, CTA...
│   │   ├── simulator/          # SimulatorForm
│   │   ├── blog/               # BlogCard
│   │   └── ui/                 # shadcn/ui components
│   ├── lib/
│   │   ├── supabase.ts         # Cliente Supabase
│   │   ├── mailer.ts           # Envio de e-mails
│   │   └── simulation.ts       # Cálculo de financiamento
│   └── types/
│       └── index.ts
└── supabase/
    └── schema.sql              # Schema do banco de dados
```
