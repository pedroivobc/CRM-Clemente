"""Configurações do tenant: identidade visual (white label) e módulos."""

from __future__ import annotations

import re
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import CurrentUserDep, DbDep, require_permission
from app.core.security import CurrentUser
from app.services.storage import BUCKET_BRANDING, get_storage, tenant_path
from app.workers.queue import enqueue

router = APIRouter(prefix="/tenant", tags=["imobiliária"])

HEX_COLOR = re.compile(r"^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
MAX_LOGO_BYTES = 2 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/x-icon"}


class BrandingIn(BaseModel):
    display_name: str = Field(min_length=1, max_length=120)
    color_primary: str
    color_secondary: str
    color_accent: str

    @field_validator("color_primary", "color_secondary", "color_accent")
    @classmethod
    def _hex(cls, v: str) -> str:
        if not HEX_COLOR.match(v):
            raise ValueError("Cor deve estar no formato hexadecimal (#RRGGBB)")
        return v.lower()


class BrandingOut(BrandingIn):
    logo_url: str | None = None
    favicon_url: str | None = None


def _branding_out(row) -> BrandingOut:
    storage = get_storage()
    return BrandingOut(
        display_name=row["display_name"],
        color_primary=row["color_primary"],
        color_secondary=row["color_secondary"],
        color_accent=row["color_accent"],
        logo_url=(
            storage.public_url(BUCKET_BRANDING, row["logo_path"]) if row["logo_path"] else None
        ),
        favicon_url=(
            storage.public_url(BUCKET_BRANDING, row["favicon_path"])
            if row["favicon_path"]
            else None
        ),
    )


@router.get("/branding", response_model=BrandingOut)
async def get_branding(db: DbDep, user: CurrentUserDep) -> BrandingOut:
    row = (
        (
            await db.execute(
                text("select * from core.tenant_branding where tenant_id = :tid"),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Identidade visual não configurada")
    return _branding_out(row)


@router.put("/branding", response_model=BrandingOut)
async def update_branding(
    payload: BrandingIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "edit")),
) -> BrandingOut:
    before = (
        (
            await db.execute(
                text("select * from core.tenant_branding where tenant_id = :tid"),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )

    row = (
        (
            await db.execute(
                text(
                    """
                update core.tenant_branding
                set display_name = :display_name,
                    color_primary = :color_primary,
                    color_secondary = :color_secondary,
                    color_accent = :color_accent,
                    updated_at = now()
                where tenant_id = :tid
                returning *
                """
                ),
                {**payload.model_dump(), "tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )

    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Identidade visual não configurada")

    await record_audit(
        db,
        user,
        "tenant_branding",
        user.tenant_id,
        "update",
        before=dict(before) if before else None,
        after=dict(row),
    )
    return _branding_out(row)


@router.post("/branding/logo", response_model=BrandingOut)
async def upload_logo(
    db: DbDep,
    file: UploadFile = File(...),
    kind: str = "logo",
    user: CurrentUser = Depends(require_permission("configuracoes", "edit")),
) -> BrandingOut:
    """Envia logo ou favicon. Trocar o logo reprocessa a marca d'água das fotos."""
    if kind not in ("logo", "favicon"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo deve ser 'logo' ou 'favicon'")
    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato de imagem não suportado")

    content = await file.read()
    if len(content) > MAX_LOGO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Imagem deve ter no máximo 2 MB")

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() or "png"
    path = tenant_path(user.tenant_id, f"{kind}-{uuid4().hex[:8]}.{ext}")
    await get_storage().upload(BUCKET_BRANDING, path, content, file.content_type)

    column = "logo_path" if kind == "logo" else "favicon_path"
    row = (
        (
            await db.execute(
                text(
                    f"""
                update core.tenant_branding
                set {column} = :path, updated_at = now()
                where tenant_id = :tid
                returning *
                """  # noqa: S608 — `column` vem de uma lista fixa validada acima
                ),
                {"path": path, "tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )

    await record_audit(db, user, "tenant_branding", user.tenant_id, f"upload_{kind}")

    if kind == "logo":
        await enqueue("rewatermark_tenant_photos", str(user.tenant_id))

    return _branding_out(row)


class ModuleOut(BaseModel):
    module: str
    enabled: bool


@router.get("/modules", response_model=list[ModuleOut])
async def list_modules(db: DbDep, user: CurrentUserDep) -> list[ModuleOut]:
    rows = (
        (
            await db.execute(
                text(
                    "select module, enabled from core.tenant_modules "
                    "where tenant_id = :tid order by module"
                ),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .all()
    )
    return [ModuleOut(**r) for r in rows]
