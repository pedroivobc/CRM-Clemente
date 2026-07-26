"""Vitrine pública: a API de leitura que o site da imobiliária e o widget
embutido consomem.

Sem login. O acesso é resolvido por uma **chave publicável** na URL, que
identifica o tenant; a partir daí só se enxerga o que foi publicado
(`publish_site = true`) e o endereço sai no nível que o proprietário permitiu.
É a peça que devolve à imobiliária o controle dos próprios dados — em vez de
ficarem presos no CRM de terceiro.

Montada como sub-aplicação em ``/public`` (ver ``app/main.py``), com CORS
aberto: o widget roda no domínio do cliente, não no nosso.
"""

from __future__ import annotations

from collections.abc import AsyncIterator
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import platform_connection, tenant_connection
from app.core.ratelimit import public_lead_rate_limit, public_read_rate_limit
from app.domain.publishing import public_address, whatsapp_link
from app.services.storage import BUCKET_BRANDING, BUCKET_PROPERTY_PHOTOS, get_storage

router = APIRouter(tags=["vitrine pública"])

SORTS = {
    "recentes": "p.published_at desc nulls last, p.created_at desc",
    "menor_preco": "coalesce(p.sale_price, p.rent_price) asc nulls last",
    "maior_preco": "coalesce(p.sale_price, p.rent_price) desc nulls last",
    "maior_area": "(p.features->>'area_util')::numeric desc nulls last",
}


# ── Resolução do tenant pela chave publicável ────────────────────────────────
async def public_tenant_id(key: str) -> UUID:
    async with platform_connection() as conn:
        tenant_id = (
            await conn.execute(text("select core.resolve_public_tenant(:k)"), {"k": key})
        ).scalar()
    if tenant_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vitrine não encontrada")
    return tenant_id


@router.get("/by-host", response_model=dict, dependencies=[Depends(public_read_rate_limit)])
async def resolve_by_host(host: str) -> dict:
    """Devolve a chave pública a partir do host (subdomínio ou domínio próprio).

    É o primeiro passo do site pronto: ele sobe em `aurora.sistema.com.br` ou
    `www.aurora.com.br`, pergunta aqui de quem é, e daí segue usando a chave
    para todo o resto.
    """
    async with platform_connection() as conn:
        key = (
            await conn.execute(
                text("select core.resolve_public_key_by_host(:h)"), {"h": host}
            )
        ).scalar()
    if key is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vitrine não encontrada para este host")
    return {"public_key": key}


async def public_conn(
    tenant_id: Annotated[UUID, Depends(public_tenant_id)],
) -> AsyncIterator[AsyncConnection]:
    async with tenant_connection(tenant_id) as conn:
        yield conn


TenantId = Annotated[UUID, Depends(public_tenant_id)]
PublicDb = Annotated[AsyncConnection, Depends(public_conn)]


# ── Schemas de saída ─────────────────────────────────────────────────────────
class Facets(BaseModel):
    purposes: list[str]
    kinds: list[str]
    cities: list[str]
    neighborhoods: list[str]
    price_min: Decimal | None
    price_max: Decimal | None


class ShowcaseConfig(BaseModel):
    display_name: str
    color_primary: str | None
    color_secondary: str | None
    color_accent: str | None
    logo_url: str | None
    whatsapp: str | None
    phone: str | None
    email: str | None
    headline: str | None
    lead_capture_enabled: bool
    facets: Facets


class PublicCard(BaseModel):
    code: str
    slug: str | None
    kind: str
    purpose: str
    title: str
    address: dict
    sale_price: Decimal | None
    rent_price: Decimal | None
    condo_fee: Decimal | None
    bedrooms: int | None
    parking: int | None
    area: Decimal | None
    cover_url: str | None
    whatsapp_url: str | None


class PublicDetail(PublicCard):
    description: str | None
    usage_type: str
    iptu_amount: Decimal | None
    year_built: int | None
    floors: int | None
    unit_floor: int | None
    suites: int | None
    bathrooms: int | None
    rental_warranties: list[str]
    tour_url: str | None
    photos: list[str] = Field(default_factory=list)


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=8, max_length=40)
    email: str | None = None
    message: str | None = Field(None, max_length=1000)
    interest: str | None = Field(None, pattern="^(venda|locacao)$")
    property_code: str | None = None
    # Campo-armadilha: humano não vê, bot preenche. Vindo cheio, descartamos.
    website: str | None = None


# ── Configuração da vitrine ──────────────────────────────────────────────────
@router.get(
    "/{key}/showcase",
    response_model=ShowcaseConfig,
    dependencies=[Depends(public_read_rate_limit)],
)
async def showcase(db: PublicDb) -> ShowcaseConfig:
    """Marca, contato e facetas de filtro — o que o widget precisa para montar."""
    storage = get_storage()

    branding = (
        (
            await db.execute(
                text(
                    "select display_name, logo_path, color_primary, color_secondary, "
                    "color_accent from core.tenant_branding"
                )
            )
        )
        .mappings()
        .first()
    )
    contact = (
        (
            await db.execute(
                text(
                    "select whatsapp, phone, email, headline, lead_capture_enabled "
                    "from core.tenant_public"
                )
            )
        )
        .mappings()
        .first()
    )
    facets = (
        (
            await db.execute(
                text(
                    """
                    select
                      array_remove(array_agg(distinct purpose), null) as purposes,
                      array_remove(array_agg(distinct kind), null) as kinds,
                      array_remove(array_agg(distinct address->>'cidade'), null) as cities,
                      array_remove(array_agg(distinct address->>'bairro'), null) as neighborhoods,
                      min(coalesce(sale_price, rent_price)) as price_min,
                      max(coalesce(sale_price, rent_price)) as price_max
                    from properties.properties
                    where publish_site
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    return ShowcaseConfig(
        display_name=branding["display_name"] if branding else "Imobiliária",
        color_primary=branding["color_primary"] if branding else None,
        color_secondary=branding["color_secondary"] if branding else None,
        color_accent=branding["color_accent"] if branding else None,
        logo_url=(
            storage.public_url(BUCKET_BRANDING, branding["logo_path"])
            if branding and branding["logo_path"]
            else None
        ),
        whatsapp=contact["whatsapp"] if contact else None,
        phone=contact["phone"] if contact else None,
        email=contact["email"] if contact else None,
        headline=contact["headline"] if contact else None,
        lead_capture_enabled=bool(contact["lead_capture_enabled"]) if contact else False,
        facets=Facets(
            purposes=sorted(facets["purposes"] or []),
            kinds=sorted(facets["kinds"] or []),
            cities=sorted(facets["cities"] or []),
            neighborhoods=sorted(facets["neighborhoods"] or []),
            price_min=facets["price_min"],
            price_max=facets["price_max"],
        ),
    )


# ── Listagem ─────────────────────────────────────────────────────────────────
class PublicPage(BaseModel):
    items: list[PublicCard]
    total: int
    page: int
    page_size: int


@router.get(
    "/{key}/properties",
    response_model=PublicPage,
    dependencies=[Depends(public_read_rate_limit)],
)
async def list_public_properties(
    db: PublicDb,
    purpose: str | None = None,
    kind: str | None = None,
    city: str | None = None,
    neighborhood: str | None = None,
    bedrooms: int | None = Query(None, ge=0),
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    q: str | None = None,
    sort: str = Query("recentes"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=48),
) -> PublicPage:
    filters = ["p.publish_site"]
    params: dict = {"limit": page_size, "offset": (page - 1) * page_size}

    if purpose in ("venda", "locacao"):
        filters.append("(p.purpose = :purpose or p.purpose = 'ambos')")
        params["purpose"] = purpose
    if kind:
        filters.append("p.kind = :kind")
        params["kind"] = kind
    if city:
        filters.append("p.address->>'cidade' = :city")
        params["city"] = city
    if neighborhood:
        filters.append("p.address->>'bairro' = :neighborhood")
        params["neighborhood"] = neighborhood
    if bedrooms is not None:
        filters.append("coalesce((p.features->>'quartos')::int, 0) >= :bedrooms")
        params["bedrooms"] = bedrooms
    if min_price is not None:
        filters.append("coalesce(p.sale_price, p.rent_price) >= :min_price")
        params["min_price"] = min_price
    if max_price is not None:
        filters.append("coalesce(p.sale_price, p.rent_price) <= :max_price")
        params["max_price"] = max_price
    if q:
        filters.append("(p.title ilike :q or p.code ilike :q or p.address->>'bairro' ilike :q)")
        params["q"] = f"%{q}%"

    where = " and ".join(filters)
    order = SORTS.get(sort, SORTS["recentes"])

    total = (
        await db.execute(
            text(f"select count(*) from properties.properties p where {where}"),  # noqa: S608
            params,
        )
    ).scalar_one()

    rows = (
        (
            await db.execute(
                text(
                    "select p.*, (select ph.watermarked_path from properties.property_photos ph "
                    "where ph.property_id = p.id and ph.is_cover limit 1) as cover_path "
                    f"from properties.properties p where {where} "  # noqa: S608
                    f"order by {order} limit :limit offset :offset"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    whatsapp = await _tenant_whatsapp(db)
    items = [_card(r, whatsapp, r["cover_path"]) for r in rows]
    return PublicPage(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/{key}/properties/{slug}",
    response_model=PublicDetail,
    dependencies=[Depends(public_read_rate_limit)],
)
async def public_property(db: PublicDb, slug: str) -> PublicDetail:
    """Detalhe do imóvel por slug (ou código, para links curtos)."""
    row = (
        (
            await db.execute(
                text(
                    "select * from properties.properties "
                    "where publish_site and (slug = :slug or code = :slug) limit 1"
                ),
                {"slug": slug},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Imóvel não encontrado")

    storage = get_storage()
    photos = (
        (
            await db.execute(
                text(
                    "select watermarked_path from properties.property_photos "
                    "where property_id = :pid and watermarked_path is not null "
                    "order by is_cover desc, sort_order"
                ),
                {"pid": str(row["id"])},
            )
        )
        .scalars()
        .all()
    )

    whatsapp = await _tenant_whatsapp(db)
    features = row["features"] or {}
    card = _card(row, whatsapp, photos[0] if photos else None)
    return PublicDetail(
        **card.model_dump(),
        description=row["description"],
        usage_type=row["usage_type"],
        iptu_amount=row["iptu_amount"],
        year_built=row["year_built"],
        floors=row["floors"],
        unit_floor=row["unit_floor"],
        suites=_int(features.get("suites")),
        bathrooms=_int(features.get("banheiros")),
        rental_warranties=list(row["rental_warranties"] or []),
        tour_url=row["tour_url"],
        photos=[storage.public_url(BUCKET_PROPERTY_PHOTOS, p) for p in photos],
    )


# ── Captura de lead ──────────────────────────────────────────────────────────
@router.post(
    "/{key}/leads",
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(public_lead_rate_limit)],
)
async def capture_lead(payload: LeadIn, db: PublicDb, tenant_id: TenantId) -> dict:
    """Registra o interesse do visitante no funil certo (venda ou locação).

    Silenciosamente aceita e ignora quando a armadilha foi preenchida: um bot
    não deve saber que foi barrado.
    """
    if payload.website:
        return {"received": True}

    enabled = (
        await db.execute(text("select lead_capture_enabled from core.tenant_public"))
    ).scalar()
    if not enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Captação de leads desativada")

    interest = payload.interest or await _infer_interest(db, payload.property_code)
    schema = "sales" if interest == "venda" else "rentals"

    property_id = None
    if payload.property_code:
        property_id = (
            await db.execute(
                text("select id from properties.properties where code = :code and publish_site"),
                {"code": payload.property_code},
            )
        ).scalar()

    pipeline_id = (
        await db.execute(
            text(f"select id from {schema}.pipelines order by created_at limit 1")  # noqa: S608
        )
    ).scalar()
    if pipeline_id is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Funil não configurado")

    stage_id = (
        await db.execute(
            text(
                f"select id from {schema}.pipeline_stages "  # noqa: S608
                "where pipeline_id = :pid order by sort_order limit 1"
            ),
            {"pid": str(pipeline_id)},
        )
    ).scalar_one()

    await db.execute(
        text(
            f"""
            insert into {schema}.leads
                (tenant_id, pipeline_id, stage_id, property_id, name, phone, email,
                 source, notes)
            values (:tid, :pid, :sid, :property_id, :name, :phone, :email, 'site', :notes)
            """  # noqa: S608
        ),
        {
            "tid": str(tenant_id),
            "pid": str(pipeline_id),
            "sid": str(stage_id),
            "property_id": str(property_id) if property_id else None,
            "name": payload.name.strip(),
            "phone": payload.phone.strip(),
            "email": (payload.email or "").strip() or None,
            "notes": payload.message,
        },
    )
    return {"received": True}


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _tenant_whatsapp(db: AsyncConnection) -> str | None:
    return (await db.execute(text("select whatsapp from core.tenant_public"))).scalar()


async def _infer_interest(db: AsyncConnection, code: str | None) -> str:
    """Deduz venda/locação pelo imóvel citado; na dúvida, venda."""
    if code:
        purpose = (
            await db.execute(
                text("select purpose from properties.properties where code = :code"),
                {"code": code},
            )
        ).scalar()
        if purpose == "locacao":
            return "locacao"
    return "venda"


def _card(row, whatsapp: str | None, cover_path: str | None) -> PublicCard:
    storage = get_storage()
    features = row["features"] or {}
    wa = (
        whatsapp_link(phone=whatsapp, code=row["code"], url=f"/imovel/{row['slug'] or row['code']}")
        if whatsapp
        else None
    )
    return PublicCard(
        code=row["code"],
        slug=row["slug"],
        kind=row["kind"],
        purpose=row["purpose"],
        title=row["title"],
        address=public_address(row["address"] or {}, row["address_visibility"]),
        sale_price=row["sale_price"],
        rent_price=row["rent_price"],
        condo_fee=row["condo_fee"],
        bedrooms=_int(features.get("quartos")),
        parking=_int(features.get("vagas")),
        area=_decimal(features.get("area_util")),
        cover_url=storage.public_url(BUCKET_PROPERTY_PHOTOS, cover_path) if cover_path else None,
        whatsapp_url=wa,
    )


def _int(value: object) -> int | None:
    try:
        return int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def _decimal(value: object) -> Decimal | None:
    try:
        return Decimal(str(value))
    except (TypeError, ValueError):
        return None
