"""Cadastro de clientes (CRM base): PF/PJ, papéis, contatos, documentos, timeline."""

from __future__ import annotations

import json
from datetime import date, datetime
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import CurrentUserDep, DbDep, require_permission
from app.core.security import CurrentUser
from app.core.validators import format_document, validate_document
from app.modules.common import Address, Page
from app.services.storage import BUCKET_DOCUMENTS, get_storage, tenant_path
from app.services.viacep import CepNotFound, lookup_cep

router = APIRouter(prefix="/clients", tags=["clientes"])

CLIENT_ROLES = {
    "proprietario",
    "locatario",
    "fiador",
    "comprador",
    "vendedor",
    "lead",
    "fornecedor",
}


class ContactIn(BaseModel):
    kind: str
    value: str
    is_primary: bool = False


class ClientIn(BaseModel):
    kind: str = Field(pattern="^(PF|PJ)$")
    name: str = Field(min_length=1, max_length=200)
    cpf_cnpj: str | None = None
    rg_ie: str | None = None
    birth_date: date | None = None
    address: Address = Field(default_factory=Address)
    notes: str | None = None
    roles: list[str] = Field(default_factory=list)
    contacts: list[ContactIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> ClientIn:
        self.cpf_cnpj = validate_document(self.kind, self.cpf_cnpj)
        invalid = set(self.roles) - CLIENT_ROLES
        if invalid:
            raise ValueError(f"Papéis inválidos: {', '.join(sorted(invalid))}")
        for contact in self.contacts:
            if contact.kind not in ("phone", "whatsapp", "email"):
                raise ValueError("Tipo de contato inválido")
        return self


class ClientUpdate(BaseModel):
    name: str | None = None
    cpf_cnpj: str | None = None
    rg_ie: str | None = None
    birth_date: date | None = None
    address: Address | None = None
    notes: str | None = None
    roles: list[str] | None = None


class ContactOut(BaseModel):
    id: UUID
    kind: str
    value: str
    is_primary: bool


class ClientOut(BaseModel):
    id: UUID
    kind: str
    name: str
    cpf_cnpj: str | None
    cpf_cnpj_formatted: str | None
    rg_ie: str | None
    birth_date: date | None
    address: dict
    notes: str | None
    roles: list[str]
    contacts: list[ContactOut] = Field(default_factory=list)
    created_at: datetime


class DocumentOut(BaseModel):
    id: UUID
    doc_type: str
    file_name: str
    url: str
    valid_until: date | None
    expired: bool
    created_at: datetime


class InteractionIn(BaseModel):
    channel: str
    summary: str
    direction: str | None = None
    payload: dict = Field(default_factory=dict)
    occurred_at: datetime | None = None


@router.get("", response_model=Page[ClientOut])
async def list_clients(
    db: DbDep,
    search: str | None = None,
    role: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: CurrentUser = Depends(require_permission("clientes", "view")),
) -> Page[ClientOut]:
    filters, params = [], {"limit": page_size, "offset": (page - 1) * page_size}
    if search:
        digits = "".join(ch for ch in search if ch.isdigit())
        params["search"] = f"%{search}%"
        if digits:
            filters.append("(c.name ilike :search or c.cpf_cnpj like :doc)")
            params["doc"] = f"%{digits}%"
        else:
            # Sem dígitos no termo, buscar por documento casaria com todos
            # os clientes que possuem CPF/CNPJ preenchido.
            filters.append("c.name ilike :search")
    if role:
        filters.append(
            "exists (select 1 from crm.client_roles cr "
            "where cr.client_id = c.id and cr.role = :role)"
        )
        params["role"] = role
    where = f"where {' and '.join(filters)}" if filters else ""

    total = (
        await db.execute(text(f"select count(*) from crm.clients c {where}"), params)  # noqa: S608
    ).scalar_one()

    rows = (
        (
            await db.execute(
                text(
                    f"""
                select c.*,
                       coalesce(array_agg(distinct cr.role)
                         filter (where cr.role is not null), '{{}}') as roles
                from crm.clients c
                left join crm.client_roles cr on cr.client_id = c.id
                {where}
                group by c.id
                order by c.name
                limit :limit offset :offset
                """  # noqa: S608 — `where` é montado a partir de literais fixos
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    items = [await _to_client_out(db, r, with_contacts=False) for r in rows]
    return Page[ClientOut](items=items, total=total, page=page, page_size=page_size)


@router.post("", response_model=ClientOut, status_code=status.HTTP_201_CREATED)
async def create_client(
    payload: ClientIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "create")),
) -> ClientOut:
    if payload.cpf_cnpj:
        dup = (
            await db.execute(
                text("select id from crm.clients where cpf_cnpj = :doc"),
                {"doc": payload.cpf_cnpj},
            )
        ).first()
        if dup:
            raise HTTPException(
                status.HTTP_409_CONFLICT, "Já existe cliente cadastrado com este CPF/CNPJ"
            )

    client_id = (
        await db.execute(
            text(
                """
                insert into crm.clients
                    (tenant_id, kind, name, cpf_cnpj, rg_ie, birth_date, address, notes)
                values
                    (:tid, :kind, :name, :cpf_cnpj, :rg_ie, :birth_date,
                     cast(:address as jsonb), :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "kind": payload.kind,
                "name": payload.name,
                "cpf_cnpj": payload.cpf_cnpj,
                "rg_ie": payload.rg_ie,
                "birth_date": payload.birth_date,
                "address": json.dumps(payload.address.model_dump(exclude_none=True)),
                "notes": payload.notes,
            },
        )
    ).scalar_one()

    await _set_roles(db, user.tenant_id, client_id, payload.roles)
    for contact in payload.contacts:
        await db.execute(
            text(
                """
                insert into crm.client_contacts (tenant_id, client_id, kind, value, is_primary)
                values (:tid, :cid, :kind, :value, :is_primary)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "cid": str(client_id),
                "kind": contact.kind,
                "value": contact.value,
                "is_primary": contact.is_primary,
            },
        )

    await record_audit(db, user, "client", client_id, "create")
    return await _get_client(db, client_id)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(
    client_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "view")),
) -> ClientOut:
    return await _get_client(db, client_id)


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: UUID,
    payload: ClientUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "edit")),
) -> ClientOut:
    before = await _get_client(db, client_id)

    fields = payload.model_dump(exclude_unset=True, exclude={"roles", "address"})
    if "cpf_cnpj" in fields:
        fields["cpf_cnpj"] = validate_document(before.kind, fields["cpf_cnpj"])
    if payload.address is not None:
        fields["address"] = json.dumps(payload.address.model_dump(exclude_none=True))

    if fields:
        sets = ", ".join(
            f"{k} = cast(:{k} as jsonb)" if k == "address" else f"{k} = :{k}" for k in fields
        )
        await db.execute(
            text(f"update crm.clients set {sets} where id = :cid"),  # noqa: S608 — chaves do modelo
            {**fields, "cid": str(client_id)},
        )

    if payload.roles is not None:
        invalid = set(payload.roles) - CLIENT_ROLES
        if invalid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Papéis inválidos")
        await _set_roles(db, user.tenant_id, client_id, payload.roles)

    after = await _get_client(db, client_id)
    await record_audit(
        db,
        user,
        "client",
        client_id,
        "update",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
    )
    return after


@router.delete("/{client_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def delete_client(
    client_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "delete")),
) -> None:
    before = await _get_client(db, client_id)
    await db.execute(text("delete from crm.clients where id = :cid"), {"cid": str(client_id)})
    await record_audit(
        db, user, "client", client_id, "delete", before=before.model_dump(mode="json")
    )


# ── Documentos ───────────────────────────────────────────────────────────────
@router.get("/{client_id}/documents", response_model=list[DocumentOut])
async def list_documents(
    client_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "view")),
) -> list[DocumentOut]:
    rows = (
        (
            await db.execute(
                text(
                    "select * from crm.client_documents where client_id = :cid "
                    "order by created_at desc"
                ),
                {"cid": str(client_id)},
            )
        )
        .mappings()
        .all()
    )
    storage = get_storage()
    today = date.today()
    return [
        DocumentOut(
            id=r["id"],
            doc_type=r["doc_type"],
            file_name=r["file_name"],
            url=storage.public_url(BUCKET_DOCUMENTS, r["storage_path"]),
            valid_until=r["valid_until"],
            expired=bool(r["valid_until"] and r["valid_until"] < today),
            created_at=r["created_at"],
        )
        for r in rows
    ]


@router.post(
    "/{client_id}/documents", response_model=DocumentOut, status_code=status.HTTP_201_CREATED
)
async def upload_document(
    client_id: UUID,
    db: DbDep,
    doc_type: str,
    valid_until: date | None = None,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("clientes", "edit")),
) -> DocumentOut:
    await _get_client(db, client_id)
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Arquivo deve ter no máximo 20 MB")

    safe_name = (file.filename or "documento").replace("/", "_")
    path = tenant_path(user.tenant_id, "clients", str(client_id), f"{uuid4().hex[:8]}-{safe_name}")
    await get_storage().upload(
        BUCKET_DOCUMENTS, path, content, file.content_type or "application/octet-stream"
    )

    row = (
        (
            await db.execute(
                text(
                    """
                insert into crm.client_documents
                    (tenant_id, client_id, doc_type, file_name, storage_path, valid_until)
                values (:tid, :cid, :doc_type, :file_name, :path, :valid_until)
                returning *
                """
                ),
                {
                    "tid": str(user.tenant_id),
                    "cid": str(client_id),
                    "doc_type": doc_type,
                    "file_name": safe_name,
                    "path": path,
                    "valid_until": valid_until,
                },
            )
        )
        .mappings()
        .first()
    )

    return DocumentOut(
        id=row["id"],
        doc_type=row["doc_type"],
        file_name=row["file_name"],
        url=get_storage().public_url(BUCKET_DOCUMENTS, row["storage_path"]),
        valid_until=row["valid_until"],
        expired=bool(row["valid_until"] and row["valid_until"] < date.today()),
        created_at=row["created_at"],
    )


@router.get("/documents/expiring", response_model=list[dict])
async def expiring_documents(
    db: DbDep,
    days: int = 30,
    user: CurrentUser = Depends(require_permission("clientes", "view")),
) -> list[dict]:
    """Documentos vencidos ou a vencer no prazo informado."""
    rows = (
        (
            await db.execute(
                text(
                    """
                select d.id, d.doc_type, d.valid_until, c.id as client_id, c.name as client_name,
                       (d.valid_until - current_date) as days_left
                from crm.client_documents d
                join crm.clients c on c.id = d.client_id
                where d.valid_until is not null
                  and d.valid_until <= current_date + make_interval(days => :days)
                order by d.valid_until
                """
                ),
                {"days": days},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


# ── Timeline ─────────────────────────────────────────────────────────────────
@router.get("/{client_id}/timeline", response_model=list[dict])
async def get_timeline(
    client_id: UUID,
    db: DbDep,
    limit: int = 100,
    user: CurrentUser = Depends(require_permission("clientes", "view")),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                text(
                    """
                select i.id, i.channel, i.direction, i.summary, i.payload, i.occurred_at,
                       u.full_name as user_name
                from crm.interactions i
                left join core.users u on u.id = i.user_id
                where i.client_id = :cid
                order by i.occurred_at desc
                limit :limit
                """
                ),
                {"cid": str(client_id), "limit": min(limit, 500)},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.post("/{client_id}/timeline", response_model=dict, status_code=status.HTTP_201_CREATED)
async def add_interaction(
    client_id: UUID,
    payload: InteractionIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("clientes", "edit")),
) -> dict:
    await _get_client(db, client_id)
    row = (
        (
            await db.execute(
                text(
                    """
                insert into crm.interactions
                    (tenant_id, client_id, user_id, channel, direction, summary,
                     payload, occurred_at)
                values (:tid, :cid, :uid, :channel, :direction, :summary,
                        cast(:payload as jsonb), coalesce(:occurred_at, now()))
                returning id, channel, direction, summary, occurred_at
                """
                ),
                {
                    "tid": str(user.tenant_id),
                    "cid": str(client_id),
                    "uid": str(user.user_id),
                    "channel": payload.channel,
                    "direction": payload.direction,
                    "summary": payload.summary,
                    "payload": json.dumps(payload.payload),
                    "occurred_at": payload.occurred_at,
                },
            )
        )
        .mappings()
        .first()
    )
    return dict(row)


# ── Utilitário: CEP ──────────────────────────────────────────────────────────
@router.get("/utils/cep/{cep}", response_model=dict)
async def get_address_by_cep(cep: str, user: CurrentUserDep) -> dict:
    try:
        return await lookup_cep(cep)
    except CepNotFound as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _set_roles(db, tenant_id: UUID, client_id: UUID, roles: list[str]) -> None:
    await db.execute(
        text("delete from crm.client_roles where client_id = :cid"), {"cid": str(client_id)}
    )
    for role in dict.fromkeys(roles):
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, :role)"
            ),
            {"tid": str(tenant_id), "cid": str(client_id), "role": role},
        )


async def _to_client_out(db, row, *, with_contacts: bool = True) -> ClientOut:
    contacts: list[ContactOut] = []
    if with_contacts:
        crows = (
            (
                await db.execute(
                    text(
                        "select id, kind, value, is_primary from crm.client_contacts "
                        "where client_id = :cid order by is_primary desc, kind"
                    ),
                    {"cid": str(row["id"])},
                )
            )
            .mappings()
            .all()
        )
        contacts = [ContactOut(**c) for c in crows]

    return ClientOut(
        id=row["id"],
        kind=row["kind"],
        name=row["name"],
        cpf_cnpj=row["cpf_cnpj"],
        cpf_cnpj_formatted=format_document(row["cpf_cnpj"]),
        rg_ie=row["rg_ie"],
        birth_date=row["birth_date"],
        address=row["address"] or {},
        notes=row["notes"],
        roles=list(row["roles"] or []),
        contacts=contacts,
        created_at=row["created_at"],
    )


async def _get_client(db, client_id: UUID) -> ClientOut:
    row = (
        (
            await db.execute(
                text(
                    """
                select c.*,
                       coalesce(array_agg(distinct cr.role)
                         filter (where cr.role is not null), '{}') as roles
                from crm.clients c
                left join crm.client_roles cr on cr.client_id = c.id
                where c.id = :cid
                group by c.id
                """
                ),
                {"cid": str(client_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cliente não encontrado")
    return await _to_client_out(db, row)
