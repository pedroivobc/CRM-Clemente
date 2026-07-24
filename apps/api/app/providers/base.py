"""Contratos das integrações externas.

Toda integração (pagamento, assinatura, NFS-e, mensageria, voz) é acessada
apenas por estas interfaces. Em desenvolvimento e nos testes valem as
implementações mock; as reais (Asaas, ClickSign, Focus NFe, Evolution API)
entram nas fases seguintes sem alterar quem chama.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any


# ── Pagamentos ───────────────────────────────────────────────────────────────
@dataclass
class SplitTarget:
    """Destino de um split: subconta (proprietário) ou conta principal."""

    wallet_id: str
    amount: Decimal | None = None
    percentage: Decimal | None = None


@dataclass
class ChargeRequest:
    customer_ref: str
    amount: Decimal
    due_date: date
    description: str
    external_ref: str
    splits: list[SplitTarget] = field(default_factory=list)
    fine_pct: Decimal | None = None
    interest_pct: Decimal | None = None
    discount_amount: Decimal | None = None
    discount_deadline: date | None = None


@dataclass
class ChargeResult:
    provider_charge_id: str
    status: str
    boleto_line: str | None = None
    boleto_url: str | None = None
    pix_copy_paste: str | None = None
    pix_qrcode: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


class PaymentProvider(ABC):
    """Gateway de cobrança com split nativo."""

    @abstractmethod
    async def create_customer(self, *, name: str, document: str, email: str | None) -> str: ...

    @abstractmethod
    async def create_subaccount(self, *, name: str, document: str, email: str) -> str:
        """Subconta do proprietário que recebe o repasse do split."""

    @abstractmethod
    async def create_charge(self, request: ChargeRequest) -> ChargeResult: ...

    @abstractmethod
    async def cancel_charge(self, provider_charge_id: str) -> None: ...

    @abstractmethod
    async def get_charge(self, provider_charge_id: str) -> ChargeResult: ...

    @abstractmethod
    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool: ...


# ── Assinatura eletrônica ────────────────────────────────────────────────────
@dataclass
class Signer:
    name: str
    email: str
    document: str | None = None
    role: str = "signer"


@dataclass
class SignatureResult:
    envelope_id: str
    status: str
    signers: list[dict[str, Any]] = field(default_factory=list)
    signed_document_url: str | None = None


class SignatureProvider(ABC):
    @abstractmethod
    async def send_for_signature(
        self, *, document: bytes, file_name: str, signers: list[Signer], external_ref: str
    ) -> SignatureResult: ...

    @abstractmethod
    async def get_status(self, envelope_id: str) -> SignatureResult: ...

    @abstractmethod
    async def download_signed(self, envelope_id: str) -> bytes: ...

    @abstractmethod
    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool: ...


# ── NFS-e ────────────────────────────────────────────────────────────────────
@dataclass
class InvoiceRequest:
    external_ref: str
    service_amount: Decimal
    service_description: str
    customer_name: str
    customer_document: str
    customer_email: str | None = None
    competence: date | None = None


@dataclass
class InvoiceResult:
    provider_ref: str
    status: str
    number: str | None = None
    pdf_url: str | None = None
    xml_url: str | None = None
    message: str | None = None


class InvoiceProvider(ABC):
    @abstractmethod
    async def issue(self, request: InvoiceRequest) -> InvoiceResult: ...

    @abstractmethod
    async def get_status(self, provider_ref: str) -> InvoiceResult: ...

    @abstractmethod
    async def cancel(self, provider_ref: str, reason: str) -> InvoiceResult: ...


# ── Mensageria (WhatsApp) ────────────────────────────────────────────────────
@dataclass
class MessageResult:
    provider_message_id: str
    status: str
    sent_at: datetime | None = None


class MessagingProvider(ABC):
    @abstractmethod
    async def send_text(self, *, to: str, body: str) -> MessageResult: ...

    @abstractmethod
    async def send_media(
        self, *, to: str, media_url: str, caption: str | None, file_name: str | None
    ) -> MessageResult: ...

    @abstractmethod
    def verify_webhook(self, headers: dict[str, str], body: bytes) -> bool: ...


# ── Voz (VoIP) ───────────────────────────────────────────────────────────────
@dataclass
class CallResult:
    provider_call_id: str
    status: str
    recording_url: str | None = None
    duration_secs: int | None = None


class VoiceProvider(ABC):
    @abstractmethod
    async def click_to_call(self, *, agent_number: str, customer_number: str) -> CallResult: ...

    @abstractmethod
    async def get_call(self, provider_call_id: str) -> CallResult: ...
