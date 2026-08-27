"""Cadastro de clientes e imóveis, incluindo fotos e marca d'água."""

from __future__ import annotations

import io
from datetime import date, timedelta

import pytest
from PIL import Image

pytestmark = pytest.mark.asyncio


def _jpeg(size=(400, 300)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 140, 160)).save(buf, format="JPEG")
    return buf.getvalue()


async def test_cliente_acumula_papeis_e_contatos(api):
    resp = await api.post(
        "/api/v1/clients",
        json={
            "kind": "PF",
            "name": "Maria Souza",
            "cpf_cnpj": "390.533.447-05",
            "roles": ["proprietario", "locatario"],
            "contacts": [
                {"kind": "whatsapp", "value": "32999998888", "is_primary": True},
                {"kind": "email", "value": "maria@exemplo.com.br"},
            ],
            "address": {"cep": "36010000", "cidade": "Juiz de Fora", "uf": "MG"},
        },
    )
    assert resp.status_code == 201, resp.text
    cliente = resp.json()

    assert set(cliente["roles"]) == {"proprietario", "locatario"}
    assert cliente["cpf_cnpj"] == "39053344705"
    assert cliente["cpf_cnpj_formatted"] == "390.533.447-05"
    assert len(cliente["contacts"]) == 2
    assert cliente["address"]["cidade"] == "Juiz de Fora"


async def test_cpf_invalido_e_recusado_no_cadastro(api):
    resp = await api.post(
        "/api/v1/clients", json={"kind": "PF", "name": "Fulano", "cpf_cnpj": "111.111.111-11"}
    )
    assert resp.status_code == 422


async def test_filtro_por_papel(api):
    await api.post(
        "/api/v1/clients",
        json={"kind": "PF", "name": "Proprietário", "roles": ["proprietario"]},
    )
    await api.post(
        "/api/v1/clients", json={"kind": "PF", "name": "Locatário", "roles": ["locatario"]}
    )

    proprietarios = (await api.get("/api/v1/clients?role=proprietario")).json()
    assert proprietarios["total"] == 1
    assert proprietarios["items"][0]["name"] == "Proprietário"


async def test_busca_por_nome_e_documento(api):
    await api.post(
        "/api/v1/clients",
        json={"kind": "PF", "name": "João Pereira", "cpf_cnpj": "390.533.447-05"},
    )
    assert (await api.get("/api/v1/clients?search=pereira")).json()["total"] == 1
    assert (await api.get("/api/v1/clients?search=390.533")).json()["total"] == 1
    assert (await api.get("/api/v1/clients?search=inexistente")).json()["total"] == 0


async def test_timeline_registra_interacoes(api):
    cliente = (await api.post("/api/v1/clients", json={"kind": "PF", "name": "Cliente"})).json()

    await api.post(
        f"/api/v1/clients/{cliente['id']}/timeline",
        json={"channel": "whatsapp", "direction": "out", "summary": "Enviada 2ª via"},
    )
    await api.post(
        f"/api/v1/clients/{cliente['id']}/timeline",
        json={"channel": "visita", "summary": "Visita ao imóvel IM-0001"},
    )

    timeline = (await api.get(f"/api/v1/clients/{cliente['id']}/timeline")).json()
    assert len(timeline) == 2
    assert {t["channel"] for t in timeline} == {"whatsapp", "visita"}


async def test_documento_com_validade_entra_no_alerta_de_vencimento(api):
    cliente = (
        await api.post("/api/v1/clients", json={"kind": "PF", "name": "Com documentos"})
    ).json()

    vence_em_10_dias = (date.today() + timedelta(days=10)).isoformat()
    envio = await api.post(
        f"/api/v1/clients/{cliente['id']}/documents"
        f"?doc_type=comprovante_de_renda&valid_until={vence_em_10_dias}",
        files={"file": ("renda.pdf", b"conteudo", "application/pdf")},
    )
    assert envio.status_code == 201, envio.text
    assert envio.json()["expired"] is False

    alertas = (await api.get("/api/v1/clients/documents/expiring?days=30")).json()
    assert len(alertas) == 1
    assert alertas[0]["client_name"] == "Com documentos"
    assert alertas[0]["days_left"] == 10


async def test_imovel_com_proprietario_ganha_papel_automaticamente(api):
    proprietario = (
        await api.post("/api/v1/clients", json={"kind": "PF", "name": "Dono do imóvel"})
    ).json()

    imovel = await api.post(
        "/api/v1/properties",
        json={
            "kind": "apartamento",
            "purpose": "locacao",
            "title": "Apto 302 — Centro",
            "rent_price": "1800.00",
            "condo_fee": "450.00",
            "features": {"quartos": 2, "vagas": 1},
            "owners": [{"client_id": proprietario["id"], "ownership_pct": "100", "is_payee": True}],
        },
    )
    assert imovel.status_code == 201, imovel.text
    dados = imovel.json()
    assert dados["status"] == "captacao"
    assert dados["owners"][0]["name"] == "Dono do imóvel"
    assert dados["features"]["quartos"] == 2

    # O cliente passa a constar como proprietário no CRM.
    atualizado = (await api.get(f"/api/v1/clients/{proprietario['id']}")).json()
    assert "proprietario" in atualizado["roles"]


async def test_codigo_do_imovel_e_sequencial(api):
    base = {"kind": "casa", "purpose": "venda", "title": "Casa"}
    codigos = [(await api.post("/api/v1/properties", json=base)).json()["code"] for _ in range(3)]
    assert codigos == ["IM-0001", "IM-0002", "IM-0003"]


async def test_status_invalido_de_imovel_e_rejeitado(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "venda", "title": "Casa"},
        )
    ).json()

    resp = await api.patch(f"/api/v1/properties/{imovel['id']}", json={"status": "inventado"})
    assert resp.status_code == 400


async def test_upload_de_foto_marca_primeira_como_capa_e_agenda_marca_dagua(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "locacao", "title": "Casa com fotos"},
        )
    ).json()

    primeira = await api.post(
        f"/api/v1/properties/{imovel['id']}/photos",
        files={"file": ("frente.jpg", _jpeg(), "image/jpeg")},
    )
    assert primeira.status_code == 201, primeira.text
    assert primeira.json()["is_cover"] is True
    # Sem worker rodando nos testes, a foto fica aguardando o processamento.
    assert primeira.json()["watermark_status"] == "pending"
    assert primeira.json()["url"] is None

    segunda = await api.post(
        f"/api/v1/properties/{imovel['id']}/photos",
        files={"file": ("sala.jpg", _jpeg(), "image/jpeg")},
    )
    assert segunda.json()["is_cover"] is False

    fotos = (await api.get(f"/api/v1/properties/{imovel['id']}/photos")).json()
    assert [f["sort_order"] for f in fotos] == [0, 1]


async def test_troca_de_capa(api):
    imovel = (
        await api.post(
            "/api/v1/properties", json={"kind": "casa", "purpose": "locacao", "title": "Casa"}
        )
    ).json()
    for nome in ("a.jpg", "b.jpg"):
        await api.post(
            f"/api/v1/properties/{imovel['id']}/photos",
            files={"file": (nome, _jpeg(), "image/jpeg")},
        )

    fotos = (await api.get(f"/api/v1/properties/{imovel['id']}/photos")).json()
    segunda = fotos[1]

    atualizadas = (
        await api.put(f"/api/v1/properties/{imovel['id']}/photos/{segunda['id']}/cover")
    ).json()
    capas = [f["id"] for f in atualizadas if f["is_cover"]]
    assert capas == [segunda["id"]]


async def test_formato_de_foto_nao_suportado(api):
    imovel = (
        await api.post(
            "/api/v1/properties", json={"kind": "casa", "purpose": "locacao", "title": "Casa"}
        )
    ).json()
    resp = await api.post(
        f"/api/v1/properties/{imovel['id']}/photos",
        files={"file": ("doc.pdf", b"%PDF-1.4", "application/pdf")},
    )
    assert resp.status_code == 400


async def test_worker_aplica_marca_dagua_e_publica_versao_marcada(api, tenants):
    """Percorre o caminho completo: upload → worker → URL pública disponível."""
    from app.workers.tasks import watermark_photo

    imovel = (
        await api.post(
            "/api/v1/properties", json={"kind": "casa", "purpose": "locacao", "title": "Casa"}
        )
    ).json()
    foto = (
        await api.post(
            f"/api/v1/properties/{imovel['id']}/photos",
            files={"file": ("frente.jpg", _jpeg(), "image/jpeg")},
        )
    ).json()

    resultado = await watermark_photo({}, str(tenants["a"]["tenant_id"]), foto["id"])
    assert resultado == "done"

    fotos = (await api.get(f"/api/v1/properties/{imovel['id']}/photos")).json()
    assert fotos[0]["watermark_status"] == "done"
    assert fotos[0]["url"].endswith(".jpg")


async def test_dashboard_resume_a_operacao(api):
    await api.post("/api/v1/clients", json={"kind": "PF", "name": "Cliente"})
    await api.post(
        "/api/v1/properties",
        json={"kind": "casa", "purpose": "locacao", "title": "Casa disponível"},
    )

    painel = (await api.get("/api/v1/dashboard")).json()
    assert painel["cadastros"]["clientes"] == 1
    assert painel["cadastros"]["imoveis"] == 1
    assert painel["plano"] == "completo"
    assert "module_sales" in painel["modulos"]
