"""Financeiro central: plano de contas, centros de custo, contas a pagar/receber,
fluxo de caixa projetado e DRE simplificado por competência."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_permission
from app.core.security import CurrentUser
from app.modules.common import Page
from app.services.storage import BUCKET_DOCUMENTS, get_storage, tenant_path

router = APIRouter(prefix="/finance", tags=["financeiro"])


# ── Plano de contas e centros de custo ───────────────────────────────────────
class AccountIn(BaseModel):
    code: str
    name: str
    kind: str = Field(pattern="^(receita|despesa)$")
    parent_id: UUID | None = None


class AccountOut(AccountIn):
    id: UUID
    active: bool


class CostCenterIn(BaseModel):
    name: str


class CostCenterOut(CostCenterIn):
    id: UUID
    active: bool


@router.get("/accounts", response_model=list[AccountOut])
async def list_accounts(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[AccountOut]:
    rows = (
        (await db.execute(text("select * from finance.chart_of_accounts order by code")))
        .mappings()
        .all()
    )
    return [AccountOut(**r) for r in rows]


@router.post("/accounts", response_model=AccountOut, status_code=status.HTTP_201_CREATED)
async def create_account(
    payload: AccountIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "create")),
) -> AccountOut:
    row = (
        (
            await db.execute(
                text(
                    """
                insert into finance.chart_of_accounts (tenant_id, code, name, kind, parent_id)
                values (:tid, :code, :name, :kind, :parent_id)
                returning *
                """
                ),
                {"tid": str(user.tenant_id), **payload.model_dump(mode="json")},
            )
        )
        .mappings()
        .first()
    )
    return AccountOut(**row)


@router.get("/cost-centers", response_model=list[CostCenterOut])
async def list_cost_centers(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[CostCenterOut]:
    rows = (
        (await db.execute(text("select * from finance.cost_centers order by name")))
        .mappings()
        .all()
    )
    return [CostCenterOut(**r) for r in rows]


@router.post("/cost-centers", response_model=CostCenterOut, status_code=status.HTTP_201_CREATED)
async def create_cost_center(
    payload: CostCenterIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "create")),
) -> CostCenterOut:
    row = (
        (
            await db.execute(
                text(
                    "insert into finance.cost_centers (tenant_id, name) values (:tid, :name) "
                    "returning *"
                ),
                {"tid": str(user.tenant_id), "name": payload.name},
            )
        )
        .mappings()
        .first()
    )
    return CostCenterOut(**row)


# ── Lançamentos (pagar / receber) ────────────────────────────────────────────
class EntryIn(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    counterparty_id: UUID | None = None  # fornecedor (pagar) ou pagador (receber)
    account_id: UUID | None = None
    cost_center_id: UUID | None = None
    due_date: date
    competence_date: date | None = None
    amount: Decimal = Field(gt=0)
    recurrence: str = Field("nenhuma", pattern="^(nenhuma|mensal|anual)$")
    notes: str | None = None


class SettleIn(BaseModel):
    paid_at: date | None = None
    paid_amount: Decimal | None = None


class EntryOut(BaseModel):
    id: UUID
    description: str
    counterparty_id: UUID | None
    counterparty_name: str | None
    account_id: UUID | None
    account_name: str | None
    cost_center_id: UUID | None
    due_date: date
    competence_date: date
    amount: Decimal
    status: str
    paid_at: date | None
    paid_amount: Decimal | None
    overdue: bool
    notes: str | None
    proof_url: str | None = None


_TABLES = {
    "payables": ("finance.payables", "supplier_id", "pago"),
    "receivables": ("finance.receivables", "payer_id", "recebido"),
}


def _resolve(kind: str) -> tuple[str, str, str]:
    if kind not in _TABLES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tipo de lançamento inválido")
    return _TABLES[kind]


@router.get("/{kind}", response_model=Page[EntryOut])
async def list_entries(
    kind: str,
    db: DbDep,
    status_filter: str | None = Query(None, alias="status"),
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=200),
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> Page[EntryOut]:
    table, party_col, _ = _resolve(kind)

    filters, params = [], {"limit": page_size, "offset": (page - 1) * page_size}
    if status_filter:
        filters.append("e.status = :status")
        params["status"] = status_filter
    if date_from:
        filters.append("e.due_date >= :date_from")
        params["date_from"] = date_from
    if date_to:
        filters.append("e.due_date <= :date_to")
        params["date_to"] = date_to
    where = f"where {' and '.join(filters)}" if filters else ""

    total = (
        await db.execute(text(f"select count(*) from {table} e {where}"), params)  # noqa: S608
    ).scalar_one()

    rows = (
        (
            await db.execute(
                text(
                    f"""
                select e.*, e.{party_col} as counterparty_id,
                       c.name as counterparty_name, a.name as account_name,
                       (e.status = 'pendente' and e.due_date < current_date) as overdue
                from {table} e
                left join crm.clients c on c.id = e.{party_col}
                left join finance.chart_of_accounts a on a.id = e.account_id
                {where}
                order by e.due_date
                limit :limit offset :offset
                """  # noqa: S608 — nomes vêm de _TABLES, não da requisição
                ),
                params,
            )
        )
        .mappings()
        .all()
    )

    storage = get_storage()
    items = [
        EntryOut(
            **{k: r[k] for k in EntryOut.model_fields if k in r and k != "proof_url"},
            proof_url=(
                storage.public_url(BUCKET_DOCUMENTS, r["proof_path"])
                if r.get("proof_path")
                else None
            ),
        )
        for r in rows
    ]
    return Page[EntryOut](items=items, total=total, page=page, page_size=page_size)


@router.post("/{kind}", response_model=EntryOut, status_code=status.HTTP_201_CREATED)
async def create_entry(
    kind: str,
    payload: EntryIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "create")),
) -> EntryOut:
    table, party_col, _ = _resolve(kind)
    competence = payload.competence_date or payload.due_date

    params = {
        "tid": str(user.tenant_id),
        "description": payload.description,
        "party": str(payload.counterparty_id) if payload.counterparty_id else None,
        "account_id": str(payload.account_id) if payload.account_id else None,
        "cost_center_id": str(payload.cost_center_id) if payload.cost_center_id else None,
        "due_date": payload.due_date,
        "competence_date": competence,
        "amount": payload.amount,
        "notes": payload.notes,
    }

    if kind == "payables":
        sql = f"""
            insert into {table}
                (tenant_id, description, {party_col}, account_id, cost_center_id,
                 due_date, competence_date, amount, recurrence, notes)
            values (:tid, :description, :party, :account_id, :cost_center_id,
                    :due_date, :competence_date, :amount, :recurrence, :notes)
            returning id
        """  # noqa: S608
        params["recurrence"] = payload.recurrence
    else:
        sql = f"""
            insert into {table}
                (tenant_id, description, {party_col}, account_id, cost_center_id,
                 due_date, competence_date, amount, notes)
            values (:tid, :description, :party, :account_id, :cost_center_id,
                    :due_date, :competence_date, :amount, :notes)
            returning id
        """  # noqa: S608

    entry_id = (await db.execute(text(sql), params)).scalar_one()
    await record_audit(db, user, kind[:-1], entry_id, "create")
    return await _get_entry(db, kind, entry_id)


@router.post("/{kind}/{entry_id}/settle", response_model=EntryOut)
async def settle_entry(
    kind: str,
    entry_id: UUID,
    payload: SettleIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> EntryOut:
    """Baixa o lançamento (pagamento/recebimento)."""
    table, _, settled_status = _resolve(kind)
    before = await _get_entry(db, kind, entry_id)
    if before.status != "pendente":
        raise HTTPException(status.HTTP_409_CONFLICT, "Lançamento já baixado ou cancelado")

    await db.execute(
        text(
            f"""
            update {table}
            set status = :status,
                paid_at = coalesce(:paid_at, current_date),
                paid_amount = coalesce(:paid_amount, amount)
            where id = :eid
            """  # noqa: S608
        ),
        {
            "status": settled_status,
            "paid_at": payload.paid_at,
            "paid_amount": payload.paid_amount,
            "eid": str(entry_id),
        },
    )
    after = await _get_entry(db, kind, entry_id)
    await record_audit(
        db,
        user,
        kind[:-1],
        entry_id,
        "settle",
        before=before.model_dump(mode="json"),
        after=after.model_dump(mode="json"),
    )
    return after


@router.post("/{kind}/{entry_id}/cancel", response_model=EntryOut)
async def cancel_entry(
    kind: str,
    entry_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> EntryOut:
    table, _, _ = _resolve(kind)
    before = await _get_entry(db, kind, entry_id)
    await db.execute(
        text(f"update {table} set status = 'cancelado' where id = :eid"),  # noqa: S608
        {"eid": str(entry_id)},
    )
    after = await _get_entry(db, kind, entry_id)
    await record_audit(
        db, user, kind[:-1], entry_id, "cancel", before=before.model_dump(mode="json")
    )
    return after


@router.post("/payables/{entry_id}/proof", response_model=EntryOut)
async def upload_proof(
    entry_id: UUID,
    db: DbDep,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> EntryOut:
    """Anexa o comprovante de pagamento."""
    await _get_entry(db, "payables", entry_id)
    content = await file.read()
    safe_name = (file.filename or "comprovante").replace("/", "_")
    path = tenant_path(user.tenant_id, "comprovantes", f"{uuid4().hex[:8]}-{safe_name}")
    await get_storage().upload(
        BUCKET_DOCUMENTS, path, content, file.content_type or "application/octet-stream"
    )
    await db.execute(
        text("update finance.payables set proof_path = :path where id = :eid"),
        {"path": path, "eid": str(entry_id)},
    )
    return await _get_entry(db, "payables", entry_id)


# ── Relatórios ───────────────────────────────────────────────────────────────
@router.get("/reports/summary")
async def summary(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> dict:
    """Indicadores do mês corrente + posição de vencidos."""
    row = (
        (
            await db.execute(
                text(
                    """
                select
                  (select coalesce(sum(amount), 0) from finance.receivables
                   where status = 'pendente') as a_receber,
                  (select coalesce(sum(amount), 0) from finance.payables
                   where status = 'pendente') as a_pagar,
                  (select coalesce(sum(amount), 0) from finance.receivables
                   where status = 'pendente' and due_date < current_date) as receber_vencido,
                  (select coalesce(sum(amount), 0) from finance.payables
                   where status = 'pendente' and due_date < current_date) as pagar_vencido,
                  (select coalesce(sum(paid_amount), 0) from finance.receivables
                   where status = 'recebido'
                     and date_trunc('month', paid_at) = date_trunc('month', current_date)
                  ) as recebido_mes,
                  (select coalesce(sum(paid_amount), 0) from finance.payables
                   where status = 'pago'
                     and date_trunc('month', paid_at) = date_trunc('month', current_date)
                  ) as pago_mes
                """
                )
            )
        )
        .mappings()
        .first()
    )
    result = dict(row)
    result["resultado_mes"] = result["recebido_mes"] - result["pago_mes"]
    return result


@router.get("/reports/cashflow")
async def cashflow(
    db: DbDep,
    days: int = Query(90, ge=1, le=365),
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> dict:
    """Fluxo de caixa projetado com saldo acumulado."""
    rows = (
        (
            await db.execute(
                text(
                    """
                select day, direction, sum(amount) as amount
                from finance.v_cashflow
                where day between current_date and current_date + make_interval(days => :days)
                group by day, direction
                order by day
                """
                ),
                {"days": days},
            )
        )
        .mappings()
        .all()
    )

    by_day: dict[date, dict[str, Decimal]] = {}
    for r in rows:
        entry = by_day.setdefault(r["day"], {"in": Decimal(0), "out": Decimal(0)})
        entry[r["direction"]] = r["amount"]

    series, balance = [], Decimal(0)
    cursor = date.today()
    end = cursor + timedelta(days=days)
    while cursor <= end:
        day_values = by_day.get(cursor, {"in": Decimal(0), "out": Decimal(0)})
        net = day_values["in"] - day_values["out"]
        balance += net
        if day_values["in"] or day_values["out"]:
            series.append(
                {
                    "day": cursor,
                    "entradas": day_values["in"],
                    "saidas": day_values["out"],
                    "saldo_dia": net,
                    "saldo_acumulado": balance,
                }
            )
        cursor += timedelta(days=1)

    return {"days": days, "saldo_projetado": balance, "series": series}


@router.get("/reports/dre")
async def dre(
    db: DbDep,
    months: int = Query(6, ge=1, le=36),
    user: CurrentUser = Depends(require_permission("relatorios", "view")),
) -> list[dict]:
    """DRE simplificado por competência (mês × conta)."""
    rows = (
        (
            await db.execute(
                text(
                    """
                select month, kind, account, sum(amount) as amount
                from finance.v_dre
                where month >= date_trunc('month', current_date)
                                - make_interval(months => :months)
                group by month, kind, account
                order by month desc, kind, account
                """
                ),
                {"months": months},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


async def _get_entry(db, kind: str, entry_id: UUID) -> EntryOut:
    table, party_col, _ = _resolve(kind)
    row = (
        (
            await db.execute(
                text(
                    f"""
                select e.*, e.{party_col} as counterparty_id,
                       c.name as counterparty_name, a.name as account_name,
                       (e.status = 'pendente' and e.due_date < current_date) as overdue
                from {table} e
                left join crm.clients c on c.id = e.{party_col}
                left join finance.chart_of_accounts a on a.id = e.account_id
                where e.id = :eid
                """  # noqa: S608 — nomes vêm de _TABLES
                ),
                {"eid": str(entry_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lançamento não encontrado")

    storage = get_storage()
    return EntryOut(
        **{k: row[k] for k in EntryOut.model_fields if k in row and k != "proof_url"},
        proof_url=(
            storage.public_url(BUCKET_DOCUMENTS, row["proof_path"])
            if row.get("proof_path")
            else None
        ),
    )
