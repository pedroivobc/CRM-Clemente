# SaaS de Gestão Imobiliária — Vendas + Locação

Sistema multi-tenant white label para imobiliárias de pequeno porte (1–20 colaboradores), com módulos de **Locação** (completo) e **Vendas** (estrutura preparada), contratáveis separadamente ou em conjunto.

## Documentação

| Documento | Conteúdo |
|---|---|
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Arquitetura, multi-tenant, white label, fluxos críticos, deploy |
| [`docs/MODELO-DE-DADOS.md`](docs/MODELO-DE-DADOS.md) | Diagrama ER por schema |
| [`docs/DECISOES-TECNICAS.md`](docs/DECISOES-TECNICAS.md) | Decisões técnicas (ADR) |
| [`PROGRESS.md`](PROGRESS.md) | Progresso por fase, decisões e pendências |

## Estrutura

```
apps/web        → Frontend React + Vite + TypeScript + Tailwind (app interno + portais)
apps/api        → Backend FastAPI + worker arq (fila Redis)
supabase/       → Migrations SQL (schemas, RLS, seeds)
infra/          → Docker Compose, Caddyfile (VPS Ubuntu 24.04)
```

## Desenvolvimento

Pré-requisitos: Node 22+, Python 3.11+, Redis, Postgres (Supabase local via `supabase start` ou Docker).

```bash
cp .env.example .env               # preencher chaves do Supabase

# Banco: aplicar migrations (na ordem) em supabase/migrations/*.sql

# API
cd apps/api
pip install -r requirements.txt -r requirements-dev.txt
uvicorn app.main:app --reload      # http://localhost:8000/docs

# Worker (marca d'água, PDFs, jobs)
python -m arq app.workers.worker.WorkerSettings

# Frontend
cd apps/web
npm install
npm run dev                        # http://localhost:5173
```

Testes: `cd apps/api && pytest`.

## Deploy (VPS)

`infra/docker-compose.yml` sobe `api`, `worker`, `redis` e `caddy` (TLS wildcard para subdomínios de tenant). Banco/Auth/Storage ficam no Supabase gerenciado. O frontend pode ser servido pelo Caddy (build em `apps/web/dist`) ou publicado na Vercel.
