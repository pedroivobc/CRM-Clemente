"""Validação de CPF/CNPJ e resolução de subdomínio."""

import pytest

from app.core.tenancy import extract_subdomain
from app.core.validators import format_document, is_valid_cnpj, is_valid_cpf, validate_document


@pytest.mark.parametrize("cpf", ["390.533.447-05", "39053344705", "111.444.777-35"])
def test_cpf_valido(cpf):
    assert is_valid_cpf(cpf)


@pytest.mark.parametrize(
    "cpf",
    [
        "111.111.111-11",  # todos os dígitos iguais
        "390.533.447-06",  # dígito verificador errado
        "12345678901",
        "3905334470",  # curto demais
        "",
    ],
)
def test_cpf_invalido(cpf):
    assert not is_valid_cpf(cpf)


@pytest.mark.parametrize("cnpj", ["11.222.333/0001-81", "11222333000181"])
def test_cnpj_valido(cnpj):
    assert is_valid_cnpj(cnpj)


@pytest.mark.parametrize("cnpj", ["11.222.333/0001-82", "00.000.000/0000-00", "1122233300018", ""])
def test_cnpj_invalido(cnpj):
    assert not is_valid_cnpj(cnpj)


def test_validate_document_normaliza_para_digitos():
    assert validate_document("PF", "390.533.447-05") == "39053344705"
    assert validate_document("PJ", "11.222.333/0001-81") == "11222333000181"


def test_validate_document_rejeita_invalido():
    with pytest.raises(ValueError, match="CPF inválido"):
        validate_document("PF", "111.111.111-11")
    with pytest.raises(ValueError, match="CNPJ inválido"):
        validate_document("PJ", "11.222.333/0001-99")


def test_documento_opcional():
    assert validate_document("PF", None) is None
    assert validate_document("PJ", "") is None


def test_format_document():
    assert format_document("39053344705") == "390.533.447-05"
    assert format_document("11222333000181") == "11.222.333/0001-81"
    assert format_document(None) is None


@pytest.mark.parametrize(
    ("host", "expected"),
    [
        ("imob-a.sistema.com.br", "imob-a"),
        ("imob-a.sistema.com.br:443", "imob-a"),
        ("sistema.com.br", None),
        ("www.sistema.com.br", None),
        ("localhost:5173", None),
        ("127.0.0.1:8000", None),
        ("", None),
    ],
)
def test_extract_subdomain(host, expected, monkeypatch):
    from app.core import config

    monkeypatch.setenv("BASE_DOMAIN", "sistema.com.br")
    config.get_settings.cache_clear()
    try:
        assert extract_subdomain(host) == expected
    finally:
        config.get_settings.cache_clear()
