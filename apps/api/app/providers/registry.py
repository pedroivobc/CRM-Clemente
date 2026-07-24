"""Seleção do provedor conforme configuração.

Fase 1 entrega apenas os mocks; as implementações reais (Asaas, ClickSign,
Focus NFe, Evolution) são registradas aqui nas fases seguintes.
"""

from __future__ import annotations

from app.core.config import get_settings
from app.providers.base import (
    InvoiceProvider,
    MessagingProvider,
    PaymentProvider,
    SignatureProvider,
    VoiceProvider,
)
from app.providers.mocks import (
    MockInvoiceProvider,
    MockMessagingProvider,
    MockPaymentProvider,
    MockSignatureProvider,
    MockVoiceProvider,
)


class ProviderNotImplemented(Exception):
    pass


_cache: dict[str, object] = {}


def _resolve(kind: str, configured: str, builders: dict[str, type]) -> object:
    if kind in _cache:
        return _cache[kind]
    builder = builders.get(configured)
    if builder is None:
        raise ProviderNotImplemented(
            f"Provedor '{configured}' para {kind} ainda não implementado. "
            f"Disponíveis: {', '.join(sorted(builders))}"
        )
    instance = builder()
    _cache[kind] = instance
    return instance


def get_payment_provider() -> PaymentProvider:
    settings = get_settings()
    return _resolve("payment", settings.payment_provider, {"mock": MockPaymentProvider})  # type: ignore[return-value]


def get_signature_provider() -> SignatureProvider:
    settings = get_settings()
    return _resolve("signature", settings.signature_provider, {"mock": MockSignatureProvider})  # type: ignore[return-value]


def get_invoice_provider() -> InvoiceProvider:
    settings = get_settings()
    return _resolve("invoice", settings.invoice_provider, {"mock": MockInvoiceProvider})  # type: ignore[return-value]


def get_messaging_provider() -> MessagingProvider:
    settings = get_settings()
    return _resolve("messaging", settings.messaging_provider, {"mock": MockMessagingProvider})  # type: ignore[return-value]


def get_voice_provider() -> VoiceProvider:
    return _resolve("voice", "mock", {"mock": MockVoiceProvider})  # type: ignore[return-value]


def reset_providers() -> None:
    """Limpa o cache (usado em testes)."""
    _cache.clear()
