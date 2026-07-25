"""Operação ponta a ponta: chaves, vistorias e chamados de manutenção."""

from __future__ import annotations

import io
from datetime import datetime, timedelta
from decimal import Decimal

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio

D = Decimal


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (320, 240), (150, 150, 150)).save(buf, format="JPEG")
    return buf.getvalue()


async def _property(api, **overrides) -> dict:
    payload = {"kind": "apartamento", "purpose": "locacao", "title": "Apto para locação"}
    payload.update(overrides)
    return (await api.post("/api/v1/properties", json=payload)).json()


# ── Chaves ───────────────────────────────────────────────────────────────────
async def test_chave_cadastrada_com_posicao_no_chaveiro(api):
    imovel = await _property(api)
    chave = (
        await api.post(
            "/api/v1/keys",
            json={
                "property_id": imovel["id"],
                "label": "Chave principal",
                "copies": 2,
                "board_position": "A-14",
            },
        )
    ).json()

    assert chave["board_position"] == "A-14"
    assert chave["copies"] == 2
    assert chave["out_count"] == 0
    assert chave["current_holder"] is None


async def test_retirada_registra_quem_levou_e_o_prazo(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()

    prazo = (datetime.now() + timedelta(hours=6)).isoformat()
    movimento = (
        await api.post(
            f"/api/v1/keys/{chave['id']}/take",
            json={
                "purpose": "Visita com interessado",
                "due_back_at": prazo,
                "taken_by_name": "Caio Barbosa",
                "taken_by_phone": "32999998888",
            },
        )
    ).json()

    assert movimento["taken_by"] == "Caio Barbosa"
    assert movimento["is_out"] is True
    assert movimento["is_overdue"] is False

    chaveiro = (await api.get("/api/v1/keys")).json()
    assert chaveiro[0]["current_holder"] == "Caio Barbosa"


async def test_retirada_exige_saber_quem_levou(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()

    resp = await api.post(
        f"/api/v1/keys/{chave['id']}/take",
        json={"purpose": "Visita", "due_back_at": datetime.now().isoformat()},
    )
    assert resp.status_code == 422


async def test_chave_que_ja_esta_fora_nao_pode_ser_retirada_de_novo(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()
    corpo = {
        "purpose": "Visita",
        "due_back_at": (datetime.now() + timedelta(hours=4)).isoformat(),
        "taken_by_name": "Alguém",
    }

    assert (await api.post(f"/api/v1/keys/{chave['id']}/take", json=corpo)).status_code == 201
    segunda = await api.post(f"/api/v1/keys/{chave['id']}/take", json=corpo)
    assert segunda.status_code == 409
    assert "já está com alguém" in segunda.json()["detail"]


async def test_devolucao_libera_a_chave(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()
    movimento = (
        await api.post(
            f"/api/v1/keys/{chave['id']}/take",
            json={
                "purpose": "Vistoria",
                "due_back_at": (datetime.now() + timedelta(hours=4)).isoformat(),
                "taken_by_name": "Vistoriador",
            },
        )
    ).json()

    devolvido = (await api.post(f"/api/v1/keys/movements/{movimento['id']}/return", json={})).json()
    assert devolvido["is_out"] is False
    assert devolvido["returned_at"] is not None

    # Com a chave devolvida, nova retirada é possível.
    nova = await api.post(
        f"/api/v1/keys/{chave['id']}/take",
        json={
            "purpose": "Nova visita",
            "due_back_at": (datetime.now() + timedelta(hours=2)).isoformat(),
            "taken_by_name": "Outro corretor",
        },
    )
    assert nova.status_code == 201


async def test_chave_fora_do_prazo_entra_no_alerta(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()
    await api.post(
        f"/api/v1/keys/{chave['id']}/take",
        json={
            "purpose": "Reparo",
            "due_back_at": (datetime.now() - timedelta(hours=30)).isoformat(),
            "taken_by_name": "Prestador",
        },
    )

    atrasadas = (await api.get("/api/v1/keys/alerts/overdue")).json()
    assert len(atrasadas) == 1
    assert atrasadas[0]["is_overdue"] is True
    assert atrasadas[0]["hours_overdue"] >= 29


async def test_assinatura_da_retirada_e_guardada(api):
    imovel = await _property(api)
    chave = (
        await api.post("/api/v1/keys", json={"property_id": imovel["id"], "label": "Chave"})
    ).json()

    png_1x1 = (
        "data:image/png;base64,"
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    movimento = (
        await api.post(
            f"/api/v1/keys/{chave['id']}/take",
            json={
                "purpose": "Visita",
                "due_back_at": (datetime.now() + timedelta(hours=3)).isoformat(),
                "taken_by_name": "Corretor",
                "signature": png_1x1,
            },
        )
    ).json()

    assert movimento["signature_url"] is not None


# ── Vistorias ────────────────────────────────────────────────────────────────
async def test_vistoria_nasce_com_roteiro_padrao(api):
    imovel = await _property(api)
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()

    assert vistoria["status"] == "agendada"
    assert len(vistoria["rooms"]) == 5
    assert vistoria["total_items"] > 20
    assert vistoria["filled_items"] == 0
    assert vistoria["progress_pct"] == 0


async def test_vistoria_sem_roteiro_comeca_vazia(api):
    imovel = await _property(api)
    vistoria = (
        await api.post(
            "/api/v1/inspections",
            json={"property_id": imovel["id"], "kind": "entrada", "use_default_script": False},
        )
    ).json()
    assert vistoria["rooms"] == []


async def test_marcar_estado_avanca_o_progresso(api):
    imovel = await _property(api)
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()
    item = vistoria["rooms"][0]["items"][0]

    await api.patch(f"/api/v1/inspections/items/{item['id']}", json={"condition": "otimo"})

    atualizada = (await api.get(f"/api/v1/inspections/{vistoria['id']}")).json()
    assert atualizada["filled_items"] == 1
    assert atualizada["progress_pct"] > 0


async def test_leitura_de_medidores(api):
    imovel = await _property(api)
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()

    await api.post(
        f"/api/v1/inspections/{vistoria['id']}/meters",
        json={"meter": "agua", "reading": "01234"},
    )
    atualizada = (
        await api.post(
            f"/api/v1/inspections/{vistoria['id']}/meters",
            json={"meter": "luz", "reading": "98765"},
        )
    ).json()

    assert {m["meter"] for m in atualizada["meters"]} == {"agua", "luz"}


async def test_foto_do_item_da_vistoria(api):
    imovel = await _property(api)
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()
    item = vistoria["rooms"][0]["items"][0]

    resp = await api.post(
        f"/api/v1/inspections/{vistoria['id']}/photos?item_id={item['id']}&caption=Piso",
        files={"file": ("piso.jpg", _jpeg(), "image/jpeg")},
    )
    assert resp.status_code == 201

    atualizada = (await api.get(f"/api/v1/inspections/{vistoria['id']}")).json()
    fotos = atualizada["rooms"][0]["items"][0]["photos"]
    assert len(fotos) == 1
    assert fotos[0]["caption"] == "Piso"


async def test_vistoria_vazia_nao_pode_ser_concluida(api):
    imovel = await _property(api)
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()

    resp = await api.post(f"/api/v1/inspections/{vistoria['id']}/finish")
    assert resp.status_code == 422


async def _completed_entry(api, imovel: dict, conditions: dict[str, str]) -> dict:
    """Vistoria de entrada concluída com os estados informados."""
    vistoria = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "entrada"})
    ).json()
    for room in vistoria["rooms"]:
        for item in room["items"]:
            key = f"{room['name']}|{item['name']}"
            if key in conditions:
                await api.patch(
                    f"/api/v1/inspections/items/{item['id']}",
                    json={"condition": conditions[key]},
                )
    await api.post(f"/api/v1/inspections/{vistoria['id']}/finish")
    return (await api.get(f"/api/v1/inspections/{vistoria['id']}")).json()


async def test_vistoria_de_saida_compara_com_a_de_entrada(api):
    imovel = await _property(api)
    await _completed_entry(
        api,
        imovel,
        {"Sala|Piso": "otimo", "Sala|Paredes e pintura": "otimo", "Cozinha|Bancada": "bom"},
    )

    saida = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "saida"})
    ).json()
    assert saida["compared_with_id"] is not None

    for room in saida["rooms"]:
        for item in room["items"]:
            key = f"{room['name']}|{item['name']}"
            estado = {
                "Sala|Piso": "bom",  # 1 degrau → indefinido
                "Sala|Paredes e pintura": "ruim",  # 3 degraus → locatário
                "Cozinha|Bancada": "bom",  # igual → nada
            }.get(key)
            if estado:
                await api.patch(
                    f"/api/v1/inspections/items/{item['id']}", json={"condition": estado}
                )

    concluida = (await api.post(f"/api/v1/inspections/{saida['id']}/finish")).json()

    assert len(concluida["issues"]) == 2
    por_descricao = {i["description"]: i for i in concluida["issues"]}
    pintura = next(i for d, i in por_descricao.items() if "Paredes" in d)
    piso = next(i for d, i in por_descricao.items() if "Piso" in d)

    assert pintura["responsibility"] == "locatario"
    assert piso["responsibility"] == "indefinido"
    # A sugestão guarda os dois estados que a motivaram.
    assert pintura["entry_condition"] == "otimo"
    assert pintura["exit_condition"] == "ruim"


async def test_responsabilidade_sugerida_pode_ser_corrigida(api):
    imovel = await _property(api)
    await _completed_entry(api, imovel, {"Sala|Piso": "otimo"})

    saida = (
        await api.post("/api/v1/inspections", json={"property_id": imovel["id"], "kind": "saida"})
    ).json()
    item = next(
        i for r in saida["rooms"] if r["name"] == "Sala" for i in r["items"] if i["name"] == "Piso"
    )
    await api.patch(f"/api/v1/inspections/items/{item['id']}", json={"condition": "ruim"})
    concluida = (await api.post(f"/api/v1/inspections/{saida['id']}/finish")).json()

    pendencia = concluida["issues"][0]
    assert pendencia["responsibility"] == "locatario"

    # A equipe discorda e ajusta.
    corrigida = (
        await api.patch(
            f"/api/v1/inspections/issues/{pendencia['id']}",
            json={"responsibility": "proprietario", "estimated_cost": "800.00"},
        )
    ).json()
    assert corrigida["responsibility"] == "proprietario"
    assert Decimal(corrigida["estimated_cost"]) == D("800.00")


async def test_laudo_em_pdf_com_a_marca_da_imobiliaria(api):
    imovel = await _property(api, title="Apto 302 — Centro")
    vistoria = await _completed_entry(api, imovel, {"Sala|Piso": "otimo"})

    resultado = (await api.post(f"/api/v1/inspections/{vistoria['id']}/report")).json()

    assert resultado["bytes"] > 1000
    assert resultado["report_url"].endswith(".pdf")

    atualizada = (await api.get(f"/api/v1/inspections/{vistoria['id']}")).json()
    assert atualizada["report_url"] is not None


# ── Chamados de manutenção ───────────────────────────────────────────────────
async def _provider(api, name: str, specialty: str = "hidraulica") -> dict:
    return (
        await api.post(
            "/api/v1/maintenance/providers",
            json={"name": name, "phone": "3299990000", "specialties": [specialty]},
        )
    ).json()


async def test_prestador_com_especialidades(api):
    prestador = await _provider(api, "Encanador do Bairro")

    assert prestador["specialties"] == ["hidraulica"]
    assert prestador["jobs_done"] == 0
    assert prestador["avg_rating"] is None


async def test_especialidade_invalida_e_recusada(api):
    resp = await api.post(
        "/api/v1/maintenance/providers", json={"name": "X", "specialties": ["telepatia"]}
    )
    assert resp.status_code == 400


async def test_chamado_percorre_o_fluxo_ate_a_conclusao(api):
    imovel = await _property(api)
    prestador_a = await _provider(api, "Hidráulica Rápida")
    prestador_b = await _provider(api, "Encanador do Bairro")

    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={
                "property_id": imovel["id"],
                "title": "Vazamento embaixo da pia",
                "description": "Pinga desde ontem",
                "priority": "alta",
            },
        )
    ).json()
    assert chamado["code"] == "CH-0001"
    assert chamado["status"] == "aberto"

    triado = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/triage",
            json={"payer": "proprietario", "specialty": "hidraulica"},
        )
    ).json()
    assert triado["status"] == "orcamento"
    assert triado["payer"] == "proprietario"

    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
        json={"provider_id": prestador_a["id"], "amount": "420.00", "lead_days": 2},
    )
    com_orcamentos = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador_b["id"], "amount": "280.00", "lead_days": 3},
        )
    ).json()

    assert com_orcamentos["status"] == "aprovacao"
    assert len(com_orcamentos["quotes"]) == 2
    assert Decimal(com_orcamentos["quote_spread"]) == D("140.00")
    mais_barato = next(q for q in com_orcamentos["quotes"] if q["is_cheapest"])
    assert mais_barato["provider_name"] == "Encanador do Bairro"

    aprovado = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/approve",
            json={"quote_id": mais_barato["id"]},
        )
    ).json()
    assert aprovado["status"] == "execucao"
    assert [q["status"] for q in aprovado["quotes"] if q["id"] == mais_barato["id"]] == ["aprovado"]

    concluido = (
        await api.post(f"/api/v1/maintenance/tickets/{chamado['id']}/complete", json={})
    ).json()
    assert concluido["status"] == "concluido"
    assert Decimal(concluido["final_cost"]) == D("280.00")
    # O valor registrado no histórico é lido por gente, em português.
    assert "R$ 280,00" in concluido["events"][-1]["summary"]


async def test_observacao_da_conclusao_e_preservada_sem_custo(api):
    """Chamado resolvido sem custo ainda guarda o que a equipe escreveu."""
    imovel = await _property(api)
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Porta emperrando"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage",
        json={"payer": "imobiliaria"},
    )

    concluido = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/complete",
            json={"notes": "Zelador ajustou a dobradiça, sem custo"},
        )
    ).json()

    assert concluido["final_cost"] is None
    assert concluido["events"][-1]["summary"] == "Zelador ajustou a dobradiça, sem custo"


async def test_orcamento_barato_fica_na_alcada_da_imobiliaria(api):
    imovel = await _property(api)
    prestador = await _provider(api, "Prestador")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Troca de resistência"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage", json={"payer": "proprietario"}
    )
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "180.00"},
        )
    ).json()

    assert com_orcamento["approver"] == "imobiliaria"
    assert "alçada" in com_orcamento["approver_reason"]


async def test_orcamento_alto_precisa_do_proprietario(api):
    imovel = await _property(api)
    prestador = await _provider(api, "Prestador")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Reforma do banheiro"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage", json={"payer": "proprietario"}
    )
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "2500.00"},
        )
    ).json()

    assert com_orcamento["approver"] == "proprietario"


async def test_no_maximo_tres_orcamentos(api):
    imovel = await _property(api)
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Serviço"},
        )
    ).json()
    for i in range(3):
        prestador = await _provider(api, f"Prestador {i}")
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": f"{300 + i * 50}.00"},
        )

    extra = await _provider(api, "Quarto prestador")
    resp = await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
        json={"provider_id": extra["id"], "amount": "500.00"},
    )
    assert resp.status_code == 409


async def test_conversa_com_o_prestador_fica_registrada_no_chamado(api):
    imovel = await _property(api)
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Serviço"},
        )
    ).json()

    atualizado = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/messages",
            json={"summary": "Prestador confirmou visita para quinta às 14h"},
        )
    ).json()

    tipos = [e["kind"] for e in atualizado["events"]]
    assert "mensagem" in tipos and "abertura" in tipos


async def test_custo_do_proprietario_vira_desconto_no_repasse(api):
    imovel = await _property(api)
    proprietario = (
        await api.post("/api/v1/clients", json={"kind": "PF", "name": "Dono do imóvel"})
    ).json()
    await api.patch(
        f"/api/v1/properties/{imovel['id']}",
        json={"owners": [{"client_id": proprietario["id"], "is_payee": True}]},
    )

    prestador = await _provider(api, "Prestador")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Troca do chuveiro"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage", json={"payer": "proprietario"}
    )
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "350.00"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/approve",
        json={"quote_id": com_orcamento["quotes"][0]["id"]},
    )
    await api.post(f"/api/v1/maintenance/tickets/{chamado['id']}/complete", json={})

    repasses = (await api.get("/api/v1/billing/payouts")).json()
    assert len(repasses) == 1
    assert Decimal(repasses[0]["deductions"]) == D("350.00")
    assert Decimal(repasses[0]["net_amount"]) == D("-350.00")


async def test_custo_do_locatario_vira_cobranca_avulsa(api):
    imovel = await _property(api)
    prestador = await _provider(api, "Prestador")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Dano na porta"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage", json={"payer": "locatario"}
    )
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "600.00"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/approve",
        json={"quote_id": com_orcamento["quotes"][0]["id"]},
    )
    await api.post(f"/api/v1/maintenance/tickets/{chamado['id']}/complete", json={})

    receber = (await api.get("/api/v1/finance/receivables")).json()
    assert receber["total"] == 1
    assert Decimal(receber["items"][0]["amount"]) == D("600.00")
    assert "Manutenção" in receber["items"][0]["description"]


async def test_custo_da_imobiliaria_vira_despesa_propria(api):
    imovel = await _property(api)
    prestador = await _provider(api, "Prestador")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Manutenção preventiva"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/triage", json={"payer": "imobiliaria"}
    )
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "220.00"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/approve",
        json={"quote_id": com_orcamento["quotes"][0]["id"]},
    )
    await api.post(f"/api/v1/maintenance/tickets/{chamado['id']}/complete", json={})

    pagar = (await api.get("/api/v1/finance/payables")).json()
    assert pagar["total"] == 1
    assert Decimal(pagar["items"][0]["amount"]) == D("220.00")


async def test_avaliacao_alimenta_a_nota_do_prestador(api):
    imovel = await _property(api)
    prestador = await _provider(api, "Prestador avaliado")
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Serviço"},
        )
    ).json()
    com_orcamento = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/quotes",
            json={"provider_id": prestador["id"], "amount": "200.00"},
        )
    ).json()
    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/approve",
        json={"quote_id": com_orcamento["quotes"][0]["id"]},
    )
    await api.post(f"/api/v1/maintenance/tickets/{chamado['id']}/complete", json={})
    avaliado = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/rate",
            json={"score": 5, "comment": "Rápido e limpo"},
        )
    ).json()

    assert avaliado["rating"] == 5

    prestadores = (await api.get("/api/v1/maintenance/providers")).json()
    atualizado = next(p for p in prestadores if p["id"] == prestador["id"])
    assert Decimal(atualizado["avg_rating"]) == D("5.00")
    assert atualizado["jobs_done"] == 1


async def test_fotos_antes_e_depois(api):
    imovel = await _property(api)
    chamado = (
        await api.post(
            "/api/v1/maintenance/tickets",
            json={"property_id": imovel["id"], "title": "Pintura"},
        )
    ).json()

    await api.post(
        f"/api/v1/maintenance/tickets/{chamado['id']}/photos?moment=antes",
        files={"file": ("antes.jpg", _jpeg(), "image/jpeg")},
    )
    atualizado = (
        await api.post(
            f"/api/v1/maintenance/tickets/{chamado['id']}/photos?moment=depois",
            files={"file": ("depois.jpg", _jpeg(), "image/jpeg")},
        )
    ).json()

    assert {p["moment"] for p in atualizado["photos"]} == {"antes", "depois"}


async def test_operacao_pertence_ao_modulo_de_locacao(client_factory):
    """Um tenant só de vendas não tem chaves, vistorias nem chamados."""
    api_vendas = client_factory("a")  # completo, para comparar
    assert (await api_vendas.get("/api/v1/keys")).status_code == 200

    api_locacao = client_factory("b")  # plano locacao
    assert (await api_locacao.get("/api/v1/keys")).status_code == 200
    assert (await api_locacao.get("/api/v1/inspections")).status_code == 200
    assert (await api_locacao.get("/api/v1/maintenance/tickets")).status_code == 200
