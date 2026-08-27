"""Vistorias: checklist por cômodo, medidores, comparativo e laudo."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.domain.operations import ItemState, compare_inspections, inspection_progress
from app.services.inspection_report import render_inspection_report
from app.services.storage import BUCKET_DOCUMENTS, BUCKET_REPORTS, get_storage, tenant_path

router = APIRouter(
    prefix="/inspections",
    tags=["vistorias"],
    dependencies=[Depends(require_module("module_rentals"))],
)

# Roteiro padrão de uma vistoria residencial, para o vistoriador não começar
# de uma tela em branco.
DEFAULT_SCRIPT: dict[str, list[str]] = {
    "Sala": ["Piso", "Paredes e pintura", "Teto", "Janelas", "Tomadas e interruptores"],
    "Cozinha": ["Piso", "Paredes e pintura", "Armários", "Bancada", "Pia e torneira", "Gás"],
    "Quarto": ["Piso", "Paredes e pintura", "Porta", "Janela", "Armário"],
    "Banheiro": ["Piso", "Azulejos", "Louças", "Box", "Chuveiro", "Registros"],
    "Área de serviço": ["Piso", "Tanque", "Ponto de máquina", "Ralo"],
}


class InspectionIn(BaseModel):
    property_id: UUID
    kind: str = Field(pattern="^(entrada|saida|periodica)$")
    contract_id: UUID | None = None
    inspector_user_id: UUID | None = None
    scheduled_at: datetime | None = None
    use_default_script: bool = True


class RoomIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    sort_order: int = 0


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    sort_order: int = 0


class ItemUpdate(BaseModel):
    condition: str | None = Field(None, pattern="^(otimo|bom|regular|ruim)$")
    notes: str | None = None


class MeterIn(BaseModel):
    meter: str = Field(pattern="^(agua|luz|gas)$")
    reading: str


class IssueUpdate(BaseModel):
    responsibility: str | None = Field(None, pattern="^(locatario|proprietario|indefinido)$")
    estimated_cost: Decimal | None = None
    description: str | None = None
    resolved: bool | None = None


class PhotoOut(BaseModel):
    id: UUID
    url: str
    caption: str | None
    item_id: UUID | None


class ItemOut(BaseModel):
    id: UUID
    name: str
    condition: str | None
    notes: str | None
    sort_order: int
    photos: list[PhotoOut] = Field(default_factory=list)


class RoomOut(BaseModel):
    id: UUID
    name: str
    sort_order: int
    notes: str | None
    items: list[ItemOut] = Field(default_factory=list)


class IssueOut(BaseModel):
    id: UUID
    room_name: str | None
    description: str
    responsibility: str
    estimated_cost: Decimal | None
    entry_condition: str | None
    exit_condition: str | None
    resolved: bool


class MeterOut(BaseModel):
    id: UUID
    meter: str
    reading: str


class InspectionOut(BaseModel):
    id: UUID
    property_id: UUID
    property_code: str
    property_title: str
    contract_id: UUID | None
    kind: str
    inspector_user_id: UUID | None
    inspector_name: str | None
    scheduled_at: datetime | None
    performed_at: datetime | None
    status: str
    general_notes: str | None
    report_url: str | None
    compared_with_id: UUID | None
    progress_pct: int
    total_items: int
    filled_items: int
    rooms: list[RoomOut] = Field(default_factory=list)
    meters: list[MeterOut] = Field(default_factory=list)
    issues: list[IssueOut] = Field(default_factory=list)
    created_at: datetime


# ── Vistorias ────────────────────────────────────────────────────────────────
@router.get("", response_model=list[dict])
async def list_inspections(
    db: DbDep,
    property_id: UUID | None = None,
    status_filter: str | None = None,
    user: CurrentUser = Depends(require_permission("vistorias", "view")),
) -> list[dict]:
    filters, params = [], {}
    if property_id:
        filters.append("i.property_id = :pid")
        params["pid"] = str(property_id)
    if status_filter:
        filters.append("i.status = :status")
        params["status"] = status_filter
    where = f"where {' and '.join(filters)}" if filters else ""

    rows = (
        (
            await db.execute(
                text(
                    f"""
                    select i.id, i.kind, i.status, i.scheduled_at, i.performed_at,
                           i.report_path, p.code as property_code, p.title as property_title,
                           u.full_name as inspector_name,
                           (select count(*) from inspections.items it
                             join inspections.rooms r on r.id = it.room_id
                            where r.inspection_id = i.id) as total_items,
                           (select count(*) from inspections.items it
                             join inspections.rooms r on r.id = it.room_id
                            where r.inspection_id = i.id and it.condition is not null)
                             as filled_items
                    from inspections.inspections i
                    join properties.properties p on p.id = i.property_id
                    left join core.users u on u.id = i.inspector_user_id
                    {where}
                    order by coalesce(i.performed_at, i.scheduled_at, i.created_at) desc
                    """  # noqa: S608
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    storage = get_storage()
    return [
        {
            **dict(r),
            "progress_pct": inspection_progress(r["total_items"], r["filled_items"]),
            "report_url": (
                storage.public_url(BUCKET_REPORTS, r["report_path"]) if r["report_path"] else None
            ),
        }
        for r in rows
    ]


@router.post("", response_model=InspectionOut, status_code=status.HTTP_201_CREATED)
async def create_inspection(
    payload: InspectionIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "create")),
) -> InspectionOut:
    """Cria a vistoria já com o roteiro padrão, se pedido.

    Vistoria de saída procura sozinha a de entrada do mesmo imóvel para
    comparar — é essa comparação que sustenta a conversa sobre reparos.
    """
    compared_with = None
    if payload.kind == "saida":
        compared_with = (
            await db.execute(
                text(
                    """
                    select id from inspections.inspections
                    where property_id = :pid and kind = 'entrada' and status = 'concluida'
                    order by performed_at desc nulls last limit 1
                    """
                ),
                {"pid": str(payload.property_id)},
            )
        ).scalar()

    inspection_id = (
        await db.execute(
            text(
                """
                insert into inspections.inspections
                    (tenant_id, property_id, contract_id, kind, inspector_user_id,
                     scheduled_at, compared_with_id)
                values (:tid, :pid, :cid, :kind, :inspector, :scheduled, :compared)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "pid": str(payload.property_id),
                "cid": str(payload.contract_id) if payload.contract_id else None,
                "kind": payload.kind,
                "inspector": str(payload.inspector_user_id or user.user_id),
                "scheduled": payload.scheduled_at,
                "compared": str(compared_with) if compared_with else None,
            },
        )
    ).scalar_one()

    if payload.use_default_script:
        for order, (room_name, items) in enumerate(DEFAULT_SCRIPT.items()):
            room_id = (
                await db.execute(
                    text(
                        "insert into inspections.rooms (tenant_id, inspection_id, name, "
                        "sort_order) values (:tid, :iid, :name, :order) returning id"
                    ),
                    {
                        "tid": str(user.tenant_id),
                        "iid": str(inspection_id),
                        "name": room_name,
                        "order": order,
                    },
                )
            ).scalar_one()
            for item_order, item_name in enumerate(items):
                await db.execute(
                    text(
                        "insert into inspections.items (tenant_id, room_id, name, sort_order) "
                        "values (:tid, :rid, :name, :order)"
                    ),
                    {
                        "tid": str(user.tenant_id),
                        "rid": str(room_id),
                        "name": item_name,
                        "order": item_order,
                    },
                )

    return await _get_inspection(db, inspection_id)


@router.get("/{inspection_id}", response_model=InspectionOut)
async def get_inspection(
    inspection_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "view")),
) -> InspectionOut:
    return await _get_inspection(db, inspection_id)


@router.post("/{inspection_id}/rooms", response_model=InspectionOut)
async def add_room(
    inspection_id: UUID,
    payload: RoomIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> InspectionOut:
    await db.execute(
        text(
            "insert into inspections.rooms (tenant_id, inspection_id, name, sort_order) "
            "values (:tid, :iid, :name, :order)"
        ),
        {
            "tid": str(user.tenant_id),
            "iid": str(inspection_id),
            "name": payload.name,
            "order": payload.sort_order,
        },
    )
    return await _get_inspection(db, inspection_id)


@router.post("/rooms/{room_id}/items", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_item(
    room_id: UUID,
    payload: ItemIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> dict:
    item_id = (
        await db.execute(
            text(
                "insert into inspections.items (tenant_id, room_id, name, sort_order) "
                "values (:tid, :rid, :name, :order) returning id"
            ),
            {
                "tid": str(user.tenant_id),
                "rid": str(room_id),
                "name": payload.name,
                "order": payload.sort_order,
            },
        )
    ).scalar_one()
    return {"id": str(item_id), "name": payload.name}


@router.patch("/items/{item_id}", response_model=dict)
async def update_item(
    item_id: UUID,
    payload: ItemUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> dict:
    """Marca o estado do item. É a ação repetida dezenas de vezes na vistoria."""
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        return {"updated": False}

    sets = ", ".join(f"{k} = :{k}" for k in fields)
    row = (
        (
            await db.execute(
                text(
                    f"update inspections.items set {sets} where id = :iid "  # noqa: S608
                    "returning id, name, condition, notes"
                ),
                {**fields, "iid": str(item_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item não encontrado")
    return dict(row)


@router.post("/{inspection_id}/photos", response_model=PhotoOut, status_code=201)
async def upload_photo(
    inspection_id: UUID,
    db: DbDep,
    item_id: UUID | None = None,
    caption: str | None = None,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> PhotoOut:
    content = await file.read()
    if len(content) > 15 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Foto deve ter no máximo 15 MB")

    ext = (file.filename or "foto.jpg").rsplit(".", 1)[-1].lower()
    path = tenant_path(user.tenant_id, "vistorias", str(inspection_id), f"{uuid4().hex}.{ext}")
    await get_storage().upload(BUCKET_DOCUMENTS, path, content, file.content_type or "image/jpeg")

    row = (
        (
            await db.execute(
                text(
                    """
                    insert into inspections.photos
                        (tenant_id, inspection_id, item_id, storage_path, caption)
                    values (:tid, :iid, :item, :path, :caption)
                    returning id, item_id, caption, storage_path
                    """
                ),
                {
                    "tid": str(user.tenant_id),
                    "iid": str(inspection_id),
                    "item": str(item_id) if item_id else None,
                    "path": path,
                    "caption": caption,
                },
            )
        )
        .mappings()
        .first()
    )
    return PhotoOut(
        id=row["id"],
        url=get_storage().public_url(BUCKET_DOCUMENTS, row["storage_path"]),
        caption=row["caption"],
        item_id=row["item_id"],
    )


@router.post("/{inspection_id}/meters", response_model=InspectionOut)
async def add_meter_reading(
    inspection_id: UUID,
    payload: MeterIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> InspectionOut:
    await db.execute(
        text(
            """
            insert into inspections.meter_readings (tenant_id, inspection_id, meter, reading)
            values (:tid, :iid, :meter, :reading)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "iid": str(inspection_id),
            "meter": payload.meter,
            "reading": payload.reading,
        },
    )
    return await _get_inspection(db, inspection_id)


@router.post("/{inspection_id}/finish", response_model=InspectionOut)
async def finish_inspection(
    inspection_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> InspectionOut:
    """Conclui a vistoria e, na saída, levanta as pendências comparando com a entrada."""
    inspection = await _get_inspection(db, inspection_id)
    if inspection.status == "concluida":
        raise HTTPException(status.HTTP_409_CONFLICT, "Vistoria já concluída")
    if inspection.filled_items == 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Preencha ao menos um item antes de concluir a vistoria",
        )

    if inspection.kind == "saida" and inspection.compared_with_id:
        await _build_issues(db, user, inspection)

    await db.execute(
        text(
            "update inspections.inspections set status = 'concluida', "
            "performed_at = coalesce(performed_at, now()) where id = :iid"
        ),
        {"iid": str(inspection_id)},
    )
    await record_audit(db, user, "inspection", inspection_id, "finish")
    return await _get_inspection(db, inspection_id)


@router.patch("/issues/{issue_id}", response_model=IssueOut)
async def update_issue(
    issue_id: UUID,
    payload: IssueUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "edit")),
) -> IssueOut:
    """Ajusta a pendência. A responsabilidade sugerida é sempre revisável."""
    fields = payload.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nada a atualizar")

    sets = ", ".join(f"{k} = :{k}" for k in fields)
    row = (
        (
            await db.execute(
                text(
                    f"update inspections.issues set {sets} where id = :iid returning *"  # noqa: S608
                ),
                {**fields, "iid": str(issue_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pendência não encontrada")

    await record_audit(db, user, "inspection_issue", issue_id, "update", after=fields)
    return IssueOut(**{k: row[k] for k in IssueOut.model_fields})


@router.post("/{inspection_id}/report", response_model=dict)
async def generate_report(
    inspection_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vistorias", "view")),
) -> dict:
    """Gera o laudo em PDF com a identidade visual da imobiliária."""
    inspection = await _get_inspection(db, inspection_id)

    branding = (
        (
            await db.execute(
                text("select * from core.tenant_branding where tenant_id = :tid"),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )

    pdf = await render_inspection_report(
        inspection=inspection.model_dump(mode="json"),
        branding=dict(branding) if branding else {},
    )
    path = tenant_path(
        user.tenant_id, "laudos", f"vistoria-{inspection.property_code}-{inspection.kind}.pdf"
    )
    await get_storage().upload(BUCKET_REPORTS, path, pdf, "application/pdf")

    await db.execute(
        text("update inspections.inspections set report_path = :path where id = :iid"),
        {"path": path, "iid": str(inspection_id)},
    )
    return {"report_url": get_storage().public_url(BUCKET_REPORTS, path), "bytes": len(pdf)}


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _build_issues(db, user: CurrentUser, inspection: InspectionOut) -> None:
    """Compara entrada × saída e grava as pendências sugeridas."""
    entry = await _get_inspection(db, inspection.compared_with_id)

    def to_states(source: InspectionOut) -> list[ItemState]:
        return [
            ItemState(
                room=room.name, name=item.name, condition=item.condition, item_id=str(item.id)
            )
            for room in source.rooms
            for item in room.items
        ]

    issues = compare_inspections(to_states(entry), to_states(inspection))

    await db.execute(
        text("delete from inspections.issues where inspection_id = :iid"),
        {"iid": str(inspection.id)},
    )
    for issue in issues:
        await db.execute(
            text(
                """
                insert into inspections.issues
                    (tenant_id, inspection_id, item_id, room_name, description,
                     responsibility, entry_condition, exit_condition)
                values (:tid, :iid, :item, :room, :desc, :resp, :entry, :exit)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "iid": str(inspection.id),
                "item": issue.item_id,
                "room": issue.room,
                "desc": issue.description,
                "resp": issue.responsibility,
                "entry": issue.entry_condition,
                "exit": issue.exit_condition,
            },
        )


async def _get_inspection(db, inspection_id: UUID) -> InspectionOut:
    row = (
        (
            await db.execute(
                text(
                    """
                    select i.*, p.code as property_code, p.title as property_title,
                           u.full_name as inspector_name
                    from inspections.inspections i
                    join properties.properties p on p.id = i.property_id
                    left join core.users u on u.id = i.inspector_user_id
                    where i.id = :iid
                    """
                ),
                {"iid": str(inspection_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vistoria não encontrada")

    storage = get_storage()

    photos = (
        (
            await db.execute(
                text(
                    "select id, item_id, storage_path, caption from inspections.photos "
                    "where inspection_id = :iid"
                ),
                {"iid": str(inspection_id)},
            )
        )
        .mappings()
        .all()
    )
    photos_by_item: dict[UUID | None, list[PhotoOut]] = {}
    for photo in photos:
        photos_by_item.setdefault(photo["item_id"], []).append(
            PhotoOut(
                id=photo["id"],
                url=storage.public_url(BUCKET_DOCUMENTS, photo["storage_path"]),
                caption=photo["caption"],
                item_id=photo["item_id"],
            )
        )

    rooms_rows = (
        (
            await db.execute(
                text(
                    "select id, name, sort_order, notes from inspections.rooms "
                    "where inspection_id = :iid order by sort_order, name"
                ),
                {"iid": str(inspection_id)},
            )
        )
        .mappings()
        .all()
    )

    rooms: list[RoomOut] = []
    total_items = filled_items = 0
    for room in rooms_rows:
        item_rows = (
            (
                await db.execute(
                    text(
                        "select id, name, condition, notes, sort_order from inspections.items "
                        "where room_id = :rid order by sort_order, name"
                    ),
                    {"rid": str(room["id"])},
                )
            )
            .mappings()
            .all()
        )
        items = [
            ItemOut(**dict(item), photos=photos_by_item.get(item["id"], [])) for item in item_rows
        ]
        total_items += len(items)
        filled_items += sum(1 for i in items if i.condition)
        rooms.append(RoomOut(**dict(room), items=items))

    meters = (
        (
            await db.execute(
                text(
                    "select id, meter, reading from inspections.meter_readings "
                    "where inspection_id = :iid order by meter"
                ),
                {"iid": str(inspection_id)},
            )
        )
        .mappings()
        .all()
    )
    issues = (
        (
            await db.execute(
                text(
                    "select id, room_name, description, responsibility, estimated_cost, "
                    "entry_condition, exit_condition, resolved from inspections.issues "
                    "where inspection_id = :iid order by created_at"
                ),
                {"iid": str(inspection_id)},
            )
        )
        .mappings()
        .all()
    )

    return InspectionOut(
        **{
            k: row[k]
            for k in (
                "id",
                "property_id",
                "contract_id",
                "kind",
                "inspector_user_id",
                "scheduled_at",
                "performed_at",
                "status",
                "general_notes",
                "compared_with_id",
                "created_at",
            )
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        inspector_name=row["inspector_name"],
        report_url=(
            storage.public_url(BUCKET_REPORTS, row["report_path"]) if row["report_path"] else None
        ),
        progress_pct=inspection_progress(total_items, filled_items),
        total_items=total_items,
        filled_items=filled_items,
        rooms=rooms,
        meters=[MeterOut(**dict(m)) for m in meters],
        issues=[IssueOut(**dict(i)) for i in issues],
    )
