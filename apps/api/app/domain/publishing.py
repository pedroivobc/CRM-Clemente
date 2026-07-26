"""Regras da vitrine: o que sai do cadastro para o site e para os portais.

Funções puras, sem banco e sem rede. A parte sensível não é o slug bonito — é
o **endereço**: proprietário quase sempre não quer o número da rua exposto, e
publicar o que não podia é um problema com o cliente, não um bug de tela. Por
isso a política de exibição mora aqui, isolada e coberta por teste, e o resto
do sistema só pergunta "o que posso mostrar deste imóvel?".

Convenções:
- ``address`` é o mesmo dicionário gravado em ``properties.address``
  (cep, logradouro, numero, complemento, bairro, cidade, uf).
- ``address_visibility`` é ``completo`` | ``rua`` | ``bairro``, do mais
  aberto ao mais fechado. O padrão do banco é ``bairro``.
"""

from __future__ import annotations

import re
import unicodedata

# Mapa do nosso ``kind`` para o PropertyType do padrão VRSync (ZAP/VivaReal/
# OLX). É o ponto de tradução do feed; ajustar contra a especificação viva
# antes de ligar a publicação real nos portais.
VRSYNC_PROPERTY_TYPE: dict[str, str] = {
    "casa": "Home",
    "casa_geminada": "Home",
    "casa_condominio": "Condominium",
    "sobrado": "Home",
    "apartamento": "Apartment",
    "cobertura": "Penthouse",
    "kitnet": "Kitnet",
    "studio": "Kitnet",
    "flat": "Flat",
    "garden": "Apartment",
    "loft": "Apartment",
    "sala_comercial": "Office",
    "loja": "Store",
    "ponto_comercial": "BusinessPremises",
    "galpao": "Warehouse",
    "andar_corporativo": "BuildingFloor",
    "predio": "Building",
    "hotel_pousada": "HotelFlat",
    "terreno": "ResidentialAllotmentLand",
    "lote_condominio": "ResidentialAllotmentLand",
    "sitio_chacara": "Farm",
    "fazenda": "Farm",
    "vaga_garagem": "ParkingSpace",
    "outro": "Home",
}

# Garantias de locação aceitas — o mesmo conjunto validado pelo gatilho no banco.
RENTAL_WARRANTIES = ("caucao", "fiador", "seguro_fianca", "titulo_capitalizacao")

_WORD_QUARTOS = {1: "1_quarto", 2: "2_quartos", 3: "3_quartos", 4: "4_quartos"}


def slugify(value: str) -> str:
    """Reduz um texto a letras, números e hífens, sem acento.

    ``"São Pedro"`` → ``"sao-pedro"``. Vazio ou só símbolos devolve ``""``.
    """
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode()
    ascii_only = ascii_only.lower()
    ascii_only = re.sub(r"[^a-z0-9]+", "-", ascii_only)
    return ascii_only.strip("-")


def build_slug(
    *,
    kind: str,
    purpose: str,
    code: str,
    bedrooms: int | None = None,
    neighborhood: str | None = None,
    city: str | None = None,
    uf: str | None = None,
) -> str:
    """Monta a URL amigável no padrão observado nos sites de JF.

    ``apartamento-2-quartos-lourdes-juiz-de-fora-mg-venda-im-0152``

    O código do imóvel entra no fim: ele é único por tenant, então garante que
    o slug também seja, sem depender de sorteio ou sufixo numérico.
    """
    kind_label = kind
    if kind in ("casa", "apartamento", "cobertura") and bedrooms in _WORD_QUARTOS:
        kind_label = f"{kind}-{_WORD_QUARTOS[bedrooms].replace('_', '-')}"

    transacao = {"venda": "venda", "locacao": "aluguel"}.get(purpose, "venda-aluguel")

    parts = [kind_label, neighborhood, city, uf, transacao, code]
    return "-".join(slugify(p) for p in parts if p and slugify(p))


def public_address(address: dict | None, visibility: str) -> dict:
    """Devolve só o que a política deixa aparecer na vitrine.

    - ``completo``: tudo, inclusive número e complemento.
    - ``rua``: logradouro sem número (o CEP também some, para não localizar).
    - ``bairro``: apenas bairro, cidade e UF.

    Cidade, bairro e UF nunca são escondidos — sem eles o anúncio não serve
    nem para busca nem para o portal, que os exige.
    """
    address = address or {}
    base = {
        "bairro": address.get("bairro"),
        "cidade": address.get("cidade"),
        "uf": address.get("uf"),
    }
    if visibility == "bairro":
        return base
    if visibility == "rua":
        return {**base, "logradouro": address.get("logradouro")}
    # completo
    return {
        **base,
        "logradouro": address.get("logradouro"),
        "numero": address.get("numero"),
        "complemento": address.get("complemento"),
        "cep": address.get("cep"),
    }


# Tipos onde não faz sentido cobrar número de quartos (comercial/terreno).
_NON_RESIDENTIAL = {
    "sala_comercial",
    "loja",
    "ponto_comercial",
    "galpao",
    "andar_corporativo",
    "predio",
    "hotel_pousada",
    "terreno",
    "lote_condominio",
    "sitio_chacara",
    "fazenda",
    "vaga_garagem",
}


def publication_blockers(
    *,
    purpose: str,
    status: str,
    title: str | None,
    description: str | None,
    sale_price: object | None,
    rent_price: object | None,
    photo_count: int,
    address: dict | None,
    kind: str | None = None,
    area_util: object | None = None,
    bedrooms: object | None = None,
    iptu_amount: object | None = None,
) -> list[str]:
    """Lista o que falta para o imóvel poder ir ao ar.

    Vazio significa "pode publicar". As regras cruzam a exigência comercial
    (foto e preço vendem) com a do portal (título, descrição e bairro são
    obrigatórios no VRSync) e com o bom senso (imóvel inativo ou vendido não
    fica anunciado).
    """
    blockers: list[str] = []
    address = address or {}

    if status in ("vendido", "alugado", "inativo"):
        blockers.append("O imóvel está fechado ou inativo e não deve ficar anunciado.")

    if not (title and title.strip()):
        blockers.append("Falta o título do anúncio.")
    elif len(title.strip()) < 10:
        blockers.append("O título precisa de ao menos 10 caracteres para os portais.")

    if not (description and description.strip()):
        blockers.append("Falta a descrição do imóvel.")
    elif len(description.strip()) < 50:
        blockers.append("A descrição precisa de ao menos 50 caracteres para os portais.")

    if photo_count == 0:
        blockers.append("Adicione ao menos uma foto.")

    if purpose in ("venda", "ambos") and not _positive(sale_price):
        blockers.append("Informe o preço de venda.")
    if purpose in ("locacao", "ambos") and not _positive(rent_price):
        blockers.append("Informe o valor do aluguel.")

    if not address.get("bairro"):
        blockers.append("Informe ao menos o bairro para a localização.")
    if not address.get("cidade"):
        blockers.append("Informe a cidade.")

    # Campos que o portal exige e que valem para todo imóvel — não faz sentido
    # anunciar sem dizer a área. Quartos só para o que tem quartos.
    if not _positive(area_util):
        blockers.append("Informe a área útil (m²).")
    if bedrooms is None and (kind is None or kind not in _NON_RESIDENTIAL):
        blockers.append("Informe o número de quartos.")
    if iptu_amount is None:
        blockers.append("Informe o valor do IPTU (marque 0 se for isento).")

    return blockers


def whatsapp_link(*, phone: str, code: str, url: str) -> str:
    """Deep link de WhatsApp já com o imóvel identificado e a URL na mensagem.

    Espelha o padrão que o mercado de JF resolveu bem: o corretor abre a
    conversa já sabendo qual imóvel a pessoa está olhando.
    """
    digits = re.sub(r"\D", "", phone)
    if digits and not digits.startswith("55"):
        digits = "55" + digits
    message = f"Olá! Tenho interesse no imóvel {code}. {url}"
    encoded = re.sub(r" ", "+", message)
    return f"https://wa.me/{digits}?text={encoded}"


def _positive(value: object | None) -> bool:
    if value is None:
        return False
    try:
        return float(value) > 0
    except (TypeError, ValueError):
        return False
