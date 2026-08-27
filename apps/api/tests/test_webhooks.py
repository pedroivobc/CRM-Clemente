"""Webhooks: assinatura, idempotência e efeito sobre cobranças e contratos.

Um webhook de pagamento processado duas vezes credita o proprietário duas
vezes. É por isso que a idempotência tem teste próprio.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

pytestmark = pytest.mark.asyncio

D = Decimal


@pytest.fixture
async def public(app_env):
    """Cliente HTTP sem autenticação — como o provedor chama o endpoint."""
    from app.main import app

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://testserver"
    ) as client:
        yield client


async def _active_contract_with_charge(api) -> dict:
    prop = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "locacao", "title": "Casa alugada"},
        )
    ).json()
    owner = (await api.post("/api/v1/clients", json={"kind": "PF", "name": "Dona Maria"})).json()
    tenant = (await api.post("/api/v1/clients", json={"kind": "PF", "name": "Seu João"})).json()

    contrato = (
        await api.post(
            "/api/v1/contracts",
            json={
                "property_id": prop["id"],
                "rent_amount": "2000.00",
                "admin_fee_pct": "10",
                "start_date": date.today().replace(day=1).isoformat(),
                "end_date": (date.today() + timedelta(days=365)).isoformat(),
                "due_day": 10,
                "parties": [
                    {"client_id": owner["id"], "role": "locador", "is_payee": True},
                    {"client_id": tenant["id"], "role": "locatario"},
                ],
            },
        )
    ).json()
    await api.post(f"/api/v1/contracts/{contrato['id']}/activate")

    cobranca = (
        await api.post(
            "/api/v1/billing/generate",
            json={"competence": date.today().replace(day=1).isoformat()},
        )
    ).json()["charges"][0]
    return {"contract": contrato, "charge": cobranca}


def _payment_event(provider_charge_id: str, event_id: str, value: str = "2000.00") -> dict:
    return {
        "id": event_id,
        "event": "PAYMENT_CONFIRMED",
        "payment": {
            "id": provider_charge_id,
            "value": value,
            "paymentDate": date.today().isoformat(),
            "billingType": "PIX",
        },
    }


# ── Pagamento ────────────────────────────────────────────────────────────────
async def test_pagamento_confirmado_baixa_a_cobranca(api, public):
    fixture = await _active_contract_with_charge(api)
    charge_id = fixture["charge"]["id"]
    provider_charge_id = fixture["charge"]["provider_charge_id"]

    resp = await public.post("/webhooks/payments", json=_payment_event(provider_charge_id, "evt-1"))
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "processado"

    atualizada = (await api.get(f"/api/v1/billing/charges/{charge_id}")).json()
    assert atualizada["status"] == "pago"
    assert Decimal(atualizada["paid_amount"]) == D("2000.00")


async def test_evento_repetido_nao_baixa_duas_vezes(api, public):
    fixture = await _active_contract_with_charge(api)
    charge_id = fixture["charge"]["id"]
    provider_charge_id = fixture["charge"]["provider_charge_id"]

    evento = _payment_event(provider_charge_id, "evt-repetido")

    primeira = await public.post("/webhooks/payments", json=evento)
    segunda = await public.post("/webhooks/payments", json=evento)
    terceira = await public.post("/webhooks/payments", json=evento)

    assert primeira.json()["outcome"] == "processado"
    assert segunda.json()["outcome"] == "duplicado"
    assert terceira.json()["outcome"] == "duplicado"

    # O valor pago é a soma dos pagamentos: se tivesse processado três vezes,
    # daria 6000 e o proprietário seria creditado a mais.
    cobranca = (await api.get(f"/api/v1/billing/charges/{charge_id}")).json()
    assert Decimal(cobranca["paid_amount"]) == D("2000.00")
    assert cobranca["status"] == "pago"


async def test_evento_sem_identificador_e_recusado(public):
    resp = await public.post("/webhooks/payments", json={"event": "PAYMENT_CONFIRMED"})
    assert resp.status_code == 400
    assert resp.json()["outcome"] == "invalido"


async def test_evento_de_outro_tipo_e_ignorado(public):
    resp = await public.post(
        "/webhooks/payments", json={"id": "evt-outro", "event": "PAYMENT_CREATED"}
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "ignorado"


async def test_pagamento_de_cobranca_desconhecida_e_ignorado(public):
    resp = await public.post(
        "/webhooks/payments", json=_payment_event("pay_inexistente", "evt-fantasma")
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "ignorado"


async def test_assinatura_invalida_bloqueia_o_processamento(public, monkeypatch):
    from app.providers.mocks import MockPaymentProvider
    from app.webhooks import router as webhooks

    class RejectingProvider(MockPaymentProvider):
        def verify_webhook(self, headers, body):
            return False

    # O router importa a função pelo nome, então é lá que ela é trocada.
    monkeypatch.setattr(webhooks, "get_payment_provider", lambda: RejectingProvider())

    resp = await public.post("/webhooks/payments", json=_payment_event("pay_x", "evt-sem-assin"))

    assert resp.status_code == 401
    assert resp.json()["outcome"] == "invalido"


async def test_todo_evento_recebido_fica_registrado(api, public):
    await public.post("/webhooks/payments", json={"id": "evt-log", "event": "PAYMENT_CREATED"})

    from app.core.db import platform_connection

    async with platform_connection() as conn:
        row = (
            (
                await conn.execute(
                    text(
                        "select status, event_type, processed_at from rentals.webhook_events "
                        "where event_id = 'evt-log'"
                    )
                )
            )
            .mappings()
            .first()
        )

    assert row["status"] == "ignorado"
    assert row["event_type"] == "PAYMENT_CREATED"
    assert row["processed_at"] is not None


# ── Assinatura eletrônica ────────────────────────────────────────────────────
async def test_contrato_assinado_fica_ativo_pelo_webhook(api, public):
    prop = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "locacao", "title": "Casa a assinar"},
        )
    ).json()
    locatario = (await api.post("/api/v1/clients", json={"kind": "PF", "name": "Assinante"})).json()
    contrato = (
        await api.post(
            "/api/v1/contracts",
            json={
                "property_id": prop["id"],
                "rent_amount": "1500.00",
                "start_date": date.today().isoformat(),
                "end_date": (date.today() + timedelta(days=365)).isoformat(),
                "parties": [{"client_id": locatario["id"], "role": "locatario"}],
            },
        )
    ).json()

    envio = (await api.post(f"/api/v1/contracts/{contrato['id']}/sign")).json()

    resp = await public.post(
        "/webhooks/signatures",
        json={
            "id": "sig-1",
            "event": "document.signed",
            "envelope_id": envio["envelope_id"],
        },
    )
    assert resp.json()["outcome"] == "processado"
    assert resp.json()["status"] == "assinado"

    atualizado = (await api.get(f"/api/v1/contracts/{contrato['id']}")).json()
    assert atualizado["status"] == "ativo"

    imovel = (await api.get(f"/api/v1/properties/{prop['id']}")).json()
    assert imovel["status"] == "alugado"


async def test_envelope_desconhecido_e_ignorado(public):
    resp = await public.post(
        "/webhooks/signatures",
        json={"id": "sig-fantasma", "event": "document.signed", "envelope_id": "env_nao_existe"},
    )
    assert resp.status_code == 200
    assert resp.json()["outcome"] == "ignorado"


async def test_webhook_de_assinatura_tambem_e_idempotente(api, public):
    prop = (
        await api.post(
            "/api/v1/properties",
            json={"kind": "casa", "purpose": "locacao", "title": "Casa"},
        )
    ).json()
    cliente = (await api.post("/api/v1/clients", json={"kind": "PF", "name": "Assinante"})).json()
    contrato = (
        await api.post(
            "/api/v1/contracts",
            json={
                "property_id": prop["id"],
                "rent_amount": "1500.00",
                "start_date": date.today().isoformat(),
                "end_date": (date.today() + timedelta(days=365)).isoformat(),
                "parties": [{"client_id": cliente["id"], "role": "locatario"}],
            },
        )
    ).json()
    envio = (await api.post(f"/api/v1/contracts/{contrato['id']}/sign")).json()

    evento = {"id": "sig-dup", "event": "document.signed", "envelope_id": envio["envelope_id"]}
    assert (await public.post("/webhooks/signatures", json=evento)).json()[
        "outcome"
    ] == "processado"
    assert (await public.post("/webhooks/signatures", json=evento)).json()["outcome"] == "duplicado"
