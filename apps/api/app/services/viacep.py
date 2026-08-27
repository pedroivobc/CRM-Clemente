"""Consulta de endereço por CEP (ViaCEP)."""

import httpx

from app.core.validators import only_digits


class CepNotFound(Exception):
    pass


async def lookup_cep(cep: str) -> dict[str, str]:
    digits = only_digits(cep)
    if len(digits) != 8:
        raise CepNotFound("CEP deve ter 8 dígitos")

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(f"https://viacep.com.br/ws/{digits}/json/")
        resp.raise_for_status()
        data = resp.json()

    if data.get("erro"):
        raise CepNotFound("CEP não encontrado")

    return {
        "cep": digits,
        "logradouro": data.get("logradouro", ""),
        "complemento": data.get("complemento", ""),
        "bairro": data.get("bairro", ""),
        "cidade": data.get("localidade", ""),
        "uf": data.get("uf", ""),
        "ibge": data.get("ibge", ""),
    }
