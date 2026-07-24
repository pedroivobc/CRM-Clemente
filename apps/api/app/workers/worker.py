"""Ponto de entrada do worker: python -m arq app.workers.worker.WorkerSettings"""

from __future__ import annotations

import logging
from typing import Any

from app.core.db import dispose_engine
from app.workers.queue import redis_settings
from app.workers.tasks import rewatermark_tenant_photos, watermark_photo

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")


async def startup(ctx: dict[str, Any]) -> None:
    logging.getLogger(__name__).info("Worker iniciado")


async def shutdown(ctx: dict[str, Any]) -> None:
    await dispose_engine()


class WorkerSettings:
    functions = [watermark_photo, rewatermark_tenant_photos]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = redis_settings()
    max_jobs = 10
    job_timeout = 300
