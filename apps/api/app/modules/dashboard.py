"""Painel inicial — indicadores da fundação (Fase 1).

Os blocos de locação (contratos, cobranças, repasses) entram na Fase 2.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.core.deps import CurrentUserDep, DbDep

router = APIRouter(prefix="/dashboard", tags=["painel"])


@router.get("")
async def overview(db: DbDep, user: CurrentUserDep) -> dict:
    counts = (
        (
            await db.execute(
                text(
                    """
                select
                  (select count(*) from crm.clients) as clientes,
                  (select count(*) from properties.properties) as imoveis,
                  (select count(*) from properties.properties
                   where status = 'disponivel') as imoveis_disponiveis,
                  (select count(*) from properties.properties
                   where status = 'alugado') as imoveis_alugados,
                  (select count(*) from crm.client_documents
                   where valid_until is not null
                     and valid_until <= current_date + 30) as documentos_a_vencer
                """
                )
            )
        )
        .mappings()
        .first()
    )

    finance_row = (
        (
            await db.execute(
                text(
                    """
                select
                  (select coalesce(sum(amount), 0) from finance.receivables
                   where status = 'pendente') as a_receber,
                  (select coalesce(sum(amount), 0) from finance.payables
                   where status = 'pendente') as a_pagar,
                  (select count(*) from finance.receivables
                   where status = 'pendente' and due_date < current_date) as receber_vencidos,
                  (select count(*) from finance.payables
                   where status = 'pendente' and due_date < current_date) as pagar_vencidos
                """
                )
            )
        )
        .mappings()
        .first()
    )

    by_status = (
        (
            await db.execute(
                text(
                    "select status, count(*) as total from properties.properties "
                    "group by status order by total desc"
                )
            )
        )
        .mappings()
        .all()
    )

    return {
        "plano": user.plan,
        "modulos": user.modules,
        "cadastros": dict(counts),
        "financeiro": dict(finance_row),
        "imoveis_por_status": [dict(r) for r in by_status],
    }
