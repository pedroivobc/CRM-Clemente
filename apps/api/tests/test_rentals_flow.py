"""Fluxo de locação ponta a ponta: funil → contrato → cobrança → repasse."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

pytestmark = pytest.mark.asyncio

D = Decimal


async def _property(api, **overrides) -> dict:
    payload = {"kind": "apartamento", "purpose": "locacao", "title": "Apto para locação"}
    payload.update(overrides)
    return (await api.post("/api/v1/properties", json=payload)).json()


async def _client(api, name: str, roles=()) -> dict:
    return (
        await api.post("/api/v1/clients", json={"kind": "PF", "name": name, "roles": list(roles)})
    ).json()


async def _contract(api, **overrides) -> dict:
    prop = await _property(api)
    owner = await _client(api, "Proprietário do imóvel", ["proprietario"])
    tenant = await _client(api, "Locatário do imóvel", ["locatario"])

    payload = {
        "property_id": prop["id"],
        "rent_amount": "1850.00",
        "condo_fee": "420.00",
        "iptu_amount": "98.00",
        "admin_fee_pct": "10",
        "start_date": date.today().replace(day=1).isoformat(),
        "end_date": (date.today().replace(day=1) + timedelta(days=730)).isoformat(),
        "due_day": 10,
        "parties": [
            {"client_id": owner["id"], "role": "locador", "is_payee": True},
            {"client_id": tenant["id"], "role": "locatario"},
        ],
    }
    payload.update(overrides)
    resp = await api.post("/api/v1/contracts", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


# ── Funil ────────────────────────────────────────────────────────────────────
async def test_funil_vem_pronto_com_as_etapas_da_locacao(api):
    board = (await api.get("/api/v1/rentals/board")).json()
    assert [s["key"] for s in board["stages"]] == [
        "lead",
        "qualificacao",
        "visita_agendada",
        "visita_realizada",
        "analise",
        "proposta",
        "contrato",
    ]
    assert board["stages"][-1]["is_won"] is True


async def test_lead_entra_na_primeira_etapa(api):
    lead = (
        await api.post(
            "/api/v1/rentals/leads",
            json={"name": "Interessado no apto", "phone": "32999998888", "source": "portal"},
        )
    ).json()

    assert lead["stage_name"] == "Lead"
    assert lead["status"] == "aberto"
    assert lead["sla_breached"] is False


async def test_mover_lead_registra_o_tempo_na_etapa(api):
    board = (await api.get("/api/v1/rentals/board")).json()
    qualificacao = next(s for s in board["stages"] if s["key"] == "qualificacao")

    lead = (await api.post("/api/v1/rentals/leads", json={"name": "Lead"})).json()
    movido = (
        await api.post(
            f"/api/v1/rentals/leads/{lead['id']}/move", json={"stage_id": qualificacao["id"]}
        )
    ).json()

    assert movido["stage_name"] == "Qualificação"
    assert movido["hours_in_stage"] < 1


async def test_mover_para_a_etapa_final_marca_o_lead_como_ganho(api):
    board = (await api.get("/api/v1/rentals/board")).json()
    contrato = next(s for s in board["stages"] if s["key"] == "contrato")

    lead = (await api.post("/api/v1/rentals/leads", json={"name": "Vai fechar"})).json()
    ganho = (
        await api.post(
            f"/api/v1/rentals/leads/{lead['id']}/move", json={"stage_id": contrato["id"]}
        )
    ).json()

    assert ganho["status"] == "ganho"


async def test_lead_perdido_exige_motivo_e_sai_do_quadro(api):
    motivos = (await api.get("/api/v1/rentals/loss-reasons")).json()
    assert len(motivos) == 6

    lead = (await api.post("/api/v1/rentals/leads", json={"name": "Vai perder"})).json()
    perdido = (
        await api.post(
            f"/api/v1/rentals/leads/{lead['id']}/lose", json={"loss_reason_id": motivos[0]["id"]}
        )
    ).json()

    assert perdido["status"] == "perdido"
    assert perdido["loss_reason"] == motivos[0]["name"]

    board = (await api.get("/api/v1/rentals/board")).json()
    assert lead["id"] not in [item["id"] for item in board["leads"]]


async def test_lead_ja_encerrado_nao_pode_ser_movido(api):
    motivos = (await api.get("/api/v1/rentals/loss-reasons")).json()
    board = (await api.get("/api/v1/rentals/board")).json()

    lead = (await api.post("/api/v1/rentals/leads", json={"name": "Encerrado"})).json()
    await api.post(
        f"/api/v1/rentals/leads/{lead['id']}/lose", json={"loss_reason_id": motivos[0]["id"]}
    )

    resp = await api.post(
        f"/api/v1/rentals/leads/{lead['id']}/move", json={"stage_id": board["stages"][1]["id"]}
    )
    assert resp.status_code == 409


async def test_analise_cadastral_calcula_a_renda_minima(api):
    analise = (
        await api.post(
            "/api/v1/rentals/credit-analyses",
            json={
                "rent_amount": "1800.00",
                "income_multiplier": "3",
                "declared_income": "6000.00",
                "guarantee_type": "seguro_fianca",
            },
        )
    ).json()

    assert analise["required_income"] == "5400.00"
    assert analise["income_ok"] is True
    assert analise["result"] == "pendente"


async def test_analise_reprova_renda_insuficiente(api):
    analise = (
        await api.post(
            "/api/v1/rentals/credit-analyses",
            json={"rent_amount": "2000.00", "declared_income": "5000.00"},
        )
    ).json()
    assert analise["income_ok"] is False

    decidida = (
        await api.post(
            f"/api/v1/rentals/credit-analyses/{analise['id']}/decide",
            json={"result": "reprovado", "notes": "Renda abaixo de 3x o aluguel"},
        )
    ).json()
    assert decidida["result"] == "reprovado"


# ── Contratos ────────────────────────────────────────────────────────────────
async def test_contrato_recebe_codigo_e_calcula_a_taxa(api):
    contrato = await _contract(api)

    assert contrato["code"] == "LOC-0001"
    assert contrato["status"] == "rascunho"
    assert contrato["total_monthly"] == "2368.00"  # 1850 + 420 + 98
    assert contrato["admin_fee_amount"] == "185.00"  # 10% do aluguel
    assert {p["role"] for p in contrato["parties"]} == {"locador", "locatario"}


async def test_contrato_exige_fim_posterior_ao_inicio(api):
    prop = await _property(api)
    resp = await api.post(
        "/api/v1/contracts",
        json={
            "property_id": prop["id"],
            "rent_amount": "1000.00",
            "start_date": "2026-08-01",
            "end_date": "2026-07-01",
        },
    )
    assert resp.status_code == 422


async def test_partes_do_contrato_ganham_papel_no_crm(api):
    contrato = await _contract(api)
    locatario = next(p for p in contrato["parties"] if p["role"] == "locatario")

    cliente = (await api.get(f"/api/v1/clients/{locatario['client_id']}")).json()
    assert "locatario" in cliente["roles"]


async def test_texto_do_contrato_substitui_as_variaveis(api):
    contrato = await _contract(api)
    corpo = (await api.get(f"/api/v1/contracts/{contrato['id']}/preview")).json()["body"]

    assert "{{" not in corpo and "«" not in corpo
    assert "Locatário do imóvel" in corpo
    assert "R$ 1.850,00" in corpo
    assert "IGP-M" in corpo


async def test_envio_para_assinatura_trava_o_rascunho(api):
    contrato = await _contract(api)

    envio = (await api.post(f"/api/v1/contracts/{contrato['id']}/sign")).json()
    assert envio["envelope_id"].startswith("env_")
    assert len(envio["signers"]) == 2

    atualizado = (await api.get(f"/api/v1/contracts/{contrato['id']}")).json()
    assert atualizado["status"] == "em_assinatura"


async def test_ativar_contrato_marca_o_imovel_como_alugado(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")

    imovel = (await api.get(f"/api/v1/properties/{contrato['property_id']}")).json()
    assert imovel["status"] == "alugado"


async def test_encerrar_contrato_libera_o_imovel(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    await api.post(f"/api/v1/contracts/{contrato['id']}/terminate")

    imovel = (await api.get(f"/api/v1/properties/{contrato['property_id']}")).json()
    assert imovel["status"] == "disponivel"

    encerrado = (await api.get(f"/api/v1/contracts/{contrato['id']}")).json()
    assert encerrado["status"] == "encerrado"


async def test_alerta_de_vigencia_lista_contratos_perto_do_fim(api):
    await _contract(
        api,
        start_date=(date.today() - timedelta(days=300)).isoformat(),
        end_date=(date.today() + timedelta(days=45)).isoformat(),
    )
    contrato = (await api.get("/api/v1/contracts"))[0] if False else None  # noqa: F841

    ativos = (await api.get("/api/v1/contracts")).json()
    await api.post(f"/api/v1/contracts/{ativos[0]['id']}/activate")

    alertas = (await api.get("/api/v1/contracts/alerts/expiring?days=90")).json()
    assert len(alertas) == 1
    assert alertas[0]["days_left"] == 45


# ── Cobranças ────────────────────────────────────────────────────────────────
async def test_geracao_mensal_cria_cobranca_com_split(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")

    competencia = date.today().replace(day=1)
    resultado = (
        await api.post("/api/v1/billing/generate", json={"competence": competencia.isoformat()})
    ).json()

    assert resultado["created"] == 1
    cobranca = resultado["charges"][0]

    assert cobranca["gross_amount"] == "2368.00"
    assert cobranca["due_date"] == competencia.replace(day=10).isoformat()
    assert [i["kind"] for i in cobranca["items"]] == ["aluguel", "condominio", "iptu"]

    splits = {s["beneficiary"]: Decimal(s["amount"]) for s in cobranca["splits"]}
    assert splits["agency"] == D("185.00")  # taxa sobre o aluguel apenas
    assert splits["owner"] == D("2183.00")
    assert sum(splits.values()) == D("2368.00")


async def test_geracao_do_mesmo_mes_nao_duplica(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    competencia = date.today().replace(day=1).isoformat()

    primeira = (await api.post("/api/v1/billing/generate", json={"competence": competencia})).json()
    segunda = (await api.post("/api/v1/billing/generate", json={"competence": competencia})).json()

    assert primeira["created"] == 1
    assert segunda["created"] == 0
    assert segunda["skipped"] == 1


async def test_contrato_em_rascunho_nao_gera_cobranca(api):
    await _contract(api)  # sem ativar
    resultado = (
        await api.post(
            "/api/v1/billing/generate",
            json={"competence": date.today().replace(day=1).isoformat()},
        )
    ).json()
    assert resultado["created"] == 0


async def test_cobranca_traz_boleto_e_pix(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    resultado = (
        await api.post(
            "/api/v1/billing/generate",
            json={"competence": date.today().replace(day=1).isoformat()},
        )
    ).json()
    cobranca = resultado["charges"][0]

    assert cobranca["boleto_line"]
    assert cobranca["pix_copy_paste"]

    segunda_via = (await api.get(f"/api/v1/billing/charges/{cobranca['id']}/second-copy")).json()
    assert segunda_via["boleto_line"] == cobranca["boleto_line"]


async def test_baixa_manual_em_dia_nao_cobra_multa(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    competencia = date.today().replace(day=1)
    cobranca = (
        await api.post("/api/v1/billing/generate", json={"competence": competencia.isoformat()})
    ).json()["charges"][0]

    baixada = (
        await api.post(
            f"/api/v1/billing/charges/{cobranca['id']}/settle",
            json={"paid_at": cobranca["due_date"], "method": "pix"},
        )
    ).json()

    assert baixada["status"] == "baixado_manual"
    assert baixada["gross_amount"] == "2368.00"
    assert [i["kind"] for i in baixada["items"]] == ["aluguel", "condominio", "iptu"]


async def test_baixa_manual_em_atraso_acrescenta_multa_e_juros(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    competencia = date.today().replace(day=1)
    cobranca = (
        await api.post("/api/v1/billing/generate", json={"competence": competencia.isoformat()})
    ).json()["charges"][0]

    vencimento = date.fromisoformat(cobranca["due_date"])
    baixada = (
        await api.post(
            f"/api/v1/billing/charges/{cobranca['id']}/settle",
            json={"paid_at": (vencimento + timedelta(days=10)).isoformat()},
        )
    ).json()

    kinds = {i["kind"]: Decimal(i["amount"]) for i in baixada["items"]}
    assert kinds["multa"] == D("47.36")  # 2% de 2368
    assert kinds["juros"] == D("7.81")  # 0,033% × 10 dias
    assert Decimal(baixada["gross_amount"]) == D("2423.17")

    # A taxa de administração continua incidindo só sobre o aluguel.
    splits = {s["beneficiary"]: Decimal(s["amount"]) for s in baixada["splits"]}
    assert splits["agency"] == D("185.00")
    assert splits["owner"] == D("2238.17")


async def test_baixa_duplicada_e_recusada(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    cobranca = (
        await api.post(
            "/api/v1/billing/generate",
            json={"competence": date.today().replace(day=1).isoformat()},
        )
    ).json()["charges"][0]

    corpo = {"paid_at": cobranca["due_date"]}
    assert (
        await api.post(f"/api/v1/billing/charges/{cobranca['id']}/settle", json=corpo)
    ).status_code == 200
    assert (
        await api.post(f"/api/v1/billing/charges/{cobranca['id']}/settle", json=corpo)
    ).status_code == 409


async def test_baixa_alimenta_o_contas_a_receber_com_a_taxa(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    cobranca = (
        await api.post(
            "/api/v1/billing/generate",
            json={"competence": date.today().replace(day=1).isoformat()},
        )
    ).json()["charges"][0]
    await api.post(
        f"/api/v1/billing/charges/{cobranca['id']}/settle",
        json={"paid_at": cobranca["due_date"]},
    )

    receber = (await api.get("/api/v1/finance/receivables?status=recebido")).json()
    assert receber["total"] == 1
    lancamento = receber["items"][0]
    assert Decimal(lancamento["amount"]) == D("185.00")
    assert "Taxa de administração" in lancamento["description"]


# ── Repasse ──────────────────────────────────────────────────────────────────
async def test_pagamento_gera_extrato_de_repasse(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    competencia = date.today().replace(day=1)
    cobranca = (
        await api.post("/api/v1/billing/generate", json={"competence": competencia.isoformat()})
    ).json()["charges"][0]
    await api.post(
        f"/api/v1/billing/charges/{cobranca['id']}/settle",
        json={"paid_at": cobranca["due_date"]},
    )

    repasses = (await api.get("/api/v1/billing/payouts")).json()
    assert len(repasses) == 1
    repasse = repasses[0]

    assert repasse["owner_name"] == "Proprietário do imóvel"
    assert Decimal(repasse["gross_amount"]) == D("2368.00")
    assert Decimal(repasse["admin_fee"]) == D("185.00")
    assert Decimal(repasse["net_amount"]) == D("2183.00")
    assert {i["kind"] for i in repasse["items"]} == {"aluguel", "encargos", "taxa_adm"}


async def test_desconto_de_manutencao_abate_do_repasse(api):
    contrato = await _contract(api)
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")
    competencia = date.today().replace(day=1)
    cobranca = (
        await api.post("/api/v1/billing/generate", json={"competence": competencia.isoformat()})
    ).json()["charges"][0]
    await api.post(
        f"/api/v1/billing/charges/{cobranca['id']}/settle",
        json={"paid_at": cobranca["due_date"]},
    )

    owner = next(p for p in contrato["parties"] if p["role"] == "locador")
    repasse = (
        await api.post(
            "/api/v1/billing/payouts/deductions",
            json={
                "owner_client_id": owner["client_id"],
                "reference_month": competencia.isoformat(),
                "amount": "350.00",
                "description": "Troca da resistência do chuveiro",
            },
        )
    ).json()

    assert Decimal(repasse["deductions"]) == D("350.00")
    assert Decimal(repasse["net_amount"]) == D("1833.00")  # 2183 − 350
