"""Log de auditoria de ações sensíveis."""

import json
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.security import CurrentUser


async def record_audit(
    conn: AsyncConnection,
    user: CurrentUser,
    entity: str,
    entity_id: str | UUID | None,
    action: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Registra a ação na mesma transação da operação auditada.

    Se a operação falhar, o registro de auditoria também é desfeito — o log
    nunca descreve algo que não aconteceu.
    """
    await conn.execute(
        text(
            """
            insert into core.audit_log
                (tenant_id, user_id, entity, entity_id, action, before, after, ip)
            values
                (:tenant_id, :user_id, :entity, :entity_id, :action,
                 cast(:before as jsonb), cast(:after as jsonb), cast(:ip as inet))
            """
        ),
        {
            "tenant_id": str(user.tenant_id),
            "user_id": str(user.user_id),
            "entity": entity,
            "entity_id": str(entity_id) if entity_id is not None else None,
            "action": action,
            "before": json.dumps(before, default=str) if before is not None else None,
            "after": json.dumps(after, default=str) if after is not None else None,
            "ip": ip,
        },
    )
