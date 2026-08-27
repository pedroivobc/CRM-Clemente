"""Motor do MCMV: enquadramento por faixa e simulação da parcela."""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.mcmv import (
    COMPROMETIMENTO_MAXIMO,
    FAIXAS,
    faixa_por_renda,
    imovel_cabe_no_programa,
    simular,
)


# ── Enquadramento por renda ──────────────────────────────────────────────────
@pytest.mark.parametrize(
    "renda, esperada",
    [
        (Decimal("1500"), "faixa_1"),
        (Decimal("2850"), "faixa_1"),
        (Decimal("3000"), "faixa_2"),
        (Decimal("4700"), "faixa_2"),
        (Decimal("6000"), "faixa_3"),
        (Decimal("8600"), "faixa_3"),
        (Decimal("10000"), "faixa_4"),
        (Decimal("12000"), "faixa_4"),
    ],
)
def test_faixa_por_renda_identifica_bem_o_limite(renda, esperada):
    assert faixa_por_renda(renda) == esperada


def test_renda_acima_da_faixa_4_fica_fora_do_programa():
    assert faixa_por_renda(Decimal("20000")) is None


def test_renda_nula_ou_negativa_fica_fora():
    assert faixa_por_renda(None) is None
    assert faixa_por_renda(Decimal("0")) is None
    assert faixa_por_renda(Decimal("-1")) is None


def test_valor_invalido_nao_estoura():
    assert faixa_por_renda("banana") is None


# ── Simulação ────────────────────────────────────────────────────────────────
def test_simula_valor_padrao_com_entrada_minima():
    sim = simular(valor_imovel=Decimal("200000"), faixa="faixa_1")
    assert sim.faixa == "faixa_1"
    assert sim.entrada == Decimal("10000.00")  # 5%
    assert sim.financiado == Decimal("190000.00")
    assert sim.prazo_meses == 420
    assert sim.parcela_estimada > 0
    # A 4.25% a.a. em 35 anos, R$ 190 mil dá algo em torno de R$ 900.
    assert Decimal("700") < sim.parcela_estimada < Decimal("1100")


def test_prazo_customizado_gera_parcela_maior():
    curta = simular(
        valor_imovel=Decimal("200000"), faixa="faixa_1", prazo_meses=120
    )
    longa = simular(
        valor_imovel=Decimal("200000"), faixa="faixa_1", prazo_meses=420
    )
    assert curta.parcela_estimada > longa.parcela_estimada


def test_entrada_maior_reduz_o_financiado_e_a_parcela():
    baixa = simular(valor_imovel=Decimal("200000"), faixa="faixa_1")
    alta = simular(
        valor_imovel=Decimal("200000"), faixa="faixa_1", entrada=Decimal("60000")
    )
    assert alta.financiado < baixa.financiado
    assert alta.parcela_estimada < baixa.parcela_estimada


def test_faixa_4_tem_juros_maior_e_parcela_maior():
    sim1 = simular(valor_imovel=Decimal("250000"), faixa="faixa_1")
    sim4 = simular(valor_imovel=Decimal("250000"), faixa="faixa_4")
    assert sim4.parcela_estimada > sim1.parcela_estimada


def test_renda_minima_bate_com_o_limite_de_comprometimento():
    sim = simular(valor_imovel=Decimal("200000"), faixa="faixa_1")
    esperada = (sim.parcela_estimada / COMPROMETIMENTO_MAXIMO).quantize(Decimal("0.01"))
    assert sim.renda_minima_sugerida == esperada


def test_cabe_na_renda_quando_renda_supera_o_minimo():
    sim = simular(
        valor_imovel=Decimal("120000"),
        faixa="faixa_1",
        renda_familiar_bruta=Decimal("2800"),
    )
    assert sim.cabe_na_renda is True


def test_nao_cabe_na_renda_quando_parcela_estoura_30_por_cento():
    sim = simular(
        valor_imovel=Decimal("260000"),
        faixa="faixa_1",
        renda_familiar_bruta=Decimal("2000"),
    )
    assert sim.cabe_na_renda is False


def test_sem_renda_declarada_supoe_que_cabe():
    sim = simular(valor_imovel=Decimal("200000"), faixa="faixa_1")
    assert sim.cabe_na_renda is True


def test_entrada_negativa_e_zerada():
    sim = simular(
        valor_imovel=Decimal("200000"), faixa="faixa_1", entrada=Decimal("-10")
    )
    assert sim.entrada == Decimal("0.00")


def test_entrada_maior_que_o_imovel_limita():
    sim = simular(
        valor_imovel=Decimal("200000"), faixa="faixa_1", entrada=Decimal("500000")
    )
    assert sim.entrada == Decimal("200000.00")
    assert sim.financiado == Decimal("0.00")
    assert sim.parcela_estimada == Decimal("0")


# ── Enquadramento do imóvel pelo teto de valor ───────────────────────────────
def test_imovel_dentro_do_teto_da_faixa():
    assert imovel_cabe_no_programa(valor_imovel=Decimal("250000"), faixa="faixa_1")
    assert not imovel_cabe_no_programa(valor_imovel=Decimal("300000"), faixa="faixa_1")


def test_faixa_4_admite_imovel_ate_500_mil():
    assert imovel_cabe_no_programa(valor_imovel=Decimal("500000"), faixa="faixa_4")
    assert not imovel_cabe_no_programa(valor_imovel=Decimal("500001"), faixa="faixa_4")


def test_tabela_cobre_as_quatro_faixas():
    assert set(FAIXAS.keys()) == {"faixa_1", "faixa_2", "faixa_3", "faixa_4"}
