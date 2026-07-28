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


@router.get("/segunda")
async def manha_de_segunda(db: DbDep, user: CurrentUserDep) -> dict:
    """Seis números para a manhã de segunda-feira do dono da imobiliária.

    A ideia é servir um resumo que caiba no golpe de vista: quanto entra
    esta semana, quanto está atrasado, o que vence, quantos negócios abertos.
    Sem filtros, sem tabelas — só os números que orientam o dia.
    """
    receita = (
        (
            await db.execute(
                text(
                    """
                    select
                      coalesce(sum(amount) filter (
                        where status = 'pendente'
                          and due_date between current_date and current_date + 7
                      ), 0) as a_receber_7dias,
                      coalesce(sum(amount) filter (
                        where status = 'pendente' and due_date < current_date
                      ), 0) as em_atraso,
                      count(*) filter (
                        where status = 'pendente' and due_date < current_date
                      ) as em_atraso_qtd
                    from finance.receivables
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    contratos = (
        (
            await db.execute(
                text(
                    """
                    select
                      count(*) filter (
                        where status = 'ativo'
                          and end_date between current_date and current_date + 60
                      ) as vencendo_60d,
                      count(*) filter (where status = 'ativo') as ativos
                    from rentals.contracts
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    negocios = (
        (
            await db.execute(
                text(
                    """
                    select
                      (select count(*) from sales.leads where status = 'aberto') +
                      (select count(*) from rentals.leads where status = 'aberto') as leads_abertos,
                      (select count(*) from sales.proposals where status = 'aberta')
                        as propostas_abertas
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    imoveis = (
        (
            await db.execute(
                text(
                    """
                    select
                      count(*) filter (where publish_site) as anunciados,
                      count(*) filter (where status = 'captacao') as em_captacao
                    from properties.properties
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    return {
        "receita_7dias": float(receita["a_receber_7dias"] or 0),
        "em_atraso": float(receita["em_atraso"] or 0),
        "em_atraso_qtd": int(receita["em_atraso_qtd"] or 0),
        "contratos_vencendo_60d": int(contratos["vencendo_60d"] or 0),
        "contratos_ativos": int(contratos["ativos"] or 0),
        "leads_abertos": int(negocios["leads_abertos"] or 0),
        "propostas_abertas": int(negocios["propostas_abertas"] or 0),
        "imoveis_anunciados": int(imoveis["anunciados"] or 0),
        "imoveis_em_captacao": int(imoveis["em_captacao"] or 0),
    }
