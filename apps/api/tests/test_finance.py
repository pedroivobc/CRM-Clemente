"""Financeiro central: lançamentos, baixa, fluxo de caixa e DRE."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

pytestmark = pytest.mark.asyncio


def _due(days: int) -> str:
    return (date.today() + timedelta(days=days)).isoformat()


async def test_ciclo_de_conta_a_receber(api):
    criar = await api.post(
        "/api/v1/finance/receivables",
        json={"description": "Taxa de administração", "due_date": _due(5), "amount": "450.00"},
    )
    assert criar.status_code == 201
    entry = criar.json()
    assert entry["status"] == "pendente"
    assert entry["overdue"] is False
    # Sem competência informada, vale o vencimento.
    assert entry["competence_date"] == entry["due_date"]

    baixa = await api.post(f"/api/v1/finance/receivables/{entry['id']}/settle", json={})
    assert baixa.status_code == 200
    assert baixa.json()["status"] == "recebido"
    assert Decimal(baixa.json()["paid_amount"]) == Decimal("450.00")

    # Não se baixa duas vezes.
    assert (
        await api.post(f"/api/v1/finance/receivables/{entry['id']}/settle", json={})
    ).status_code == 409


async def test_baixa_parcial_registra_valor_informado(api):
    entry = (
        await api.post(
            "/api/v1/finance/payables",
            json={"description": "Fornecedor", "due_date": _due(3), "amount": "1000.00"},
        )
    ).json()

    baixa = await api.post(
        f"/api/v1/finance/payables/{entry['id']}/settle",
        json={"paid_amount": "800.00", "paid_at": date.today().isoformat()},
    )
    assert Decimal(baixa.json()["paid_amount"]) == Decimal("800.00")
    assert baixa.json()["status"] == "pago"


async def test_lancamento_vencido_e_sinalizado(api):
    entry = (
        await api.post(
            "/api/v1/finance/receivables",
            json={"description": "Aluguel atrasado", "due_date": _due(-10), "amount": "2000.00"},
        )
    ).json()
    assert entry["overdue"] is True

    resumo = (await api.get("/api/v1/finance/reports/summary")).json()
    assert Decimal(resumo["receber_vencido"]) == Decimal("2000.00")


async def test_cancelamento_remove_do_fluxo_de_caixa(api):
    entry = (
        await api.post(
            "/api/v1/finance/receivables",
            json={"description": "Cancelável", "due_date": _due(10), "amount": "999.00"},
        )
    ).json()

    antes = (await api.get("/api/v1/finance/reports/cashflow")).json()
    assert Decimal(antes["saldo_projetado"]) == Decimal("999.00")

    await api.post(f"/api/v1/finance/receivables/{entry['id']}/cancel")

    depois = (await api.get("/api/v1/finance/reports/cashflow")).json()
    assert Decimal(depois["saldo_projetado"]) == Decimal("0")


async def test_fluxo_de_caixa_projeta_saldo_acumulado(api):
    await api.post(
        "/api/v1/finance/receivables",
        json={"description": "Entrada", "due_date": _due(5), "amount": "3000.00"},
    )
    await api.post(
        "/api/v1/finance/payables",
        json={"description": "Saída", "due_date": _due(10), "amount": "1200.00"},
    )

    fluxo = (await api.get("/api/v1/finance/reports/cashflow?days=30")).json()
    assert Decimal(fluxo["saldo_projetado"]) == Decimal("1800.00")

    series = fluxo["series"]
    assert Decimal(series[0]["entradas"]) == Decimal("3000.00")
    assert Decimal(series[-1]["saldo_acumulado"]) == Decimal("1800.00")


async def test_fluxo_de_caixa_ignora_vencimentos_fora_da_janela(api):
    await api.post(
        "/api/v1/finance/receivables",
        json={"description": "Longe", "due_date": _due(200), "amount": "5000.00"},
    )
    fluxo = (await api.get("/api/v1/finance/reports/cashflow?days=30")).json()
    assert Decimal(fluxo["saldo_projetado"]) == Decimal("0")


async def test_dre_agrupa_por_competencia_e_conta(api):
    contas = (await api.get("/api/v1/finance/accounts")).json()
    taxa_adm = next(c for c in contas if c["code"] == "1.01")

    await api.post(
        "/api/v1/finance/receivables",
        json={
            "description": "Taxa de administração — julho",
            "due_date": _due(5),
            "competence_date": date.today().replace(day=1).isoformat(),
            "amount": "700.00",
            "account_id": taxa_adm["id"],
        },
    )

    dre = (await api.get("/api/v1/finance/reports/dre")).json()
    linha = next(r for r in dre if r["account"] == "Taxa de administração de aluguel")
    assert linha["kind"] == "receita"
    assert Decimal(linha["amount"]) == Decimal("700.00")


async def test_resumo_calcula_resultado_do_mes(api):
    recebivel = (
        await api.post(
            "/api/v1/finance/receivables",
            json={"description": "Receita", "due_date": _due(1), "amount": "5000.00"},
        )
    ).json()
    pagavel = (
        await api.post(
            "/api/v1/finance/payables",
            json={"description": "Despesa", "due_date": _due(1), "amount": "1500.00"},
        )
    ).json()

    await api.post(f"/api/v1/finance/receivables/{recebivel['id']}/settle", json={})
    await api.post(f"/api/v1/finance/payables/{pagavel['id']}/settle", json={})

    resumo = (await api.get("/api/v1/finance/reports/summary")).json()
    assert Decimal(resumo["recebido_mes"]) == Decimal("5000.00")
    assert Decimal(resumo["pago_mes"]) == Decimal("1500.00")
    assert Decimal(resumo["resultado_mes"]) == Decimal("3500.00")


async def test_valor_negativo_e_rejeitado(api):
    resp = await api.post(
        "/api/v1/finance/receivables",
        json={"description": "Inválido", "due_date": _due(1), "amount": "-10.00"},
    )
    assert resp.status_code == 422
