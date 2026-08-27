"""Legendas prontas para Instagram e Facebook a partir da ficha do imóvel.

Função pura, sem banco. A imobiliária ganha um texto que já cabe na
publicação — headline, valor, destaques, chamada para conversar e hashtags
locais. Cada plataforma tem sua etiqueta:

- **Instagram** favorece bloco enxuto, quebras curtas e muitos hashtags
  (limite prático 30). Legenda até ~2.200 caracteres.
- **Facebook** aceita texto mais longo e hashtags atrapalham menos, mas
  também não ajudam muito; ficamos com 3–5 relevantes.

Determinístico: para a mesma ficha, sai a mesma legenda. Isso deixa a
imobiliária confiar no botão "copiar" e o teste ficar simples.
"""

from __future__ import annotations

import re
import unicodedata
from decimal import Decimal
from typing import Literal

Platform = Literal["instagram", "facebook"]

_KIND_LABEL = {
    "casa": "Casa",
    "casa_geminada": "Casa geminada",
    "casa_condominio": "Casa em condomínio",
    "sobrado": "Sobrado",
    "apartamento": "Apartamento",
    "cobertura": "Cobertura",
    "kitnet": "Kitnet",
    "studio": "Studio",
    "flat": "Flat",
    "garden": "Garden",
    "loft": "Loft",
    "sala_comercial": "Sala comercial",
    "loja": "Loja",
    "ponto_comercial": "Ponto comercial",
    "galpao": "Galpão",
    "andar_corporativo": "Andar corporativo",
    "predio": "Prédio",
    "hotel_pousada": "Hotel / pousada",
    "terreno": "Terreno",
    "lote_condominio": "Lote em condomínio",
    "sitio_chacara": "Sítio / chácara",
    "fazenda": "Fazenda",
    "vaga_garagem": "Vaga de garagem",
    "outro": "Imóvel",
}


def build_social_caption(
    *,
    platform: Platform,
    kind: str,
    purpose: str,
    code: str,
    title: str,
    description: str | None,
    bairro: str | None,
    cidade: str | None,
    uf: str | None,
    area_util: Decimal | None,
    bedrooms: int | None,
    suites: int | None,
    bathrooms: int | None,
    parking_spots: int | None,
    sale_price: Decimal | None,
    rent_price: Decimal | None,
    condo_fee: Decimal | None,
    iptu_amount: Decimal | None,
    pet_allowed: bool | None,
    republic_allowed: bool | None,
    has_leisure_area: bool | None,
    whatsapp_url: str | None = None,
    phone: str | None = None,
    site_url: str | None = None,
) -> str:
    """Devolve a legenda pronta para copiar para o app da rede social."""
    lines: list[str] = []

    lines.append(_headline(kind, purpose, bedrooms, bairro, cidade))
    lines.append("")

    money_line = _money_line(purpose, sale_price, rent_price)
    if money_line:
        lines.append(money_line)
        lines.append("")

    if description:
        lines.append(_condense(description, limit=280))
        lines.append("")

    specs = _specs_block(
        area_util=area_util,
        bedrooms=bedrooms,
        suites=suites,
        bathrooms=bathrooms,
        parking_spots=parking_spots,
        condo_fee=condo_fee,
        iptu_amount=iptu_amount,
    )
    if specs:
        lines.extend(specs)
        lines.append("")

    perks = _perks_line(pet_allowed, republic_allowed, has_leisure_area)
    if perks:
        lines.append(perks)
        lines.append("")

    # Localização de novo, agora com foco em busca.
    if bairro or cidade:
        lines.append(f"Localização: {_locality(bairro, cidade, uf)}.")
        lines.append("")

    # Call-to-action e identificação do imóvel.
    lines.append(f"Cód. {code} — fale com a gente:")
    if whatsapp_url:
        lines.append(f"WhatsApp: {whatsapp_url}")
    if phone:
        lines.append(f"Telefone: {phone}")
    if site_url:
        lines.append(f"Ficha completa: {site_url}")
    lines.append("")

    tags = _hashtags(
        platform=platform,
        kind=kind,
        purpose=purpose,
        bairro=bairro,
        cidade=cidade,
        uf=uf,
    )
    if tags:
        lines.append(" ".join(tags))

    text = "\n".join(lines).rstrip()
    # Instagram trunca em 2.200; Facebook aceita mais, mas texto longo perde
    # engajamento. Corte por segurança sem tesourar palavras no meio.
    limit = 2200 if platform == "instagram" else 4000
    if len(text) > limit:
        text = text[: limit - 1].rsplit(" ", 1)[0] + "…"
    return text


# ── Blocos ───────────────────────────────────────────────────────────────────
def _headline(
    kind: str,
    purpose: str,
    bedrooms: int | None,
    bairro: str | None,
    cidade: str | None,
) -> str:
    kind_label = _KIND_LABEL.get(kind, "Imóvel")
    quartos = ""
    if bedrooms and kind in ("casa", "apartamento", "cobertura", "sobrado"):
        quartos = f" de {bedrooms} quarto{'s' if bedrooms > 1 else ''}"
    onde = ""
    if bairro:
        onde = f" no {bairro}"
    elif cidade:
        onde = f" em {cidade}"
    acao = "para alugar" if purpose == "locacao" else "à venda"
    return f"{kind_label}{quartos}{onde} {acao}"


def _money_line(
    purpose: str,
    sale_price: Decimal | None,
    rent_price: Decimal | None,
) -> str:
    parts: list[str] = []
    if purpose in ("venda", "ambos") and sale_price:
        parts.append(f"Venda: {_brl(sale_price)}")
    if purpose in ("locacao", "ambos") and rent_price:
        parts.append(f"Aluguel: {_brl(rent_price)}/mês")
    return " | ".join(parts)


def _specs_block(
    *,
    area_util: Decimal | None,
    bedrooms: int | None,
    suites: int | None,
    bathrooms: int | None,
    parking_spots: int | None,
    condo_fee: Decimal | None,
    iptu_amount: Decimal | None,
) -> list[str]:
    rows: list[str] = []
    if area_util:
        rows.append(f"- Área útil: {int(area_util)} m²")
    if bedrooms:
        rows.append(f"- Quartos: {bedrooms}" + (f" (sendo {suites} suíte(s))" if suites else ""))
    if bathrooms:
        rows.append(f"- Banheiros: {bathrooms}")
    if parking_spots:
        rows.append(f"- Vagas: {parking_spots}")
    if condo_fee:
        rows.append(f"- Condomínio: {_brl(condo_fee)}/mês")
    if iptu_amount is not None:
        rows.append(f"- IPTU: {_brl(iptu_amount)}")
    return rows


def _perks_line(
    pet_allowed: bool | None,
    republic_allowed: bool | None,
    has_leisure_area: bool | None,
) -> str:
    perks: list[str] = []
    if pet_allowed is True:
        perks.append("aceita pet")
    if republic_allowed is True:
        perks.append("aceita república")
    if has_leisure_area is True:
        perks.append("com área de lazer")
    if not perks:
        return ""
    return "Diferenciais: " + ", ".join(perks) + "."


def _hashtags(
    *,
    platform: Platform,
    kind: str,
    purpose: str,
    bairro: str | None,
    cidade: str | None,
    uf: str | None,
) -> list[str]:
    kind_tag = _slug_tag(_KIND_LABEL.get(kind, "imovel"))
    purpose_tag = "aluguel" if purpose == "locacao" else "venda"
    base = ["#imovel", f"#{kind_tag}", f"#{purpose_tag}"]
    if cidade:
        base.append(f"#{_slug_tag(cidade)}")
    if bairro:
        base.append(f"#{_slug_tag(bairro)}")
    if uf:
        base.append(f"#{uf.lower()}")
    base += [
        f"#{kind_tag}{purpose_tag}",
        "#imobiliaria",
        f"#corretor{purpose_tag}",
    ]
    # Deduplicar mantendo ordem; Instagram ganha lista maior; Facebook, curta.
    seen: set[str] = set()
    unique: list[str] = []
    for tag in base:
        if tag not in seen:
            unique.append(tag)
            seen.add(tag)
    return unique if platform == "instagram" else unique[:5]


# ── Formatadores ─────────────────────────────────────────────────────────────
def _brl(value: Decimal | int | float) -> str:
    inteiro = int(Decimal(value).quantize(Decimal("1")))
    reversed_digits = str(inteiro)[::-1]
    grouped = ".".join(reversed_digits[i : i + 3] for i in range(0, len(reversed_digits), 3))
    return "R$ " + grouped[::-1]


def _locality(bairro: str | None, cidade: str | None, uf: str | None) -> str:
    parts = [p for p in (bairro, cidade) if p]
    text = " · ".join(parts)
    if uf:
        text += f" — {uf}"
    return text


def _condense(text: str, *, limit: int) -> str:
    # Corta descrições longas sem cortar palavras no meio; preserva quebras
    # simples pra manter o ritmo do texto original.
    collapsed = re.sub(r"[ \t]+", " ", text).strip()
    if len(collapsed) <= limit:
        return collapsed
    return collapsed[: limit - 1].rsplit(" ", 1)[0] + "…"


def _slug_tag(value: str) -> str:
    """Reduz um texto a letras+dígitos para virar hashtag (sem hífen)."""
    normalized = unicodedata.normalize("NFKD", value)
    ascii_only = normalized.encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "", ascii_only)
