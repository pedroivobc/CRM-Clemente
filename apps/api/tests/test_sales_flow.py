"""Fluxo de vendas ponta a ponta e autonomia entre os módulos.

O ponto central destes testes é que Vendas e Locação operam de forma
independente: funil, indicadores e financeiro próprios, e um plano que não
contrata o módulo não enxerga nada dele.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

pytestmark = pytest.mark.asyncio

D = Decimal


async def _property(api, **overrides) -> dict:
    payload = {
        "kind": "casa",
        "purpose": "venda",
        "title": "Casa à venda",
        "sale_price": "620000.00",
    }
    payload.update(overrides)
    return (await api.post("/api/v1/properties", json=payload)).json()


async def _client(api, name: str) -> dict:
    return (await api.post("/api/v1/clients", json={"kind": "PF", "name": name})).json()


# ── Funil ────────────────────────────────────────────────────────────────────
async def test_funil_de_vendas_tem_etapas_proprias(api):
    board = (await api.get("/api/v1/sales/board")).json()

    assert [s["key"] for s in board["stages"]] == [
        "lead",
        "qualificacao",
        "visita_agendada",
        "visita_realizada",
        "proposta",
        "negociacao",
        "fechamento",
    ]
    assert board["stages"][-1]["is_won"] is True


async def test_funil_de_vendas_e_independente_do_de_locacao(api):
    venda = (await api.get("/api/v1/sales/board")).json()
    locacao = (await api.get("/api/v1/rentals/board")).json()

    assert venda["pipeline_id"] != locacao["pipeline_id"]
    # "Negociação" é etapa de venda; "Análise cadastral" é de locação.
    assert "negociacao" in [s["key"] for s in venda["stages"]]
    assert "negociacao" not in [s["key"] for s in locacao["stages"]]
    assert "analise" in [s["key"] for s in locacao["stages"]]


async def test_lead_de_venda_guarda_orcamento_e_forma_de_pagamento(api):
    lead = (
        await api.post(
            "/api/v1/sales/leads",
            json={
                "name": "Comprador interessado",
                "budget_min": "400000.00",
                "budget_max": "650000.00",
                "financing_type": "financiamento",
                "source": "portal",
            },
        )
    ).json()

    assert lead["stage_name"] == "Lead"
    assert lead["financing_type"] == "financiamento"
    assert Decimal(lead["budget_max"]) == D("650000.00")


async def test_forma_de_pagamento_invalida_e_recusada(api):
    resp = await api.post("/api/v1/sales/leads", json={"name": "X", "financing_type": "bitcoin"})
    assert resp.status_code == 400


async def test_lead_de_venda_nao_aparece_no_funil_de_locacao(api):
    await api.post("/api/v1/sales/leads", json={"name": "Só de venda"})

    locacao = (await api.get("/api/v1/rentals/board")).json()
    assert locacao["leads"] == []

    venda = (await api.get("/api/v1/sales/board")).json()
    assert len(venda["leads"]) == 1


async def test_mover_para_fechamento_marca_lead_como_ganho(api):
    board = (await api.get("/api/v1/sales/board")).json()
    fechamento = next(s for s in board["stages"] if s["key"] == "fechamento")

    lead = (await api.post("/api/v1/sales/leads", json={"name": "Vai comprar"})).json()
    ganho = (
        await api.post(
            f"/api/v1/sales/leads/{lead['id']}/move", json={"stage_id": fechamento["id"]}
        )
    ).json()

    assert ganho["status"] == "ganho"


async def test_motivos_de_perda_sao_proprios_de_vendas(api):
    motivos = {m["name"] for m in (await api.get("/api/v1/sales/loss-reasons")).json()}

    assert "Não conseguiu financiamento" in motivos
    # Motivo típico de locação não deve aparecer aqui.
    assert "Reprovado na análise cadastral" not in motivos


# ── Propostas ────────────────────────────────────────────────────────────────
async def test_proposta_calcula_o_desconto_sobre_o_pedido(api):
    imovel = await _property(api)
    comprador = await _client(api, "Comprador")

    proposta = (
        await api.post(
            "/api/v1/sales/proposals",
            json={
                "property_id": imovel["id"],
                "buyer_id": comprador["id"],
                "asking_price": "620000.00",
                "offer_amount": "580000.00",
                "financing_type": "financiamento",
                "financing_bank": "Caixa",
            },
        )
    ).json()

    assert proposta["code"] == "PROP-0001"
    assert proposta["status"] == "aberta"
    assert proposta["round"] == 1
    assert Decimal(proposta["discount_amount"]) == D("40000.00")
    assert Decimal(proposta["discount_pct"]) == D("6.4516")


async def test_comprador_ganha_o_papel_no_crm(api):
    imovel = await _property(api)
    comprador = await _client(api, "Novo comprador")

    await api.post(
        "/api/v1/sales/proposals",
        json={
            "property_id": imovel["id"],
            "buyer_id": comprador["id"],
            "asking_price": "500000.00",
            "offer_amount": "480000.00",
        },
    )

    atualizado = (await api.get(f"/api/v1/clients/{comprador['id']}")).json()
    assert "comprador" in atualizado["roles"]


async def test_contraproposta_abre_nova_rodada_preservando_o_historico(api):
    imovel = await _property(api)
    proposta = (
        await api.post(
            "/api/v1/sales/proposals",
            json={
                "property_id": imovel["id"],
                "asking_price": "620000.00",
                "offer_amount": "560000.00",
            },
        )
    ).json()

    contra = (
        await api.post(
            f"/api/v1/sales/proposals/{proposta['id']}/counter",
            json={"offer_amount": "595000.00", "notes": "Contraproposta do vendedor"},
        )
    ).json()

    assert contra["round"] == 2
    assert contra["parent_id"] == proposta["id"]
    assert Decimal(contra["offer_amount"]) == D("595000.00")

    todas = (await api.get("/api/v1/sales/proposals")).json()
    original = next(p for p in todas if p["id"] == proposta["id"])
    assert original["status"] == "contraproposta"


async def test_proposta_aceita_reserva_o_imovel(api):
    imovel = await _property(api)
    proposta = (
        await api.post(
            "/api/v1/sales/proposals",
            json={
                "property_id": imovel["id"],
                "asking_price": "620000.00",
                "offer_amount": "610000.00",
            },
        )
    ).json()

    aceita = (await api.post(f"/api/v1/sales/proposals/{proposta['id']}/accept", json={})).json()
    assert aceita["status"] == "aceita"

    atualizado = (await api.get(f"/api/v1/properties/{imovel['id']}")).json()
    assert atualizado["status"] == "reservado"


async def test_proposta_ja_decidida_nao_aceita_nova_decisao(api):
    imovel = await _property(api)
    proposta = (
        await api.post(
            "/api/v1/sales/proposals",
            json={
                "property_id": imovel["id"],
                "asking_price": "400000.00",
                "offer_amount": "380000.00",
            },
        )
    ).json()

    await api.post(f"/api/v1/sales/proposals/{proposta['id']}/reject", json={})
    resp = await api.post(f"/api/v1/sales/proposals/{proposta['id']}/accept", json={})
    assert resp.status_code == 409


# ── Negócios e comissões ─────────────────────────────────────────────────────
async def test_venda_fechada_rateia_a_comissao_e_marca_o_imovel(api):
    imovel = await _property(api)
    comprador = await _client(api, "Comprador")
    vendedor = await _client(api, "Vendedor")

    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={
                "property_id": imovel["id"],
                "buyer_id": comprador["id"],
                "seller_id": vendedor["id"],
                "sale_amount": "620000.00",
                "financing_type": "financiamento",
                "financing_bank": "Caixa",
            },
        )
    ).json()

    assert negocio["code"] == "VEN-0001"
    assert negocio["status"] == "em_andamento"
    # 6% de 620.000 = 37.200; sem corretores, tudo da imobiliária.
    assert Decimal(negocio["commission_total"]) == D("37200.00")
    assert [c["beneficiary"] for c in negocio["commissions"]] == ["agency"]

    atualizado = (await api.get(f"/api/v1/properties/{imovel['id']}")).json()
    assert atualizado["status"] == "vendido"


async def test_comissao_rateada_entre_captador_e_vendedor(api, tenants):
    imovel = await _property(api)
    corretor = str(tenants["a"]["user_id"])

    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={
                "property_id": imovel["id"],
                "sale_amount": "500000.00",
                "lister_id": corretor,
                "seller_broker_id": corretor,
            },
        )
    ).json()

    partes = {c["beneficiary"]: Decimal(c["amount"]) for c in negocio["commissions"]}
    assert Decimal(negocio["commission_total"]) == D("30000.00")
    assert partes["lister"] == D("6000.00")  # 20%
    assert partes["seller_broker"] == D("9000.00")  # 30%
    assert partes["agency"] == D("15000.00")  # 50%
    assert sum(partes.values()) == D("30000.00")


async def test_comissao_da_imobiliaria_entra_no_contas_a_receber(api):
    imovel = await _property(api)

    await api.post(
        "/api/v1/sales/deals",
        json={"property_id": imovel["id"], "sale_amount": "400000.00"},
    )

    receber = (await api.get("/api/v1/finance/receivables")).json()
    assert receber["total"] == 1
    lancamento = receber["items"][0]
    assert Decimal(lancamento["amount"]) == D("24000.00")
    assert "Comissão de venda" in lancamento["description"]
    assert lancamento["account_name"] == "Comissão de venda"


async def test_percentual_de_comissao_pode_ser_ajustado_no_negocio(api):
    imovel = await _property(api)
    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={
                "property_id": imovel["id"],
                "sale_amount": "620000.00",
                "commission_pct": "5",
            },
        )
    ).json()
    assert Decimal(negocio["commission_total"]) == D("31000.00")


async def test_cancelar_venda_devolve_o_imovel_e_cancela_a_comissao(api):
    imovel = await _property(api)
    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={"property_id": imovel["id"], "sale_amount": "500000.00"},
        )
    ).json()

    cancelado = (
        await api.post(
            f"/api/v1/sales/deals/{negocio['id']}/cancel",
            json={"notes": "Financiamento negado"},
        )
    ).json()

    assert cancelado["status"] == "cancelado"
    assert all(c["status"] == "cancelado" for c in cancelado["commissions"])

    imovel_atualizado = (await api.get(f"/api/v1/properties/{imovel['id']}")).json()
    assert imovel_atualizado["status"] == "disponivel"

    receber = (await api.get("/api/v1/finance/receivables?status=cancelado")).json()
    assert receber["total"] == 1


async def test_pagar_comissao_do_corretor(api, tenants):
    imovel = await _property(api)
    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={
                "property_id": imovel["id"],
                "sale_amount": "500000.00",
                "seller_broker_id": str(tenants["a"]["user_id"]),
            },
        )
    ).json()

    pago = (
        await api.post(f"/api/v1/sales/deals/{negocio['id']}/commissions/seller_broker/pay")
    ).json()

    comissao = next(c for c in pago["commissions"] if c["beneficiary"] == "seller_broker")
    assert comissao["status"] == "pago"

    # Pagar de novo não é possível.
    resp = await api.post(f"/api/v1/sales/deals/{negocio['id']}/commissions/seller_broker/pay")
    assert resp.status_code == 409


async def test_regra_de_comissao_precisa_somar_cem_por_cento(api):
    resp = await api.put(
        "/api/v1/sales/commission-rule",
        json={
            "default_pct": "6",
            "agency_share_pct": "50",
            "lister_share_pct": "20",
            "seller_share_pct": "20",
        },
    )
    assert resp.status_code == 400
    assert "100%" in resp.json()["detail"]


async def test_regra_de_comissao_ajustada_vale_para_o_proximo_negocio(api, tenants):
    await api.put(
        "/api/v1/sales/commission-rule",
        json={
            "default_pct": "5",
            "agency_share_pct": "40",
            "lister_share_pct": "25",
            "seller_share_pct": "35",
        },
    )

    imovel = await _property(api)
    negocio = (
        await api.post(
            "/api/v1/sales/deals",
            json={
                "property_id": imovel["id"],
                "sale_amount": "600000.00",
                "seller_broker_id": str(tenants["a"]["user_id"]),
            },
        )
    ).json()

    partes = {c["beneficiary"]: Decimal(c["amount"]) for c in negocio["commissions"]}
    assert Decimal(negocio["commission_total"]) == D("30000.00")  # 5%
    assert partes["seller_broker"] == D("10500.00")  # 35%
    assert partes["agency"] == D("19500.00")  # 40% + 25% órfãos


# ── Painéis por módulo ───────────────────────────────────────────────────────
async def test_painel_de_vendas_traz_indicadores_proprios(api, tenants):
    imovel = await _property(api)
    await api.post(
        "/api/v1/sales/deals",
        json={
            "property_id": imovel["id"],
            "sale_amount": "620000.00",
            "seller_broker_id": str(tenants["a"]["user_id"]),
        },
    )
    outro = await _property(api, title="Segunda casa")
    await api.post(
        "/api/v1/sales/deals", json={"property_id": outro["id"], "sale_amount": "380000.00"}
    )

    painel = (await api.get("/api/v1/sales/dashboard")).json()

    assert Decimal(painel["vgv"]) == D("1000000.00")
    assert painel["vendas"] == 2
    assert Decimal(painel["ticket_medio"]) == D("500000.00")
    assert Decimal(painel["comissao_gerada"]) == D("60000.00")
    assert len(painel["funil"]) == 7
    assert painel["ranking_corretores"][0]["vendas"] == 1


async def test_painel_de_vendas_mostra_o_valor_em_negociacao(api):
    imovel = await _property(api)
    await api.post(
        "/api/v1/sales/proposals",
        json={
            "property_id": imovel["id"],
            "asking_price": "620000.00",
            "offer_amount": "590000.00",
        },
    )

    painel = (await api.get("/api/v1/sales/dashboard")).json()
    assert Decimal(painel["valor_em_negociacao"]) == D("590000.00")


async def test_painel_de_locacao_traz_indicadores_proprios(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "apartamento", "purpose": "locacao", "title": "Apto"},
        )
    ).json()
    proprietario = await _client(api, "Proprietário")
    locatario = await _client(api, "Locatário")

    contrato = (
        await api.post(
            "/api/v1/contracts",
            json={
                "property_id": imovel["id"],
                "rent_amount": "2000.00",
                "admin_fee_pct": "10",
                "start_date": date.today().replace(day=1).isoformat(),
                "end_date": date.today().replace(year=date.today().year + 1).isoformat(),
                "parties": [
                    {"client_id": proprietario["id"], "role": "locador", "is_payee": True},
                    {"client_id": locatario["id"], "role": "locatario"},
                ],
            },
        )
    ).json()
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")

    painel = (await api.get("/api/v1/rentals/dashboard")).json()

    assert painel["carteira"]["contratos_ativos"] == 1
    assert Decimal(painel["carteira"]["aluguel_administrado"]) == D("2000.00")
    assert Decimal(painel["carteira"]["taxa_mensal_prevista"]) == D("200.00")
    assert len(painel["funil"]) == 7


async def test_paineis_dos_modulos_nao_se_misturam(api):
    """O painel de vendas não conhece contratos, e o de locação não conhece VGV."""
    painel_vendas = (await api.get("/api/v1/sales/dashboard")).json()
    painel_locacao = (await api.get("/api/v1/rentals/dashboard")).json()

    assert "vgv" in painel_vendas and "carteira" not in painel_vendas
    assert "carteira" in painel_locacao and "vgv" not in painel_locacao


# ── Autonomia por plano contratado ───────────────────────────────────────────
async def test_plano_locacao_nao_acessa_nada_de_vendas(client_factory):
    api_locacao = client_factory("b")  # plano "locacao"

    for rota in (
        "/api/v1/sales/board",
        "/api/v1/sales/proposals",
        "/api/v1/sales/deals",
        "/api/v1/sales/dashboard",
    ):
        resp = await api_locacao.get(rota)
        assert resp.status_code == 403, rota
        assert "não contratado" in resp.json()["detail"]


async def test_plano_locacao_nao_recebe_funil_de_vendas_no_provisionamento(client_factory):
    from sqlalchemy import text

    from app.core.db import tenant_connection

    api_locacao = client_factory("b")
    assert (await api_locacao.get("/api/v1/rentals/board")).status_code == 200

    # O tenant de locação não tem pipeline de vendas criado.
    tenant_id = (await api_locacao.get("/api/v1/session/me")).json()["tenant_id"]
    async with tenant_connection(tenant_id) as conn:
        total = (await conn.execute(text("select count(*) from sales.pipelines"))).scalar_one()
    assert total == 0
