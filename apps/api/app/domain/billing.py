"""Motor financeiro da locação.

Funções puras, sem banco e sem rede: a composição da cobrança, a multa e os
juros por atraso, o desconto por pontualidade, o split entre imobiliária e
proprietário e o extrato de repasse. É a parte do sistema que mexe com o
dinheiro dos outros, então cada regra vive aqui isolada e coberta por teste.

Convenções:
- Todo valor é ``Decimal`` e é arredondado a duas casas com ROUND_HALF_UP
  (o arredondamento comercial usado em cobrança no Brasil).
- Percentuais chegam como número inteiro de porcento: 10 significa 10%.
- Em listas de itens, desconto entra com valor negativo.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

CENTS = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value: Decimal | int | float | str) -> Decimal:
    """Normaliza para duas casas decimais com arredondamento comercial."""
    return Decimal(str(value)).quantize(CENTS, rounding=ROUND_HALF_UP)


def percent_of(base: Decimal, pct: Decimal) -> Decimal:
    """Aplica um percentual (10 = 10%) sobre a base."""
    return money(Decimal(str(base)) * Decimal(str(pct)) / Decimal(100))


# ── Composição da cobrança ───────────────────────────────────────────────────
@dataclass(frozen=True)
class ChargeItem:
    kind: str
    amount: Decimal
    description: str | None = None
    # Itens da imobiliária (ex.: taxa de contrato) não entram no repasse.
    beneficiary: str = "owner"


@dataclass
class ChargeComposition:
    items: list[ChargeItem] = field(default_factory=list)

    @property
    def total(self) -> Decimal:
        return money(sum((item.amount for item in self.items), ZERO))

    def total_for(self, beneficiary: str) -> Decimal:
        return money(sum((i.amount for i in self.items if i.beneficiary == beneficiary), ZERO))


def build_monthly_charge(
    *,
    rent_amount: Decimal,
    condo_fee: Decimal = ZERO,
    iptu_amount: Decimal = ZERO,
    insurance_amount: Decimal = ZERO,
    extras: list[ChargeItem] | None = None,
) -> ChargeComposition:
    """Monta a cobrança mensal do aluguel com seus encargos."""
    items = [ChargeItem("aluguel", money(rent_amount), "Aluguel")]
    if condo_fee and money(condo_fee) != ZERO:
        items.append(ChargeItem("condominio", money(condo_fee), "Condomínio"))
    if iptu_amount and money(iptu_amount) != ZERO:
        items.append(ChargeItem("iptu", money(iptu_amount), "IPTU"))
    if insurance_amount and money(insurance_amount) != ZERO:
        items.append(ChargeItem("seguro", money(insurance_amount), "Seguro"))
    items.extend(extras or [])
    return ChargeComposition(items)


# ── Atraso e pontualidade ────────────────────────────────────────────────────
@dataclass(frozen=True)
class LateCharges:
    days_late: int
    fine: Decimal
    interest: Decimal

    @property
    def total(self) -> Decimal:
        return money(self.fine + self.interest)


def compute_late_charges(
    *,
    amount: Decimal,
    due_date: date,
    payment_date: date,
    fine_pct: Decimal,
    daily_interest_pct: Decimal,
) -> LateCharges:
    """Multa e juros de mora.

    A multa é percentual único sobre o valor devido; os juros são diários e
    proporcionais ao atraso. Pagamento em dia ou adiantado não gera encargo.
    """
    days_late = (payment_date - due_date).days
    if days_late <= 0:
        return LateCharges(0, ZERO, ZERO)

    base = money(amount)
    fine = percent_of(base, fine_pct)
    interest = money(base * Decimal(str(daily_interest_pct)) / Decimal(100) * days_late)
    return LateCharges(days_late, fine, interest)


def compute_punctuality_discount(
    *,
    discount_amount: Decimal,
    due_date: date,
    payment_date: date,
) -> Decimal:
    """Desconto por pontualidade: só vale se o pagamento ocorrer até o vencimento."""
    if not discount_amount or money(discount_amount) <= ZERO:
        return ZERO
    return money(discount_amount) if payment_date <= due_date else ZERO


# ── Split entre imobiliária e proprietário ───────────────────────────────────
@dataclass(frozen=True)
class SplitPart:
    beneficiary: str  # "agency" | "owner"
    amount: Decimal
    wallet_id: str | None = None
    client_id: str | None = None


@dataclass(frozen=True)
class SplitResult:
    agency: Decimal
    owner: Decimal
    admin_fee: Decimal
    parts: list[SplitPart]

    @property
    def total(self) -> Decimal:
        return money(self.agency + self.owner)


def compute_split(
    *,
    composition: ChargeComposition,
    admin_fee_pct: Decimal,
    owner_shares: list[tuple[str, Decimal, str | None]] | None = None,
) -> SplitResult:
    """Divide o valor pago entre a imobiliária e o proprietário.

    A taxa de administração incide **sobre o aluguel**, não sobre o total
    cobrado: condomínio e IPTU são repasses e não remuneram a administração.
    Itens marcados como ``agency`` (ex.: taxa de contrato) vão inteiros para a
    imobiliária.

    ``owner_shares`` são ``(client_id, percentual, wallet_id)`` para imóveis com
    mais de um proprietário; a última cota absorve a diferença de centavos para
    que a soma feche exatamente com o total.
    """
    rent_total = money(sum((i.amount for i in composition.items if i.kind == "aluguel"), ZERO))
    admin_fee = percent_of(rent_total, admin_fee_pct)

    agency_items = composition.total_for("agency")
    agency_total = money(admin_fee + agency_items)
    owner_total = money(composition.total - agency_total)

    parts: list[SplitPart] = [SplitPart("agency", agency_total)]

    if owner_shares:
        distributed = ZERO
        for index, (client_id, share_pct, wallet_id) in enumerate(owner_shares):
            is_last = index == len(owner_shares) - 1
            share = (
                money(owner_total - distributed) if is_last else percent_of(owner_total, share_pct)
            )
            distributed = money(distributed + share)
            parts.append(SplitPart("owner", share, wallet_id, client_id))
    else:
        parts.append(SplitPart("owner", owner_total))

    return SplitResult(agency_total, owner_total, admin_fee, parts)


# ── Repasse ao proprietário ──────────────────────────────────────────────────
@dataclass(frozen=True)
class PayoutLine:
    kind: str
    amount: Decimal  # positivo credita, negativo debita
    description: str | None = None
    charge_id: str | None = None


@dataclass(frozen=True)
class PayoutStatement:
    gross_amount: Decimal  # recebido dos locatários
    admin_fee: Decimal  # retido pela imobiliária
    deductions: Decimal  # manutenção e outros abatimentos (valor positivo)
    net_amount: Decimal  # a creditar ao proprietário
    lines: list[PayoutLine]


def build_payout_statement(lines: list[PayoutLine]) -> PayoutStatement:
    """Consolida o extrato mensal de repasse.

    O bruto é o que entrou; a taxa de administração e os descontos de
    manutenção saem dele. O líquido nunca é inferido: é a soma das linhas.
    """
    gross = money(sum((line.amount for line in lines if line.amount > ZERO), ZERO))
    admin_fee = money(-sum((line.amount for line in lines if line.kind == "taxa_adm"), ZERO))
    deductions = money(
        -sum(
            (line.amount for line in lines if line.kind == "desconto_manutencao"),
            ZERO,
        )
    )
    net = money(sum((line.amount for line in lines), ZERO))
    return PayoutStatement(gross, admin_fee, deductions, net, lines)


def payout_lines_from_payment(
    *,
    composition: ChargeComposition,
    split: SplitResult,
    charge_id: str | None = None,
) -> list[PayoutLine]:
    """Traduz uma cobrança paga nas linhas que o proprietário vê no extrato."""
    rent = money(sum((i.amount for i in composition.items if i.kind == "aluguel"), ZERO))
    charges_total = money(
        sum(
            (
                i.amount
                for i in composition.items
                if i.kind in ("condominio", "iptu", "seguro") and i.beneficiary == "owner"
            ),
            ZERO,
        )
    )
    extras = money(
        sum(
            (
                i.amount
                for i in composition.items
                if i.kind in ("multa", "juros", "desconto", "outro") and i.beneficiary == "owner"
            ),
            ZERO,
        )
    )

    lines = [PayoutLine("aluguel", rent, "Aluguel recebido", charge_id)]
    if charges_total != ZERO:
        lines.append(PayoutLine("encargos", charges_total, "Encargos recebidos", charge_id))
    if extras != ZERO:
        lines.append(PayoutLine("outro", extras, "Multa, juros e ajustes", charge_id))
    lines.append(
        PayoutLine("taxa_adm", money(-split.admin_fee), "Taxa de administração", charge_id)
    )
    return lines
