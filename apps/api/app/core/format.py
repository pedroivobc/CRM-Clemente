"""Formatação brasileira para textos que chegam ao usuário.

O sistema inteiro é em português: valor gravado no histórico de um chamado ou
impresso num laudo precisa sair como `R$ 1.180,00`, e não como o `1180.00` da
representação interna.
"""

from __future__ import annotations

from decimal import Decimal


def brl(value: Decimal | float | str | None) -> str:
    """Devolve o valor no formato `R$ 1.180,00`."""
    if value is None:
        return "—"
    # Formata no padrão americano e troca os separadores de uma vez, para não
    # depender de locale instalado no contêiner.
    formatted = f"{Decimal(str(value)):,.2f}".replace(",", "\x00").replace(".", ",")
    return "R$ " + formatted.replace("\x00", ".")
