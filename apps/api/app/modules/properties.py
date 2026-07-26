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
from app.domain.publishing import (
    RENTAL_WARRANTIES,
    build_slug,
    public_address,
    publication_blockers,
)
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
# Vocabulário de tipos alinhado ao constraint da migration 0010; o mapa para o
# PropertyType do VRSync vive em app.domain.publishing.
PROPERTY_KINDS = (
    "casa",
    "casa_geminada",
    "casa_condominio",
    "sobrado",
    "apartamento",
    "cobertura",
    "kitnet",
    "studio",
    "flat",
    "garden",
    "loft",
    "sala_comercial",
    "loja",
    "ponto_comercial",
    "galpao",
    "andar_corporativo",
    "predio",
    "hotel_pousada",
    "terreno",
    "lote_condominio",
    "sitio_chacara",
    "fazenda",
    "vaga_garagem",
    "outro",
)
ADDRESS_VISIBILITIES = {"completo", "rua", "bairro"}
MAX_PHOTO_BYTES = 15 * 1024 * 1024
ALLOWED_PHOTO_TYPES = {"image/jpeg", "image/png", "image/webp"}


class OwnerIn(BaseModel):
    client_id: UUID
    ownership_pct: Decimal = Decimal("100")
    is_payee: bool = True


class PropertyIn(BaseModel):
    kind: str
    purpose: str = Field(pattern="^(venda|locacao|ambos)$")
    usage_type: str = Field("residencial", pattern="^(residencial|comercial|ambos)$")
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    address: Address = Field(default_factory=Address)
    address_visibility: str = Field("bairro", pattern="^(completo|rua|bairro)$")
    registry_number: str | None = None
    iptu_code: str | None = None
    features: dict = Field(default_factory=dict)
    year_built: int | None = None
    floors: int | None = None
    unit_floor: int | None = None
    lot_area: Decimal | None = None
    # Campos tipados que antes viviam em features (jsonb).
    area_util: Decimal | None = None
    bedrooms: int | None = None
    suites: int | None = None
    bathrooms: int | None = None
    parking_spots: int | None = None
    # Perfis do imóvel (locação sobretudo). None = "não informado".
    pet_allowed: bool | None = None
    republic_allowed: bool | None = None
    has_leisure_area: bool | None = None
    rental_warranties: list[str] = Field(default_factory=list)
    sale_price: Decimal | None = None
    rent_price: Decimal | None = None
    condo_fee: Decimal | None = None
    iptu_amount: Decimal | None = None
    tour_url: str | None = None
    is_exclusive: bool = False
    owners: list[OwnerIn] = Field(default_factory=list)


class PropertyUpdate(BaseModel):
    kind: str | None = None
    purpose: str | None = None
    usage_type: str | None = Field(None, pattern="^(residencial|comercial|ambos)$")
    status: str | None = None
    title: str | None = None
    description: str | None = None
    address: Address | None = None
    address_visibility: str | None = Field(None, pattern="^(completo|rua|bairro)$")
    registry_number: str | None = None
    iptu_code: str | None = None
    features: dict | None = None
    year_built: int | None = None
    floors: int | None = None
    unit_floor: int | None = None
    lot_area: Decimal | None = None
    area_util: Decimal | None = None
    bedrooms: int | None = None
    suites: int | None = None
    bathrooms: int | None = None
    parking_spots: int | None = None
    pet_allowed: bool | None = None
    republic_allowed: bool | None = None
    has_leisure_area: bool | None = None
    rental_warranties: list[str] | None = None
    sale_price: Decimal | None = None
    rent_price: Decimal | None = None
    condo_fee: Decimal | None = None
    iptu_amount: Decimal | None = None
    tour_url: str | None = None
    is_exclusive: bool | None = None
    owners: list[OwnerIn] | None = None


class PublishIn(BaseModel):
    publish_site: bool
    publish_portals: bool


class WatermarkSettings(BaseModel):
    enabled: bool = True
    position: str = Field(
        "bottom-right", pattern="^(bottom-right|bottom-left|top-right|top-left|center)$"
    )
    opacity: Decimal = Field(Decimal("0.65"), ge=0, le=1)
    apply_on_site: bool = True
    apply_on_portals: bool = False


class ShowcaseSettings(BaseModel):
    # public_key é somente-leitura para o app (troca por rota própria); os
    # demais campos a imobiliária edita.
    public_key: str | None = None
    whatsapp: str | None = None
    phone: str | None = None
    email: str | None = None
    headline: str | None = None
    lead_capture_enabled: bool = True


class ShowcaseSettingsIn(BaseModel):
    whatsapp: str | None = None
    phone: str | None = None
    email: str | None = None
    headline: str | None = None
    lead_capture_enabled: bool = True


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
    slug: str | None
    kind: str
    purpose: str
    usage_type: str
    status: str
    title: str
    description: str | None
    address: dict
    address_visibility: str
    # Como o endereço aparece na vitrine, dado o nível escolhido — para a
    # imobiliária conferir antes de publicar.
    public_address: dict
    registry_number: str | None
    iptu_code: str | None
    features: dict
    year_built: int | None
    floors: int | None
    unit_floor: int | None
    lot_area: Decimal | None
    area_util: Decimal | None
    bedrooms: int | None
    suites: int | None
    bathrooms: int | None
    parking_spots: int | None
    pet_allowed: bool | None
    republic_allowed: bool | None
    has_leisure_area: bool | None
    rental_warranties: list[str]
    sale_price: Decimal | None
    rent_price: Decimal | None
    condo_fee: Decimal | None
    iptu_amount: Decimal | None
    tour_url: str | None
    is_exclusive: bool
    publish_site: bool
    publish_portals: bool
    published_at: datetime | None
    # Calculados na leitura da ficha (não em listagem, por custo).
    publish_blockers: list[str] = Field(default_factory=list)
    is_publishable: bool = True
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
    if payload.kind not in PROPERTY_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de imóvel inválido")
    _validate_warranties(payload.rental_warranties)

    code = (
        await db.execute(
            text("select properties.next_property_code(:tid)"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    address = payload.address.model_dump(exclude_none=True)
    slug = build_slug(
        kind=payload.kind,
        purpose=payload.purpose,
        code=code,
        bedrooms=payload.bedrooms,
        neighborhood=address.get("bairro"),
        city=address.get("cidade"),
        uf=address.get("uf"),
    )

    property_id = (
        await db.execute(
            text(
                """
                insert into properties.properties
                    (tenant_id, code, slug, kind, purpose, usage_type, title, description,
                     address, address_visibility, registry_number, iptu_code, features,
                     year_built, floors, unit_floor, lot_area, area_util, bedrooms, suites,
                     bathrooms, parking_spots, pet_allowed, republic_allowed, has_leisure_area,
                     rental_warranties, sale_price, rent_price, condo_fee, iptu_amount,
                     tour_url, is_exclusive)
                values
                    (:tid, :code, :slug, :kind, :purpose, :usage_type, :title, :description,
                     cast(:address as jsonb), :address_visibility, :registry_number, :iptu_code,
                     cast(:features as jsonb), :year_built, :floors, :unit_floor, :lot_area,
                     :area_util, :bedrooms, :suites, :bathrooms, :parking_spots,
                     :pet_allowed, :republic_allowed, :has_leisure_area,
                     :rental_warranties, :sale_price, :rent_price, :condo_fee, :iptu_amount,
                     :tour_url, :is_exclusive)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "slug": slug or None,
                "kind": payload.kind,
                "purpose": payload.purpose,
                "usage_type": payload.usage_type,
                "title": payload.title,
                "description": payload.description,
                "address": json.dumps(address),
                "address_visibility": payload.address_visibility,
                "registry_number": payload.registry_number,
                "iptu_code": payload.iptu_code,
                "features": json.dumps(payload.features),
                "year_built": payload.year_built,
                "floors": payload.floors,
                "unit_floor": payload.unit_floor,
                "lot_area": payload.lot_area,
                "area_util": payload.area_util,
                "bedrooms": payload.bedrooms,
                "suites": payload.suites,
                "bathrooms": payload.bathrooms,
                "parking_spots": payload.parking_spots,
                "pet_allowed": payload.pet_allowed,
                "republic_allowed": payload.republic_allowed,
                "has_leisure_area": payload.has_leisure_area,
                "rental_warranties": payload.rental_warranties,
                "sale_price": payload.sale_price,
                "rent_price": payload.rent_price,
                "condo_fee": payload.condo_fee,
                "iptu_amount": payload.iptu_amount,
                "tour_url": payload.tour_url,
                "is_exclusive": payload.is_exclusive,
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
    if "kind" in fields and fields["kind"] not in PROPERTY_KINDS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tipo de imóvel inválido")
    if payload.rental_warranties is not None:
        _validate_warranties(payload.rental_warranties)
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

    # O slug carrega tipo, bairro e cidade; se algum deles mudou, ele acompanha.
    if fields.keys() & {"kind", "purpose", "address", "bedrooms"}:
        await _refresh_slug(db, property_id)

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


@router.post("/{property_id}/publish", response_model=PropertyOut)
async def set_publication(
    property_id: UUID,
    payload: PublishIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> PropertyOut:
    """Liga ou desliga a publicação no site e nos portais.

    Publicar exige o imóvel pronto: se faltar foto, preço, título, descrição ou
    localização, a chamada é recusada com a lista do que falta. Despublicar
    (as duas flags falsas) nunca é barrado — é sempre possível tirar do ar.
    """
    current = await _get_property(db, property_id)

    if payload.publish_site or payload.publish_portals:
        blockers = _blockers_for(current, await _photo_count(db, property_id))
        if blockers:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                "Não é possível publicar: " + " ".join(blockers),
            )

    going_live = (payload.publish_site or payload.publish_portals) and not (
        current.publish_site or current.publish_portals
    )
    await db.execute(
        text(
            "update properties.properties set publish_site = :site, publish_portals = :portals, "
            "published_at = case when :first_time then now() else published_at end "
            "where id = :pid"
        ),
        {
            "site": payload.publish_site,
            "portals": payload.publish_portals,
            "first_time": going_live,
            "pid": str(property_id),
        },
    )
    await record_audit(db, user, "property", property_id, "update")
    return await _get_property(db, property_id)


@router.get("/settings/watermark", response_model=WatermarkSettings)
async def get_watermark_settings(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "view")),
) -> WatermarkSettings:
    row = (
        (
            await db.execute(
                text(
                    "select enabled, position, opacity, apply_on_site, apply_on_portals "
                    "from properties.watermark_settings where tenant_id = :tid"
                ),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )
    return WatermarkSettings(**row) if row else WatermarkSettings()


@router.put("/settings/watermark", response_model=WatermarkSettings)
async def update_watermark_settings(
    payload: WatermarkSettings,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> WatermarkSettings:
    await db.execute(
        text(
            """
            insert into properties.watermark_settings
                (tenant_id, enabled, position, opacity, apply_on_site, apply_on_portals)
            values (:tid, :enabled, :position, :opacity, :apply_on_site, :apply_on_portals)
            on conflict (tenant_id) do update set
                enabled = excluded.enabled, position = excluded.position,
                opacity = excluded.opacity, apply_on_site = excluded.apply_on_site,
                apply_on_portals = excluded.apply_on_portals, updated_at = now()
            """
        ),
        {
            "tid": str(user.tenant_id),
            "enabled": payload.enabled,
            "position": payload.position,
            "opacity": payload.opacity,
            "apply_on_site": payload.apply_on_site,
            "apply_on_portals": payload.apply_on_portals,
        },
    )
    await record_audit(db, user, "tenant_branding", user.tenant_id, "update")
    return payload


@router.get("/settings/showcase", response_model=ShowcaseSettings)
async def get_showcase_settings(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "view")),
) -> ShowcaseSettings:
    row = (
        (
            await db.execute(
                text(
                    "select public_key, whatsapp, phone, email, headline, lead_capture_enabled "
                    "from core.tenant_public"
                )
            )
        )
        .mappings()
        .first()
    )
    return ShowcaseSettings(**row) if row else ShowcaseSettings()


@router.put("/settings/showcase", response_model=ShowcaseSettings)
async def update_showcase_settings(
    payload: ShowcaseSettingsIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("imoveis", "edit")),
) -> ShowcaseSettings:
    """Contato e chamada da vitrine. A chave publicável é gerada no
    provisionamento e só aparece aqui — não é editável por esta rota."""
    row = (
        (
            await db.execute(
                text(
                    """
                    update core.tenant_public set
                        whatsapp = :whatsapp, phone = :phone, email = :email,
                        headline = :headline, lead_capture_enabled = :lead, updated_at = now()
                    where tenant_id = :tid
                    returning public_key, whatsapp, phone, email, headline, lead_capture_enabled
                    """
                ),
                {
                    "tid": str(user.tenant_id),
                    "whatsapp": payload.whatsapp,
                    "phone": payload.phone,
                    "email": payload.email,
                    "headline": payload.headline,
                    "lead": payload.lead_capture_enabled,
                },
            )
        )
        .mappings()
        .first()
    )
    await record_audit(db, user, "tenant_branding", user.tenant_id, "update")
    return ShowcaseSettings(**row)


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

    blockers: list[str] = []
    if with_details:
        blockers = _blockers_from_row(row, len(photos))

    return PropertyOut(
        id=row["id"],
        code=row["code"],
        slug=row["slug"],
        kind=row["kind"],
        purpose=row["purpose"],
        usage_type=row["usage_type"],
        status=row["status"],
        title=row["title"],
        description=row["description"],
        address=row["address"] or {},
        address_visibility=row["address_visibility"],
        public_address=public_address(row["address"] or {}, row["address_visibility"]),
        registry_number=row["registry_number"],
        iptu_code=row["iptu_code"],
        features=row["features"] or {},
        year_built=row["year_built"],
        floors=row["floors"],
        unit_floor=row["unit_floor"],
        lot_area=row["lot_area"],
        area_util=row["area_util"],
        bedrooms=row["bedrooms"],
        suites=row["suites"],
        bathrooms=row["bathrooms"],
        parking_spots=row["parking_spots"],
        pet_allowed=row["pet_allowed"],
        republic_allowed=row["republic_allowed"],
        has_leisure_area=row["has_leisure_area"],
        rental_warranties=list(row["rental_warranties"] or []),
        sale_price=row["sale_price"],
        rent_price=row["rent_price"],
        condo_fee=row["condo_fee"],
        iptu_amount=row["iptu_amount"],
        tour_url=row["tour_url"],
        is_exclusive=row["is_exclusive"],
        publish_site=row["publish_site"],
        publish_portals=row["publish_portals"],
        published_at=row["published_at"],
        publish_blockers=blockers,
        is_publishable=not blockers,
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


def _validate_warranties(warranties: list[str]) -> None:
    invalid = set(warranties) - set(RENTAL_WARRANTIES)
    if invalid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Garantia de locação inválida: {', '.join(sorted(invalid))}",
        )


def _int_or_none(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _blockers_from_row(row, photo_count: int) -> list[str]:
    """Impedimentos de publicação a partir da linha crua do banco."""
    return publication_blockers(
        purpose=row["purpose"],
        status=row["status"],
        title=row["title"],
        description=row["description"],
        sale_price=row["sale_price"],
        rent_price=row["rent_price"],
        photo_count=photo_count,
        address=row["address"] or {},
        kind=row["kind"],
        area_util=row["area_util"],
        bedrooms=row["bedrooms"],
        iptu_amount=row["iptu_amount"],
    )


def _blockers_for(prop: PropertyOut, photo_count: int) -> list[str]:
    return publication_blockers(
        purpose=prop.purpose,
        status=prop.status,
        title=prop.title,
        description=prop.description,
        sale_price=prop.sale_price,
        rent_price=prop.rent_price,
        photo_count=photo_count,
        address=prop.address,
        kind=prop.kind,
        area_util=prop.area_util,
        bedrooms=prop.bedrooms,
        iptu_amount=prop.iptu_amount,
    )


async def _photo_count(db, property_id: UUID) -> int:
    return (
        await db.execute(
            text("select count(*) from properties.property_photos where property_id = :pid"),
            {"pid": str(property_id)},
        )
    ).scalar_one()


async def _refresh_slug(db, property_id: UUID) -> None:
    """Recalcula o slug a partir do estado atual do imóvel."""
    row = (
        (
            await db.execute(
                text(
                    "select code, kind, purpose, bedrooms, address "
                    "from properties.properties where id = :pid"
                ),
                {"pid": str(property_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        return
    address = row["address"] or {}
    slug = build_slug(
        kind=row["kind"],
        purpose=row["purpose"],
        code=row["code"],
        bedrooms=row["bedrooms"],
        neighborhood=address.get("bairro"),
        city=address.get("cidade"),
        uf=address.get("uf"),
    )
    await db.execute(
        text("update properties.properties set slug = :slug where id = :pid"),
        {"slug": slug or None, "pid": str(property_id)},
    )
