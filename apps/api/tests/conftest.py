"""Fixtures dos testes.

Os testes de integração exigem um Postgres alcançável em ``TEST_DATABASE_URL``
(ou ``DATABASE_URL``). As migrations são aplicadas uma vez por sessão em um
banco descartável; se não houver banco, esses testes são pulados e os de
unidade seguem rodando.
"""

from __future__ import annotations

import asyncio
import os
import uuid
from pathlib import Path

import asyncpg
import pytest
import pytest_asyncio
from fastapi import Request
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "supabase" / "migrations"


def _base_url() -> str:
    return os.getenv(
        "TEST_DATABASE_URL",
        os.getenv(
            "DATABASE_URL", "postgresql+asyncpg://postgres:postgres@localhost:55432/postgres"
        ),
    )


def _dsn(url: str) -> str:
    """URL do SQLAlchemy → DSN aceito pelo asyncpg."""
    return url.replace("postgresql+asyncpg://", "postgresql://")


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    return "asyncio"


APP_ROLE = "crm_test_api"
APP_PASSWORD = "crm_test_api"


async def _create_and_migrate(admin_dsn: str, target_dsn: str, db_name: str) -> None:
    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(f'create database "{db_name}"')
    finally:
        await conn.close()

    # Cada migration tem vários comandos; o protocolo estendido do asyncpg
    # (prepared statements) não aceita isso, então usamos a conexão nativa,
    # que fala o protocolo simples.
    conn = await asyncpg.connect(target_dsn)
    try:
        for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
            await conn.execute(migration.read_text())

        # A API roda com um papel comum, sem BYPASSRLS. Testar como superusuário
        # desligaria silenciosamente o RLS e mascararia falhas de isolamento.
        await conn.execute(
            f"""
            do $$
            begin
              if not exists (select 1 from pg_roles where rolname = '{APP_ROLE}') then
                create role {APP_ROLE} login password '{APP_PASSWORD}';
              end if;
            end $$;
            grant {APP_ROLE} to current_user;
            grant app_api to {APP_ROLE};
            """
        )
    finally:
        await conn.close()


async def _drop(admin_dsn: str, db_name: str) -> None:
    conn = await asyncpg.connect(admin_dsn)
    try:
        await conn.execute(
            "select pg_terminate_backend(pid) from pg_stat_activity "
            "where datname = $1 and pid <> pg_backend_pid()",
            db_name,
        )
        await conn.execute(f'drop database if exists "{db_name}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def database_url() -> tuple[str, str]:
    """Cria um banco descartável, aplica as migrations e devolve (app, admin).

    Síncrona de propósito: um fixture async de escopo de sessão rodaria em um
    event loop diferente do de cada teste, e conexões asyncpg são presas ao
    loop em que nasceram.
    """
    admin_url = _base_url()
    db_name = f"test_crm_{uuid.uuid4().hex[:10]}"
    admin_target = admin_url.rsplit("/", 1)[0] + f"/{db_name}"

    try:
        asyncio.run(_create_and_migrate(_dsn(admin_url), _dsn(admin_target), db_name))
    except OSError as exc:  # pragma: no cover — ambiente sem Postgres
        pytest.skip(f"Postgres indisponível para testes de integração: {exc}")

    host_part = admin_url.split("@", 1)[1]
    app_target = (
        f"postgresql+asyncpg://{APP_ROLE}:{APP_PASSWORD}@{host_part.rsplit('/', 1)[0]}/{db_name}"
    )

    yield app_target, admin_target

    asyncio.run(_drop(_dsn(admin_url), db_name))


@pytest_asyncio.fixture
async def app_env(database_url: tuple[str, str], tmp_path):
    """Aplicação configurada para o banco de testes e storage em disco temporário."""
    from app.core import config, db
    from app.services import storage

    app_url, admin_url = database_url

    config.get_settings.cache_clear()
    os.environ["DATABASE_URL"] = app_url
    os.environ["LOCAL_STORAGE_DIR"] = str(tmp_path / "storage")
    os.environ["SUPABASE_JWT_SECRET"] = "x" * 40
    os.environ["APP_ENV"] = "development"

    await db.dispose_engine()
    storage.set_storage(storage.LocalStorage(str(tmp_path / "storage")))

    # O banco vive pela sessão inteira; cada teste começa do zero. Truncar
    # core.tenants em cascata alcança todas as tabelas de negócio, já que
    # todas referenciam o tenant com ON DELETE CASCADE. Exige o dono das
    # tabelas, por isso vai pela conexão administrativa.
    admin = await asyncpg.connect(_dsn(admin_url))
    try:
        await admin.execute("truncate core.tenants cascade")
    finally:
        await admin.close()

    yield

    await db.dispose_engine()
    storage.set_storage(None)
    config.get_settings.cache_clear()


@pytest_asyncio.fixture
async def tenants(app_env):
    """Dois tenants provisionados — base dos testes de isolamento."""
    from app.core.db import platform_connection

    created = {}
    async with platform_connection() as conn:
        for key, (name, plan, sub) in {
            "a": ("Imobiliária A", "completo", "imob-a"),
            "b": ("Imobiliária B", "locacao", "imob-b"),
        }.items():
            tenant_id = (
                await conn.execute(
                    text("select core.provision_tenant(:n, :p, :s)"),
                    {"n": name, "p": plan, "s": sub},
                )
            ).scalar_one()
            user_id = (
                await conn.execute(
                    text("select core.attach_user(:t, :a, :n, :e, 'Admin')"),
                    {
                        "t": str(tenant_id),
                        "a": str(uuid.uuid4()),
                        "n": f"Admin {name}",
                        "e": f"admin@{sub}.com.br",
                    },
                )
            ).scalar_one()
            created[key] = {
                "tenant_id": tenant_id,
                "user_id": user_id,
                "plan": plan,
                "name": name,
            }
    return created


def _current_user(info: dict, permissions: list[str] | None = None, roles=("Admin",)):
    from app.core.security import CurrentUser

    modules = ["module_rentals"]
    if info["plan"] in ("venda", "completo"):
        modules.append("module_sales")
    return CurrentUser(
        user_id=info["user_id"],
        tenant_id=info["tenant_id"],
        full_name="Usuário de Teste",
        email="teste@exemplo.com.br",
        tenant_name=info["name"],
        plan=info["plan"],
        roles=list(roles),
        permissions=permissions or [],
        modules=modules,
    )


@pytest_asyncio.fixture
async def client_factory(tenants):
    """Cria um cliente HTTP autenticado como o tenant indicado.

    A verificação do JWT é substituída (é do Supabase, não do sistema); tudo
    depois dela — contexto de tenant, RLS, RBAC — roda de verdade.
    """
    from app.core.deps import get_current_user
    from app.main import app

    clients: list[AsyncClient] = []
    # Cada cliente HTTP carrega sua própria identidade: o override é único e
    # resolve o usuário pelo cabeçalho, para que dois clientes de tenants
    # diferentes coexistam no mesmo teste.
    identities: dict[str, object] = {}

    async def _resolve(request: Request):
        return identities[request.headers["x-test-identity"]]

    app.dependency_overrides[get_current_user] = _resolve

    def make(tenant_key: str = "a", permissions=None, roles=("Admin",)) -> AsyncClient:
        key = f"{tenant_key}-{len(identities)}"
        identities[key] = _current_user(tenants[tenant_key], permissions, roles)
        http = AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
            headers={"Authorization": "Bearer fake", "X-Test-Identity": key},
        )
        clients.append(http)
        return http

    yield make

    for http in clients:
        await http.aclose()
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def api(client_factory):
    return client_factory("a")
