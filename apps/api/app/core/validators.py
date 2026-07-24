"""Validação de documentos brasileiros."""

import re

_NON_DIGITS = re.compile(r"\D")


def only_digits(value: str) -> str:
    return _NON_DIGITS.sub("", value or "")


def is_valid_cpf(cpf: str) -> bool:
    cpf = only_digits(cpf)
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for size in (9, 10):
        weights = range(size + 1, 1, -1)
        total = sum(int(d) * w for d, w in zip(cpf[:size], weights, strict=True))
        check = (total * 10) % 11
        check = 0 if check == 10 else check
        if check != int(cpf[size]):
            return False
    return True


def is_valid_cnpj(cnpj: str) -> bool:
    cnpj = only_digits(cnpj)
    if len(cnpj) != 14 or cnpj == cnpj[0] * 14:
        return False
    for size, weights in (
        (12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
        (13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]),
    ):
        total = sum(int(d) * w for d, w in zip(cnpj[:size], weights, strict=True))
        check = total % 11
        check = 0 if check < 2 else 11 - check
        if check != int(cnpj[size]):
            return False
    return True


def validate_document(kind: str, value: str | None) -> str | None:
    """Normaliza e valida CPF (PF) ou CNPJ (PJ). Documento é opcional."""
    if not value:
        return None
    digits = only_digits(value)
    if kind == "PF":
        if not is_valid_cpf(digits):
            raise ValueError("CPF inválido")
    elif kind == "PJ":
        if not is_valid_cnpj(digits):
            raise ValueError("CNPJ inválido")
    else:
        raise ValueError("Tipo de pessoa inválido")
    return digits


def format_document(digits: str | None) -> str | None:
    if not digits:
        return None
    if len(digits) == 11:
        return f"{digits[:3]}.{digits[3:6]}.{digits[6:9]}-{digits[9:]}"
    if len(digits) == 14:
        return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"
    return digits
