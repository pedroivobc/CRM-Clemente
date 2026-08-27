"""Limitador de taxa simples, em memória, para a superfície pública.

A vitrine é aberta e sem login: convém conter varredura e flood de leads. Este
limitador é por processo (janela fixa por chave) — suficiente para uma
instância e como primeira barreira. Em produção o Caddy à frente aplica o
limite de borda; os dois se somam, não se substituem.
"""

from __future__ import annotations

import time
from collections import defaultdict

from fastapi import HTTPException, Request, status


class FixedWindowLimiter:
    def __init__(self, *, limit: int, window_seconds: float) -> None:
        self.limit = limit
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def check(self, key: str) -> None:
        now = time.monotonic()
        cutoff = now - self.window
        hits = [t for t in self._hits[key] if t > cutoff]
        if len(hits) >= self.limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Muitas requisições. Tente novamente em instantes.",
            )
        hits.append(now)
        self._hits[key] = hits


def _client_ip(request: Request) -> str:
    # Atrás do Caddy o IP real vem no X-Forwarded-For (primeiro da lista).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "desconhecido"


# Leitura da vitrine é generosa; o envio de lead é apertado.
_read_limiter = FixedWindowLimiter(limit=120, window_seconds=60)
_lead_limiter = FixedWindowLimiter(limit=5, window_seconds=60)


def public_read_rate_limit(request: Request) -> None:
    _read_limiter.check(_client_ip(request))


def public_lead_rate_limit(request: Request) -> None:
    _lead_limiter.check(_client_ip(request))
