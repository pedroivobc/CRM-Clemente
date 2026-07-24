"""Colaboradores e controle de acesso (RBAC)."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_permission
from app.core.security import CurrentUser

router = APIRouter(prefix="/users", tags=["colaboradores"])


class UserIn(BaseModel):
    full_name: str = Field(min_length=1, max_length=160)
    email: EmailStr
    phone: str | None = None
    role_ids: list[UUID] = Field(default_factory=list)


class UserUpdate(BaseModel):
    full_name: str | None = Field(None, min_length=1, max_length=160)
    phone: str | None = None
    status: str | None = None
    role_ids: list[UUID] | None = None


class UserOut(BaseModel):
    id: UUID
    full_name: str
    email: str
    phone: str | None
    status: str
    auth_user_id: UUID | None
    roles: list[str]


class RoleOut(BaseModel):
    id: UUID
    name: str
    is_system: bool
    permissions: list[str]


def _user_select(where: str = "") -> str:
    """Consulta de colaboradores com os papéis agregados.

    Montada por concatenação: o literal de array vazio do SQL (``'{}'``)
    colidiria com os marcadores de ``str.format``.
    """
    return (
        "select u.id, u.full_name, u.email, u.phone, u.status, u.auth_user_id, "
        "coalesce(array_agg(r.name) filter (where r.name is not null), '{}') as roles "
        "from core.users u "
        "left join core.user_roles ur on ur.user_id = u.id "
        "left join core.roles r on r.id = ur.role_id "
        f"{where} "
        "group by u.id "
        "order by u.full_name"
    )


@router.get("", response_model=list[UserOut])
async def list_users(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "view")),
) -> list[UserOut]:
    rows = (await db.execute(text(_user_select()))).mappings().all()
    return [UserOut(**r) for r in rows]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def create_user(
    payload: UserIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "create")),
) -> UserOut:
    """Cadastra o colaborador.

    O vínculo com o Supabase Auth (``auth_user_id``) é feito no primeiro
    acesso, pelo convite enviado por e-mail.
    """
    exists = (
        await db.execute(
            text("select 1 from core.users where email = :email"),
            {"email": payload.email},
        )
    ).first()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já existe colaborador com este e-mail")

    new_id = (
        await db.execute(
            text(
                """
                insert into core.users (tenant_id, full_name, email, phone)
                values (:tid, :full_name, :email, :phone)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "full_name": payload.full_name,
                "email": payload.email,
                "phone": payload.phone,
            },
        )
    ).scalar_one()

    await _set_roles(db, user.tenant_id, new_id, payload.role_ids)
    await record_audit(db, user, "user", new_id, "create", after=payload.model_dump(mode="json"))
    return await _get_user(db, new_id)


@router.patch("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: UUID,
    payload: UserUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "edit")),
) -> UserOut:
    before = await _get_user(db, user_id)

    fields = payload.model_dump(exclude_unset=True, exclude={"role_ids"})
    if fields:
        if "status" in fields and fields["status"] not in ("active", "inactive"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Situação inválida")
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        await db.execute(
            text(f"update core.users set {sets} where id = :uid"),  # noqa: S608 — chaves do modelo
            {**fields, "uid": str(user_id)},
        )

    if payload.role_ids is not None:
        await _set_roles(db, user.tenant_id, user_id, payload.role_ids)

    after = await _get_user(db, user_id)
    await record_audit(
        db,
        user,
        "user",
        user_id,
        "update",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
    )
    return after


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
async def deactivate_user(
    user_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "delete")),
) -> None:
    """Desativa o colaborador (o histórico de auditoria é preservado)."""
    if user_id == user.user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Não é possível desativar a si mesmo")

    before = await _get_user(db, user_id)
    await db.execute(
        text("update core.users set status = 'inactive' where id = :uid"),
        {"uid": str(user_id)},
    )
    await record_audit(
        db, user, "user", user_id, "deactivate", before=before.model_dump(mode="json")
    )


@router.get("/roles/all", response_model=list[RoleOut])
async def list_roles(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("configuracoes", "view")),
) -> list[RoleOut]:
    rows = (
        (
            await db.execute(
                text(
                    """
                select r.id, r.name, r.is_system,
                       coalesce(
                         array_agg(p.module || ':' || p.action)
                           filter (where p.id is not null), '{}'
                       ) as permissions
                from core.roles r
                left join core.role_permissions rp on rp.role_id = r.id
                left join core.permissions p on p.id = rp.permission_id
                group by r.id
                order by r.name
                """
                )
            )
        )
        .mappings()
        .all()
    )
    return [RoleOut(**r) for r in rows]


@router.get("/audit/log")
async def list_audit(
    db: DbDep,
    limit: int = 100,
    user: CurrentUser = Depends(require_permission("configuracoes", "view")),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                text(
                    """
                select a.id, a.entity, a.entity_id, a.action, a.occurred_at,
                       u.full_name as user_name
                from core.audit_log a
                left join core.users u on u.id = a.user_id
                order by a.occurred_at desc
                limit :limit
                """
                ),
                {"limit": min(limit, 500)},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


async def _set_roles(db, tenant_id: UUID, user_id: UUID, role_ids: list[UUID]) -> None:
    await db.execute(
        text("delete from core.user_roles where user_id = :uid"), {"uid": str(user_id)}
    )
    for role_id in role_ids:
        valid = (
            await db.execute(
                text("select 1 from core.roles where id = :rid"), {"rid": str(role_id)}
            )
        ).first()
        if not valid:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Papel inexistente")
        await db.execute(
            text(
                "insert into core.user_roles (tenant_id, user_id, role_id) "
                "values (:tid, :uid, :rid)"
            ),
            {"tid": str(tenant_id), "uid": str(user_id), "rid": str(role_id)},
        )


async def _get_user(db, user_id: UUID) -> UserOut:
    row = (
        (await db.execute(text(_user_select("where u.id = :uid")), {"uid": str(user_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Colaborador não encontrado")
    return UserOut(**row)
