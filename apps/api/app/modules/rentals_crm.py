"""CRM de locação: funil próprio, kanban, SLA e análise cadastral."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser

router = APIRouter(
    prefix="/rentals",
    tags=["locação"],
    dependencies=[Depends(require_module("module_rentals"))],
)


# ── Modelos ──────────────────────────────────────────────────────────────────
class StageOut(BaseModel):
    id: UUID
    key: str
    name: str
    sort_order: int
    sla_hours: int | None
    is_won: bool


class LeadIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    phone: str | None = None
    email: str | None = None
    source: str | None = None
    client_id: UUID | None = None
    property_id: UUID | None = None
    assigned_to: UUID | None = None
    stage_id: UUID | None = None
    notes: str | None = None


class LeadUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    source: str | None = None
    client_id: UUID | None = None
    property_id: UUID | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class LeadMove(BaseModel):
    stage_id: UUID


class LeadLoss(BaseModel):
    loss_reason_id: UUID
    notes: str | None = None


class LeadOut(BaseModel):
    id: UUID
    stage_id: UUID
    stage_name: str
    name: str
    phone: str | None
    email: str | None
    source: str | None
    client_id: UUID | None
    client_name: str | None
    property_id: UUID | None
    property_code: str | None
    assigned_to: UUID | None
    assigned_name: str | None
    status: str
    loss_reason: str | None
    notes: str | None
    stage_since: datetime
    hours_in_stage: float
    sla_hours: int | None
    sla_breached: bool
    created_at: datetime


class BoardOut(BaseModel):
    pipeline_id: UUID
    stages: list[StageOut]
    leads: list[LeadOut]


class CreditAnalysisIn(BaseModel):
    lead_id: UUID | None = None
    client_id: UUID | None = None
    property_id: UUID | None = None
    rent_amount: Decimal = Field(gt=0)
    income_multiplier: Decimal = Decimal("3")
    declared_income: Decimal | None = None
    guarantee_type: str | None = None
    guarantee_notes: str | None = None
    doc_checklist: dict = Field(default_factory=dict)
    notes: str | None = None


class CreditAnalysisDecision(BaseModel):
    result: str = Field(pattern="^(aprovado|reprovado|pendente)$")
    notes: str | None = None


class CreditAnalysisOut(BaseModel):
    id: UUID
    lead_id: UUID | None
    client_id: UUID | None
    rent_amount: Decimal
    income_multiplier: Decimal
    declared_income: Decimal | None
    required_income: Decimal
    income_ok: bool | None
    guarantee_type: str | None
    guarantee_notes: str | None
    doc_checklist: dict
    result: str
    notes: str | None
    created_at: datetime


_LEAD_SELECT = """
    select l.*, s.name as stage_name, s.sla_hours,
           c.name as client_name, p.code as property_code,
           u.full_name as assigned_name, r.name as loss_reason,
           extract(epoch from (now() - l.stage_since)) / 3600 as hours_in_stage
    from rentals.leads l
    join rentals.pipeline_stages s on s.id = l.stage_id
    left join crm.clients c on c.id = l.client_id
    left join properties.properties p on p.id = l.property_id
    left join core.users u on u.id = l.assigned_to
    left join rentals.loss_reasons r on r.id = l.loss_reason_id
"""


def _lead_out(row) -> LeadOut:
    hours = float(row["hours_in_stage"] or 0)
    sla = row["sla_hours"]
    return LeadOut(
        **{
            k: row[k]
            for k in (
                "id",
                "stage_id",
                "name",
                "phone",
                "email",
                "source",
                "client_id",
                "property_id",
                "assigned_to",
                "status",
                "notes",
                "stage_since",
                "created_at",
            )
        },
        stage_name=row["stage_name"],
        client_name=row["client_name"],
        property_code=row["property_code"],
        assigned_name=row["assigned_name"],
        loss_reason=row["loss_reason"],
        hours_in_stage=round(hours, 1),
        sla_hours=sla,
        # Só há estouro de SLA em lead ainda aberto.
        sla_breached=bool(sla and hours > sla and row["status"] == "aberto"),
    )


# ── Quadro do funil ──────────────────────────────────────────────────────────
@router.get("/board", response_model=BoardOut)
async def board(
    db: DbDep,
    include_closed: bool = False,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> BoardOut:
    """Funil completo para o kanban: etapas na ordem e leads posicionados."""
    pipeline_id = await _default_pipeline(db)

    stages = (
        (
            await db.execute(
                text(
                    "select id, key, name, sort_order, sla_hours, is_won "
                    "from rentals.pipeline_stages where pipeline_id = :pid "
                    "order by sort_order"
                ),
                {"pid": str(pipeline_id)},
            )
        )
        .mappings()
        .all()
    )

    where = "where l.pipeline_id = :pid"
    if not include_closed:
        where += " and l.status = 'aberto'"

    leads = (
        (
            await db.execute(
                text(f"{_LEAD_SELECT} {where} order by l.stage_since"),  # noqa: S608
                {"pid": str(pipeline_id)},
            )
        )
        .mappings()
        .all()
    )

    return BoardOut(
        pipeline_id=pipeline_id,
        stages=[StageOut(**s) for s in stages],
        leads=[_lead_out(r) for r in leads],
    )


@router.get("/loss-reasons", response_model=list[dict])
async def loss_reasons(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                text("select id, name from rentals.loss_reasons where active order by name")
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


# ── Leads ────────────────────────────────────────────────────────────────────
@router.post("/leads", response_model=LeadOut, status_code=status.HTTP_201_CREATED)
async def create_lead(
    payload: LeadIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "create")),
) -> LeadOut:
    pipeline_id = await _default_pipeline(db)

    stage_id = (
        payload.stage_id
        or (
            await db.execute(
                text(
                    "select id from rentals.pipeline_stages where pipeline_id = :pid "
                    "order by sort_order limit 1"
                ),
                {"pid": str(pipeline_id)},
            )
        ).scalar_one()
    )

    assigned_to = payload.assigned_to or await _next_broker(db)

    lead_id = (
        await db.execute(
            text(
                """
                insert into rentals.leads
                    (tenant_id, pipeline_id, stage_id, client_id, property_id,
                     name, phone, email, source, assigned_to, notes)
                values (:tid, :pid, :sid, :client_id, :property_id,
                        :name, :phone, :email, :source, :assigned_to, :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "pid": str(pipeline_id),
                "sid": str(stage_id),
                "client_id": str(payload.client_id) if payload.client_id else None,
                "property_id": str(payload.property_id) if payload.property_id else None,
                "name": payload.name,
                "phone": payload.phone,
                "email": payload.email,
                "source": payload.source,
                "assigned_to": str(assigned_to) if assigned_to else None,
                "notes": payload.notes,
            },
        )
    ).scalar_one()

    await db.execute(
        text(
            "insert into rentals.lead_stage_history "
            "(tenant_id, lead_id, to_stage_id, user_id) values (:tid, :lid, :sid, :uid)"
        ),
        {
            "tid": str(user.tenant_id),
            "lid": str(lead_id),
            "sid": str(stage_id),
            "uid": str(user.user_id),
        },
    )
    return await _get_lead(db, lead_id)


@router.get("/leads/{lead_id}", response_model=LeadOut)
async def get_lead(
    lead_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> LeadOut:
    return await _get_lead(db, lead_id)


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: UUID,
    payload: LeadUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "edit")),
) -> LeadOut:
    fields = payload.model_dump(exclude_unset=True)
    if fields:
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        params = {k: (str(v) if isinstance(v, UUID) else v) for k, v in fields.items()}
        await db.execute(
            text(f"update rentals.leads set {sets} where id = :lid"),  # noqa: S608
            {**params, "lid": str(lead_id)},
        )
    return await _get_lead(db, lead_id)


@router.post("/leads/{lead_id}/move", response_model=LeadOut)
async def move_lead(
    lead_id: UUID,
    payload: LeadMove,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "edit")),
) -> LeadOut:
    """Move o lead de etapa e registra quanto tempo ele ficou na anterior."""
    current = (
        (
            await db.execute(
                text("select stage_id, stage_since, status from rentals.leads where id = :lid"),
                {"lid": str(lead_id)},
            )
        )
        .mappings()
        .first()
    )
    if current is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead não encontrado")
    if current["status"] != "aberto":
        raise HTTPException(status.HTTP_409_CONFLICT, "Lead já encerrado")

    stage = (
        (
            await db.execute(
                text("select id, is_won from rentals.pipeline_stages where id = :sid"),
                {"sid": str(payload.stage_id)},
            )
        )
        .mappings()
        .first()
    )
    if stage is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Etapa inexistente")

    await db.execute(
        text(
            """
            insert into rentals.lead_stage_history
                (tenant_id, lead_id, from_stage_id, to_stage_id, user_id, hours_in_stage)
            select :tid, :lid, :from_sid, :to_sid, :uid,
                   extract(epoch from (now() - :since)) / 3600
            """
        ),
        {
            "tid": str(user.tenant_id),
            "lid": str(lead_id),
            "from_sid": str(current["stage_id"]),
            "to_sid": str(payload.stage_id),
            "uid": str(user.user_id),
            "since": current["stage_since"],
        },
    )

    await db.execute(
        text(
            """
            update rentals.leads
            set stage_id = :sid,
                stage_since = now(),
                status = case when :is_won then 'ganho' else status end,
                closed_at = case when :is_won then now() else closed_at end
            where id = :lid
            """
        ),
        {"sid": str(payload.stage_id), "is_won": stage["is_won"], "lid": str(lead_id)},
    )
    return await _get_lead(db, lead_id)


@router.post("/leads/{lead_id}/lose", response_model=LeadOut)
async def lose_lead(
    lead_id: UUID,
    payload: LeadLoss,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "edit")),
) -> LeadOut:
    updated = (
        await db.execute(
            text(
                """
                update rentals.leads
                set status = 'perdido', loss_reason_id = :rid, closed_at = now(),
                    notes = coalesce(:notes, notes)
                where id = :lid and status = 'aberto'
                returning id
                """
            ),
            {"rid": str(payload.loss_reason_id), "notes": payload.notes, "lid": str(lead_id)},
        )
    ).first()
    if updated is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Lead não encontrado ou já encerrado")

    await record_audit(db, user, "lead", lead_id, "lose")
    return await _get_lead(db, lead_id)


# ── Análise cadastral ────────────────────────────────────────────────────────
@router.post(
    "/credit-analyses", response_model=CreditAnalysisOut, status_code=status.HTTP_201_CREATED
)
async def create_credit_analysis(
    payload: CreditAnalysisIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "create")),
) -> CreditAnalysisOut:
    analysis_id = (
        await db.execute(
            text(
                """
                insert into rentals.credit_analyses
                    (tenant_id, lead_id, client_id, property_id, rent_amount,
                     income_multiplier, declared_income, guarantee_type,
                     guarantee_notes, doc_checklist, notes)
                values (:tid, :lead_id, :client_id, :property_id, :rent_amount,
                        :income_multiplier, :declared_income, :guarantee_type,
                        :guarantee_notes, cast(:doc_checklist as jsonb), :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "lead_id": str(payload.lead_id) if payload.lead_id else None,
                "client_id": str(payload.client_id) if payload.client_id else None,
                "property_id": str(payload.property_id) if payload.property_id else None,
                "rent_amount": payload.rent_amount,
                "income_multiplier": payload.income_multiplier,
                "declared_income": payload.declared_income,
                "guarantee_type": payload.guarantee_type,
                "guarantee_notes": payload.guarantee_notes,
                "doc_checklist": json.dumps(payload.doc_checklist),
                "notes": payload.notes,
            },
        )
    ).scalar_one()
    return await _get_analysis(db, analysis_id)


@router.post("/credit-analyses/{analysis_id}/decide", response_model=CreditAnalysisOut)
async def decide_credit_analysis(
    analysis_id: UUID,
    payload: CreditAnalysisDecision,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "approve")),
) -> CreditAnalysisOut:
    """Aprovar ou reprovar a análise é ação sensível: exige permissão de aprovação."""
    await db.execute(
        text(
            """
            update rentals.credit_analyses
            set result = :result, decided_by = :uid, decided_at = now(),
                notes = coalesce(:notes, notes)
            where id = :aid
            """
        ),
        {
            "result": payload.result,
            "uid": str(user.user_id),
            "notes": payload.notes,
            "aid": str(analysis_id),
        },
    )
    await record_audit(
        db, user, "credit_analysis", analysis_id, "decide", after={"result": payload.result}
    )
    return await _get_analysis(db, analysis_id)


@router.get("/credit-analyses/{analysis_id}", response_model=CreditAnalysisOut)
async def get_credit_analysis(
    analysis_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> CreditAnalysisOut:
    return await _get_analysis(db, analysis_id)


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _default_pipeline(db) -> UUID:
    pipeline_id = (
        await db.execute(
            text(
                "select id from rentals.pipelines where module = 'rentals' "
                "order by is_default desc, created_at limit 1"
            )
        )
    ).scalar()
    if pipeline_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funil de locação não configurado")
    return pipeline_id


async def _next_broker(db) -> UUID | None:
    """Distribuição round-robin: o corretor com menos leads abertos leva o próximo.

    Empate é desfeito pelo nome, para a atribuição ser previsível.
    """
    return (
        await db.execute(
            text(
                """
                select u.id
                from core.users u
                join core.user_roles ur on ur.user_id = u.id
                join core.roles r on r.id = ur.role_id and r.name = 'Corretor'
                left join rentals.leads l
                  on l.assigned_to = u.id and l.status = 'aberto'
                where u.status = 'active'
                group by u.id, u.full_name
                order by count(l.id), u.full_name
                limit 1
                """
            )
        )
    ).scalar()


async def _get_lead(db, lead_id: UUID) -> LeadOut:
    row = (
        (await db.execute(text(f"{_LEAD_SELECT} where l.id = :lid"), {"lid": str(lead_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead não encontrado")
    return _lead_out(row)


async def _get_analysis(db, analysis_id: UUID) -> CreditAnalysisOut:
    row = (
        (
            await db.execute(
                text("select * from rentals.credit_analyses where id = :aid"),
                {"aid": str(analysis_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Análise não encontrada")

    required = (row["rent_amount"] * row["income_multiplier"]).quantize(Decimal("0.01"))
    declared = row["declared_income"]
    return CreditAnalysisOut(
        id=row["id"],
        lead_id=row["lead_id"],
        client_id=row["client_id"],
        rent_amount=row["rent_amount"],
        income_multiplier=row["income_multiplier"],
        declared_income=declared,
        required_income=required,
        income_ok=None if declared is None else declared >= required,
        guarantee_type=row["guarantee_type"],
        guarantee_notes=row["guarantee_notes"],
        doc_checklist=row["doc_checklist"] or {},
        result=row["result"],
        notes=row["notes"],
        created_at=row["created_at"],
    )
