"""Regras da operação: vistoria comparada, chaves e aprovação de reparo."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from app.domain.operations import (
    ItemState,
    average_rating,
    cheapest_quote,
    compare_inspections,
    inspection_progress,
    key_status,
    quote_spread,
    who_approves,
)

D = Decimal


def _item(room: str, name: str, condition: str | None) -> ItemState:
    return ItemState(room=room, name=name, condition=condition)


# ── Vistoria comparada ───────────────────────────────────────────────────────
def test_item_que_nao_mudou_nao_vira_pendencia():
    issues = compare_inspections(
        [_item("Sala", "Piso", "bom")],
        [_item("Sala", "Piso", "bom")],
    )
    assert issues == []


def test_item_que_melhorou_nao_vira_pendencia():
    # O locatário pintou a parede: não se cobra por isso.
    issues = compare_inspections(
        [_item("Sala", "Pintura", "regular")],
        [_item("Sala", "Pintura", "otimo")],
    )
    assert issues == []


def test_piora_de_um_degrau_fica_indefinida():
    # Pode ser desgaste natural; quem decide é a equipe.
    issues = compare_inspections(
        [_item("Sala", "Pintura", "otimo")],
        [_item("Sala", "Pintura", "bom")],
    )

    assert len(issues) == 1
    assert issues[0].responsibility == "indefinido"
    assert issues[0].steps_worse == 1
    assert "de ótimo para bom" in issues[0].description


def test_piora_de_dois_degraus_sugere_o_locatario():
    issues = compare_inspections(
        [_item("Cozinha", "Bancada", "otimo")],
        [_item("Cozinha", "Bancada", "regular")],
    )

    assert issues[0].responsibility == "locatario"
    assert issues[0].steps_worse == 2
    # A sugestão carrega os dois estados, para poder ser contestada.
    assert issues[0].entry_condition == "otimo"
    assert issues[0].exit_condition == "regular"


def test_piora_maxima_sugere_o_locatario():
    issues = compare_inspections(
        [_item("Quarto", "Porta", "otimo")],
        [_item("Quarto", "Porta", "ruim")],
    )
    assert issues[0].steps_worse == 3
    assert issues[0].responsibility == "locatario"


def test_item_sem_registro_na_entrada_fica_indefinido():
    # Sem base de comparação não se atribui responsabilidade a ninguém.
    issues = compare_inspections(
        [],
        [_item("Área", "Tanque", "ruim")],
    )

    assert len(issues) == 1
    assert issues[0].responsibility == "indefinido"
    assert issues[0].entry_condition is None
    assert "sem registro na entrada" in issues[0].description


def test_item_novo_em_bom_estado_nao_vira_pendencia():
    issues = compare_inspections([], [_item("Área", "Tanque", "bom")])
    assert issues == []


def test_comparacao_ignora_diferenca_de_caixa_e_espaco():
    issues = compare_inspections(
        [_item("Sala", "Piso", "otimo")],
        [_item(" sala ", "PISO", "ruim")],
    )
    assert len(issues) == 1
    assert issues[0].responsibility == "locatario"


def test_item_sem_estado_na_saida_e_ignorado():
    issues = compare_inspections(
        [_item("Sala", "Piso", "otimo")],
        [_item("Sala", "Piso", None)],
    )
    assert issues == []


def test_vistoria_completa_de_varios_comodos():
    entrada = [
        _item("Sala", "Piso", "otimo"),
        _item("Sala", "Pintura", "otimo"),
        _item("Cozinha", "Armário", "bom"),
        _item("Banheiro", "Louças", "otimo"),
    ]
    saida = [
        _item("Sala", "Piso", "bom"),  # 1 degrau → indefinido
        _item("Sala", "Pintura", "ruim"),  # 3 degraus → locatário
        _item("Cozinha", "Armário", "bom"),  # igual → nada
        _item("Banheiro", "Louças", "regular"),  # 2 degraus → locatário
    ]

    issues = compare_inspections(entrada, saida)

    assert len(issues) == 3
    responsabilidades = [i.responsibility for i in issues]
    assert responsabilidades.count("locatario") == 2
    assert responsabilidades.count("indefinido") == 1


def test_progresso_da_vistoria():
    assert inspection_progress(20, 5) == 25
    assert inspection_progress(20, 20) == 100
    assert inspection_progress(0, 0) == 0


# ── Chaves ───────────────────────────────────────────────────────────────────
def test_chave_devolvida_nao_esta_fora():
    agora = datetime(2026, 7, 25, 12, 0)
    status = key_status(
        due_back_at=datetime(2026, 7, 24, 18, 0),
        returned_at=datetime(2026, 7, 24, 17, 0),
        now=agora,
    )
    assert status.is_out is False
    assert status.is_overdue is False


def test_chave_fora_dentro_do_prazo():
    agora = datetime(2026, 7, 25, 12, 0)
    status = key_status(due_back_at=datetime(2026, 7, 25, 18, 0), returned_at=None, now=agora)

    assert status.is_out is True
    assert status.is_overdue is False
    assert status.hours_overdue == 0


def test_chave_atrasada_conta_as_horas():
    agora = datetime(2026, 7, 25, 12, 0)
    status = key_status(due_back_at=datetime(2026, 7, 24, 18, 0), returned_at=None, now=agora)

    assert status.is_overdue is True
    assert status.hours_overdue == 18


# ── Aprovação de reparo ──────────────────────────────────────────────────────
def test_valor_dentro_da_alcada_a_imobiliaria_aprova():
    decisao = who_approves(amount=D("250.00"), payer="proprietario", agency_limit=D("300.00"))
    assert decisao.approver == "imobiliaria"
    assert "alçada" in decisao.reason


def test_valor_acima_da_alcada_vai_para_o_proprietario():
    # É o dinheiro dele saindo do repasse; a decisão tem de ser dele.
    decisao = who_approves(amount=D("1200.00"), payer="proprietario", agency_limit=D("300.00"))
    assert decisao.approver == "proprietario"


def test_valor_exatamente_no_limite_fica_com_a_imobiliaria():
    decisao = who_approves(amount=D("300.00"), payer="proprietario", agency_limit=D("300.00"))
    assert decisao.approver == "imobiliaria"


def test_custo_da_imobiliaria_nao_precisa_de_aprovacao_do_proprietario():
    decisao = who_approves(amount=D("5000.00"), payer="imobiliaria", agency_limit=D("300.00"))
    assert decisao.approver == "imobiliaria"


def test_custo_do_locatario_e_decidido_pela_imobiliaria():
    decisao = who_approves(amount=D("900.00"), payer="locatario", agency_limit=D("300.00"))
    assert decisao.approver == "imobiliaria"


def test_sem_pagador_definido_o_limite_vale():
    assert who_approves(amount=D("100.00"), payer=None, agency_limit=D("300.00")).approver == (
        "imobiliaria"
    )
    assert who_approves(amount=D("800.00"), payer=None, agency_limit=D("300.00")).approver == (
        "proprietario"
    )


# ── Orçamentos ───────────────────────────────────────────────────────────────
def test_menor_orcamento():
    assert cheapest_quote([("a", D("900")), ("b", D("650")), ("c", D("780"))]) == (
        "b",
        D("650"),
    )


def test_menor_orcamento_sem_propostas():
    assert cheapest_quote([]) is None


def test_dispersao_entre_orcamentos():
    assert quote_spread([D("650.00"), D("780.00"), D("900.00")]) == D("250.00")


def test_dispersao_com_um_orcamento_so():
    assert quote_spread([D("650.00")]) == D("0.00")


def test_media_de_avaliacoes():
    assert average_rating([5, 4, 5, 3]) == D("4.25")
    assert average_rating([]) is None


# ── Formatação brasileira ────────────────────────────────────────────────────
def test_valor_sai_no_formato_brasileiro():
    """Texto que chega ao usuário nunca mostra o ponto decimal americano."""
    from app.core.format import brl

    assert brl(Decimal("1180.00")) == "R$ 1.180,00"
    assert brl(Decimal("300")) == "R$ 300,00"
    assert brl(Decimal("1234567.89")) == "R$ 1.234.567,89"
    assert brl(Decimal("0.5")) == "R$ 0,50"
    assert brl(None) == "—"
