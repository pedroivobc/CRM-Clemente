"""Motor de vendas: proposta, comissão, rateio e indicadores."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.domain.sales import (
    assess_proposal,
    compute_commission,
    compute_sales_kpis,
    default_shares,
    funnel_conversion,
)

D = Decimal


# ── Proposta ─────────────────────────────────────────────────────────────────
def test_proposta_abaixo_do_pedido_mostra_o_desconto():
    resultado = assess_proposal(asking_price=D("620000.00"), offer_amount=D("580000.00"))

    assert resultado.discount_amount == D("40000.00")
    assert resultado.discount_pct == D("6.4516")
    assert resultado.is_below_asking is True


def test_proposta_no_valor_pedido():
    resultado = assess_proposal(asking_price=D("500000.00"), offer_amount=D("500000.00"))

    assert resultado.discount_amount == D("0.00")
    assert resultado.discount_pct == D("0.0000")
    assert resultado.is_below_asking is False


def test_proposta_acima_do_pedido_mostra_agio_como_negativo():
    # Em disputa por um imóvel a oferta passa do pedido; o vendedor precisa ver.
    resultado = assess_proposal(asking_price=D("400000.00"), offer_amount=D("420000.00"))

    assert resultado.discount_amount == D("-20000.00")
    assert resultado.discount_pct < 0
    assert resultado.is_below_asking is False


# ── Comissão ─────────────────────────────────────────────────────────────────
def test_comissao_padrao_de_6_por_cento():
    resultado = compute_commission(sale_amount=D("620000.00"), commission_pct=D("6"))

    assert resultado.total == D("37200.00")
    assert resultado.agency_amount == D("37200.00")  # sem rateio, tudo da imobiliária


@pytest.mark.parametrize(
    ("pct", "expected"),
    [(D("5"), D("31000.00")), (D("6"), D("37200.00")), (D("6.5"), D("40300.00"))],
)
def test_percentual_configuravel_por_negocio(pct, expected):
    resultado = compute_commission(sale_amount=D("620000.00"), commission_pct=pct)
    assert resultado.total == expected


def test_rateio_entre_imobiliaria_captador_e_vendedor():
    resultado = compute_commission(
        sale_amount=D("500000.00"),
        commission_pct=D("6"),
        shares=[
            ("lister", D("20"), "corretor-a"),
            ("seller_broker", D("30"), "corretor-b"),
            ("agency", D("50"), None),
        ],
    )

    assert resultado.total == D("30000.00")
    partes = {s.beneficiary: s.amount for s in resultado.shares}
    assert partes["lister"] == D("6000.00")
    assert partes["seller_broker"] == D("9000.00")
    assert partes["agency"] == D("15000.00")
    assert sum(partes.values()) == resultado.total


def test_rateio_fecha_no_centavo_com_valores_quebrados():
    # 1/3 cada de uma comissão que não divide exato.
    resultado = compute_commission(
        sale_amount=D("333333.33"),
        commission_pct=D("6"),
        shares=[
            ("lister", D("33.3333"), "a"),
            ("seller_broker", D("33.3333"), "b"),
            ("agency", D("33.3334"), None),
        ],
    )

    assert sum(s.amount for s in resultado.shares) == resultado.total
    assert resultado.total == D("20000.00")


def test_comissao_arredonda_meio_centavo_para_cima():
    resultado = compute_commission(sale_amount=D("123456.75"), commission_pct=D("6"))
    assert resultado.total == D("7407.41")  # 7407.405 → 7407.41


def test_parte_do_corretor_sem_dono_volta_para_a_imobiliaria():
    # Venda de imóvel captado pela própria imobiliária, sem corretor captador.
    shares = default_shares(
        agency_pct=D("50"),
        lister_pct=D("20"),
        seller_pct=D("30"),
        lister_id=None,
        seller_id="corretor-b",
    )
    resultado = compute_commission(sale_amount=D("400000.00"), commission_pct=D("6"), shares=shares)

    partes = {s.beneficiary: s.amount for s in resultado.shares}
    assert "lister" not in partes
    assert partes["seller_broker"] == D("7200.00")  # 30% de 24000
    assert partes["agency"] == D("16800.00")  # 50% + 20% órfãos
    assert sum(partes.values()) == D("24000.00")


def test_sem_nenhum_corretor_a_comissao_inteira_fica_com_a_imobiliaria():
    shares = default_shares(
        agency_pct=D("50"),
        lister_pct=D("20"),
        seller_pct=D("30"),
        lister_id=None,
        seller_id=None,
    )
    resultado = compute_commission(sale_amount=D("300000.00"), commission_pct=D("6"), shares=shares)

    assert len(resultado.shares) == 1
    assert resultado.agency_amount == D("18000.00")
    assert resultado.brokers_amount == D("0.00")


def test_captador_e_vendedor_sendo_a_mesma_pessoa_recebem_as_duas_cotas():
    shares = default_shares(
        agency_pct=D("50"),
        lister_pct=D("20"),
        seller_pct=D("30"),
        lister_id="corretor-a",
        seller_id="corretor-a",
    )
    resultado = compute_commission(sale_amount=D("500000.00"), commission_pct=D("6"), shares=shares)

    do_corretor = sum(s.amount for s in resultado.shares if s.user_id == "corretor-a")
    assert do_corretor == D("15000.00")  # 20% + 30% de 30000
    assert resultado.agency_amount == D("15000.00")


# ── Funil ────────────────────────────────────────────────────────────────────
def test_conversao_do_funil_em_relacao_ao_topo():
    etapas = funnel_conversion(
        [
            ("lead", "Lead", 100),
            ("qualificacao", "Qualificação", 60),
            ("visita_realizada", "Visita realizada", 30),
            ("proposta", "Proposta", 12),
            ("fechamento", "Venda fechada", 6),
        ]
    )

    assert [e.conversion_pct for e in etapas] == [
        D("100.00"),
        D("60.00"),
        D("30.00"),
        D("12.00"),
        D("6.00"),
    ]


def test_funil_vazio_nao_divide_por_zero():
    etapas = funnel_conversion([("lead", "Lead", 0), ("proposta", "Proposta", 0)])
    assert all(e.conversion_pct == D("0.00") for e in etapas)


def test_funil_sem_etapas():
    assert funnel_conversion([]) == []


# ── Indicadores ──────────────────────────────────────────────────────────────
def test_kpis_do_periodo():
    kpis = compute_sales_kpis(
        [
            (D("620000.00"), D("37200.00"), date(2026, 7, 10), date(2026, 5, 1)),
            (D("380000.00"), D("22800.00"), date(2026, 7, 22), date(2026, 6, 12)),
        ]
    )

    assert kpis.vgv == D("1000000.00")
    assert kpis.deals_count == 2
    assert kpis.average_ticket == D("500000.00")
    assert kpis.commission_total == D("60000.00")
    assert kpis.average_cycle_days == 55  # (70 + 40) / 2


def test_ciclo_medio_ignora_negocios_sem_origem_conhecida():
    kpis = compute_sales_kpis(
        [
            (D("500000.00"), D("30000.00"), date(2026, 7, 10), date(2026, 6, 10)),
            (D("500000.00"), D("30000.00"), date(2026, 7, 20), None),
        ]
    )
    assert kpis.average_cycle_days == 30


def test_periodo_sem_vendas():
    kpis = compute_sales_kpis([])

    assert kpis.vgv == D("0.00")
    assert kpis.deals_count == 0
    assert kpis.average_ticket == D("0.00")
    assert kpis.average_cycle_days is None
