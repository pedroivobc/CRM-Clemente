"""Isolamento multi-tenant: nenhum dado atravessa a fronteira do tenant.

Estes testes exercitam a API real contra o Postgres real, com RLS ativo.
"""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio

CLIENTE_A = {"kind": "PF", "name": "Cliente do Tenant A", "cpf_cnpj": "390.533.447-05"}
CLIENTE_B = {"kind": "PF", "name": "Cliente do Tenant B", "cpf_cnpj": "111.444.777-35"}


async def test_listagem_nao_vaza_entre_tenants(client_factory):
    api_a = client_factory("a")
    resp = await api_a.post("/api/v1/clients", json=CLIENTE_A)
    assert resp.status_code == 201, resp.text
    client_a_id = resp.json()["id"]

    api_b = client_factory("b")
    listagem_b = await api_b.get("/api/v1/clients")
    assert listagem_b.status_code == 200
    assert listagem_b.json()["total"] == 0

    # Nem por acesso direto ao identificador.
    direto = await api_b.get(f"/api/v1/clients/{client_a_id}")
    assert direto.status_code == 404


async def test_mesmo_cpf_pode_existir_em_tenants_diferentes(client_factory):
    api_a = client_factory("a")
    api_b = client_factory("b")

    assert (await api_a.post("/api/v1/clients", json=CLIENTE_A)).status_code == 201
    # O mesmo CPF em outro tenant não conflita: a unicidade é por tenant.
    assert (await api_b.post("/api/v1/clients", json=CLIENTE_A)).status_code == 201


async def test_cpf_duplicado_no_mesmo_tenant_e_rejeitado(api):
    assert (await api.post("/api/v1/clients", json=CLIENTE_A)).status_code == 201
    dup = await api.post("/api/v1/clients", json=CLIENTE_A)
    assert dup.status_code == 409


async def test_imoveis_isolados_por_tenant(client_factory):
    api_a = client_factory("a")
    api_b = client_factory("b")

    imovel = {"kind": "apartamento", "purpose": "locacao", "title": "Apto 2 quartos"}
    resp = await api_a.post("/api/v1/properties", json=imovel)
    assert resp.status_code == 201, resp.text
    assert resp.json()["code"] == "IM-0001"

    # A numeração é por tenant: o primeiro imóvel de B também é IM-0001.
    resp_b = await api_b.post("/api/v1/properties", json=imovel)
    assert resp_b.status_code == 201
    assert resp_b.json()["code"] == "IM-0001"

    assert (await api_b.get("/api/v1/properties")).json()["total"] == 1


async def test_financeiro_isolado_por_tenant(client_factory):
    api_a = client_factory("a")
    api_b = client_factory("b")

    lancamento = {
        "description": "Aluguel de sala",
        "due_date": "2026-08-10",
        "amount": "1500.00",
    }
    assert (await api_a.post("/api/v1/finance/receivables", json=lancamento)).status_code == 201

    assert (await api_b.get("/api/v1/finance/receivables")).json()["total"] == 0
    assert (await api_a.get("/api/v1/finance/receivables")).json()["total"] == 1


async def test_plano_de_contas_e_semeado_por_tenant(client_factory):
    api_a = client_factory("a")
    contas = (await api_a.get("/api/v1/finance/accounts")).json()
    centros = (await api_a.get("/api/v1/finance/cost-centers")).json()

    assert any(c["code"] == "1.01" for c in contas)
    assert {c["name"] for c in centros} == {"Locação", "Vendas", "Administrativo"}
