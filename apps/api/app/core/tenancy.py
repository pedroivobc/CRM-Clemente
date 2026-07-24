"""Resolução do tenant pelo subdomínio (ex.: imobiliariax.sistema.com.br)."""

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import platform_connection


@dataclass
class TenantContext:
    tenant_id: UUID
    name: str
    plan: str
    subdomain: str


def extract_subdomain(host: str) -> str | None:
    """Extrai o rótulo do tenant do cabeçalho Host.

    ``imob-a.sistema.com.br`` → ``imob-a``. Retorna ``None`` para o domínio
    base, ``www`` e hosts sem subdomínio (localhost, IP direto).
    """
    if not host:
        return None
    host = host.split(":")[0].strip().lower()
    base = get_settings().base_domain.split(":")[0].strip().lower()

    if host == base or host in ("localhost", "127.0.0.1"):
        return None
    if host.endswith("." + base):
        label = host[: -(len(base) + 1)]
    else:
        parts = host.split(".")
        if len(parts) < 3:
            return None
        label = parts[0]

    label = label.split(".")[0]
    if label in ("www", "app", "api", ""):
        return None
    return label


async def resolve_tenant_by_subdomain(subdomain: str) -> TenantContext | None:
    async with platform_connection() as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select t.id, t.name, t.plan, d.subdomain
                    from core.tenant_domains d
                    join core.tenants t on t.id = d.tenant_id
                    where d.subdomain = :sub and t.status = 'active'
                    """
                ),
                {"sub": subdomain},
            )
        ).first()
    if row is None:
        return None
    return TenantContext(tenant_id=row[0], name=row[1], plan=row[2], subdomain=row[3])
