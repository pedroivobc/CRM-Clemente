"""Aplicação FastAPI — Sistema de Gestão Imobiliária."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import get_settings
from app.core.db import dispose_engine
from app.modules import (
    billing,
    clients,
    contracts,
    dashboard,
    finance,
    inspections,
    maintenance,
    properties,
    property_keys,
    rentals_crm,
    rentals_dashboard,
    sales,
    session,
    tenants,
    users,
)
from app.webhooks import router as webhooks_router
from app.workers.queue import close_pool

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await close_pool()
    await dispose_engine()


settings = get_settings()

app = FastAPI(
    title="Sistema de Gestão Imobiliária",
    description="API multi-tenant para imobiliárias — módulos de Locação e Vendas.",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# Em produção o acesso é por subdomínio do tenant, servido pela mesma origem
# (Caddy). A liberação ampla vale apenas para o Vite em desenvolvimento.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=(
        r"https://([a-z0-9-]+\.)?" + settings.base_domain.replace(".", r"\.")
        if settings.is_production
        else r"https?://.*"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


@app.get("/api/health", tags=["infra"])
async def health() -> dict:
    return {"status": "ok", "env": settings.app_env}


for module in (
    session,
    dashboard,
    tenants,
    users,
    clients,
    properties,
    finance,
    rentals_crm,
    rentals_dashboard,
    contracts,
    billing,
    property_keys,
    inspections,
    maintenance,
    sales,
):
    app.include_router(module.router, prefix="/api/v1")

# Webhooks ficam fora de /api/v1: quem chama é o provedor, não o app.
app.include_router(webhooks_router.router)

# Vitrine pública: sub-aplicação isolada em /public, com CORS aberto porque o
# widget roda no domínio do cliente (WordPress, site próprio) — não na nossa
# origem. A liberação vale só aqui; o resto da API segue restrito ao tenant.
from app.modules import public_showcase  # noqa: E402

public_app = FastAPI(title="Vitrine pública", docs_url=None, openapi_url=None)
public_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@public_app.exception_handler(ValueError)
async def _public_value_error(request: Request, exc: ValueError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"detail": str(exc)})


public_app.include_router(public_showcase.router)
app.mount("/public", public_app)
