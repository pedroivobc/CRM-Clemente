"""Feeds XML para os portais (VRSync do grupo Zap; Chaves na Mão)."""

from __future__ import annotations

from decimal import Decimal
from xml.etree import ElementTree as ET

from app.domain.feeds import build_chavesnamao_feed, build_vrsync_feed

NS = {"v": "http://www.vivareal.com/schemas/1.0/VRSync"}

TENANT = {
    "display_name": "Aurora Imobiliária",
    "phone": "(32) 3215-1234",
    "email": "contato@aurora.com.br",
    "creci": "MG-12345",
}

BASE_PROPERTY = {
    "code": "IM-0152",
    "kind": "apartamento",
    "purpose": "venda",
    "usage_type": "residencial",
    "title": "Apartamento em Lourdes",
    "description": "Reformado, sala ampla, cozinha planejada, área externa.",
    "address": {
        "cep": "36036-000",
        "logradouro": "Rua Doutor Dilermando Cruz",
        "numero": "240",
        "bairro": "Lourdes",
        "cidade": "Juiz de Fora",
        "uf": "MG",
    },
    "address_visibility": "bairro",
    "area_util": Decimal("68"),
    "lot_area": None,
    "bedrooms": 2,
    "suites": 1,
    "bathrooms": 2,
    "parking_spots": 1,
    "year_built": 2015,
    "sale_price": Decimal("199000"),
    "rent_price": None,
    "condo_fee": Decimal("420"),
    "iptu_amount": Decimal("1200"),
    "pet_allowed": True,
    "republic_allowed": None,
    "has_leisure_area": True,
    "photos": ["https://cdn.example/p1.jpg", "https://cdn.example/p2.jpg"],
    "video_url": "https://www.youtube.com/watch?v=abc",
}


_DEFAULT = object()


def _vrsync(properties=_DEFAULT):
    xml = build_vrsync_feed(
        tenant=TENANT,
        properties=[BASE_PROPERTY] if properties is _DEFAULT else properties,
        apply_watermark_on_portals=True,
    )
    return xml, ET.fromstring(xml)


def _cnm(properties=_DEFAULT):
    xml = build_chavesnamao_feed(
        tenant=TENANT,
        properties=[BASE_PROPERTY] if properties is _DEFAULT else properties,
        apply_watermark_on_portals=True,
    )
    return xml, ET.fromstring(xml)


# ── VRSync ───────────────────────────────────────────────────────────────────
def test_vrsync_gera_xml_valido_com_namespace_correto():
    xml, root = _vrsync()
    assert xml.startswith(b"<?xml")
    assert root.tag.endswith("ListingDataFeed")


def test_vrsync_lista_um_listing_por_imovel():
    _, root = _vrsync([BASE_PROPERTY, {**BASE_PROPERTY, "code": "IM-0153"}])
    assert len(root.findall("v:Listings/v:Listing", NS)) == 2


def test_vrsync_traduz_kind_para_property_type():
    _, root = _vrsync()
    kind = root.find("v:Listings/v:Listing/v:Details/v:PropertyType", NS)
    assert kind is not None and kind.text == "Apartment"


def test_vrsync_venda_usa_transaction_sale():
    _, root = _vrsync()
    tx = root.find("v:Listings/v:Listing/v:TransactionType", NS)
    assert tx is not None and tx.text == "Sale"


def test_vrsync_locacao_traz_rental_price():
    prop = {
        **BASE_PROPERTY,
        "purpose": "locacao",
        "sale_price": None,
        "rent_price": Decimal("2500"),
    }
    _, root = _vrsync([prop])
    rent = root.find("v:Listings/v:Listing/v:Details/v:RentalPrice", NS)
    assert rent is not None and rent.text == "2500"
    assert rent.attrib.get("period") == "Monthly"


def test_vrsync_endereco_bairro_esconde_rua_e_numero():
    _, root = _vrsync()
    location = root.find("v:Listings/v:Listing/v:Location", NS)
    assert location is not None
    assert location.attrib.get("displayAddress") == "Neighborhood"
    assert location.find("v:Address", NS) is None
    assert location.find("v:StreetNumber", NS) is None
    # Cidade, bairro e UF nunca somem.
    assert location.find("v:City", NS).text == "Juiz de Fora"
    assert location.find("v:Neighborhood", NS).text == "Lourdes"
    assert location.find("v:State", NS).text == "MG"


def test_vrsync_endereco_completo_exibe_rua_e_numero():
    _, root = _vrsync([{**BASE_PROPERTY, "address_visibility": "completo"}])
    location = root.find("v:Listings/v:Listing/v:Location", NS)
    assert location.attrib.get("displayAddress") == "All"
    assert location.find("v:Address", NS).text == "Rua Doutor Dilermando Cruz"
    assert location.find("v:StreetNumber", NS).text == "240"


def test_vrsync_media_publica_fotos_e_video():
    _, root = _vrsync()
    items = root.findall("v:Listings/v:Listing/v:Media/v:Item", NS)
    mediums = [i.attrib.get("medium") for i in items]
    assert mediums.count("image") == 2
    assert "video" in mediums


def test_vrsync_pet_e_lazer_viram_feature_quando_true():
    _, root = _vrsync()
    features = [
        f.text for f in root.findall("v:Listings/v:Listing/v:Details/v:Features/v:Feature", NS)
    ]
    assert "Pets allowed" in features
    assert "Recreation Area" in features


def test_vrsync_pet_none_nao_gera_feature():
    prop = {**BASE_PROPERTY, "pet_allowed": None, "has_leisure_area": None}
    _, root = _vrsync([prop])
    features = root.findall("v:Listings/v:Listing/v:Details/v:Features/v:Feature", NS)
    assert features == []


def test_vrsync_traz_contato_da_imobiliaria():
    _, root = _vrsync()
    contato = root.find("v:Listings/v:Listing/v:ContactInfo", NS)
    assert contato.find("v:Name", NS).text == "Aurora Imobiliária"
    assert contato.find("v:LicenseNumber", NS).text == "MG-12345"


def test_vrsync_feed_vazio_nao_quebra():
    _, root = _vrsync([])
    assert root.findall("v:Listings/v:Listing", NS) == []


# ── Chaves na Mão ────────────────────────────────────────────────────────────
def test_chavesnamao_gera_um_imovel_por_entrada():
    _, root = _cnm([BASE_PROPERTY, {**BASE_PROPERTY, "code": "IM-9"}])
    assert root.tag == "imoveis"
    assert len(root.findall("imovel")) == 2


def test_chavesnamao_traz_valores_e_endereco():
    _, root = _cnm()
    imovel = root.find("imovel")
    assert imovel.find("codigo").text == "IM-0152"
    assert imovel.find("valorVenda").text == "199000"
    assert imovel.find("condominio").text == "420"
    endereco = imovel.find("endereco")
    assert endereco.find("cidade").text == "Juiz de Fora"
    assert endereco.find("bairro").text == "Lourdes"
    assert endereco.find("rua") is None  # visibility bairro esconde
