"""Indicadores próprios do módulo de Locação.

Espelha o painel de vendas: cada módulo tem seus próprios KPIs, e uma
imobiliária que contrate só locação não depende de nada do módulo de vendas.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import text

from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.domain.sales import funnel_conversion

router = APIRouter(
    prefix="/rentals",
    tags=["locação"],
    dependencies=[Depends(require_module("module_rentals"))],
)


@router.get("/dashboard")
async def rentals_dashboard(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> dict:
    """Carteira administrada, receita recorrente, inadimplência e funil."""
    carteira = (
        (
            await db.execute(
                text(
                    """
                    select
                      count(*) filter (where status = 'ativo') as contratos_ativos,
                      count(*) filter (where status = 'em_assinatura') as em_assinatura,
                      coalesce(sum(rent_amount) filter (where status = 'ativo'), 0)
                        as aluguel_administrado,
                      coalesce(
                        sum(rent_amount * admin_fee_pct / 100) filter (where status = 'ativo'),
                        0
                      ) as taxa_mensal_prevista,
                      count(*) filter (
                        where status = 'ativo'
                          and end_date <= current_date + interval '90 days'
                      ) as vigencias_a_vencer
                    from rentals.contracts
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    # Inadimplência do mês corrente: cobranças vencidas e ainda em aberto.
    cobrancas = (
        (
            await db.execute(
                text(
                    """
                    select
                      count(*) filter (
                        where status = 'pendente' and due_date < current_date
                      ) as vencidas,
                      coalesce(sum(gross_amount) filter (
                        where status = 'pendente' and due_date < current_date
                      ), 0) as valor_vencido,
                      coalesce(sum(gross_amount) filter (
                        where status in ('pago', 'baixado_manual')
                          and competence = date_trunc('month', current_date)::date
                      ), 0) as recebido_mes,
                      coalesce(sum(gross_amount) filter (
                        where competence = date_trunc('month', current_date)::date
                      ), 0) as cobrado_mes
                    from rentals.charges
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    cobrado = Decimal(cobrancas["cobrado_mes"])
    recebido = Decimal(cobrancas["recebido_mes"])
    inadimplencia_pct = (
        ((cobrado - recebido) / cobrado * 100).quantize(Decimal("0.01"))
        if cobrado > 0
        else Decimal("0.00")
    )

    repasses = (
        (
            await db.execute(
                text(
                    """
                    select coalesce(sum(net_amount), 0) as a_repassar,
                           count(*) as proprietarios
                    from rentals.payouts
                    where reference_month = date_trunc('month', current_date)::date
                      and status in ('aberto', 'fechado')
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    stage_rows = (
        (
            await db.execute(
                text(
                    """
                    select s.key, s.name, s.sort_order,
                           count(l.id) filter (where l.status = 'aberto') as abertos
                    from rentals.pipeline_stages s
                    left join rentals.leads l on l.stage_id = s.id
                    group by s.key, s.name, s.sort_order
                    order by s.sort_order
                    """
                )
            )
        )
        .mappings()
        .all()
    )
    funil = funnel_conversion([(r["key"], r["name"], r["abertos"]) for r in stage_rows])

    reajustes = (
        await db.execute(
            text(
                """
                select count(*) from rentals.contracts
                where status = 'ativo'
                  and coalesce(last_adjustment_at, start_date)
                      + interval '12 months' <= current_date
                """
            )
        )
    ).scalar_one()

    return {
        "carteira": dict(carteira),
        "cobrancas": {
            **dict(cobrancas),
            "inadimplencia_pct": inadimplencia_pct,
        },
        "repasses": dict(repasses),
        "reajustes_devidos": reajustes,
        "funil": [
            {
                "key": s.key,
                "name": s.name,
                "count": s.count,
                "conversion_pct": s.conversion_pct,
            }
            for s in funil
        ],
    }
