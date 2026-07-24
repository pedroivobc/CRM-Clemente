"""Implementações mock — desenvolvimento e testes sem credenciais.

Simulam o comportamento observável dos provedores reais (identificadores,
status, linha digitável, Pix) de forma determinística, para exercitar os
fluxos ponta a ponta antes da integração real.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.providers.base import (
    CallResult,
    ChargeRequest,
    ChargeResult,
    InvoiceProvider,
    InvoiceRequest,
    InvoiceResult,
    MessageResult,
    MessagingProvider,
    PaymentProvider,
    SignatureProvider,
    SignatureResult,
    Signer,
    VoiceProvider,
)


def _ref(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


class MockPaymentProvider(PaymentProvider):
    def __init__(self) -> None:
        self.charges: dict[str, ChargeResult] = {}
        self.requests: dict[str, ChargeRequest] = {}

    async def create_customer(self, *, name: str, document: str, email: str | None) -> str:
        return _ref("cus")

    async def create_subaccount(self, *, name: str, document: str, email: str) -> str:
        return _ref("wal")

    async def create_charge(self, request: ChargeRequest) -> ChargeResult:
        charge_id = _ref("pay")
        result = ChargeResult(
            provider_charge_id=charge_id,
            status="PENDING",
            boleto_line="34191.79001 01043.510047 91020.150008 6 00000000000000",
            boleto_url=f"https://sandbox.mock/boleto/{charge_id}",
            pix_copy_paste=f"00020126580014BR.GOV.BCB.PIX0136{uuid.uuid4()}5204000053039865802BR",
            pix_qrcode=f"https://sandbox.mock/pix/{charge_id}.png",
            raw={"mock": True, "splits": len(request.splits)},
        )
        self.charges[charge_id] = result
        self.requests[charge_id] = request
        return result

    async def cancel_charge(self, provider_charge_id: str) -> None:
        if provider_charge_id in self.charges:
            self.charges[provider_charge_id].status = "CANCELLED"

    async def get_charge(self, provider_charge_id: str) -> ChargeResult:
        if provider_charge_id not in self.charges:
            raise KeyError(f"Cobrança {provider_charge_id} não encontrada no mock")
        return self.charges[provider_charge_id]

    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool:
        return True


class MockSignatureProvider(SignatureProvider):
    def __init__(self) -> None:
        self.envelopes: dict[str, SignatureResult] = {}
        self.documents: dict[str, bytes] = {}

    async def send_for_signature(
        self, *, document: bytes, file_name: str, signers: list[Signer], external_ref: str
    ) -> SignatureResult:
        envelope_id = _ref("env")
        result = SignatureResult(
            envelope_id=envelope_id,
            status="enviado",
            signers=[{"name": s.name, "email": s.email, "status": "pendente"} for s in signers],
        )
        self.envelopes[envelope_id] = result
        self.documents[envelope_id] = document
        return result

    async def get_status(self, envelope_id: str) -> SignatureResult:
        return self.envelopes[envelope_id]

    async def download_signed(self, envelope_id: str) -> bytes:
        return self.documents[envelope_id]

    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool:
        return True


class MockInvoiceProvider(InvoiceProvider):
    def __init__(self) -> None:
        self.invoices: dict[str, InvoiceResult] = {}
        self._counter = 0

    async def issue(self, request: InvoiceRequest) -> InvoiceResult:
        self._counter += 1
        ref = _ref("nfse")
        result = InvoiceResult(
            provider_ref=ref,
            status="autorizada",
            number=str(self._counter).zfill(6),
            pdf_url=f"https://sandbox.mock/nfse/{ref}.pdf",
            xml_url=f"https://sandbox.mock/nfse/{ref}.xml",
        )
        self.invoices[ref] = result
        return result

    async def get_status(self, provider_ref: str) -> InvoiceResult:
        return self.invoices[provider_ref]

    async def cancel(self, provider_ref: str, reason: str) -> InvoiceResult:
        invoice = self.invoices[provider_ref]
        invoice.status = "cancelada"
        invoice.message = reason
        return invoice


class MockMessagingProvider(MessagingProvider):
    def __init__(self) -> None:
        self.sent: list[dict[str, str | None]] = []

    async def send_text(self, *, to: str, body: str) -> MessageResult:
        self.sent.append({"to": to, "body": body, "media_url": None})
        return MessageResult(_ref("msg"), "sent", datetime.now(UTC))

    async def send_media(
        self, *, to: str, media_url: str, caption: str | None, file_name: str | None
    ) -> MessageResult:
        self.sent.append({"to": to, "body": caption, "media_url": media_url})
        return MessageResult(_ref("msg"), "sent", datetime.now(UTC))

    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool:
        return True


class MockVoiceProvider(VoiceProvider):
    def __init__(self) -> None:
        self.calls: dict[str, CallResult] = {}

    async def click_to_call(self, *, agent_number: str, customer_number: str) -> CallResult:
        call_id = _ref("call")
        result = CallResult(call_id, "ringing")
        self.calls[call_id] = result
        return result

    async def get_call(self, provider_call_id: str) -> CallResult:
        return self.calls[provider_call_id]
