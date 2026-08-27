"""Controle de chaves: chaveiro, retirada com assinatura e alerta de atraso."""

from __future__ import annotations

import base64
from datetime import datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.services.storage import BUCKET_DOCUMENTS, get_storage, tenant_path

router = APIRouter(
    prefix="/keys",
    tags=["chaves"],
    dependencies=[Depends(require_module("module_rentals"))],
)


class KeyIn(BaseModel):
    property_id: UUID
    label: str = Field(min_length=1, max_length=120)
    copies: int = Field(1, ge=1)
    board_position: str | None = None
    notes: str | None = None


class KeyUpdate(BaseModel):
    label: str | None = None
    copies: int | None = Field(None, ge=1)
    board_position: str | None = None
    notes: str | None = None
    active: bool | None = None


class MovementIn(BaseModel):
    purpose: str = Field(min_length=1, max_length=160)
    due_back_at: datetime
    taken_by_user_id: UUID | None = None
    taken_by_client_id: UUID | None = None
    taken_by_name: str | None = None
    taken_by_document: str | None = None
    taken_by_phone: str | None = None
    # Assinatura desenhada na tela, em data URL (image/png em base64).
    signature: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def _check(self) -> MovementIn:
        if not any((self.taken_by_user_id, self.taken_by_client_id, self.taken_by_name)):
            raise ValueError("Informe quem está levando a chave")
        return self


class ReturnIn(BaseModel):
    notes: str | None = None


class MovementOut(BaseModel):
    id: UUID
    key_id: UUID
    key_label: str
    board_position: str | None
    property_id: UUID
    property_code: str
    taken_by: str
    purpose: str
    taken_at: datetime
    due_back_at: datetime
    returned_at: datetime | None
    signature_url: str | None
    is_out: bool
    is_overdue: bool
    hours_overdue: int
    notes: str | None


class KeyOut(BaseModel):
    id: UUID
    property_id: UUID
    property_code: str
    property_title: str
    label: str
    copies: int
    board_position: str | None
    notes: str | None
    active: bool
    out_count: int
    overdue: bool
    current_holder: str | None
    due_back_at: datetime | None


# ── Chaveiro ─────────────────────────────────────────────────────────────────
@router.get("", response_model=list[KeyOut])
async def list_keys(
    db: DbDep,
    property_id: UUID | None = None,
    only_out: bool = False,
    user: CurrentUser = Depends(require_permission("chaves", "view")),
) -> list[KeyOut]:
    """Chaveiro da imobiliária, com quem está de posse de cada chave."""
    filters, params = ["k.active"], {}
    if property_id:
        filters.append("k.property_id = :pid")
        params["pid"] = str(property_id)
    if only_out:
        filters.append("m.id is not null")

    rows = (
        (
            await db.execute(
                text(
                    f"""
                    select k.*, p.code as property_code, p.title as property_title,
                           m.due_back_at, m.taken_at,
                           coalesce(u.full_name, c.name, m.taken_by_name) as current_holder,
                           (m.id is not null) as is_out,
                           (m.id is not null and m.due_back_at < now()) as overdue
                    from keys.property_keys k
                    join properties.properties p on p.id = k.property_id
                    left join lateral (
                      select mv.* from keys.key_movements mv
                      where mv.key_id = k.id and mv.returned_at is null
                      order by mv.taken_at desc limit 1
                    ) m on true
                    left join core.users u on u.id = m.taken_by_user_id
                    left join crm.clients c on c.id = m.taken_by_client_id
                    where {" and ".join(filters)}
                    order by k.board_position nulls last, p.code
                    """  # noqa: S608 — filtros montados de literais fixos
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    return [
        KeyOut(
            **{
                k: r[k]
                for k in (
                    "id",
                    "property_id",
                    "label",
                    "copies",
                    "board_position",
                    "notes",
                    "active",
                )
            },
            property_code=r["property_code"],
            property_title=r["property_title"],
            out_count=1 if r["is_out"] else 0,
            overdue=bool(r["overdue"]),
            current_holder=r["current_holder"],
            due_back_at=r["due_back_at"],
        )
        for r in rows
    ]


@router.post("", response_model=KeyOut, status_code=status.HTTP_201_CREATED)
async def create_key(
    payload: KeyIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("chaves", "create")),
) -> KeyOut:
    key_id = (
        await db.execute(
            text(
                """
                insert into keys.property_keys
                    (tenant_id, property_id, label, copies, board_position, notes)
                values (:tid, :pid, :label, :copies, :position, :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "pid": str(payload.property_id),
                "label": payload.label,
                "copies": payload.copies,
                "position": payload.board_position,
                "notes": payload.notes,
            },
        )
    ).scalar_one()
    return await _get_key(db, key_id)


@router.patch("/{key_id}", response_model=KeyOut)
async def update_key(
    key_id: UUID,
    payload: KeyUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("chaves", "edit")),
) -> KeyOut:
    fields = payload.model_dump(exclude_unset=True)
    if fields:
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        await db.execute(
            text(f"update keys.property_keys set {sets} where id = :kid"),  # noqa: S608
            {**fields, "kid": str(key_id)},
        )
    return await _get_key(db, key_id)


# ── Movimentação ─────────────────────────────────────────────────────────────
@router.post("/{key_id}/take", response_model=MovementOut, status_code=status.HTTP_201_CREATED)
async def take_key(
    key_id: UUID,
    payload: MovementIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("chaves", "edit")),
) -> MovementOut:
    """Registra a retirada da chave, com prazo e assinatura de quem levou."""
    outstanding = (
        await db.execute(
            text("select 1 from keys.key_movements " "where key_id = :kid and returned_at is null"),
            {"kid": str(key_id)},
        )
    ).first()
    if outstanding:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Esta chave já está com alguém. Registre a devolução antes de nova retirada.",
        )

    signature_path = None
    if payload.signature:
        signature_path = await _store_signature(user.tenant_id, payload.signature)

    movement_id = (
        await db.execute(
            text(
                """
                insert into keys.key_movements
                    (tenant_id, key_id, taken_by_user_id, taken_by_client_id, taken_by_name,
                     taken_by_document, taken_by_phone, purpose, due_back_at,
                     signature_path, notes, created_by)
                values (:tid, :kid, :uid, :cid, :name, :doc, :phone, :purpose, :due,
                        :signature, :notes, :created_by)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "kid": str(key_id),
                "uid": str(payload.taken_by_user_id) if payload.taken_by_user_id else None,
                "cid": str(payload.taken_by_client_id) if payload.taken_by_client_id else None,
                "name": payload.taken_by_name,
                "doc": payload.taken_by_document,
                "phone": payload.taken_by_phone,
                "purpose": payload.purpose,
                "due": payload.due_back_at,
                "signature": signature_path,
                "notes": payload.notes,
                "created_by": str(user.user_id),
            },
        )
    ).scalar_one()

    await record_audit(db, user, "key_movement", movement_id, "take")
    return await _get_movement(db, movement_id)


@router.post("/movements/{movement_id}/return", response_model=MovementOut)
async def return_key(
    movement_id: UUID,
    payload: ReturnIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("chaves", "edit")),
) -> MovementOut:
    updated = (
        await db.execute(
            text(
                """
                update keys.key_movements
                set returned_at = now(), returned_to = :uid,
                    notes = coalesce(:notes, notes)
                where id = :mid and returned_at is null
                returning id
                """
            ),
            {"uid": str(user.user_id), "notes": payload.notes, "mid": str(movement_id)},
        )
    ).first()
    if updated is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Movimentação não encontrada ou chave já devolvida"
        )

    await record_audit(db, user, "key_movement", movement_id, "return")
    return await _get_movement(db, movement_id)


@router.get("/movements", response_model=list[MovementOut])
async def list_movements(
    db: DbDep,
    key_id: UUID | None = None,
    only_out: bool = False,
    limit: int = 100,
    user: CurrentUser = Depends(require_permission("chaves", "view")),
) -> list[MovementOut]:
    filters, params = [], {"limit": min(limit, 300)}
    if key_id:
        filters.append("m.key_id = :kid")
        params["kid"] = str(key_id)
    if only_out:
        filters.append("m.returned_at is null")
    where = f"where {' and '.join(filters)}" if filters else ""

    rows = (
        (
            await db.execute(
                text(f"{_MOVEMENT_SELECT} {where} order by m.taken_at desc limit :limit"),  # noqa: S608
                params,
            )
        )
        .mappings()
        .all()
    )
    return [_movement_out(r) for r in rows]


@router.get("/alerts/overdue", response_model=list[MovementOut])
async def overdue_keys(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("chaves", "view")),
) -> list[MovementOut]:
    """Chaves fora do prazo — a lista que a equipe cobra no fim do dia."""
    rows = (
        (
            await db.execute(
                text(
                    f"{_MOVEMENT_SELECT} "
                    "where m.returned_at is null and m.due_back_at < now() "
                    "order by m.due_back_at"
                )
            )
        )
        .mappings()
        .all()
    )
    return [_movement_out(r) for r in rows]


# ── Helpers ──────────────────────────────────────────────────────────────────
_MOVEMENT_SELECT = """
    select m.*, k.label as key_label, k.board_position, k.property_id,
           p.code as property_code,
           coalesce(u.full_name, c.name, m.taken_by_name) as taken_by,
           greatest(0, floor(extract(epoch from (now() - m.due_back_at)) / 3600))
             as hours_overdue
    from keys.key_movements m
    join keys.property_keys k on k.id = m.key_id
    join properties.properties p on p.id = k.property_id
    left join core.users u on u.id = m.taken_by_user_id
    left join crm.clients c on c.id = m.taken_by_client_id
"""


async def _store_signature(tenant_id: UUID, data_url: str) -> str:
    """Guarda a assinatura desenhada na tela como imagem."""
    payload = data_url.split(",", 1)[-1]
    try:
        content = base64.b64decode(payload, validate=True)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Assinatura em formato inválido") from exc

    path = tenant_path(tenant_id, "assinaturas", f"chave-{uuid4().hex[:10]}.png")
    await get_storage().upload(BUCKET_DOCUMENTS, path, content, "image/png")
    return path


def _movement_out(row) -> MovementOut:
    is_out = row["returned_at"] is None
    hours_overdue = int(row["hours_overdue"] or 0) if is_out else 0
    storage = get_storage()
    return MovementOut(
        **{
            k: row[k]
            for k in (
                "id",
                "key_id",
                "property_id",
                "purpose",
                "taken_at",
                "due_back_at",
                "returned_at",
                "notes",
            )
        },
        key_label=row["key_label"],
        board_position=row["board_position"],
        property_code=row["property_code"],
        taken_by=row["taken_by"] or "—",
        signature_url=(
            storage.public_url(BUCKET_DOCUMENTS, row["signature_path"])
            if row["signature_path"]
            else None
        ),
        is_out=is_out,
        is_overdue=is_out and hours_overdue > 0,
        hours_overdue=hours_overdue,
    )


async def _get_key(db, key_id: UUID) -> KeyOut:
    row = (
        (
            await db.execute(
                text(
                    """
                    select k.*, p.code as property_code, p.title as property_title,
                           m.due_back_at,
                           coalesce(u.full_name, c.name, m.taken_by_name) as current_holder,
                           (m.id is not null) as is_out,
                           (m.id is not null and m.due_back_at < now()) as overdue
                    from keys.property_keys k
                    join properties.properties p on p.id = k.property_id
                    left join lateral (
                      select mv.* from keys.key_movements mv
                      where mv.key_id = k.id and mv.returned_at is null
                      order by mv.taken_at desc limit 1
                    ) m on true
                    left join core.users u on u.id = m.taken_by_user_id
                    left join crm.clients c on c.id = m.taken_by_client_id
                    where k.id = :kid
                    """
                ),
                {"kid": str(key_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chave não encontrada")

    return KeyOut(
        **{
            k: row[k]
            for k in ("id", "property_id", "label", "copies", "board_position", "notes", "active")
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        out_count=1 if row["is_out"] else 0,
        overdue=bool(row["overdue"]),
        current_holder=row["current_holder"],
        due_back_at=row["due_back_at"],
    )


async def _get_movement(db, movement_id: UUID) -> MovementOut:
    row = (
        (await db.execute(text(f"{_MOVEMENT_SELECT} where m.id = :mid"), {"mid": str(movement_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Movimentação não encontrada")
    return _movement_out(row)
