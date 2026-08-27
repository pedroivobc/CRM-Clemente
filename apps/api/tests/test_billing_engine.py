"""Motor financeiro da locação: split, multa, juros, desconto e repasse.

Esta é a parte do sistema que decide para onde vai o dinheiro do proprietário
e do locatário, então os casos são escritos com valores conferíveis à mão.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.domain.billing import (
    ChargeItem,
    PayoutLine,
    build_monthly_charge,
    build_payout_statement,
    compute_late_charges,
    compute_punctuality_discount,
    compute_split,
    money,
    payout_lines_from_payment,
    percent_of,
)

D = Decimal


# ── Composição ───────────────────────────────────────────────────────────────
def test_cobranca_mensal_soma_aluguel_e_encargos():
    charge = build_monthly_charge(
        rent_amount=D("1850.00"), condo_fee=D("420.00"), iptu_amount=D("98.00")
    )
    assert charge.total == D("2368.00")
    assert [i.kind for i in charge.items] == ["aluguel", "condominio", "iptu"]


def test_encargos_zerados_nao_viram_linha_na_cobranca():
    charge = build_monthly_charge(rent_amount=D("1000.00"), condo_fee=D("0"))
    assert [i.kind for i in charge.items] == ["aluguel"]
    assert charge.total == D("1000.00")


def test_desconto_entra_como_valor_negativo():
    charge = build_monthly_charge(
        rent_amount=D("1000.00"),
        extras=[ChargeItem("desconto", D("-50.00"), "Desconto combinado")],
    )
    assert charge.total == D("950.00")


# ── Split ────────────────────────────────────────────────────────────────────
def test_taxa_de_administracao_incide_apenas_sobre_o_aluguel():
    # Condomínio e IPTU são repasse, não remuneram a administração.
    charge = build_monthly_charge(
        rent_amount=D("2000.00"), condo_fee=D("500.00"), iptu_amount=D("100.00")
    )
    split = compute_split(composition=charge, admin_fee_pct=D("10"))

    assert split.admin_fee == D("200.00")  # 10% de 2000, não de 2600
    assert split.agency == D("200.00")
    assert split.owner == D("2400.00")
    assert split.total == charge.total


@pytest.mark.parametrize(
    ("pct", "expected_fee", "expected_owner"),
    [
        (D("10"), D("185.00"), D("1665.00")),
        (D("12"), D("222.00"), D("1628.00")),
        (D("13"), D("240.50"), D("1609.50")),
    ],
)
def test_taxa_configuravel_por_contrato(pct, expected_fee, expected_owner):
    charge = build_monthly_charge(rent_amount=D("1850.00"))
    split = compute_split(composition=charge, admin_fee_pct=pct)

    assert split.admin_fee == expected_fee
    assert split.owner == expected_owner
    assert split.total == D("1850.00")


def test_item_da_imobiliaria_nao_vai_para_o_proprietario():
    charge = build_monthly_charge(
        rent_amount=D("1000.00"),
        extras=[ChargeItem("outro", D("150.00"), "Taxa de contrato", beneficiary="agency")],
    )
    split = compute_split(composition=charge, admin_fee_pct=D("10"))

    assert split.agency == D("250.00")  # 100 de taxa adm + 150 da taxa de contrato
    assert split.owner == D("900.00")
    assert split.total == D("1150.00")


def test_split_com_varios_proprietarios_fecha_no_centavo():
    # 1/3 cada de um valor que não divide exato: a última cota absorve a sobra.
    charge = build_monthly_charge(rent_amount=D("1000.00"))
    split = compute_split(
        composition=charge,
        admin_fee_pct=D("10"),
        owner_shares=[
            ("dono-a", D("33.3333"), "wallet-a"),
            ("dono-b", D("33.3333"), "wallet-b"),
            ("dono-c", D("33.3334"), "wallet-c"),
        ],
    )

    owner_parts = [p for p in split.parts if p.beneficiary == "owner"]
    assert len(owner_parts) == 3
    assert sum(p.amount for p in owner_parts) == split.owner == D("900.00")
    assert [p.wallet_id for p in owner_parts] == ["wallet-a", "wallet-b", "wallet-c"]


def test_split_arredonda_meio_centavo_para_cima():
    charge = build_monthly_charge(rent_amount=D("1234.55"))
    split = compute_split(composition=charge, admin_fee_pct=D("10"))

    assert split.admin_fee == D("123.46")  # 123.455 → 123.46
    assert split.owner == D("1111.09")
    assert split.total == D("1234.55")


# ── Multa e juros ────────────────────────────────────────────────────────────
def test_pagamento_em_dia_nao_gera_encargo():
    late = compute_late_charges(
        amount=D("2000.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 10),
        fine_pct=D("2"),
        daily_interest_pct=D("0.033"),
    )
    assert late.days_late == 0
    assert late.total == D("0.00")


def test_pagamento_adiantado_nao_gera_encargo():
    late = compute_late_charges(
        amount=D("2000.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 3),
        fine_pct=D("2"),
        daily_interest_pct=D("0.033"),
    )
    assert late.total == D("0.00")


def test_multa_e_juros_proporcionais_ao_atraso():
    late = compute_late_charges(
        amount=D("2000.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 25),
        fine_pct=D("2"),
        daily_interest_pct=D("0.033"),
    )
    assert late.days_late == 15
    assert late.fine == D("40.00")  # 2% de 2000
    assert late.interest == D("9.90")  # 0,033% × 15 dias × 2000
    assert late.total == D("49.90")


def test_um_dia_de_atraso_ja_cobra_multa_cheia():
    late = compute_late_charges(
        amount=D("1000.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 11),
        fine_pct=D("2"),
        daily_interest_pct=D("0.033"),
    )
    assert late.days_late == 1
    assert late.fine == D("20.00")
    assert late.interest == D("0.33")


def test_atraso_que_atravessa_o_mes():
    late = compute_late_charges(
        amount=D("1500.00"),
        due_date=date(2026, 1, 10),
        payment_date=date(2026, 2, 9),
        fine_pct=D("2"),
        daily_interest_pct=D("0.033"),
    )
    assert late.days_late == 30
    assert late.interest == D("14.85")  # ≈1% ao mês


# ── Desconto por pontualidade ────────────────────────────────────────────────
def test_desconto_por_pontualidade_vale_ate_o_vencimento():
    assert compute_punctuality_discount(
        discount_amount=D("50.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 10),
    ) == D("50.00")


def test_desconto_por_pontualidade_perdido_com_um_dia_de_atraso():
    assert compute_punctuality_discount(
        discount_amount=D("50.00"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 11),
    ) == D("0.00")


def test_contrato_sem_desconto_configurado():
    assert compute_punctuality_discount(
        discount_amount=D("0"),
        due_date=date(2026, 8, 10),
        payment_date=date(2026, 8, 1),
    ) == D("0.00")


# ── Repasse ──────────────────────────────────────────────────────────────────
def test_extrato_de_repasse_de_um_aluguel_simples():
    charge = build_monthly_charge(rent_amount=D("1850.00"), condo_fee=D("420.00"))
    split = compute_split(composition=charge, admin_fee_pct=D("10"))
    statement = build_payout_statement(payout_lines_from_payment(composition=charge, split=split))

    assert statement.gross_amount == D("2270.00")
    assert statement.admin_fee == D("185.00")
    assert statement.deductions == D("0.00")
    assert statement.net_amount == D("2085.00")


def test_desconto_de_manutencao_abate_do_repasse():
    charge = build_monthly_charge(rent_amount=D("2000.00"))
    split = compute_split(composition=charge, admin_fee_pct=D("10"))
    lines = payout_lines_from_payment(composition=charge, split=split)
    lines.append(
        PayoutLine("desconto_manutencao", D("-350.00"), "Troca de resistência do chuveiro")
    )

    statement = build_payout_statement(lines)

    assert statement.gross_amount == D("2000.00")
    assert statement.admin_fee == D("200.00")
    assert statement.deductions == D("350.00")
    assert statement.net_amount == D("1450.00")


def test_repasse_de_varios_contratos_no_mesmo_mes():
    lines: list[PayoutLine] = []
    for rent in (D("1200.00"), D("1850.00"), D("2400.00")):
        charge = build_monthly_charge(rent_amount=rent)
        split = compute_split(composition=charge, admin_fee_pct=D("10"))
        lines.extend(payout_lines_from_payment(composition=charge, split=split))

    statement = build_payout_statement(lines)

    assert statement.gross_amount == D("5450.00")
    assert statement.admin_fee == D("545.00")
    assert statement.net_amount == D("4905.00")


def test_repasse_pode_ficar_negativo_quando_o_reparo_supera_o_aluguel():
    # Acontece de verdade: reparo caro em mês de aluguel baixo. O extrato tem de
    # mostrar o saldo devedor, não zerar em silêncio.
    charge = build_monthly_charge(rent_amount=D("900.00"))
    split = compute_split(composition=charge, admin_fee_pct=D("10"))
    lines = payout_lines_from_payment(composition=charge, split=split)
    lines.append(PayoutLine("desconto_manutencao", D("-1500.00"), "Reforma hidráulica"))

    statement = build_payout_statement(lines)

    assert statement.net_amount == D("-690.00")


def test_multa_e_juros_recebidos_entram_no_repasse_do_proprietario():
    charge = build_monthly_charge(
        rent_amount=D("2000.00"),
        extras=[ChargeItem("multa", D("40.00")), ChargeItem("juros", D("9.90"))],
    )
    split = compute_split(composition=charge, admin_fee_pct=D("10"))
    statement = build_payout_statement(payout_lines_from_payment(composition=charge, split=split))

    # A taxa incide só sobre o aluguel; multa e juros vão inteiros ao proprietário.
    assert statement.admin_fee == D("200.00")
    assert statement.net_amount == D("1849.90")


# ── Utilitários ──────────────────────────────────────────────────────────────
def test_percent_of_arredonda_corretamente():
    assert percent_of(D("1234.55"), D("10")) == D("123.46")
    assert percent_of(D("100.00"), D("12.5")) == D("12.50")


def test_money_nao_usa_ponto_flutuante():
    # 0.1 + 0.2 em float dá 0.30000000000000004; aqui tem de dar 0.30.
    assert money(D("0.1") + D("0.2")) == D("0.30")
