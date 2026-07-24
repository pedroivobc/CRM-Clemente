"""Tarefas assíncronas do worker."""

from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from sqlalchemy import text

from app.core.db import tenant_connection
from app.services.storage import BUCKET_BRANDING, BUCKET_PROPERTY_PHOTOS, get_storage
from app.services.watermark import apply_watermark

logger = logging.getLogger(__name__)


async def watermark_photo(ctx: dict[str, Any], tenant_id: str, photo_id: str) -> str:
    """Aplica o logo do tenant sobre a foto original e salva a versão pública.

    O original permanece intocado em bucket privado; a versão marcada é a
    única servida na vitrine, nos portais e na API pública.
    """
    storage = get_storage()

    async with tenant_connection(UUID(tenant_id)) as conn:
        row = (
            await conn.execute(
                text(
                    """
                    select p.original_path, b.logo_path
                    from properties.property_photos p
                    left join core.tenant_branding b on b.tenant_id = p.tenant_id
                    where p.id = :pid
                    """
                ),
                {"pid": photo_id},
            )
        ).first()

    if row is None:
        logger.warning("Foto %s não encontrada (tenant %s)", photo_id, tenant_id)
        return "not_found"

    original_path, logo_path = row

    try:
        original = await storage.download(BUCKET_PROPERTY_PHOTOS, original_path)
        logo = None
        if logo_path:
            try:
                logo = await storage.download(BUCKET_BRANDING, logo_path)
            except Exception:
                logger.warning("Logo do tenant %s indisponível; seguindo sem marca", tenant_id)

        marked = apply_watermark(original, logo)
        marked_path = _watermarked_path(original_path)
        await storage.upload(BUCKET_PROPERTY_PHOTOS, marked_path, marked, "image/jpeg")
        status, stored_path = "done", marked_path
    except Exception:
        logger.exception("Falha ao marcar foto %s", photo_id)
        status, stored_path = "error", None

    async with tenant_connection(UUID(tenant_id)) as conn:
        await conn.execute(
            text(
                """
                update properties.property_photos
                set watermarked_path = :path, watermark_status = :status
                where id = :pid
                """
            ),
            {"path": stored_path, "status": status, "pid": photo_id},
        )

    return status


def _watermarked_path(original_path: str) -> str:
    """``<tenant>/<imovel>/orig/<arquivo>`` → ``<tenant>/<imovel>/wm/<arquivo>.jpg``."""
    head, _, filename = original_path.rpartition("/")
    stem = filename.rsplit(".", 1)[0]
    head = head[: -len("/orig")] if head.endswith("/orig") else head
    return f"{head}/wm/{stem}.jpg" if head else f"wm/{stem}.jpg"


async def rewatermark_tenant_photos(ctx: dict[str, Any], tenant_id: str) -> int:
    """Reprocessa todas as fotos do tenant — usado quando o logo muda."""
    async with tenant_connection(UUID(tenant_id)) as conn:
        rows = (
            (
                await conn.execute(
                    text("select id from properties.property_photos where tenant_id = :tid"),
                    {"tid": tenant_id},
                )
            )
            .scalars()
            .all()
        )

    for photo_id in rows:
        await watermark_photo(ctx, tenant_id, str(photo_id))
    return len(rows)
