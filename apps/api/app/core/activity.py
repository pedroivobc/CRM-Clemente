"""Feed de atividade — pulso do time dentro do sistema.

Diferente do audit_log (que é técnico e detalhado), o feed guarda frases
prontas em bom português para o gerente e o corretor lerem no painel.
Uma linha aqui é o que rolaria num grupo de WhatsApp da equipe:
"Ana movimentou 3 leads pra Proposta hoje".

Feito no mesmo commit da ação — se a operação der ruim, o feed também
é revertido.
"""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.security import CurrentUser


async def record_activity(
    conn: AsyncConnection,
    user: CurrentUser,
    *,
    event_type: str,
    summary: str,
    subject_type: str | None = None,
    subject_id: str | UUID | None = None,
    meta: dict[str, Any] | None = None,
) -> None:
    """Emite um evento no feed do tenant.

    ``event_type`` é slug (``lead.created``, ``deal.closed``); ``summary`` é a
    frase pronta que aparece no painel — grava agora para ser imune a rename
    de tela ou refactor.
    """
    await conn.execute(
        text(
            """
            insert into core.activity_feed
                (tenant_id, actor_id, event_type, subject_type, subject_id, summary, meta)
            values
                (:tid, :aid, :type, :stype, :sid, :summary, cast(:meta as jsonb))
            """
        ),
        {
            "tid": str(user.tenant_id),
            "aid": str(user.user_id),
            "type": event_type,
            "stype": subject_type,
            "sid": str(subject_id) if subject_id is not None else None,
            "summary": summary,
            "meta": json.dumps(meta or {}, default=str),
        },
    )
