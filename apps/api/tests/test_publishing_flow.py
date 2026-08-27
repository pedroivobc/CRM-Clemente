"""Controles de publicação da vitrine: impedimentos, endereço e marca d'água."""

from __future__ import annotations

import io

from PIL import Image

DESCRICAO = (
    "Apartamento reformado, sala arejada com bancada em granito, dois quartos "
    "e área externa privativa. Próximo ao comércio do bairro."
)


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (120, 140, 160)).save(buf, format="JPEG")
    return buf.getvalue()


async def _anunciavel(api) -> dict:
    """Cria um imóvel completo, a ponto de poder ir ao ar (menos a foto)."""
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={
                "kind": "apartamento",
                "purpose": "venda",
                "title": "Apartamento 2 quartos em Lourdes com ótima localização",
                "description": DESCRICAO,
                "sale_price": "199000.00",
                "iptu_amount": "1200.00",
                "area_util": "68.00",
                "bedrooms": 2,
                "bathrooms": 1,
                "parking_spots": 1,
                "address": {"bairro": "Lourdes", "cidade": "Juiz de Fora", "uf": "MG"},
            },
        )
    ).json()
    return imovel


async def _add_foto(api, imovel_id: str) -> None:
    await api.post(
        f"/api/v1/properties/{imovel_id}/photos",
        files={"file": ("frente.jpg", _jpeg(), "image/jpeg")},
    )


# ── Estado inicial ───────────────────────────────────────────────────────────
async def test_imovel_nasce_despublicado_com_slug(api):
    imovel = await _anunciavel(api)
    assert imovel["publish_site"] is False
    assert imovel["publish_portals"] is False
    assert imovel["published_at"] is None
    assert imovel["slug"] == "apartamento-2-quartos-lourdes-juiz-de-fora-mg-venda-im-0001"


async def test_ficha_lista_o_que_falta_para_publicar(api):
    imovel = await _anunciavel(api)
    # Sem foto ainda: impedimento presente.
    detalhe = (await api.get(f"/api/v1/properties/{imovel['id']}")).json()
    assert detalhe["is_publishable"] is False
    assert any("foto" in b for b in detalhe["publish_blockers"])

    await _add_foto(api, imovel["id"])
    detalhe = (await api.get(f"/api/v1/properties/{imovel['id']}")).json()
    assert detalhe["is_publishable"] is True
    assert detalhe["publish_blockers"] == []


# ── Guarda da publicação ─────────────────────────────────────────────────────
async def test_publicar_incompleto_e_recusado_com_motivos(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "venda", "title": "Casa"},
        )
    ).json()

    resp = await api.post(
        f"/api/v1/properties/{imovel['id']}/publish",
        json={"publish_site": True, "publish_portals": False},
    )
    assert resp.status_code == 422
    assert "publicar" in resp.json()["detail"].lower()


async def test_publicar_imovel_completo(api):
    imovel = await _anunciavel(api)
    await _add_foto(api, imovel["id"])

    resp = await api.post(
        f"/api/v1/properties/{imovel['id']}/publish",
        json={"publish_site": True, "publish_portals": True},
    )
    assert resp.status_code == 200, resp.text
    dados = resp.json()
    assert dados["publish_site"] is True
    assert dados["publish_portals"] is True
    assert dados["published_at"] is not None


async def test_despublicar_nunca_e_barrado(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "venda", "title": "Casa"},
        )
    ).json()
    # Mesmo incompleto, tirar do ar (as duas flags falsas) é permitido.
    resp = await api.post(
        f"/api/v1/properties/{imovel['id']}/publish",
        json={"publish_site": False, "publish_portals": False},
    )
    assert resp.status_code == 200


async def test_imovel_vendido_nao_pode_publicar(api):
    imovel = await _anunciavel(api)
    await _add_foto(api, imovel["id"])
    await api.patch(f"/api/v1/properties/{imovel['id']}", json={"status": "vendido"})

    resp = await api.post(
        f"/api/v1/properties/{imovel['id']}/publish",
        json={"publish_site": True, "publish_portals": False},
    )
    assert resp.status_code == 422


# ── Endereço ─────────────────────────────────────────────────────────────────
async def test_endereco_publico_respeita_a_politica(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={
                "kind": "apartamento",
                "purpose": "venda",
                "title": "Apartamento com endereço",
                "address": {
                    "logradouro": "Rua das Acácias",
                    "numero": "240",
                    "bairro": "Cascatinha",
                    "cidade": "Juiz de Fora",
                    "uf": "MG",
                },
            },
        )
    ).json()
    # Padrão: só bairro.
    assert imovel["public_address"] == {
        "bairro": "Cascatinha",
        "cidade": "Juiz de Fora",
        "uf": "MG",
    }

    liberado = (
        await api.patch(
            f"/api/v1/properties/{imovel['id']}", json={"address_visibility": "completo"}
        )
    ).json()
    assert liberado["public_address"]["numero"] == "240"
    assert liberado["public_address"]["logradouro"] == "Rua das Acácias"


# ── Vocabulário e garantias ──────────────────────────────────────────────────
async def test_tipo_invalido_e_recusado(api):
    resp = await api.post(
        "/api/v1/properties",
        json={"kind": "castelo", "purpose": "venda", "title": "Castelo"},
    )
    assert resp.status_code == 400


async def test_novo_tipo_do_vocabulario_e_aceito(api):
    resp = await api.post(
        "/api/v1/properties",
        json={"kind": "cobertura", "purpose": "venda", "title": "Cobertura duplex"},
    )
    assert resp.status_code == 201


async def test_garantia_de_locacao_invalida_e_recusada(api):
    resp = await api.post(
        "/api/v1/properties",
        json={
            "kind": "apartamento",
            "purpose": "locacao",
            "title": "Apto",
            "rental_warranties": ["telepatia"],
        },
    )
    assert resp.status_code == 400


async def test_garantias_validas_sao_guardadas(api):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={
                "kind": "apartamento",
                "purpose": "locacao",
                "title": "Apto",
                "rental_warranties": ["caucao", "fiador"],
            },
        )
    ).json()
    assert set(imovel["rental_warranties"]) == {"caucao", "fiador"}


# ── Slug acompanha mudanças ──────────────────────────────────────────────────
async def test_slug_muda_quando_o_bairro_muda(api):
    imovel = await _anunciavel(api)
    atualizado = (
        await api.patch(
            f"/api/v1/properties/{imovel['id']}",
            json={"address": {"bairro": "Centro", "cidade": "Juiz de Fora", "uf": "MG"}},
        )
    ).json()
    assert "centro" in atualizado["slug"]
    assert "lourdes" not in atualizado["slug"]


# ── Marca d'água por tenant ──────────────────────────────────────────────────
async def test_configuracao_de_marca_dagua_padrao_e_edicao(api):
    atual = (await api.get("/api/v1/properties/settings/watermark")).json()
    assert atual["enabled"] is True
    assert atual["apply_on_site"] is True
    assert atual["apply_on_portals"] is False

    salvo = (
        await api.put(
            "/api/v1/properties/settings/watermark",
            json={
                "enabled": True,
                "position": "center",
                "opacity": "0.4",
                "apply_on_site": True,
                "apply_on_portals": True,
            },
        )
    ).json()
    assert salvo["position"] == "center"

    relido = (await api.get("/api/v1/properties/settings/watermark")).json()
    assert relido["apply_on_portals"] is True
    assert relido["position"] == "center"
