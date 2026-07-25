"""Motor de vendas: comissão, rateio e indicadores do funil.

Funções puras, sem banco e sem rede — o mesmo tratamento dado ao motor de
locação, porque aqui também se decide dinheiro de terceiros: a comissão do
corretor que captou o imóvel e a do que fechou a venda.

Convenções:
- Valores em ``Decimal`` arredondados a duas casas (ROUND_HALF_UP).
- Percentuais como número inteiro de porcento: 6 significa 6%.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.domain.billing import ZERO, money, percent_of

HUNDRED = Decimal(100)


# ── Proposta ─────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class ProposalAssessment:
    asking_price: Decimal
    offer_amount: Decimal
    discount_amount: Decimal
    discount_pct: Decimal

    @property
    def is_below_asking(self) -> bool:
        return self.discount_amount > ZERO


def assess_proposal(*, asking_price: Decimal, offer_amount: Decimal) -> ProposalAssessment:
    """Compara a oferta com o preço pedido.

    Oferta acima do pedido (acontece em disputa) devolve desconto negativo, e
    não zero: o vendedor precisa enxergar o ágio.
    """
    asking = money(asking_price)
    offer = money(offer_amount)
    difference = money(asking - offer)
    pct = (
        (difference / asking * HUNDRED).quantize(Decimal("0.0001"))
        if asking > ZERO
        else Decimal("0.0000")
    )
    return ProposalAssessment(asking, offer, difference, pct)


# ── Comissão ─────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class CommissionShare:
    beneficiary: str  # agency | lister | seller_broker | partner
    share_pct: Decimal
    amount: Decimal
    user_id: str | None = None
    client_id: str | None = None


@dataclass(frozen=True)
class CommissionResult:
    sale_amount: Decimal
    commission_pct: Decimal
    total: Decimal
    shares: list[CommissionShare] = field(default_factory=list)

    @property
    def agency_amount(self) -> Decimal:
        return money(sum((s.amount for s in self.shares if s.beneficiary == "agency"), ZERO))

    @property
    def brokers_amount(self) -> Decimal:
        return money(self.total - self.agency_amount)


def compute_commission(
    *,
    sale_amount: Decimal,
    commission_pct: Decimal,
    shares: list[tuple[str, Decimal, str | None]] | None = None,
) -> CommissionResult:
    """Comissão total da venda e seu rateio.

    ``shares`` são ``(beneficiário, percentual, user_id)`` e devem somar 100%
    da comissão. A última cota absorve a diferença de centavos para que a soma
    feche exatamente com o total — ninguém recebe um centavo a menos por causa
    de arredondamento.
    """
    total = percent_of(sale_amount, commission_pct)

    if not shares:
        return CommissionResult(
            money(sale_amount),
            Decimal(str(commission_pct)),
            total,
            [CommissionShare("agency", Decimal(100), total)],
        )

    computed: list[CommissionShare] = []
    distributed = ZERO
    for index, (beneficiary, share_pct, user_id) in enumerate(shares):
        is_last = index == len(shares) - 1
        amount = money(total - distributed) if is_last else percent_of(total, share_pct)
        distributed = money(distributed + amount)
        computed.append(CommissionShare(beneficiary, Decimal(str(share_pct)), amount, user_id))

    return CommissionResult(money(sale_amount), Decimal(str(commission_pct)), total, computed)


def default_shares(
    *,
    agency_pct: Decimal,
    lister_pct: Decimal,
    seller_pct: Decimal,
    lister_id: str | None,
    seller_id: str | None,
) -> list[tuple[str, Decimal, str | None]]:
    """Monta o rateio a partir da regra do tenant.

    Quando não há corretor identificado para uma cota (venda de carteira
    própria, por exemplo), a parte volta para a imobiliária em vez de ficar
    sem dono.
    """
    agency_total = Decimal(str(agency_pct))
    shares: list[tuple[str, Decimal, str | None]] = []

    if lister_id:
        shares.append(("lister", Decimal(str(lister_pct)), lister_id))
    else:
        agency_total += Decimal(str(lister_pct))

    if seller_id:
        shares.append(("seller_broker", Decimal(str(seller_pct)), seller_id))
    else:
        agency_total += Decimal(str(seller_pct))

    # A imobiliária fica por último para absorver o arredondamento.
    shares.append(("agency", agency_total, None))
    return shares


# ── Indicadores do funil ─────────────────────────────────────────────────────
@dataclass(frozen=True)
class FunnelStage:
    key: str
    name: str
    count: int
    conversion_pct: Decimal  # em relação à etapa inicial


def funnel_conversion(stages: list[tuple[str, str, int]]) -> list[FunnelStage]:
    """Conversão de cada etapa em relação ao topo do funil.

    Um funil sem leads no topo devolve 0% em vez de dividir por zero.
    """
    if not stages:
        return []

    top = stages[0][2]
    result: list[FunnelStage] = []
    for key, name, count in stages:
        pct = (
            (Decimal(count) / Decimal(top) * HUNDRED).quantize(Decimal("0.01"))
            if top > 0
            else Decimal("0.00")
        )
        result.append(FunnelStage(key, name, count, pct))
    return result


@dataclass(frozen=True)
class SalesKpis:
    vgv: Decimal  # valor geral de vendas no período
    deals_count: int
    average_ticket: Decimal
    commission_total: Decimal
    average_cycle_days: int | None


def compute_sales_kpis(
    deals: list[tuple[Decimal, Decimal, date, date | None]],
) -> SalesKpis:
    """Indicadores do período a partir dos negócios fechados.

    Cada item é ``(valor da venda, comissão, data de fechamento, data de
    entrada do lead)``. O ciclo médio só considera negócios cuja origem é
    conhecida — estimar o resto inventaria número.
    """
    if not deals:
        return SalesKpis(ZERO, 0, ZERO, ZERO, None)

    vgv = money(sum((d[0] for d in deals), ZERO))
    commission = money(sum((d[1] for d in deals), ZERO))
    ticket = money(vgv / len(deals))

    cycles = [(d[2] - d[3]).days for d in deals if d[3] is not None]
    average_cycle = round(sum(cycles) / len(cycles)) if cycles else None

    return SalesKpis(vgv, len(deals), ticket, commission, average_cycle)
