"""Enfileiramento de tarefas assíncronas.

Isola a API do backend de fila (arq/Redis). Se o Redis estiver indisponível
em desenvolvimento, o enfileiramento degrada para no-op registrado em log —
a operação principal (ex.: upload da foto) não falha por causa disso.
"""

from __future__ import annotations

import logging
from typing import Any

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_pool: Any = None


def redis_settings() -> RedisSettings:
    return RedisSettings.from_dsn(get_settings().redis_url)


async def get_pool() -> Any:
    global _pool
    if _pool is None:
        _pool = await create_pool(redis_settings())
    return _pool


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


async def enqueue(task_name: str, *args: Any, **kwargs: Any) -> str | None:
    """Enfileira uma tarefa; devolve o id do job (None se a fila estiver fora)."""
    try:
        pool = await get_pool()
        job = await pool.enqueue_job(task_name, *args, **kwargs)
        return job.job_id if job else None
    except Exception:
        logger.warning("Fila indisponível — tarefa %s não enfileirada", task_name, exc_info=True)
        return None
