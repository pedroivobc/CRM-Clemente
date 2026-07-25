"""Renderização do contrato a partir do template do tenant.

O template guarda variáveis no formato ``{{nome}}``. A substituição é literal e
sem execução de código — o template é conteúdo do cliente, não programa.
"""

from __future__ import annotations

import re
from decimal import Decimal
from uuid import UUID

from sqlalchemy import text

from app.core.validators import format_document

VARIABLE = re.compile(r"\{\{\s*([a-z_]+)\s*\}\}")

GUARANTEE_LABELS = {
    "fiador": "fiador",
    "caucao": "caução",
    "seguro_fianca": "seguro-fiança",
    "titulo_capitalizacao": "título de capitalização",
}


def _money(value: Decimal | None) -> str:
    if value is None:
        return "—"
    inteiro, _, centavos = f"{Decimal(value):.2f}".partition(".")
    milhar = f"{int(inteiro):,}".replace(",", ".")
    return f"R$ {milhar},{centavos}"


def _date(value) -> str:
    return value.strftime("%d/%m/%Y") if value else "—"


def _pct(value: Decimal) -> str:
    normalized = Decimal(value).normalize()
    return f"{normalized:f}".replace(".", ",") + "%"


async def build_context(db, contract_id: UUID, tenant_name: str) -> dict[str, str]:
    row = (
        (
            await db.execute(
                text(
                    """
                    select c.*, p.code as property_code, p.address as property_address,
                           p.title as property_title
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    where c.id = :cid
                    """
                ),
                {"cid": str(contract_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise ValueError("Contrato não encontrado")

    parties = (
        (
            await db.execute(
                text(
                    """
                    select p.role, c.name, c.cpf_cnpj
                    from rentals.contract_parties p
                    join crm.clients c on c.id = p.client_id
                    where p.contract_id = :cid
                    """
                ),
                {"cid": str(contract_id)},
            )
        )
        .mappings()
        .all()
    )
    by_role = {p["role"]: p for p in parties}
    address = row["property_address"] or {}
    street = ", ".join(filter(None, [address.get("logradouro"), address.get("numero")]))
    full_address = (
        " — ".join(
            filter(
                None,
                [
                    street,
                    address.get("bairro"),
                    "/".join(filter(None, [address.get("cidade"), address.get("uf")])),
                ],
            )
        )
        or row["property_title"]
    )

    def party(role: str, field: str) -> str:
        entry = by_role.get(role)
        if not entry:
            return "—"
        return entry["name"] if field == "name" else (format_document(entry["cpf_cnpj"]) or "—")

    return {
        "imobiliaria_nome": tenant_name,
        "contrato_codigo": row["code"],
        "locador_nome": party("locador", "name"),
        "locador_documento": party("locador", "doc"),
        "locatario_nome": party("locatario", "name"),
        "locatario_documento": party("locatario", "doc"),
        "fiador_nome": party("fiador", "name"),
        "fiador_documento": party("fiador", "doc"),
        "imovel_codigo": row["property_code"],
        "imovel_endereco": full_address,
        "valor_aluguel": _money(row["rent_amount"]),
        "valor_condominio": _money(row["condo_fee"]),
        "valor_iptu": _money(row["iptu_amount"]),
        "dia_vencimento": str(row["due_day"]),
        "data_inicio": _date(row["start_date"]),
        "data_fim": _date(row["end_date"]),
        "indice_reajuste": "IGP-M" if row["price_index"] == "IGPM" else "IPCA",
        "garantia": GUARANTEE_LABELS.get(row["guarantee_type"] or "", "sem garantia"),
        "valor_garantia": _money(row["guarantee_amount"]),
        "multa_atraso": _pct(row["late_fine_pct"]),
        "juros_dia": _pct(row["daily_interest_pct"]),
        "taxa_administracao": _pct(row["admin_fee_pct"]),
    }


async def render_contract(db, contract_id: UUID, tenant_name: str) -> str:
    context = await build_context(db, contract_id, tenant_name)
    template = (
        await db.execute(
            text(
                """
                select coalesce(t.body, '') from rentals.contracts c
                left join rentals.contract_templates t on t.id = c.template_id
                where c.id = :cid
                """
            ),
            {"cid": str(contract_id)},
        )
    ).scalar()

    if not template:
        raise ValueError("Contrato sem template associado")

    # Variável desconhecida fica visível no texto em vez de sumir em silêncio.
    return VARIABLE.sub(lambda m: context.get(m.group(1), f"«{m.group(1)}»"), template)
