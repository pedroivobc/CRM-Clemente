"""Motor do Minha Casa Minha Vida.

Encaixe do imóvel numa faixa e simulação de parcela — funções puras, sem
banco e sem rede. Os parâmetros do programa vivem em constantes aqui em cima
para que a atualização quando a CEF mudar valor seja um único ponto.

As faixas e limites usados aqui refletem o programa vigente em 2026: para
imóveis novos e usados urbanos, faixas 1 a 4 por renda familiar bruta
mensal. A simulação é **estimativa** — o cadastro definitivo passa pelo
SICAQ/SIPAH e depende de análise de crédito. Aqui basta responder à pergunta
"cabe no meu bolso?" para o comprador na vitrine e na conversa do corretor.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Literal

Faixa = Literal["faixa_1", "faixa_2", "faixa_3", "faixa_4"]


@dataclass(frozen=True)
class FaixaMCMV:
    """Parâmetros de uma faixa do programa."""

    codigo: Faixa
    nome: str
    renda_min: Decimal   # bruta familiar
    renda_max: Decimal
    imovel_max: Decimal  # teto de valor do imóvel elegível
    taxa_anual: Decimal  # juros a.a., aproximação para o simulador
    prazo_max_meses: int


# Tabela do programa. Os valores são estimativas de 2026 usadas para a
# simulação; o cadastro final na Caixa é quem confirma. Alterar aqui atualiza
# o simulador em toda a aplicação.
FAIXAS: dict[Faixa, FaixaMCMV] = {
    "faixa_1": FaixaMCMV(
        codigo="faixa_1",
        nome="Faixa 1",
        renda_min=Decimal("0"),
        renda_max=Decimal("2850"),
        imovel_max=Decimal("264000"),
        taxa_anual=Decimal("0.0425"),
        prazo_max_meses=420,
    ),
    "faixa_2": FaixaMCMV(
        codigo="faixa_2",
        nome="Faixa 2",
        renda_min=Decimal("2850.01"),
        renda_max=Decimal("4700"),
        imovel_max=Decimal("264000"),
        taxa_anual=Decimal("0.0475"),
        prazo_max_meses=420,
    ),
    "faixa_3": FaixaMCMV(
        codigo="faixa_3",
        nome="Faixa 3",
        renda_min=Decimal("4700.01"),
        renda_max=Decimal("8600"),
        imovel_max=Decimal("350000"),
        taxa_anual=Decimal("0.0716"),
        prazo_max_meses=420,
    ),
    "faixa_4": FaixaMCMV(
        codigo="faixa_4",
        nome="Faixa 4",
        renda_min=Decimal("8600.01"),
        renda_max=Decimal("12000"),
        imovel_max=Decimal("500000"),
        taxa_anual=Decimal("0.0816"),
        prazo_max_meses=420,
    ),
}

COMPROMETIMENTO_MAXIMO = Decimal("0.30")  # regra da Caixa: parcela ≤ 30% da renda
ENTRADA_MINIMA = Decimal("0.05")          # entrada mínima praticada


def faixa_por_renda(renda_familiar_bruta: Decimal | int | float | None) -> Faixa | None:
    """Descobre a faixa cabível para a renda declarada.

    Nulo, negativo ou acima do teto da Faixa 4 devolve ``None`` — significa
    "fora do programa nesta simulação".
    """
    if renda_familiar_bruta is None:
        return None
    try:
        renda = Decimal(str(renda_familiar_bruta))
    except (TypeError, ValueError, ArithmeticError):
        return None
    if renda <= 0:
        return None
    for faixa in FAIXAS.values():
        if faixa.renda_min <= renda <= faixa.renda_max:
            return faixa.codigo
    return None


@dataclass(frozen=True)
class Simulacao:
    """Resultado numérico da simulação."""

    faixa: Faixa
    faixa_nome: str
    valor_imovel: Decimal
    entrada: Decimal
    financiado: Decimal
    prazo_meses: int
    taxa_anual: Decimal
    parcela_estimada: Decimal
    renda_minima_sugerida: Decimal
    cabe_na_renda: bool


def simular(
    *,
    valor_imovel: Decimal | int | float,
    faixa: Faixa,
    entrada: Decimal | int | float | None = None,
    prazo_meses: int | None = None,
    renda_familiar_bruta: Decimal | int | float | None = None,
) -> Simulacao:
    """Simula uma financiamento MCMV com aproximação Price.

    ``entrada`` opcional — sem valor, usa a entrada mínima. ``prazo_meses``
    opcional — sem valor, usa o teto da faixa. ``renda_familiar_bruta``
    entra para dizer se o comprometimento fecha em 30%.
    """
    parametros = FAIXAS[faixa]
    valor_imovel_dec = Decimal(str(valor_imovel))
    entrada_dec = (
        Decimal(str(entrada))
        if entrada is not None
        else (valor_imovel_dec * ENTRADA_MINIMA)
    )
    if entrada_dec < 0:
        entrada_dec = Decimal("0")
    if entrada_dec > valor_imovel_dec:
        entrada_dec = valor_imovel_dec

    financiado = valor_imovel_dec - entrada_dec
    prazo = min(prazo_meses or parametros.prazo_max_meses, parametros.prazo_max_meses)

    parcela = _parcela_price(
        principal=financiado, taxa_anual=parametros.taxa_anual, prazo_meses=prazo
    )

    # A renda sugerida é a que faria essa parcela cair no limite de 30%.
    renda_minima = (parcela / COMPROMETIMENTO_MAXIMO).quantize(Decimal("0.01"))
    cabe = True
    if renda_familiar_bruta is not None:
        try:
            renda = Decimal(str(renda_familiar_bruta))
            cabe = parcela <= renda * COMPROMETIMENTO_MAXIMO
        except (TypeError, ValueError, ArithmeticError):
            cabe = False

    return Simulacao(
        faixa=faixa,
        faixa_nome=parametros.nome,
        valor_imovel=valor_imovel_dec.quantize(Decimal("0.01")),
        entrada=entrada_dec.quantize(Decimal("0.01")),
        financiado=financiado.quantize(Decimal("0.01")),
        prazo_meses=prazo,
        taxa_anual=parametros.taxa_anual,
        parcela_estimada=parcela.quantize(Decimal("0.01")),
        renda_minima_sugerida=renda_minima,
        cabe_na_renda=cabe,
    )


def imovel_cabe_no_programa(
    *, valor_imovel: Decimal | int | float, faixa: Faixa
) -> bool:
    """Confere se o valor do imóvel respeita o teto da faixa."""
    return Decimal(str(valor_imovel)) <= FAIXAS[faixa].imovel_max


def _parcela_price(*, principal: Decimal, taxa_anual: Decimal, prazo_meses: int) -> Decimal:
    """Parcela pelo sistema Price (parcelas fixas).

    Aproximação. O SAC costuma ser mais usado no MCMV, mas para "cabe no
    bolso?" o Price rende número mais previsível e conservador — a primeira
    parcela do SAC é mais alta que essa e o comprador percebe na conversa.
    """
    if prazo_meses <= 0 or principal <= 0:
        return Decimal("0")
    # Taxa mensal a partir da anual: (1+ia)^(1/12) - 1
    ia = float(taxa_anual)
    im = (1 + ia) ** (1 / 12) - 1
    n = prazo_meses
    p = float(principal)
    if im == 0:
        parcela = p / n
    else:
        parcela = p * im / (1 - (1 + im) ** -n)
    return Decimal(str(round(parcela, 2)))
