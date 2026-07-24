"""Acesso ao banco com contexto de tenant.

Toda consulta de negócio roda dentro de uma transação que define
``app.tenant_id``; as políticas RLS do Postgres derivam desse parâmetro
(``core.current_tenant_id()``). Se o contexto não for definido, as políticas
não casam e nenhuma linha é visível — o isolamento não depende de a aplicação
lembrar de filtrar por ``tenant_id``.
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection, AsyncEngine, create_async_engine

from app.core.config import get_settings

_engine: AsyncEngine | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        settings = get_settings()
        _engine = create_async_engine(
            settings.database_url,
            pool_size=10,
            max_overflow=10,
            pool_pre_ping=True,
            echo=False,
        )
    return _engine


async def dispose_engine() -> None:
    global _engine
    if _engine is not None:
        await _engine.dispose()
        _engine = None


@asynccontextmanager
async def tenant_connection(tenant_id: UUID | str) -> AsyncIterator[AsyncConnection]:
    """Abre uma transação com ``app.tenant_id`` definido para o escopo dela."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.execute(
            text("select set_config('app.tenant_id', :tid, true)"),
            {"tid": str(tenant_id)},
        )
        yield conn


@asynccontextmanager
async def platform_connection() -> AsyncIterator[AsyncConnection]:
    """Transação sem contexto de tenant.

    Uso restrito a operações de plataforma: resolver o tenant pelo subdomínio,
    provisionar tenant e autenticar (descobrir a qual tenant o usuário
    pertence). Nunca use para dados de negócio.
    """
    engine = get_engine()
    async with engine.begin() as conn:
        yield conn
