"""Cadastro de imóveis, fotos com marca d'água, mídias e proprietários."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_permission
from app.core.security import CurrentUser
from app.modules.common import Address, Page
from app.services.storage import BUCKET_PROPERTY_PHOTOS, get_storage, tenant_path
from app.workers.queue import enqueue

router = APIRouter(prefix="/properties", tags=["imóveis"])

PROPERTY_STATUSES = {
    "captacao",
    "disponivel",
    "reservado",
    "alugado",
    "vendido",
    "em_manutencao",
    "inativo",
}
MAX_PHOTO_BYTES = 15 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


class OwnerIn(BaseModel):
    client_id: UUID
    ownership_pct: Decimal = Decimal("100")
    is_payee: bool = True


class PropertyIn(BaseModel):
    kind: str
    purpose: str = Field(pattern="^(venda|locacao|ambos)$")
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    address: Address = Field(default_factory=Address)
    registry_number: str | None = None
    iptu_code: str | None = None
    features: dict = Field(default_factory=dict)
    sale_price: Decimal | None = None
    rent_price: Decimal | None = None
    condo_fee: Decimal | None = None
    iptu_amount: Decimal | None = None
    tour_url: str | None = None
    owners: list[OwnerIn] = Field(default_factory=list)


class PropertyUpdate(BaseModel):
    kind: str | None = None
    purpose: str | None = None
    status: str | None = None
    title: str | None = None
    description: str | None = None
    address: Address | None = None
    registry_number: str | None = None
    iptu_code: str | None = None
    features: dict | None = None
    sale_price: Decimal | None = None
    rent_price: Decimal | None = None
    condo_fee: Decimal | None = None
    iptu_amount: Decimal | None = None
    tour_url: str | None = None
    owners: list[OwnerIn] | None = None


class PhotoOut(BaseModel):
    id: UUID
    url: str | None
    watermark_status: str
    is_cover: bool
    sort_order: int


class OwnerOut(BaseModel):
    client_id: UUID
    name: str
    ownership_pct: Decimal
    is_payee: bool


class PropertyOut(BaseModel):
    id: UUID
    code: str
    kind: str
    purpose: str
    status: str
    title: str
    description: str | None
    address: dict
    registry_number: str | None
    iptu_code: str | None
    features: dict
    sale_price: Decimal | None
    rent_price: Decimal | None
    condo_fee: Decimal | None
    iptu_amount: Decimal | None
    tour_url: str | None
    cover_url: str | None = None
    photos: list[PhotoOut] = Field(default_factory=list)
    owners: list[OwnerOut] = Field(default_factory=list)
    created_at: datetime


@router.get("", response_model=Page[PropertyOut])
async def list_properties(
    db: DbDep,
    search: str | None = None,
    status_filter: str | None = Query(None, alias="status"),
    purpose: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: CurrentUser = Depends(require_permission("imoveis", "view")),
) -> Page[PropertyOut]:
    filters, params = [], {"limit": page_size, "offset": (page - 1) * page_size}
    if search:
        filters.append(
            "(p.title ilike :search or p.code ilike :search "
            "or p.address->>'bairro' ilike :search "
            "or p.address->>'cidade' ilike :search)"
        )
        params["search"] = f"%{search}%"
    if status_filter:
        filters.append("p.status = :status")
        params["status"] = status_filter
    if purpose:
        filters.append("(p.purpose = :purpose or p.purpose = 'ambos')")
        params["purpose"] = purpose
    where = f"where {' and '.join(filters)}" if filters else ""

    total = (
        await db.execute(text(f"select count(*) from properties.properties p {where}"), params)  # noqa: S608
    ).scalar_one()

    rows = (
        (
            await db.execute(
                text(
                    f"""
                select p.* from properties.properties p
                {where}
                order by p.created_at desc
                limit :limit offset :offset
                """  # noqa: S608 — `where` montado a partir de literais fixos
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    items = [await _to_property_out(db, r, with_details=False) for r in rows]
    return Page[PropertyOut](items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
async def create_property(
    payload: PropertyIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "create")),
) -> PropertyOut:
    code = (
        await db.execute(
            text("select properties.next_property_code(:tid)"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    property_id = (
        await db.execute(
            text(
                """
                insert into properties.properties
                    (tenant_id, code, kind, purpose, title, description, address,
                     registry_number, iptu_code, features, sale_price, rent_price,
                     condo_fee, iptu_amount, tour_url)
                values
                    (:tid, :code, :kind, :purpose, :title, :description,
                     cast(:address as jsonb), :registry_number, :iptu_code,
                     cast(:features as jsonb), :sale_price, :rent_price,
                     :condo_fee, :iptu_amount, :tour_url)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "kind": payload.kind,
                "purpose": payload.purpose,
                "title": payload.title,
                "description": payload.description,
                "address": json.dumps(payload.address.model_dump(exclude_none=True)),
                "registry_number": payload.registry_number,
                "iptu_code": payload.iptu_code,
                "features": json.dumps(payload.features),
                "sale_price": payload.sale_price,
                "rent_price": payload.rent_price,
                "condo_fee": payload.condo_fee,
                "iptu_amount": payload.iptu_amount,
                "tour_url": payload.tour_url,
            },
        )
    ).scalar_one()

    await _set_owners(db, user.tenant_id, property_id, payload.owners)
    await record_audit(db, user, "property", property_id, "create")
    return await _get_property(db, property_id)


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(
    property_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "view")),
) -> PropertyOut:
    return await _get_property(db, property_id)


@router.patch("/{property_id}", response_model=PropertyOut)
async def update_property(
    property_id: UUID,
    payload: PropertyUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> PropertyOut:
    before = await _get_property(db, property_id)

    fields = payload.model_dump(exclude_unset=True, exclude={"owners", "address", "features"})
    if "status" in fields and fields["status"] not in PROPERTY_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Situação de imóvel inválida")
    if payload.address is not None:
        fields["address"] = json.dumps(payload.address.model_dump(exclude_none=True))
    if payload.features is not None:
        fields["features"] = json.dumps(payload.features)

    if fields:
        sets = ", ".join(
            f"{k} = cast(:{k} as jsonb)" if k in ("address", "features") else f"{k} = :{k}"
            for k in fields
        )
        await db.execute(
            text(f"update properties.properties set {sets} where id = :pid"),  # noqa: S608
            {**fields, "pid": str(property_id)},
        )

    if payload.owners is not None:
        await _set_owners(db, user.tenant_id, property_id, payload.owners)

    after = await _get_property(db, property_id)
    await record_audit(
        db,
        user,
        "property",
        property_id,
        "update",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
    )
    return after


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_property(
    property_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "delete")),
) -> None:
    before = await _get_property(db, property_id)
    await db.execute(
        text("delete from properties.properties where id = :pid"), {"pid": str(property_id)}
    )
    await record_audit(
        db, user, "property", property_id, "delete", before=before.model_dump(mode="json")
    )


# ── Fotos ────────────────────────────────────────────────────────────────────
@router.post("/{property_id}/photos", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    property_id: UUID,
    db: DbDep,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> PhotoOut:
    """Guarda o original em bucket privado e enfileira a marca d'água.

    A versão pública (marcada com o logo do tenant) é produzida pelo worker;
    até ficar pronta, a foto aparece com situação ``pending``.
    """
    await _get_property(db, property_id)

    if file.content_type not in ALLOWED_PHOTO_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Envie imagens JPEG, PNG ou WebP")
    content = await file.read()
    if len(content) > MAX_PHOTO_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Foto deve ter no máximo 15 MB")

    ext = (file.filename or "foto.jpg").rsplit(".", 1)[-1].lower()
    path = tenant_path(user.tenant_id, str(property_id), "orig", f"{uuid4().hex}.{ext}")
    await get_storage().upload(BUCKET_PROPERTY_PHOTOS, path, content, file.content_type)

    next_order = (
        await db.execute(
            text(
                "select coalesce(max(sort_order), -1) + 1 from properties.property_photos "
                "where property_id = :pid"
            ),
            {"pid": str(property_id)},
        )
    ).scalar_one()
    has_cover = (
        await db.execute(
            text(
                "select 1 from properties.property_photos " "where property_id = :pid and is_cover"
            ),
            {"pid": str(property_id)},
        )
    ).first()

    row = (
        (
            await db.execute(
                text(
                    """
                insert into properties.property_photos
                    (tenant_id, property_id, original_path, is_cover, sort_order)
                values (:tid, :pid, :path, :is_cover, :sort_order)
                returning id, watermarked_path, watermark_status, is_cover, sort_order
                """
                ),
                {
                    "tid": str(user.tenant_id),
                    "pid": str(property_id),
                    "path": path,
                    "is_cover": not has_cover,
                    "sort_order": next_order,
                },
            )
        )
        .mappings()
        .first()
    )

    await enqueue("watermark_photo", str(user.tenant_id), str(row["id"]))
    return _photo_out(row)


@router.get("/{property_id}/photos", response_model=list[PhotoOut])
async def list_photos(
    property_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "view")),
) -> list[PhotoOut]:
    rows = (
        (
            await db.execute(
                text(
                    "select id, watermarked_path, watermark_status, is_cover, sort_order "
                    "from properties.property_photos where property_id = :pid order by sort_order"
                ),
                {"pid": str(property_id)},
            )
        )
        .mappings()
        .all()
    )
    return [_photo_out(r) for r in rows]


@router.put("/{property_id}/photos/{photo_id}/cover", response_model=list[PhotoOut])
async def set_cover(
    property_id: UUID,
    photo_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> list[PhotoOut]:
    await db.execute(
        text("update properties.property_photos set is_cover = false where property_id = :pid"),
        {"pid": str(property_id)},
    )
    updated = (
        await db.execute(
            text(
                "update properties.property_photos set is_cover = true "
                "where id = :photo_id and property_id = :pid returning id"
            ),
            {"photo_id": str(photo_id), "pid": str(property_id)},
        )
    ).first()
    if updated is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada")
    return await list_photos(property_id, db, user)


@router.delete(
    "/{property_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
async def delete_photo(
    property_id: UUID,
    photo_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> None:
    row = (
        (
            await db.execute(
                text(
                    "delete from properties.property_photos "
                    "where id = :photo_id and property_id = :pid "
                    "returning original_path, watermarked_path"
                ),
                {"photo_id": str(photo_id), "pid": str(property_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada")

    storage = get_storage()
    for path in (row["original_path"], row["watermarked_path"]):
        if path:
            await storage.delete(BUCKET_PROPERTY_PHOTOS, path)


# ── Helpers ──────────────────────────────────────────────────────────────────
def _photo_out(row) -> PhotoOut:
    storage = get_storage()
    return PhotoOut(
        id=row["id"],
        url=(
            storage.public_url(BUCKET_PROPERTY_PHOTOS, row["watermarked_path"])
            if row["watermarked_path"]
            else None
        ),
        watermark_status=row["watermark_status"],
        is_cover=row["is_cover"],
        sort_order=row["sort_order"],
    )


async def _set_owners(db, tenant_id: UUID, property_id: UUID, owners: list[OwnerIn]) -> None:
    await db.execute(
        text("delete from properties.property_owners where property_id = :pid"),
        {"pid": str(property_id)},
    )
    for owner in owners:
        exists = (
            await db.execute(
                text("select 1 from crm.clients where id = :cid"),
                {"cid": str(owner.client_id)},
            )
        ).first()
        if not exists:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Proprietário não encontrado")
        await db.execute(
            text(
                """
                insert into properties.property_owners
                    (tenant_id, property_id, client_id, ownership_pct, is_payee)
                values (:tid, :pid, :cid, :pct, :payee)
                """
            ),
            {
                "tid": str(tenant_id),
                "pid": str(property_id),
                "cid": str(owner.client_id),
                "pct": owner.ownership_pct,
                "payee": owner.is_payee,
            },
        )
        # Garante o papel de proprietário no cadastro do cliente.
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, 'proprietario') on conflict do nothing"
            ),
            {"tid": str(tenant_id), "cid": str(owner.client_id)},
        )


async def _to_property_out(db, row, *, with_details: bool = True) -> PropertyOut:
    storage = get_storage()
    photos: list[PhotoOut] = []
    owners: list[OwnerOut] = []

    if with_details:
        prows = (
            (
                await db.execute(
                    text(
                        "select id, watermarked_path, watermark_status, is_cover, sort_order "
                        "from properties.property_photos "
                        "where property_id = :pid order by sort_order"
                    ),
                    {"pid": str(row["id"])},
                )
            )
            .mappings()
            .all()
        )
        photos = [_photo_out(p) for p in prows]

        orows = (
            (
                await db.execute(
                    text(
                        """
                    select o.client_id, c.name, o.ownership_pct, o.is_payee
                    from properties.property_owners o
                    join crm.clients c on c.id = o.client_id
                    where o.property_id = :pid
                    """
                    ),
                    {"pid": str(row["id"])},
                )
            )
            .mappings()
            .all()
        )
        owners = [OwnerOut(**o) for o in orows]

    cover = (
        await db.execute(
            text(
                "select watermarked_path from properties.property_photos "
                "where property_id = :pid and is_cover limit 1"
            ),
            {"pid": str(row["id"])},
        )
    ).scalar()

    return PropertyOut(
        id=row["id"],
        code=row["code"],
        kind=row["kind"],
        purpose=row["purpose"],
        status=row["status"],
        title=row["title"],
        description=row["description"],
        address=row["address"] or {},
        registry_number=row["registry_number"],
        iptu_code=row["iptu_code"],
        features=row["features"] or {},
        sale_price=row["sale_price"],
        rent_price=row["rent_price"],
        condo_fee=row["condo_fee"],
        iptu_amount=row["iptu_amount"],
        tour_url=row["tour_url"],
        cover_url=storage.public_url(BUCKET_PROPERTY_PHOTOS, cover) if cover else None,
        photos=photos,
        owners=owners,
        created_at=row["created_at"],
    )


async def _get_property(db, property_id: UUID) -> PropertyOut:
    row = (
        (
            await db.execute(
                text("select * from properties.properties where id = :pid"),
                {"pid": str(property_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imóvel não encontrado")
    return await _to_property_out(db, row)
