"""Regras da operação: vistoria comparada, prazo de chaves e aprovação de reparo.

Funções puras. A parte mais delicada é a comparação entre a vistoria de
entrada e a de saída: ela **sugere** de quem é a responsabilidade por cada
piora, mas nunca decide sozinha — quem assina é a equipe, olhando as fotos.
Por isso toda sugestão carrega o estado de entrada e o de saída que a
motivaram, para poder ser contestada.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.domain.billing import ZERO, money

# Escala de conservação, do melhor para o pior.
CONDITIONS = ("otimo", "bom", "regular", "ruim")
CONDITION_RANK = {name: index for index, name in enumerate(CONDITIONS)}

CONDITION_LABELS = {
    "otimo": "ótimo",
    "bom": "bom",
    "regular": "regular",
    "ruim": "ruim",
}


# ── Vistoria comparada ───────────────────────────────────────────────────────
@dataclass(frozen=True)
class ItemState:
    room: str
    name: str
    condition: str | None
    item_id: str | None = None


@dataclass(frozen=True)
class ComparedIssue:
    room: str
    item: str
    entry_condition: str | None
    exit_condition: str | None
    steps_worse: int
    responsibility: str  # locatario | proprietario | indefinido
    description: str
    item_id: str | None = None


def condition_rank(condition: str | None) -> int | None:
    return CONDITION_RANK.get(condition) if condition else None


def compare_inspections(
    entry_items: list[ItemState],
    exit_items: list[ItemState],
) -> list[ComparedIssue]:
    """Aponta o que piorou entre a entrada e a saída.

    Regras de sugestão:
    - Piora de um degrau: desgaste possível, responsabilidade **indefinida** —
      cabe à equipe decidir se é uso normal.
    - Piora de dois ou mais degraus: sugere **locatário**, por indicar dano
      além do desgaste natural.
    - Item que não existia na entrada não gera cobrança: sem base de
      comparação, a responsabilidade fica indefinida.
    - Item que melhorou ou ficou igual não vira pendência.
    """
    by_key = {(i.room.strip().lower(), i.name.strip().lower()): i for i in entry_items}
    issues: list[ComparedIssue] = []

    for exit_item in exit_items:
        key = (exit_item.room.strip().lower(), exit_item.name.strip().lower())
        entry_item = by_key.get(key)

        entry_rank = condition_rank(entry_item.condition) if entry_item else None
        exit_rank = condition_rank(exit_item.condition)

        if exit_rank is None:
            continue

        if entry_rank is None:
            # Sem estado de entrada não há como atribuir a piora a ninguém.
            if exit_rank >= CONDITION_RANK["regular"]:
                issues.append(
                    ComparedIssue(
                        room=exit_item.room,
                        item=exit_item.name,
                        entry_condition=None,
                        exit_condition=exit_item.condition,
                        steps_worse=0,
                        responsibility="indefinido",
                        description=(
                            f"{exit_item.name} em estado "
                            f"{CONDITION_LABELS[exit_item.condition]} sem registro na entrada"
                        ),
                        item_id=exit_item.item_id,
                    )
                )
            continue

        steps = exit_rank - entry_rank
        if steps <= 0:
            continue

        responsibility = "locatario" if steps >= 2 else "indefinido"
        issues.append(
            ComparedIssue(
                room=exit_item.room,
                item=exit_item.name,
                entry_condition=entry_item.condition,
                exit_condition=exit_item.condition,
                steps_worse=steps,
                responsibility=responsibility,
                description=(
                    f"{exit_item.name} passou de "
                    f"{CONDITION_LABELS[entry_item.condition]} para "
                    f"{CONDITION_LABELS[exit_item.condition]}"
                ),
                item_id=exit_item.item_id,
            )
        )

    return issues


def inspection_progress(total_items: int, filled_items: int) -> int:
    """Percentual preenchido da vistoria, para a tela do vistoriador."""
    if total_items <= 0:
        return 0
    return round(filled_items / total_items * 100)


# ── Chaves ───────────────────────────────────────────────────────────────────
@dataclass(frozen=True)
class KeyStatus:
    is_out: bool
    is_overdue: bool
    hours_overdue: int


def key_status(due_back_at: datetime, returned_at: datetime | None, now: datetime) -> KeyStatus:
    """Situação de uma retirada de chave: fora, no prazo ou atrasada."""
    if returned_at is not None:
        return KeyStatus(False, False, 0)

    delta = now - due_back_at
    overdue_hours = int(delta.total_seconds() // 3600)
    return KeyStatus(True, overdue_hours > 0, max(0, overdue_hours))


# ── Chamados de manutenção ───────────────────────────────────────────────────
@dataclass(frozen=True)
class ApprovalDecision:
    approver: str  # imobiliaria | proprietario
    reason: str


def who_approves(*, amount: Decimal, payer: str | None, agency_limit: Decimal) -> ApprovalDecision:
    """Define quem precisa aprovar o orçamento.

    A imobiliária resolve sozinha o que é pequeno ou o que ela mesma paga;
    acima do limite, ou quando quem paga é o proprietário, a decisão é dele —
    é o dinheiro dele saindo do repasse.
    """
    value = money(amount)

    if payer == "imobiliaria":
        return ApprovalDecision("imobiliaria", "A imobiliária arca com o custo")
    if payer == "locatario":
        return ApprovalDecision("imobiliaria", "Custo do locatário, cobrado à parte")
    if value <= money(agency_limit):
        return ApprovalDecision("imobiliaria", f"Valor dentro da alçada de {money(agency_limit)}")
    return ApprovalDecision("proprietario", f"Valor acima da alçada de {money(agency_limit)}")


def cheapest_quote(quotes: list[tuple[str, Decimal]]) -> tuple[str, Decimal] | None:
    """Menor orçamento entre os recebidos, para destacar na tela."""
    return min(quotes, key=lambda q: q[1]) if quotes else None


def quote_spread(quotes: list[Decimal]) -> Decimal:
    """Diferença entre o maior e o menor orçamento.

    Serve para a equipe perceber quando as propostas estão muito distantes —
    normalmente sinal de que o serviço foi descrito de formas diferentes.
    """
    if len(quotes) < 2:
        return ZERO
    return money(max(quotes) - min(quotes))


def average_rating(scores: list[int]) -> Decimal | None:
    """Média das avaliações de um prestador."""
    if not scores:
        return None
    return (Decimal(sum(scores)) / Decimal(len(scores))).quantize(Decimal("0.01"))
