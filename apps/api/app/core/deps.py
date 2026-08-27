"""Dependências do FastAPI: identidade, contexto de tenant e autorização."""

from collections.abc import AsyncIterator
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import platform_connection, tenant_connection
from app.core.security import AuthError, CurrentUser, auth_user_id_from_token
from app.core.tenancy import TenantContext, extract_subdomain, resolve_tenant_by_subdomain


async def get_tenant_from_host(request: Request) -> TenantContext | None:
    """Tenant indicado pelo subdomínio, quando houver.

    Em desenvolvimento (localhost) não há subdomínio; nesse caso o tenant vem
    do vínculo do usuário autenticado.
    """
    subdomain = extract_subdomain(request.headers.get("host", ""))
    if not subdomain:
        return None
    tenant = await resolve_tenant_by_subdomain(subdomain)
    if tenant is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imobiliária não encontrada")
    return tenant


async def get_current_user(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
) -> CurrentUser:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Autenticação necessária")

    try:
        auth_user_id = auth_user_id_from_token(authorization.split(" ", 1)[1].strip())
    except AuthError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, str(exc)) from exc

    async with platform_connection() as conn:
        row = (
            (
                await conn.execute(
                    text("select * from core.resolve_user_context(:uid)"),
                    {"uid": str(auth_user_id)},
                )
            )
            .mappings()
            .first()
        )

        if row is None:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Usuário sem vínculo ativo com uma imobiliária",
            )

        modules = (
            await conn.execute(
                text("select core.tenant_enabled_modules(:tid)"),
                {"tid": str(row["tenant_id"])},
            )
        ).scalar_one()

    user = CurrentUser(
        user_id=row["user_id"],
        tenant_id=row["tenant_id"],
        full_name=row["full_name"],
        email=row["email"],
        tenant_name=row["tenant_name"],
        plan=row["plan"],
        roles=list(row["roles"] or []),
        permissions=list(row["permissions"] or []),
        modules=list(modules or []),
    )

    # Acesso por subdomínio de outra imobiliária é bloqueado mesmo com token válido.
    host_tenant = await get_tenant_from_host(request)
    if host_tenant is not None and host_tenant.tenant_id != user.tenant_id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Este usuário não pertence à imobiliária deste endereço",
        )

    return user


CurrentUserDep = Annotated[CurrentUser, Depends(get_current_user)]


async def get_db(user: CurrentUserDep) -> AsyncIterator[AsyncConnection]:
    """Conexão já dentro do contexto de tenant do usuário autenticado."""
    async with tenant_connection(user.tenant_id) as conn:
        yield conn


DbDep = Annotated[AsyncConnection, Depends(get_db)]


def require_permission(module: str, action: str):
    """Exige uma permissão (módulo × ação) do RBAC."""

    async def _check(user: CurrentUserDep) -> CurrentUser:
        if not user.has_permission(module, action):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Sem permissão para {action} em {module}",
            )
        return user

    return _check


def require_module(module: str):
    """Exige que o plano contratado inclua o módulo."""

    async def _check(user: CurrentUserDep) -> CurrentUser:
        if not user.has_module(module):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Módulo não contratado por esta imobiliária",
            )
        return user

    return _check
