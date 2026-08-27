"""Webhooks dos provedores externos.

O pagamento confirmado dispara uma cadeia crítica — baixa, recibo, NFS-e,
aviso ao locatário e ao proprietário. Ela não pode rodar duas vezes nem se
perder, então cada evento é gravado antes de ser processado, com
``(provider, event_id)`` único: uma reentrega do mesmo evento é reconhecida e
ignorada em vez de duplicar o dinheiro.

Estes endpoints ficam fora de ``/api/v1`` e não passam por autenticação de
usuário: quem chama é o provedor, autenticado pela assinatura da requisição.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Request, Response, status
from sqlalchemy import text

from app.core.db import platform_connection, tenant_connection
from app.providers.registry import get_payment_provider, get_signature_provider

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


class WebhookOutcome:
    RECEIVED = "recebido"
    PROCESSED = "processado"
    DUPLICATE = "duplicado"
    IGNORED = "ignorado"
    INVALID = "invalido"


async def _record_event(
    provider: str, event_id: str, event_type: str | None, payload: dict
) -> bool:
    """Grava o evento. Retorna False se já tinha sido recebido antes."""
    async with platform_connection() as conn:
        inserted = (
            await conn.execute(
                text(
                    """
                    insert into rentals.webhook_events
                        (provider, event_id, event_type, payload)
                    values (:provider, :event_id, :event_type, cast(:payload as jsonb))
                    on conflict (provider, event_id) do nothing
                    returning id
                    """
                ),
                {
                    "provider": provider,
                    "event_id": event_id,
                    "event_type": event_type,
                    "payload": json.dumps(payload),
                },
            )
        ).first()
    return inserted is not None


async def _finish_event(provider: str, event_id: str, status_value: str, error: str | None = None):
    async with platform_connection() as conn:
        await conn.execute(
            text(
                """
                update rentals.webhook_events
                set status = :status, error_message = :error, processed_at = now()
                where provider = :provider and event_id = :event_id
                """
            ),
            {
                "status": status_value,
                "error": error,
                "provider": provider,
                "event_id": event_id,
            },
        )


def _event_id(payload: dict, fallback_keys: tuple[str, ...]) -> str | None:
    for key in ("id", "event_id", "eventId", *fallback_keys):
        value = payload.get(key)
        if isinstance(value, str) and value:
            return value
    return None


# ── Gateway de pagamento ─────────────────────────────────────────────────────
@router.post("/payments", status_code=status.HTTP_200_OK)
async def payment_webhook(request: Request, response: Response) -> dict:
    """Confirmação de pagamento: baixa a cobrança e credita o repasse."""
    body = await request.body()
    payload: dict[str, Any] = json.loads(body or b"{}")

    provider = get_payment_provider()
    if not provider.verify_webhook(dict(request.headers), body):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"outcome": WebhookOutcome.INVALID, "detail": "Assinatura inválida"}

    event_id = _event_id(payload, ("paymentId",))
    if not event_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"outcome": WebhookOutcome.INVALID, "detail": "Evento sem identificador"}

    event_type = payload.get("event") or payload.get("type")

    if not await _record_event("payment", event_id, event_type, payload):
        # Reentrega: já processamos. Responder 200 evita novas tentativas.
        return {"outcome": WebhookOutcome.DUPLICATE, "event_id": event_id}

    if event_type not in ("PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"):
        await _finish_event("payment", event_id, "ignorado")
        return {"outcome": WebhookOutcome.IGNORED, "event_id": event_id}

    try:
        processed = await _apply_payment(payload)
    except Exception as exc:  # noqa: BLE001 — o evento fica registrado com o erro
        logger.exception("Falha ao processar pagamento %s", event_id)
        await _finish_event("payment", event_id, "erro", str(exc))
        response.status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        return {"outcome": "erro", "event_id": event_id}

    await _finish_event("payment", event_id, "processado" if processed else "ignorado")
    return {
        "outcome": WebhookOutcome.PROCESSED if processed else WebhookOutcome.IGNORED,
        "event_id": event_id,
    }


async def _apply_payment(payload: dict) -> bool:
    """Localiza a cobrança pelo identificador do gateway e a baixa."""
    payment = payload.get("payment", payload)
    provider_charge_id = payment.get("id") or payment.get("charge_id")
    if not provider_charge_id:
        return False

    async with platform_connection() as conn:
        found = (
            (
                await conn.execute(
                    text("select * from rentals.resolve_charge_tenant(:pid)"),
                    {"pid": provider_charge_id},
                )
            )
            .mappings()
            .first()
        )
    if found is None:
        return False

    from datetime import date as date_type

    paid_at = payment.get("paymentDate") or payment.get("paid_at")
    paid_date = date_type.fromisoformat(paid_at) if paid_at else date_type.today()
    paid_amount = payment.get("value") or payment.get("amount")

    async with tenant_connection(found["tenant_id"]) as conn:
        already = (
            await conn.execute(
                text("select 1 from rentals.payments where charge_id = :chid"),
                {"chid": str(found["charge_id"])},
            )
        ).first()
        if already:
            return False

        await conn.execute(
            text(
                """
                insert into rentals.payments
                    (tenant_id, charge_id, paid_amount, paid_at, method, provider_ref)
                values (:tid, :chid, :amount, :paid_at, :method, :ref)
                """
            ),
            {
                "tid": str(found["tenant_id"]),
                "chid": str(found["charge_id"]),
                "amount": paid_amount,
                "paid_at": paid_date,
                "method": (payment.get("billingType") or "boleto").lower()[:20],
                "ref": provider_charge_id,
            },
        )
        await conn.execute(
            text("update rentals.charges set status = 'pago' where id = :chid"),
            {"chid": str(found["charge_id"])},
        )
    return True


# ── Assinatura eletrônica ────────────────────────────────────────────────────
@router.post("/signatures", status_code=status.HTTP_200_OK)
async def signature_webhook(request: Request, response: Response) -> dict:
    """Atualiza o status do envelope e ativa o contrato quando todos assinam."""
    body = await request.body()
    payload: dict[str, Any] = json.loads(body or b"{}")

    provider = get_signature_provider()
    if not provider.verify_webhook(dict(request.headers), body):
        response.status_code = status.HTTP_401_UNAUTHORIZED
        return {"outcome": WebhookOutcome.INVALID, "detail": "Assinatura inválida"}

    event_id = _event_id(payload, ("envelopeId", "document_key"))
    if not event_id:
        response.status_code = status.HTTP_400_BAD_REQUEST
        return {"outcome": WebhookOutcome.INVALID, "detail": "Evento sem identificador"}

    event_type = payload.get("event") or payload.get("type")
    if not await _record_event("signature", event_id, event_type, payload):
        return {"outcome": WebhookOutcome.DUPLICATE, "event_id": event_id}

    envelope_id = payload.get("envelope_id") or payload.get("envelopeId")
    new_status = {
        "document.viewed": "visualizado",
        "document.signed": "assinado",
        "document.refused": "recusado",
        "document.canceled": "cancelado",
    }.get(str(event_type), None)

    if not envelope_id or new_status is None:
        await _finish_event("signature", event_id, "ignorado")
        return {"outcome": WebhookOutcome.IGNORED, "event_id": event_id}

    async with platform_connection() as conn:
        found = (
            (
                await conn.execute(
                    text("select * from rentals.resolve_envelope_tenant(:env)"),
                    {"env": envelope_id},
                )
            )
            .mappings()
            .first()
        )
    if found is None:
        await _finish_event("signature", event_id, "ignorado")
        return {"outcome": WebhookOutcome.IGNORED, "event_id": event_id}

    async with tenant_connection(found["tenant_id"]) as conn:
        await conn.execute(
            text(
                """
                update rentals.signature_requests
                set status = :status,
                    finished_at = case when :status in ('assinado', 'recusado', 'cancelado')
                                       then now() else finished_at end
                where id = :sid
                """
            ),
            {"status": new_status, "sid": str(found["request_id"])},
        )
        if new_status == "assinado":
            # Contrato assinado fica ativo e o imóvel passa a alugado.
            await conn.execute(
                text(
                    "update rentals.contracts set status = 'ativo' where id = :cid "
                    "and status = 'em_assinatura'"
                ),
                {"cid": str(found["contract_id"])},
            )
            await conn.execute(
                text(
                    """
                    update properties.properties set status = 'alugado'
                    where id = (select property_id from rentals.contracts where id = :cid)
                    """
                ),
                {"cid": str(found["contract_id"])},
            )

    await _finish_event("signature", event_id, "processado")
    return {"outcome": WebhookOutcome.PROCESSED, "event_id": event_id, "status": new_status}
