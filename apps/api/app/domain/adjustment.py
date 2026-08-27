"""Reajuste anual do aluguel pelo índice contratado (IGP-M ou IPCA).

O reajuste usa o índice **acumulado** dos doze meses anteriores à data de
aniversário do contrato — não a variação de um mês só. Índices negativos
(deflação) são aplicados como vêm: a lei não obriga reajuste positivo, e
inventar um piso aqui seria alterar o contrato.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from app.domain.billing import money

ONE = Decimal(1)
HUNDRED = Decimal(100)


def accumulate_index(monthly_pcts: list[Decimal]) -> Decimal:
    """Compõe variações mensais em uma variação acumulada, em porcento.

    Índices se compõem multiplicativamente: 1% seguido de 1% dá 2,01%, não 2%.
    """
    factor = ONE
    for pct in monthly_pcts:
        factor *= ONE + Decimal(str(pct)) / HUNDRED
    return ((factor - ONE) * HUNDRED).quantize(Decimal("0.000001"))


@dataclass(frozen=True)
class AdjustmentResult:
    previous_rent: Decimal
    new_rent: Decimal
    accumulated_pct: Decimal

    @property
    def difference(self) -> Decimal:
        return money(self.new_rent - self.previous_rent)


def compute_adjustment(*, current_rent: Decimal, monthly_pcts: list[Decimal]) -> AdjustmentResult:
    accumulated = accumulate_index(monthly_pcts)
    new_rent = money(Decimal(str(current_rent)) * (ONE + accumulated / HUNDRED))
    return AdjustmentResult(money(current_rent), new_rent, accumulated)


def next_adjustment_date(start_date: date, last_adjustment: date | None) -> date:
    """Aniversário do contrato: 12 meses do início ou do último reajuste."""
    base = last_adjustment or start_date
    try:
        return base.replace(year=base.year + 1)
    except ValueError:
        # 29 de fevereiro em ano não bissexto cai para o dia 28.
        return base.replace(year=base.year + 1, day=28)


def is_adjustment_due(start_date: date, last_adjustment: date | None, today: date) -> bool:
    return today >= next_adjustment_date(start_date, last_adjustment)


def contract_expiry_alerts(end_date: date, today: date) -> int | None:
    """Marco de alerta de fim de vigência: 90, 60 ou 30 dias, ou None."""
    days_left = (end_date - today).days
    for milestone in (90, 60, 30):
        if days_left == milestone:
            return milestone
    return None
