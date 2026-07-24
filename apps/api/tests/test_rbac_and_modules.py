"""RBAC granular e gating por módulo contratado."""

from __future__ import annotations

import pytest

pytestmark = pytest.mark.asyncio


async def test_sem_permissao_de_criar_e_bloqueado(client_factory):
    # Corretor típico: vê e cria clientes, mas não tem acesso ao financeiro.
    api = client_factory(
        "a",
        permissions=["clientes:view", "clientes:create", "imoveis:view"],
        roles=("Corretor",),
    )

    assert (await api.get("/api/v1/clients")).status_code == 200
    criar = await api.post("/api/v1/clients", json={"kind": "PF", "name": "Novo cliente"})
    assert criar.status_code == 201

    financeiro = await api.get("/api/v1/finance/receivables")
    assert financeiro.status_code == 403
    assert "permissão" in financeiro.json()["detail"]


async def test_admin_tem_acesso_total(api):
    # Admin não depende da lista de permissões explícitas.
    assert (await api.get("/api/v1/finance/receivables")).status_code == 200
    assert (await api.get("/api/v1/users")).status_code == 200
    assert (await api.get("/api/v1/users/roles/all")).status_code == 200


async def test_papeis_padrao_sao_criados_no_provisionamento(api):
    papeis = {r["name"] for r in (await api.get("/api/v1/users/roles/all")).json()}
    assert papeis == {
        "Admin",
        "Gestor",
        "Corretor",
        "Financeiro",
        "Atendimento",
        "Vistoriador",
        "RH",
    }


async def test_permissoes_do_corretor_nao_incluem_financeiro(api):
    papeis = (await api.get("/api/v1/users/roles/all")).json()
    corretor = next(r for r in papeis if r["name"] == "Corretor")
    financeiro = next(r for r in papeis if r["name"] == "Financeiro")

    assert not any(p.startswith("financeiro:") for p in corretor["permissions"])
    assert "clientes:create" in corretor["permissions"]
    assert "financeiro:edit" in financeiro["permissions"]


async def test_modulo_de_vendas_bloqueado_para_plano_locacao(client_factory):
    api_locacao = client_factory("b")  # plano "locacao"
    resp = await api_locacao.get("/api/v1/sales/status")
    assert resp.status_code == 403
    assert "não contratado" in resp.json()["detail"]


async def test_modulo_de_vendas_liberado_para_plano_completo(client_factory):
    api_completo = client_factory("a")  # plano "completo"
    resp = await api_completo.get("/api/v1/sales/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "em_breve"


async def test_auditoria_registra_acoes_sensiveis(api):
    criado = await api.post("/api/v1/clients", json={"kind": "PF", "name": "Auditado"})
    client_id = criado.json()["id"]
    await api.patch(f"/api/v1/clients/{client_id}", json={"name": "Auditado (editado)"})
    await api.delete(f"/api/v1/clients/{client_id}")

    log = (await api.get("/api/v1/users/audit/log")).json()
    acoes = [e["action"] for e in log if e["entity"] == "client"]
    assert acoes[:3] == ["delete", "update", "create"]
