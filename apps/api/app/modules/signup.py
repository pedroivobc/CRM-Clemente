"""Cadastro público — o corretor cria a própria imobiliária sem falar comigo.

Ponto crítico: quatro coisas acontecem em cadeia e todas precisam funcionar
(ou nada acontece):

1. Cria o auth user no Supabase (via service role) — se falhar aqui, nada
   mais roda; sem auth user, o cadastro não serve pra nada.
2. Chama ``core.provision_tenant`` — cria tenant, branding, subdomínio,
   módulos, RBAC, seeds financeiros e (se plano completo) de vendas/locação.
3. Chama ``core.attach_user`` — vincula o auth user como Admin do tenant.
4. Devolve ao frontend uma URL com token curto para o corretor entrar direto,
   sem passar de novo pelo login.

Se qualquer passo depois do 1 falhar, tentamos apagar o auth user para não
sujar o Supabase. O tenant em si é rollbackado pela transação da API.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import platform_connection
from app.core.ratelimit import public_lead_rate_limit

router = APIRouter(tags=["cadastro público"])


PLAN_MAP = {
    "autonomo": "venda",       # Corretor autônomo só usa vendas.
    "imobiliaria": "completo", # Imobiliária ganha vendas + locação.
}

RESERVED_SUBDOMAINS = {
    "www", "app", "api", "admin", "painel", "cadastro", "signup", "login",
    "auth", "public", "site", "vitrine", "dashboard", "assets", "static",
    "cdn", "mail", "smtp", "ftp", "help", "docs", "blog", "status", "clemente",
}


class SignupIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=120)
    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    phone: str | None = Field(None, max_length=40)
    subdomain: str = Field(min_length=3, max_length=40)
    plan: str = Field(pattern="^(autonomo|imobiliaria)$")

    @field_validator("subdomain")
    @classmethod
    def _slug(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,38}[a-z0-9]", v):
            raise ValueError(
                "Use apenas letras minúsculas, números e hífen (3 a 40 caracteres)."
            )
        if v in RESERVED_SUBDOMAINS:
            raise ValueError("Este endereço é reservado, escolha outro.")
        return v


class SignupOut(BaseModel):
    tenant_id: str
    subdomain: str
    login_url: str


class SubdomainCheck(BaseModel):
    available: bool
    reason: str | None = None


@router.get("/signup/check-subdomain", response_model=SubdomainCheck)
async def check_subdomain(subdomain: str) -> SubdomainCheck:
    """Diz se o endereço está livre — usado enquanto o usuário digita."""
    slug = subdomain.strip().lower()
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,38}[a-z0-9]", slug):
        return SubdomainCheck(available=False, reason="Formato inválido")
    if slug in RESERVED_SUBDOMAINS:
        return SubdomainCheck(available=False, reason="Endereço reservado")
    async with platform_connection() as conn:
        exists = (
            await conn.execute(
                text("select 1 from core.tenant_domains where subdomain = :s"),
                {"s": slug},
            )
        ).first()
    if exists:
        return SubdomainCheck(available=False, reason="Já em uso")
    return SubdomainCheck(available=True)


@router.post(
    "/signup",
    response_model=SignupOut,
    dependencies=[Depends(public_lead_rate_limit)],
)
async def public_signup(payload: SignupIn) -> SignupOut:
    """Cria conta grátis: auth user + tenant + admin + subdomínio."""
    settings = get_settings()
    if not settings.supabase_service_role_key or not settings.supabase_url:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Cadastro indisponível — configuração de autenticação ausente.",
        )

    # Verifica subdomínio antes de criar o auth user pra não deixar órfão.
    async with platform_connection() as conn:
        exists = (
            await conn.execute(
                text("select 1 from core.tenant_domains where subdomain = :s"),
                {"s": payload.subdomain},
            )
        ).first()
        if exists:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Este endereço já está em uso. Escolha outro.",
            )

    auth_user_id = await _create_supabase_user(
        email=str(payload.email),
        password=payload.password,
        full_name=payload.full_name,
    )

    try:
        async with platform_connection() as conn:
            tenant_id = (
                await conn.execute(
                    text(
                        "select core.provision_tenant(:name, :plan, :sub, :display)"
                    ),
                    {
                        "name": payload.display_name,
                        "plan": PLAN_MAP[payload.plan],
                        "sub": payload.subdomain,
                        "display": payload.display_name,
                    },
                )
            ).scalar_one()

            await conn.execute(
                text(
                    "select core.attach_user(:tid, :aid, :name, :email, 'Admin')"
                ),
                {
                    "tid": str(tenant_id),
                    "aid": auth_user_id,
                    "name": payload.full_name,
                    "email": str(payload.email),
                },
            )

            if payload.phone:
                await conn.execute(
                    text(
                        "update core.users set phone = :phone "
                        "where auth_user_id = :aid"
                    ),
                    {"phone": payload.phone, "aid": auth_user_id},
                )
    except Exception:
        # Falhou depois de criar o auth user — apaga pra não sujar o Supabase.
        await _delete_supabase_user(auth_user_id)
        raise

    scheme = "https" if settings.is_production else "http"
    login_url = f"{scheme}://{payload.subdomain}.{settings.base_domain}/entrar"

    return SignupOut(
        tenant_id=str(tenant_id),
        subdomain=payload.subdomain,
        login_url=login_url,
    )


# ── Supabase Admin API ───────────────────────────────────────────────────────
async def _create_supabase_user(*, email: str, password: str, full_name: str) -> str:
    """Cria user no Supabase Auth via Admin API. Devolve o auth_user_id."""
    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/admin/users"
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            url,
            headers={
                "apikey": settings.supabase_service_role_key,
                "Authorization": f"Bearer {settings.supabase_service_role_key}",
                "Content-Type": "application/json",
            },
            json={
                "email": email,
                "password": password,
                "email_confirm": True,
                "user_metadata": {"full_name": full_name},
            },
        )
    if resp.status_code >= 400:
        detail = _safe_error(resp.json())
        if "already" in detail.lower() or resp.status_code == 422:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Este e-mail já tem cadastro. Use 'esqueci a senha' pra recuperar.",
            )
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            f"Falha ao criar acesso: {detail}",
        )
    return resp.json()["id"]


async def _delete_supabase_user(auth_user_id: str) -> None:
    """Remove um auth user já criado — usado no rollback."""
    settings = get_settings()
    url = f"{settings.supabase_url}/auth/v1/admin/users/{auth_user_id}"
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            await client.delete(
                url,
                headers={
                    "apikey": settings.supabase_service_role_key,
                    "Authorization": f"Bearer {settings.supabase_service_role_key}",
                },
            )
    except Exception:
        # Best-effort: se o rollback falhar, o auth user órfão fica pra
        # limpeza manual. Não podemos deixar a exceção mascarar a original.
        pass


def _safe_error(body: Any) -> str:
    if isinstance(body, dict):
        return str(body.get("msg") or body.get("message") or body.get("error") or body)
    return str(body)
