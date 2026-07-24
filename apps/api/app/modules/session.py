"""Sessão: identidade do usuário e dados públicos do tenant (theming do login)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import text

from app.core.db import platform_connection
from app.core.deps import CurrentUserDep
from app.core.tenancy import extract_subdomain

router = APIRouter(tags=["sessão"])


class BrandingOut(BaseModel):
    display_name: str
    logo_url: str | None = None
    favicon_url: str | None = None
    color_primary: str
    color_secondary: str
    color_accent: str


class TenantPublicOut(BaseModel):
    tenant_id: UUID
    name: str
    plan: str
    subdomain: str
    branding: BrandingOut


class MeOut(BaseModel):
    user_id: UUID
    tenant_id: UUID
    full_name: str
    email: str
    tenant_name: str
    plan: str
    roles: list[str]
    permissions: list[str]
    modules: list[str]


@router.get("/session/tenant", response_model=TenantPublicOut)
async def current_tenant(request: Request) -> TenantPublicOut:
    """Identidade visual do tenant do subdomínio — usado antes do login."""
    subdomain = extract_subdomain(request.headers.get("host", ""))
    if not subdomain:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            "Nenhuma imobiliária identificada neste endereço",
        )

    async with platform_connection() as conn:
        row = (
            (
                await conn.execute(
                    text(
                        """
                    select t.id, t.name, t.plan, d.subdomain, b.display_name,
                           b.logo_path, b.favicon_path,
                           b.color_primary, b.color_secondary, b.color_accent
                    from core.tenant_domains d
                    join core.tenants t on t.id = d.tenant_id
                    join core.tenant_branding b on b.tenant_id = t.id
                    where d.subdomain = :sub and t.status = 'active'
                    """
                    ),
                    {"sub": subdomain},
                )
            )
            .mappings()
            .first()
        )

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imobiliária não encontrada")

    from app.services.storage import BUCKET_BRANDING, get_storage

    storage = get_storage()
    return TenantPublicOut(
        tenant_id=row["id"],
        name=row["name"],
        plan=row["plan"],
        subdomain=row["subdomain"],
        branding=BrandingOut(
            display_name=row["display_name"],
            logo_url=(
                storage.public_url(BUCKET_BRANDING, row["logo_path"]) if row["logo_path"] else None
            ),
            favicon_url=(
                storage.public_url(BUCKET_BRANDING, row["favicon_path"])
                if row["favicon_path"]
                else None
            ),
            color_primary=row["color_primary"],
            color_secondary=row["color_secondary"],
            color_accent=row["color_accent"],
        ),
    )


@router.get("/session/me", response_model=MeOut)
async def me(user: CurrentUserDep) -> MeOut:
    return MeOut(
        user_id=user.user_id,
        tenant_id=user.tenant_id,
        full_name=user.full_name,
        email=user.email,
        tenant_name=user.tenant_name,
        plan=user.plan,
        roles=user.roles,
        permissions=user.permissions,
        modules=user.modules,
    )
