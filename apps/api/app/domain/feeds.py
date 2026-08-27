"""Feeds XML para os portais imobiliários.

Dois formatos, um domínio:
- **VRSync** — padrão do Grupo Zap (ZAP, VivaReal, OLX). É o feed lido 2×/dia
  que o mercado converge para. Estrutura no ``<Listings>`` com um
  ``<Listing>`` por imóvel; contato do anunciante fora do bloco.
- **Chaves na Mão** — schema próprio, também XML, mais simples. Mesma
  materialização, campos diferentes.

Funções puras: recebem os dados já achatados por linha e devolvem string XML.
Não tocam o banco. O endpoint HTTP compõe a query, achata os campos e passa
para cá — o que deixa o teste rápido e o cache do lado dele.

Todo cuidado com o endereço: o feed respeita ``address_visibility``. O
portal exige cidade/UF (jamais escondemos), mas o número da rua ou o
logradouro inteiro só aparecem se a política for suficiente.
"""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Any
from xml.etree.ElementTree import Element, SubElement, tostring

from app.domain.publishing import VRSYNC_PROPERTY_TYPE, public_address

VRSYNC_TRANSACTION = {"venda": "Sale", "locacao": "Rent", "ambos": "SaleAndRent"}
VRSYNC_USAGE = {"residencial": "Residential", "comercial": "Commercial", "ambos": "Both"}


def build_vrsync_feed(
    *,
    tenant: dict,
    properties: list[dict],
    apply_watermark_on_portals: bool,
) -> bytes:
    """Constrói o XML VRSync com todos os imóveis publicados nos portais.

    ``tenant`` traz: display_name, cnpj (opcional), phone, email, creci.
    ``properties`` já vem com colunas de propriedade + address + photos (lista
    de URLs — marcadas ou não conforme ``apply_watermark_on_portals``).
    """
    root = Element("ListingDataFeed", {"xmlns": "http://www.vivareal.com/schemas/1.0/VRSync"})

    header = SubElement(root, "Header")
    SubElement(header, "Provider").text = tenant.get("display_name", "Imobiliária")
    SubElement(header, "Email").text = tenant.get("email") or ""
    SubElement(header, "PublishDate").text = _now_iso()

    listings = SubElement(root, "Listings")
    for prop in properties:
        listings.append(_vrsync_listing(prop, tenant, apply_watermark_on_portals))

    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="utf-8")


def build_chavesnamao_feed(
    *,
    tenant: dict,
    properties: list[dict],
    apply_watermark_on_portals: bool,
) -> bytes:
    """XML da Chaves na Mão. Estrutura mais simples, sem o wrapper ``Header``."""
    root = Element("imoveis")
    for prop in properties:
        root.append(_chavesnamao_item(prop, tenant, apply_watermark_on_portals))
    return b'<?xml version="1.0" encoding="UTF-8"?>\n' + tostring(root, encoding="utf-8")


# ── VRSync ───────────────────────────────────────────────────────────────────
def _vrsync_listing(prop: dict, tenant: dict, marca_dagua: bool) -> Element:
    listing = Element("Listing")
    SubElement(listing, "ListingID").text = prop["code"]
    SubElement(listing, "Title").text = _cdata(prop["title"])
    SubElement(listing, "TransactionType").text = VRSYNC_TRANSACTION.get(prop["purpose"], "Sale")
    SubElement(listing, "PublicationType").text = "Standard"

    details = SubElement(listing, "Details")
    SubElement(details, "PropertyType").text = VRSYNC_PROPERTY_TYPE.get(prop["kind"], "Home")
    SubElement(details, "UsageType").text = VRSYNC_USAGE.get(prop.get("usage_type", "residencial"))
    if prop.get("description"):
        SubElement(details, "Description").text = _cdata(prop["description"])
    if prop.get("area_util") is not None:
        SubElement(details, "LivingArea", {"unit": "square metres"}).text = _num(prop["area_util"])
    if prop.get("lot_area") is not None:
        SubElement(details, "LotArea", {"unit": "square metres"}).text = _num(prop["lot_area"])
    if prop.get("bedrooms") is not None:
        SubElement(details, "Bedrooms").text = str(int(prop["bedrooms"]))
    if prop.get("suites") is not None:
        SubElement(details, "Suites").text = str(int(prop["suites"]))
    if prop.get("bathrooms") is not None:
        SubElement(details, "Bathrooms").text = str(int(prop["bathrooms"]))
    if prop.get("parking_spots") is not None:
        SubElement(details, "Garage").text = str(int(prop["parking_spots"]))
    if prop.get("year_built"):
        SubElement(details, "YearBuilt").text = str(int(prop["year_built"]))

    # Preços (venda e/ou aluguel) + encargos.
    prices = SubElement(details, "ListPrice", {"currency": "BRL"})
    prices.text = _num(prop.get("sale_price") or prop.get("rent_price") or 0)
    if prop.get("purpose") in ("locacao", "ambos") and prop.get("rent_price") is not None:
        SubElement(details, "RentalPrice", {"currency": "BRL", "period": "Monthly"}).text = _num(
            prop["rent_price"]
        )
    if prop.get("condo_fee") is not None:
        SubElement(details, "PropertyAdministrationFee", {"currency": "BRL"}).text = _num(
            prop["condo_fee"]
        )
    if prop.get("iptu_amount") is not None:
        SubElement(details, "YearlyTax", {"currency": "BRL"}).text = _num(prop["iptu_amount"])

    # Características derivadas dos flags do imóvel.
    features = SubElement(details, "Features")
    for value, feature_name in (
        (prop.get("pet_allowed"), "Pets allowed"),
        (prop.get("has_leisure_area"), "Recreation Area"),
    ):
        if value is True:
            SubElement(features, "Feature").text = feature_name

    # Endereço, respeitando a visibilidade.
    address = public_address(prop.get("address") or {}, prop.get("address_visibility", "bairro"))
    location = SubElement(listing, "Location", {"displayAddress": _display_addr(prop)})
    SubElement(location, "Country", {"abbreviation": "BR"}).text = "Brasil"
    if address.get("uf"):
        SubElement(location, "State", {"abbreviation": address["uf"]}).text = address["uf"]
    if address.get("cidade"):
        SubElement(location, "City").text = address["cidade"]
    if address.get("bairro"):
        SubElement(location, "Neighborhood").text = address["bairro"]
    if address.get("logradouro"):
        SubElement(location, "Address").text = address["logradouro"]
    if address.get("numero"):
        SubElement(location, "StreetNumber").text = address["numero"]
    if address.get("cep"):
        SubElement(location, "PostalCode").text = address["cep"]

    # Fotos e vídeo. Média sempre publicável (o worker já garante a marca ou
    # a versão limpa, conforme a preferência do tenant).
    media = SubElement(listing, "Media")
    for i, url in enumerate(prop.get("photos") or [], start=1):
        SubElement(media, "Item", {"medium": "image", "caption": f"Foto {i}"}).text = url
    if prop.get("video_url"):
        SubElement(media, "Item", {"medium": "video"}).text = prop["video_url"]

    contact = SubElement(listing, "ContactInfo")
    SubElement(contact, "Name").text = tenant.get("display_name", "Imobiliária")
    if tenant.get("phone"):
        SubElement(contact, "Telephone").text = tenant["phone"]
    if tenant.get("email"):
        SubElement(contact, "Email").text = tenant["email"]
    if tenant.get("creci"):
        SubElement(contact, "LicenseNumber").text = tenant["creci"]

    return listing


# ── Chaves na Mão ────────────────────────────────────────────────────────────
def _chavesnamao_item(prop: dict, tenant: dict, marca_dagua: bool) -> Element:
    item = Element("imovel")
    SubElement(item, "codigo").text = prop["code"]
    SubElement(item, "tipo").text = VRSYNC_PROPERTY_TYPE.get(prop["kind"], "Home")
    SubElement(item, "finalidade").text = {
        "venda": "Venda",
        "locacao": "Locacao",
        "ambos": "VendaLocacao",
    }.get(prop["purpose"], "Venda")
    SubElement(item, "titulo").text = _cdata(prop["title"])
    if prop.get("description"):
        SubElement(item, "descricao").text = _cdata(prop["description"])
    if prop.get("sale_price"):
        SubElement(item, "valorVenda").text = _num(prop["sale_price"])
    if prop.get("rent_price"):
        SubElement(item, "valorLocacao").text = _num(prop["rent_price"])
    if prop.get("condo_fee"):
        SubElement(item, "condominio").text = _num(prop["condo_fee"])
    if prop.get("iptu_amount") is not None:
        SubElement(item, "iptu").text = _num(prop["iptu_amount"])
    if prop.get("area_util") is not None:
        SubElement(item, "areaUtil").text = _num(prop["area_util"])
    if prop.get("bedrooms") is not None:
        SubElement(item, "dormitorios").text = str(int(prop["bedrooms"]))
    if prop.get("bathrooms") is not None:
        SubElement(item, "banheiros").text = str(int(prop["bathrooms"]))
    if prop.get("parking_spots") is not None:
        SubElement(item, "vagas").text = str(int(prop["parking_spots"]))

    address = public_address(prop.get("address") or {}, prop.get("address_visibility", "bairro"))
    endereco = SubElement(item, "endereco")
    for key, dest in (("cidade", "cidade"), ("uf", "uf"), ("bairro", "bairro"),
                      ("logradouro", "rua"), ("numero", "numero"), ("cep", "cep")):
        if address.get(key):
            SubElement(endereco, dest).text = address[key]

    fotos = SubElement(item, "fotos")
    for url in prop.get("photos") or []:
        SubElement(fotos, "foto").text = url

    if prop.get("video_url"):
        SubElement(item, "video").text = prop["video_url"]

    return item


# ── Helpers ──────────────────────────────────────────────────────────────────
def _num(value: Any) -> str:
    if value is None:
        return "0"
    if isinstance(value, Decimal):
        # Sem casa decimal quando é inteiro (portal aceita ambos).
        return f"{value:.2f}".rstrip("0").rstrip(".") or "0"
    return str(value)


def _cdata(text: str) -> str:
    # ElementTree escapa entidades automaticamente; para portais que preferem
    # CDATA, envolvemos manualmente e ignoramos o duplo-escape ao serializar
    # (ver serialização em tostring — o texto vira &lt;![CDATA…]]&gt; mesmo).
    # Como os principais parsers (VRSync/CNM) aceitam texto escapado, ficamos
    # com o valor puro; nenhuma tag no title/desc quebra o portal.
    return re.sub(r"[\r\n]+", " ", text or "").strip()


def _display_addr(prop: dict) -> str:
    vis = prop.get("address_visibility", "bairro")
    return {"completo": "All", "rua": "Street", "bairro": "Neighborhood"}.get(vis, "Neighborhood")


def _now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
