"""API pública da vitrine: só o publicado aparece, endereço respeita a política,
filtros e ordenação funcionam, e o lead cai no funil certo."""

from __future__ import annotations

import io

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image

DESCRICAO = (
    "Apartamento reformado, sala arejada com bancada em granito, dois quartos "
    "e área externa privativa. Próximo ao comércio do bairro."
)


def _jpeg() -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (400, 300), (120, 140, 160)).save(buf, format="JPEG")
    return buf.getvalue()


@pytest_asyncio.fixture
async def pub():
    """Cliente HTTP sem autenticação — como o widget no site do cliente."""
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _public_key(api) -> str:
    return (await api.get("/api/v1/properties/settings/showcase")).json()["public_key"]


async def _publish(
    api, *, purpose="venda", price="199000.00", bairro="Lourdes", city="Juiz de Fora"
):
    imovel = (
        await api.post(
            "/api/v1/properties",
            json={
                "kind": "apartamento",
                "purpose": purpose,
                "title": f"Apartamento 2 quartos em {bairro} com ótima localização",
                "description": DESCRICAO,
                **({"sale_price": price} if purpose == "venda" else {"rent_price": price}),
                "iptu_amount": "1200.00",
                "area_util": "68.00",
                "bedrooms": 2,
                "parking_spots": 1,
                "address": {"bairro": bairro, "cidade": city, "uf": "MG"},
            },
        )
    ).json()
    await api.post(
        f"/api/v1/properties/{imovel['id']}/photos",
        files={"file": ("frente.jpg", _jpeg(), "image/jpeg")},
    )
    await api.post(
        f"/api/v1/properties/{imovel['id']}/publish",
        json={"publish_site": True, "publish_portals": False},
    )
    return imovel


# ── Configuração da vitrine ──────────────────────────────────────────────────
async def test_showcase_traz_marca_contato_e_facetas(api, pub):
    await api.put(
        "/api/v1/properties/settings/showcase",
        json={"whatsapp": "32998510706", "email": "contato@aurora.com.br", "headline": "Seu lar"},
    )
    await _publish(api, bairro="Cascatinha")
    key = await _public_key(api)

    cfg = (await pub.get(f"/public/{key}/showcase")).json()
    assert cfg["whatsapp"] == "32998510706"
    assert cfg["headline"] == "Seu lar"
    assert "venda" in cfg["facets"]["purposes"]
    assert "Cascatinha" in cfg["facets"]["neighborhoods"]


# ── Só o publicado ───────────────────────────────────────────────────────────
async def test_lista_apenas_imoveis_publicados(api, pub):
    await _publish(api)  # publicado
    rascunho = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "venda", "title": "Casa não publicada"},
        )
    ).json()
    key = await _public_key(api)

    lista = (await pub.get(f"/public/{key}/properties")).json()
    assert lista["total"] == 1
    codigos = [c["code"] for c in lista["items"]]
    assert rascunho["code"] not in codigos


async def test_endereco_publico_respeita_a_politica(api, pub):
    imovel = await _publish(api)
    # Endereço padrão é "bairro": não deve vazar logradouro.
    await api.patch(
        f"/api/v1/properties/{imovel['id']}",
        json={
            "address": {
                "logradouro": "Rua Secreta",
                "numero": "99",
                "bairro": "Lourdes",
                "cidade": "Juiz de Fora",
                "uf": "MG",
            }
        },
    )
    key = await _public_key(api)

    detalhe = (await pub.get(f"/public/{key}/properties/{imovel['code']}")).json()
    assert "logradouro" not in detalhe["address"]
    assert detalhe["address"]["bairro"] == "Lourdes"


# ── Filtros e ordenação ──────────────────────────────────────────────────────
async def test_filtro_por_finalidade_e_ordenacao_por_preco(api, pub):
    await _publish(api, purpose="venda", price="300000.00", bairro="Centro")
    await _publish(api, purpose="venda", price="150000.00", bairro="São Pedro")
    await _publish(api, purpose="locacao", price="1800.00", bairro="Granbery")
    key = await _public_key(api)

    vendas = (await pub.get(f"/public/{key}/properties?purpose=venda&sort=menor_preco")).json()
    assert vendas["total"] == 2
    precos = [c["sale_price"] for c in vendas["items"]]
    assert precos == sorted(precos, key=float)


async def test_detalhe_por_slug(api, pub):
    imovel = await _publish(api)
    key = await _public_key(api)
    detalhe_full = (await pub.get(f"/public/{key}/properties/{imovel['code']}")).json()

    porslug = (await pub.get(f"/public/{key}/properties/{detalhe_full['slug']}")).json()
    assert porslug["code"] == imovel["code"]
    assert porslug["description"]


# ── Captura de lead ──────────────────────────────────────────────────────────
async def test_lead_de_venda_cai_no_funil_de_vendas(api, pub):
    imovel = await _publish(api, purpose="venda")
    key = await _public_key(api)

    resp = await pub.post(
        f"/public/{key}/leads",
        json={
            "name": "Marina Alves",
            "phone": "32999998888",
            "interest": "venda",
            "property_code": imovel["code"],
            "message": "Tenho interesse neste apartamento",
        },
    )
    assert resp.status_code == 202

    board = (await api.get("/api/v1/sales/board")).json()
    nomes = [lead["name"] for lead in board["leads"]]
    assert "Marina Alves" in nomes


async def test_lead_de_locacao_cai_no_funil_de_locacao(api, pub):
    imovel = await _publish(api, purpose="locacao", price="1800.00")
    key = await _public_key(api)

    await pub.post(
        f"/public/{key}/leads",
        json={"name": "Bruno Locatário", "phone": "32988887777", "property_code": imovel["code"]},
    )

    board = (await api.get("/api/v1/rentals/board")).json()
    nomes = [lead["name"] for lead in board["leads"]]
    assert "Bruno Locatário" in nomes


async def test_honeypot_descarta_o_bot(api, pub):
    await _publish(api)
    key = await _public_key(api)

    resp = await pub.post(
        f"/public/{key}/leads",
        json={"name": "Robo Spam", "phone": "0000000000", "website": "http://spam"},
    )
    assert resp.status_code == 202

    board = (await api.get("/api/v1/sales/board")).json()
    assert "Robo Spam" not in [lead["name"] for lead in board["leads"]]


async def test_chave_invalida_da_404(pub):
    resp = await pub.get("/public/pub_naoexiste/properties")
    assert resp.status_code == 404


# ── Isolamento entre imobiliárias ────────────────────────────────────────────
async def test_vitrine_de_um_tenant_nao_mostra_imovel_de_outro(client_factory):
    from app.main import app

    api_a = client_factory("a")
    api_b = client_factory("b")

    await _publish(api_a, bairro="Bairro do A")
    await _publish(api_b, purpose="locacao", price="1500.00", bairro="Bairro do B")

    key_a = await _public_key(api_a)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://testserver") as pub:
        lista = (await pub.get(f"/public/{key_a}/properties")).json()

    bairros = [c["address"].get("bairro") for c in lista["items"]]
    assert "Bairro do A" in bairros
    assert "Bairro do B" not in bairros


# ── Resolução por host ───────────────────────────────────────────────────────
async def test_by_host_resolve_por_subdominio(api, pub):
    key = await _public_key(api)
    resp = await pub.get("/public/by-host?host=imob-a")
    assert resp.status_code == 200
    assert resp.json()["public_key"] == key


async def test_by_host_resolve_pelo_host_completo(api, pub):
    key = await _public_key(api)
    # imob-a é o subdomínio provisionado no conftest.
    resp = await pub.get("/public/by-host?host=imob-a.sistema.com.br")
    assert resp.status_code == 200
    assert resp.json()["public_key"] == key


async def test_by_host_desconhecido_da_404(pub):
    resp = await pub.get("/public/by-host?host=nao-existe.com.br")
    assert resp.status_code == 404
