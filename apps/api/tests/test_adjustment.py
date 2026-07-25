"""Reajuste anual e alertas de vigência."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from app.domain.adjustment import (
    accumulate_index,
    compute_adjustment,
    contract_expiry_alerts,
    is_adjustment_due,
    next_adjustment_date,
)

D = Decimal


def test_indices_compoem_multiplicativamente():
    # 1% seguido de 1% dá 2,01%, não 2%.
    assert accumulate_index([D("1"), D("1")]) == D("2.010000")


def test_acumulado_de_doze_meses():
    acumulado = accumulate_index([D("0.5")] * 12)
    assert acumulado == D("6.167781")


def test_reajuste_aplica_o_acumulado_sobre_o_aluguel():
    resultado = compute_adjustment(current_rent=D("1850.00"), monthly_pcts=[D("0.5")] * 12)

    assert resultado.previous_rent == D("1850.00")
    assert resultado.new_rent == D("1964.10")
    assert resultado.difference == D("114.10")


def test_deflacao_reduz_o_aluguel():
    # IGP-M negativo acontece; o contrato manda aplicar o índice como está.
    resultado = compute_adjustment(current_rent=D("2000.00"), monthly_pcts=[D("-0.2")] * 12)

    assert resultado.accumulated_pct < 0
    assert resultado.new_rent < D("2000.00")
    assert resultado.new_rent == D("1952.52")


def test_serie_vazia_mantem_o_aluguel():
    resultado = compute_adjustment(current_rent=D("1500.00"), monthly_pcts=[])
    assert resultado.new_rent == D("1500.00")
    assert resultado.accumulated_pct == D("0.000000")


def test_proximo_reajuste_e_o_aniversario_do_contrato():
    assert next_adjustment_date(date(2025, 3, 15), None) == date(2026, 3, 15)


def test_proximo_reajuste_conta_do_ultimo_aplicado():
    assert next_adjustment_date(date(2023, 3, 15), date(2025, 3, 15)) == date(2026, 3, 15)


def test_reajuste_de_contrato_iniciado_em_29_de_fevereiro():
    assert next_adjustment_date(date(2024, 2, 29), None) == date(2025, 2, 28)


def test_reajuste_devido_somente_a_partir_do_aniversario():
    inicio = date(2025, 7, 1)
    assert not is_adjustment_due(inicio, None, date(2026, 6, 30))
    assert is_adjustment_due(inicio, None, date(2026, 7, 1))


def test_alertas_de_vigencia_nos_marcos():
    fim = date(2026, 12, 31)
    assert contract_expiry_alerts(fim, date(2026, 10, 2)) == 90
    assert contract_expiry_alerts(fim, date(2026, 11, 1)) == 60
    assert contract_expiry_alerts(fim, date(2026, 12, 1)) == 30
    assert contract_expiry_alerts(fim, date(2026, 12, 15)) is None
