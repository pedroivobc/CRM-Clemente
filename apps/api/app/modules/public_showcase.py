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

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncConnection

from app.core.db import platform_connection, tenant_connection
from app.core.ratelimit import public_lead_rate_limit, public_read_rate_limit
from app.domain.feeds import build_chavesnamao_feed, build_vrsync_feed
from app.domain.mcmv import faixa_por_renda, simular
from app.domain.publishing import public_address, video_embed_url, whatsapp_link
from app.services.storage import BUCKET_BRANDING, BUCKET_PROPERTY_PHOTOS, get_storage

router = APIRouter(tags=["vitrine pública"])

SORTS = {
    "recentes": "p.published_at desc nulls last, p.created_at desc",
    "menor_preco": "coalesce(p.sale_price, p.rent_price) asc nulls last",
    "maior_preco": "coalesce(p.sale_price, p.rent_price) desc nulls last",
    "maior_area": "p.area_util desc nulls last",
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
            await conn.execute(text("select core.resolve_public_key_by_host(:h)"), {"h": host})
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
    mcmv_faixas: list[str] = Field(default_factory=list)


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
    pet_allowed: bool | None
    republic_allowed: bool | None
    has_leisure_area: bool | None
    mcmv_faixa: str | None
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
    video_url: str | None
    # Embed pronto para <iframe> (YouTube/Vimeo), quando video_url reconhecido.
    video_embed: str | None
    # Parcela pré-calculada com a faixa cadastrada e a taxa vigente. Serve
    # de placeholder na página; o visitante refina com renda no simulador.
    mcmv_parcela_estimada: Decimal | None = None
    photos: list[str] = Field(default_factory=list)


class LeadIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    phone: str = Field(min_length=8, max_length=40)
    email: str | None = None
    message: str | None = Field(None, max_length=1000)
    interest: str | None = Field(None, pattern="^(venda|locacao)$")
    property_code: str | None = None
    # Renda declarada — quando o visitante usa o simulador MCMV. Vai para o
    # CRM para o corretor já saber qual faixa buscar.
    renda_familiar_bruta: Decimal | None = None
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
                      array_remove(array_agg(distinct mcmv_faixa), null) as mcmv_faixas,
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
            mcmv_faixas=sorted(facets["mcmv_faixas"] or []),
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
    pet_allowed: bool | None = None,
    republic_allowed: bool | None = None,
    has_leisure_area: bool | None = None,
    mcmv: str | None = Query(None, pattern="^(faixa_1|faixa_2|faixa_3|faixa_4|qualquer)$"),
    renda: Decimal | None = None,
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
        filters.append("coalesce(p.bedrooms, 0) >= :bedrooms")
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
    # Flags de perfil: só filtram quando o visitante pede explicitamente.
    if pet_allowed:
        filters.append("p.pet_allowed is true")
    if republic_allowed:
        filters.append("p.republic_allowed is true")
    if has_leisure_area:
        filters.append("p.has_leisure_area is true")
    # MCMV: "qualquer" mostra os imóveis que estão em alguma faixa; uma faixa
    # específica filtra por ela. Se veio renda mas não faixa, deduz da renda.
    if mcmv == "qualquer":
        filters.append("p.mcmv_faixa is not null")
    elif mcmv:
        filters.append("p.mcmv_faixa = :mcmv")
        params["mcmv"] = mcmv
    elif renda is not None:
        deduzida = faixa_por_renda(renda)
        if deduzida:
            filters.append("p.mcmv_faixa = :mcmv")
            params["mcmv"] = deduzida
        else:
            # Renda fora do teto do programa — mostra vazio, não vale filtrar.
            filters.append("false")

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
    card = _card(row, whatsapp, photos[0] if photos else None)

    # Pré-calcula a parcela cheia (prazo máximo, entrada mínima) só quando o
    # imóvel está numa faixa e tem preço — para aparecer estático no card.
    parcela_est: Decimal | None = None
    if row["mcmv_faixa"] and row["sale_price"] and row["sale_price"] > 0:
        parcela_est = simular(
            valor_imovel=row["sale_price"], faixa=row["mcmv_faixa"]
        ).parcela_estimada

    return PublicDetail(
        **card.model_dump(),
        description=row["description"],
        usage_type=row["usage_type"],
        iptu_amount=row["iptu_amount"],
        year_built=row["year_built"],
        floors=row["floors"],
        unit_floor=row["unit_floor"],
        suites=row["suites"],
        bathrooms=row["bathrooms"],
        rental_warranties=list(row["rental_warranties"] or []),
        tour_url=row["tour_url"],
        video_url=row["video_url"],
        video_embed=video_embed_url(row["video_url"]),
        mcmv_parcela_estimada=parcela_est,
        photos=[storage.public_url(BUCKET_PROPERTY_PHOTOS, p) for p in photos],
    )


class McmvSim(BaseModel):
    faixa: str
    faixa_nome: str
    valor_imovel: Decimal
    entrada: Decimal
    financiado: Decimal
    prazo_meses: int
    taxa_anual: Decimal
    parcela_estimada: Decimal
    renda_minima_sugerida: Decimal
    cabe_na_renda: bool


@router.get(
    "/{key}/properties/{slug}/mcmv",
    response_model=McmvSim,
    dependencies=[Depends(public_read_rate_limit)],
)
async def simulate_public_mcmv(
    db: PublicDb,
    slug: str,
    faixa: str | None = Query(
        None, pattern="^(faixa_1|faixa_2|faixa_3|faixa_4)$"
    ),
    entrada: Decimal | None = None,
    prazo_meses: int | None = Query(None, ge=12, le=420),
    renda: Decimal | None = None,
) -> McmvSim:
    """Simulação de parcela do MCMV para o imóvel publicado.

    Endpoint público — o visitante da vitrine informa a renda e vê se cabe
    no bolso sem precisar falar com corretor. Sem faixa e sem renda,
    usa a faixa do cadastro do imóvel.
    """
    row = (
        (
            await db.execute(
                text(
                    "select sale_price, mcmv_faixa from properties.properties "
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
    if row["sale_price"] is None or row["sale_price"] <= 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Imóvel sem preço de venda — a simulação não se aplica.",
        )
    faixa_escolhida = faixa or row["mcmv_faixa"] or (
        faixa_por_renda(renda) if renda else None
    )
    if faixa_escolhida is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Informe a faixa MCMV ou uma renda familiar bruta.",
        )
    sim = simular(
        valor_imovel=row["sale_price"],
        faixa=faixa_escolhida,  # type: ignore[arg-type]
        entrada=entrada,
        prazo_meses=prazo_meses,
        renda_familiar_bruta=renda,
    )
    return McmvSim(
        faixa=sim.faixa,
        faixa_nome=sim.faixa_nome,
        valor_imovel=sim.valor_imovel,
        entrada=sim.entrada,
        financiado=sim.financiado,
        prazo_meses=sim.prazo_meses,
        taxa_anual=sim.taxa_anual,
        parcela_estimada=sim.parcela_estimada,
        renda_minima_sugerida=sim.renda_minima_sugerida,
        cabe_na_renda=sim.cabe_na_renda,
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

    params = {
        "tid": str(tenant_id),
        "pid": str(pipeline_id),
        "sid": str(stage_id),
        "property_id": str(property_id) if property_id else None,
        "name": payload.name.strip(),
        "phone": payload.phone.strip(),
        "email": (payload.email or "").strip() or None,
        "notes": payload.message,
    }
    if schema == "sales" and payload.renda_familiar_bruta is not None:
        params["renda"] = payload.renda_familiar_bruta
        await db.execute(
            text(
                """
                insert into sales.leads
                    (tenant_id, pipeline_id, stage_id, property_id, name, phone, email,
                     source, notes, renda_familiar_bruta)
                values (:tid, :pid, :sid, :property_id, :name, :phone, :email,
                        'site', :notes, :renda)
                """
            ),
            params,
        )
    else:
        await db.execute(
            text(
                f"""
                insert into {schema}.leads
                    (tenant_id, pipeline_id, stage_id, property_id, name, phone, email,
                     source, notes)
                values (:tid, :pid, :sid, :property_id, :name, :phone, :email,
                        'site', :notes)
                """  # noqa: S608
            ),
            params,
        )
    return {"received": True}


# ── Feeds para portais ───────────────────────────────────────────────────────
@router.get(
    "/{key}/feed/vrsync.xml",
    dependencies=[Depends(public_read_rate_limit)],
)
async def feed_vrsync(db: PublicDb) -> Response:
    """Feed XML no padrão VRSync (Grupo Zap: ZAP, VivaReal, OLX).

    Portal lê 2×/dia. Só entram imóveis com `publish_portals`, respeitando o
    `address_visibility` do proprietário. Se a imobiliária pediu marca d'água
    nos portais, as fotos vêm marcadas; caso contrário, versão limpa.
    """
    tenant, properties, apply_wm = await _feed_payload(db)
    xml = build_vrsync_feed(
        tenant=tenant, properties=properties, apply_watermark_on_portals=apply_wm
    )
    return Response(content=xml, media_type="application/xml; charset=utf-8")


@router.get(
    "/{key}/feed/chavesnamao.xml",
    dependencies=[Depends(public_read_rate_limit)],
)
async def feed_chavesnamao(db: PublicDb) -> Response:
    """Feed XML no padrão Chaves na Mão."""
    tenant, properties, apply_wm = await _feed_payload(db)
    xml = build_chavesnamao_feed(
        tenant=tenant, properties=properties, apply_watermark_on_portals=apply_wm
    )
    return Response(content=xml, media_type="application/xml; charset=utf-8")


async def _feed_payload(db: AsyncConnection) -> tuple[dict, list[dict], bool]:
    branding = (
        (
            await db.execute(
                text("select display_name from core.tenant_branding")
            )
        )
        .mappings()
        .first()
    )
    contact = (
        (
            await db.execute(
                text("select phone, email from core.tenant_public")
            )
        )
        .mappings()
        .first()
    )
    tenant = {
        "display_name": branding["display_name"] if branding else "Imobiliária",
        "phone": contact["phone"] if contact else None,
        "email": contact["email"] if contact else None,
    }

    wm_row = (
        (
            await db.execute(
                text(
                    "select apply_on_portals from properties.watermark_settings limit 1"
                )
            )
        )
        .mappings()
        .first()
    )
    apply_wm = bool(wm_row["apply_on_portals"]) if wm_row else False
    photo_column = "watermarked_path" if apply_wm else "original_path"

    rows = (
        (
            await db.execute(
                text(
                    """
                    select p.*
                    from properties.properties p
                    where p.publish_portals
                    order by p.published_at desc nulls last, p.created_at desc
                    """
                )
            )
        )
        .mappings()
        .all()
    )
    storage = get_storage()

    properties: list[dict] = []
    for row in rows:
        photos = (
            (
                await db.execute(
                    text(
                        f"select {photo_column} as path "  # noqa: S608
                        "from properties.property_photos "
                        f"where property_id = :pid and {photo_column} is not null "  # noqa: S608
                        "order by is_cover desc, sort_order"
                    ),
                    {"pid": str(row["id"])},
                )
            )
            .scalars()
            .all()
        )
        properties.append(
            {
                **dict(row),
                "photos": [
                    storage.public_url(BUCKET_PROPERTY_PHOTOS, p) for p in photos
                ],
            }
        )

    return tenant, properties, apply_wm


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
        bedrooms=row["bedrooms"],
        parking=row["parking_spots"],
        area=row["area_util"],
        pet_allowed=row["pet_allowed"],
        republic_allowed=row["republic_allowed"],
        has_leisure_area=row["has_leisure_area"],
        mcmv_faixa=row["mcmv_faixa"],
        cover_url=storage.public_url(BUCKET_PROPERTY_PHOTOS, cover_path) if cover_path else None,
        whatsapp_url=wa,
    )
