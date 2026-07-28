"""Módulo de Vendas — operação, propostas, negócios e comissões.

Autônomo em relação à locação: funil próprio, indicadores próprios e
financeiro próprio. Uma imobiliária que contrate apenas vendas tem aqui o
produto inteiro, sem depender de nada do módulo de locação.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.domain.sales import (
    assess_proposal,
    compute_commission,
    compute_sales_kpis,
    default_shares,
    funnel_conversion,
)

router = APIRouter(
    prefix="/sales",
    tags=["vendas"],
    dependencies=[Depends(require_module("module_sales"))],
)

FINANCING_TYPES = ("a_vista", "financiamento", "fgts", "consorcio", "permuta", "misto")


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
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    financing_type: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class LeadUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    email: str | None = None
    source: str | None = None
    client_id: UUID | None = None
    property_id: UUID | None = None
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    financing_type: str | None = None
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
    budget_min: Decimal | None
    budget_max: Decimal | None
    financing_type: str | None
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


class ProposalIn(BaseModel):
    property_id: UUID
    lead_id: UUID | None = None
    buyer_id: UUID | None = None
    broker_id: UUID | None = None
    asking_price: Decimal = Field(gt=0)
    offer_amount: Decimal = Field(gt=0)
    down_payment: Decimal | None = None
    financing_type: str | None = None
    financing_bank: str | None = None
    conditions: str | None = None
    valid_until: date | None = None


class CounterProposalIn(BaseModel):
    offer_amount: Decimal = Field(gt=0)
    conditions: str | None = None
    valid_until: date | None = None
    notes: str | None = None


class ProposalDecision(BaseModel):
    notes: str | None = None


class ProposalOut(BaseModel):
    id: UUID
    code: str
    lead_id: UUID | None
    property_id: UUID
    property_code: str
    property_title: str
    buyer_id: UUID | None
    buyer_name: str | None
    broker_id: UUID | None
    broker_name: str | None
    asking_price: Decimal
    offer_amount: Decimal
    discount_amount: Decimal
    discount_pct: Decimal
    down_payment: Decimal | None
    financing_type: str | None
    financing_bank: str | None
    conditions: str | None
    valid_until: date | None
    status: str
    round: int
    parent_id: UUID | None
    decision_notes: str | None
    created_at: datetime


class DealIn(BaseModel):
    proposal_id: UUID | None = None
    property_id: UUID
    buyer_id: UUID | None = None
    seller_id: UUID | None = None
    sale_amount: Decimal = Field(gt=0)
    down_payment: Decimal | None = None
    financing_type: str | None = None
    financing_bank: str | None = None
    commission_pct: Decimal | None = None
    lister_id: UUID | None = None  # corretor que captou
    seller_broker_id: UUID | None = None  # corretor que vendeu
    closed_at: date | None = None
    deed_date: date | None = None
    notes: str | None = None


class CommissionOut(BaseModel):
    beneficiary: str
    user_id: UUID | None
    user_name: str | None
    share_pct: Decimal
    amount: Decimal
    status: str


class DealOut(BaseModel):
    id: UUID
    code: str
    proposal_id: UUID | None
    property_id: UUID
    property_code: str
    property_title: str
    buyer_id: UUID | None
    buyer_name: str | None
    seller_id: UUID | None
    seller_name: str | None
    sale_amount: Decimal
    down_payment: Decimal | None
    financing_type: str | None
    financing_bank: str | None
    commission_pct: Decimal
    commission_total: Decimal
    closed_at: date
    deed_date: date | None
    keys_handed_at: date | None
    status: str
    notes: str | None
    commissions: list[CommissionOut]
    created_at: datetime


class CommissionRuleIn(BaseModel):
    default_pct: Decimal = Field(ge=0, le=100)
    agency_share_pct: Decimal = Field(ge=0, le=100)
    lister_share_pct: Decimal = Field(ge=0, le=100)
    seller_share_pct: Decimal = Field(ge=0, le=100)


class CommissionRuleOut(CommissionRuleIn):
    pass


# ── Quadro do funil ──────────────────────────────────────────────────────────
_LEAD_SELECT = """
    select l.*, s.name as stage_name, s.sla_hours,
           c.name as client_name, p.code as property_code,
           u.full_name as assigned_name, r.name as loss_reason,
           extract(epoch from (now() - l.stage_since)) / 3600 as hours_in_stage
    from sales.leads l
    join sales.pipeline_stages s on s.id = l.stage_id
    left join crm.clients c on c.id = l.client_id
    left join properties.properties p on p.id = l.property_id
    left join core.users u on u.id = l.assigned_to
    left join sales.loss_reasons r on r.id = l.loss_reason_id
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
                "budget_min",
                "budget_max",
                "financing_type",
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
        sla_breached=bool(sla and hours > sla and row["status"] == "aberto"),
    )


@router.get("/board", response_model=BoardOut)
async def board(
    db: DbDep,
    include_closed: bool = False,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> BoardOut:
    pipeline_id = await _default_pipeline(db)

    stages = (
        (
            await db.execute(
                text(
                    "select id, key, name, sort_order, sla_hours, is_won "
                    "from sales.pipeline_stages where pipeline_id = :pid order by sort_order"
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
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                text("select id, name from sales.loss_reasons where active order by name")
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
    user: CurrentUser = Depends(require_permission("vendas", "create")),
) -> LeadOut:
    if payload.financing_type and payload.financing_type not in FINANCING_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Forma de pagamento inválida")

    pipeline_id = await _default_pipeline(db)
    stage_id = (
        await db.execute(
            text(
                "select id from sales.pipeline_stages where pipeline_id = :pid "
                "order by sort_order limit 1"
            ),
            {"pid": str(pipeline_id)},
        )
    ).scalar_one()

    assigned_to = payload.assigned_to or await _next_broker(db)

    lead_id = (
        await db.execute(
            text(
                """
                insert into sales.leads
                    (tenant_id, pipeline_id, stage_id, client_id, property_id, name,
                     phone, email, source, budget_min, budget_max, financing_type,
                     assigned_to, notes)
                values (:tid, :pid, :sid, :client_id, :property_id, :name,
                        :phone, :email, :source, :budget_min, :budget_max, :financing_type,
                        :assigned_to, :notes)
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
                "budget_min": payload.budget_min,
                "budget_max": payload.budget_max,
                "financing_type": payload.financing_type,
                "assigned_to": str(assigned_to) if assigned_to else None,
                "notes": payload.notes,
            },
        )
    ).scalar_one()

    await db.execute(
        text(
            "insert into sales.lead_stage_history (tenant_id, lead_id, to_stage_id, user_id) "
            "values (:tid, :lid, :sid, :uid)"
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
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> LeadOut:
    return await _get_lead(db, lead_id)


@router.patch("/leads/{lead_id}", response_model=LeadOut)
async def update_lead(
    lead_id: UUID,
    payload: LeadUpdate,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "edit")),
) -> LeadOut:
    fields = payload.model_dump(exclude_unset=True)
    if fields:
        sets = ", ".join(f"{k} = :{k}" for k in fields)
        params = {k: (str(v) if isinstance(v, UUID) else v) for k, v in fields.items()}
        await db.execute(
            text(f"update sales.leads set {sets} where id = :lid"),  # noqa: S608
            {**params, "lid": str(lead_id)},
        )
    return await _get_lead(db, lead_id)


@router.post("/leads/{lead_id}/move", response_model=LeadOut)
async def move_lead(
    lead_id: UUID,
    payload: LeadMove,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "edit")),
) -> LeadOut:
    current = (
        (
            await db.execute(
                text("select stage_id, stage_since, status from sales.leads where id = :lid"),
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
                text("select id, is_won from sales.pipeline_stages where id = :sid"),
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
            insert into sales.lead_stage_history
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
            update sales.leads
            set stage_id = :sid, stage_since = now(),
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
    user: CurrentUser = Depends(require_permission("vendas", "edit")),
) -> LeadOut:
    updated = (
        await db.execute(
            text(
                """
                update sales.leads
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

    await record_audit(db, user, "sales_lead", lead_id, "lose")
    return await _get_lead(db, lead_id)


# ── Propostas ────────────────────────────────────────────────────────────────
@router.get("/proposals", response_model=list[ProposalOut])
async def list_proposals(
    db: DbDep,
    status_filter: str | None = None,
    property_id: UUID | None = None,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> list[ProposalOut]:
    filters, params = [], {}
    if status_filter:
        filters.append("pr.status = :status")
        params["status"] = status_filter
    if property_id:
        filters.append("pr.property_id = :pid")
        params["pid"] = str(property_id)
    where = f"where {' and '.join(filters)}" if filters else ""

    rows = (
        (
            await db.execute(
                text(f"{_PROPOSAL_SELECT} {where} order by pr.created_at desc"),  # noqa: S608
                params,
            )
        )
        .mappings()
        .all()
    )
    return [_proposal_out(r) for r in rows]


@router.post("/proposals", response_model=ProposalOut, status_code=status.HTTP_201_CREATED)
async def create_proposal(
    payload: ProposalIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "create")),
) -> ProposalOut:
    if payload.financing_type and payload.financing_type not in FINANCING_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Forma de pagamento inválida")

    code = (
        await db.execute(
            text("select sales.next_code(:tid, 'proposal')"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    proposal_id = (
        await db.execute(
            text(
                """
                insert into sales.proposals
                    (tenant_id, code, lead_id, property_id, buyer_id, broker_id,
                     asking_price, offer_amount, down_payment, financing_type,
                     financing_bank, conditions, valid_until)
                values (:tid, :code, :lead_id, :property_id, :buyer_id, :broker_id,
                        :asking_price, :offer_amount, :down_payment, :financing_type,
                        :financing_bank, :conditions, :valid_until)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "lead_id": str(payload.lead_id) if payload.lead_id else None,
                "property_id": str(payload.property_id),
                "buyer_id": str(payload.buyer_id) if payload.buyer_id else None,
                "broker_id": str(payload.broker_id) if payload.broker_id else str(user.user_id),
                "asking_price": payload.asking_price,
                "offer_amount": payload.offer_amount,
                "down_payment": payload.down_payment,
                "financing_type": payload.financing_type,
                "financing_bank": payload.financing_bank,
                "conditions": payload.conditions,
                "valid_until": payload.valid_until,
            },
        )
    ).scalar_one()

    # O comprador passa a constar no CRM com o papel correspondente.
    if payload.buyer_id:
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, 'comprador') on conflict do nothing"
            ),
            {"tid": str(user.tenant_id), "cid": str(payload.buyer_id)},
        )

    await record_audit(db, user, "proposal", proposal_id, "create")
    return await _get_proposal(db, proposal_id)


@router.post("/proposals/{proposal_id}/counter", response_model=ProposalOut)
async def counter_proposal(
    proposal_id: UUID,
    payload: CounterProposalIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "edit")),
) -> ProposalOut:
    """Registra a contraproposta como nova rodada, preservando o histórico."""
    original = await _get_proposal(db, proposal_id)
    if original.status not in ("aberta", "contraproposta"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta proposta já foi decidida")

    await db.execute(
        text(
            "update sales.proposals set status = 'contraproposta', "
            "decided_by = :uid, decided_at = now(), decision_notes = :notes where id = :pid"
        ),
        {"uid": str(user.user_id), "notes": payload.notes, "pid": str(proposal_id)},
    )

    code = (
        await db.execute(
            text("select sales.next_code(:tid, 'proposal')"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    new_id = (
        await db.execute(
            text(
                """
                insert into sales.proposals
                    (tenant_id, code, lead_id, property_id, buyer_id, broker_id,
                     asking_price, offer_amount, down_payment, financing_type,
                     financing_bank, conditions, valid_until, parent_id, round)
                select :tid, :code, lead_id, property_id, buyer_id, broker_id,
                       asking_price, :offer, down_payment, financing_type,
                       financing_bank, coalesce(:conditions, conditions),
                       coalesce(:valid_until, valid_until), id, round + 1
                from sales.proposals where id = :pid
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "offer": payload.offer_amount,
                "conditions": payload.conditions,
                "valid_until": payload.valid_until,
                "pid": str(proposal_id),
            },
        )
    ).scalar_one()

    await record_audit(db, user, "proposal", proposal_id, "counter")
    return await _get_proposal(db, new_id)


@router.post("/proposals/{proposal_id}/accept", response_model=ProposalOut)
async def accept_proposal(
    proposal_id: UUID,
    payload: ProposalDecision,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> ProposalOut:
    """Aceitar reserva o imóvel: ele sai da vitrine enquanto o negócio corre."""
    proposal = await _get_proposal(db, proposal_id)
    if proposal.status not in ("aberta", "contraproposta"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta proposta já foi decidida")

    await db.execute(
        text(
            "update sales.proposals set status = 'aceita', decided_by = :uid, "
            "decided_at = now(), decision_notes = :notes where id = :pid"
        ),
        {"uid": str(user.user_id), "notes": payload.notes, "pid": str(proposal_id)},
    )
    await db.execute(
        text(
            "update properties.properties set status = 'reservado' "
            "where id = :prop and status not in ('vendido', 'alugado')"
        ),
        {"prop": str(proposal.property_id)},
    )
    await record_audit(db, user, "proposal", proposal_id, "accept")
    return await _get_proposal(db, proposal_id)


@router.post("/proposals/{proposal_id}/reject", response_model=ProposalOut)
async def reject_proposal(
    proposal_id: UUID,
    payload: ProposalDecision,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> ProposalOut:
    proposal = await _get_proposal(db, proposal_id)
    if proposal.status not in ("aberta", "contraproposta"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta proposta já foi decidida")

    await db.execute(
        text(
            "update sales.proposals set status = 'recusada', decided_by = :uid, "
            "decided_at = now(), decision_notes = :notes where id = :pid"
        ),
        {"uid": str(user.user_id), "notes": payload.notes, "pid": str(proposal_id)},
    )
    await record_audit(db, user, "proposal", proposal_id, "reject")
    return await _get_proposal(db, proposal_id)


# ── Negócios e comissões ─────────────────────────────────────────────────────
@router.get("/deals", response_model=list[DealOut])
async def list_deals(
    db: DbDep,
    status_filter: str | None = None,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> list[DealOut]:
    where = "where d.status = :status" if status_filter else ""
    rows = (
        (
            await db.execute(
                text(f"{_DEAL_SELECT} {where} order by d.closed_at desc"),  # noqa: S608
                {"status": status_filter} if status_filter else {},
            )
        )
        .mappings()
        .all()
    )
    return [await _to_deal_out(db, r) for r in rows]


@router.post("/deals", response_model=DealOut, status_code=status.HTTP_201_CREATED)
async def create_deal(
    payload: DealIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> DealOut:
    """Fecha a venda: marca o imóvel como vendido, calcula e rateia a comissão.

    A comissão vira contas a receber no financeiro do tenant, para a venda
    aparecer no caixa sem depender do módulo de locação.
    """
    rule = (
        (
            await db.execute(
                text("select * from sales.commission_rules where tenant_id = :tid"),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )
    if rule is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "Regra de comissão não configurada"
        )

    commission_pct = (
        payload.commission_pct if payload.commission_pct is not None else rule["default_pct"]
    )

    code = (
        await db.execute(text("select sales.next_code(:tid, 'deal')"), {"tid": str(user.tenant_id)})
    ).scalar_one()

    deal_id = (
        await db.execute(
            text(
                """
                insert into sales.deals
                    (tenant_id, code, proposal_id, property_id, buyer_id, seller_id,
                     sale_amount, down_payment, financing_type, financing_bank,
                     commission_pct, closed_at, deed_date, notes)
                values (:tid, :code, :proposal_id, :property_id, :buyer_id, :seller_id,
                        :sale_amount, :down_payment, :financing_type, :financing_bank,
                        :commission_pct, coalesce(:closed_at, current_date), :deed_date, :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "proposal_id": str(payload.proposal_id) if payload.proposal_id else None,
                "property_id": str(payload.property_id),
                "buyer_id": str(payload.buyer_id) if payload.buyer_id else None,
                "seller_id": str(payload.seller_id) if payload.seller_id else None,
                "sale_amount": payload.sale_amount,
                "down_payment": payload.down_payment,
                "financing_type": payload.financing_type,
                "financing_bank": payload.financing_bank,
                "commission_pct": commission_pct,
                "closed_at": payload.closed_at,
                "deed_date": payload.deed_date,
                "notes": payload.notes,
            },
        )
    ).scalar_one()

    shares = default_shares(
        agency_pct=rule["agency_share_pct"],
        lister_pct=rule["lister_share_pct"],
        seller_pct=rule["seller_share_pct"],
        lister_id=str(payload.lister_id) if payload.lister_id else None,
        seller_id=str(payload.seller_broker_id) if payload.seller_broker_id else None,
    )
    commission = compute_commission(
        sale_amount=payload.sale_amount, commission_pct=commission_pct, shares=shares
    )

    for share in commission.shares:
        await db.execute(
            text(
                """
                insert into sales.commissions
                    (tenant_id, deal_id, beneficiary, user_id, share_pct, amount)
                values (:tid, :did, :beneficiary, :uid, :pct, :amount)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "did": str(deal_id),
                "beneficiary": share.beneficiary,
                "uid": share.user_id,
                "pct": share.share_pct,
                "amount": share.amount,
            },
        )

    await db.execute(
        text("update properties.properties set status = 'vendido' where id = :pid"),
        {"pid": str(payload.property_id)},
    )
    if payload.proposal_id:
        await db.execute(
            text("update sales.proposals set status = 'aceita' where id = :pid"),
            {"pid": str(payload.proposal_id)},
        )
    if payload.buyer_id:
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, 'comprador') on conflict do nothing"
            ),
            {"tid": str(user.tenant_id), "cid": str(payload.buyer_id)},
        )
    if payload.seller_id:
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, 'vendedor') on conflict do nothing"
            ),
            {"tid": str(user.tenant_id), "cid": str(payload.seller_id)},
        )

    await _post_commission_to_finance(db, user, deal_id, code, commission.agency_amount)
    await record_audit(
        db,
        user,
        "deal",
        deal_id,
        "create",
        after={"sale_amount": str(payload.sale_amount), "commission": str(commission.total)},
    )
    return await _get_deal(db, deal_id)


@router.post("/deals/{deal_id}/conclude", response_model=DealOut)
async def conclude_deal(
    deal_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> DealOut:
    """Conclui o negócio (escritura lavrada e chaves entregues)."""
    await db.execute(
        text(
            "update sales.deals set status = 'concluido', "
            "keys_handed_at = coalesce(keys_handed_at, current_date) where id = :did"
        ),
        {"did": str(deal_id)},
    )
    await record_audit(db, user, "deal", deal_id, "conclude")
    return await _get_deal(db, deal_id)


@router.post("/deals/{deal_id}/cancel", response_model=DealOut)
async def cancel_deal(
    deal_id: UUID,
    payload: ProposalDecision,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> DealOut:
    """Cancela a venda, devolve o imóvel à vitrine e cancela as comissões."""
    deal = await _get_deal(db, deal_id)
    if deal.status == "cancelado":
        raise HTTPException(status.HTTP_409_CONFLICT, "Negócio já cancelado")

    await db.execute(
        text(
            "update sales.deals set status = 'cancelado', cancel_reason = :reason "
            "where id = :did"
        ),
        {"reason": payload.notes, "did": str(deal_id)},
    )
    await db.execute(
        text("update sales.commissions set status = 'cancelado' where deal_id = :did"),
        {"did": str(deal_id)},
    )
    await db.execute(
        text("update properties.properties set status = 'disponivel' where id = :pid"),
        {"pid": str(deal.property_id)},
    )
    await db.execute(
        text(
            "update finance.receivables set status = 'cancelado' "
            "where source = 'sales_deal' and source_id = :did"
        ),
        {"did": str(deal_id)},
    )
    await record_audit(db, user, "deal", deal_id, "cancel")
    return await _get_deal(db, deal_id)


@router.post("/deals/{deal_id}/commissions/{beneficiary}/pay", response_model=DealOut)
async def pay_commission(
    deal_id: UUID,
    beneficiary: str,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> DealOut:
    """Marca a cota da comissão como paga ao corretor."""
    updated = (
        await db.execute(
            text(
                "update sales.commissions set status = 'pago', paid_at = current_date "
                "where deal_id = :did and beneficiary = :ben and status = 'pendente' "
                "returning id"
            ),
            {"did": str(deal_id), "ben": beneficiary},
        )
    ).first()
    if updated is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Comissão não encontrada ou já quitada")
    await record_audit(db, user, "commission", deal_id, "pay", after={"beneficiary": beneficiary})
    return await _get_deal(db, deal_id)


# ── Regra de comissão ────────────────────────────────────────────────────────
@router.get("/commission-rule", response_model=CommissionRuleOut)
async def get_commission_rule(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> CommissionRuleOut:
    row = (
        (
            await db.execute(
                text("select * from sales.commission_rules where tenant_id = :tid"),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Regra de comissão não configurada")
    return CommissionRuleOut(**{k: row[k] for k in CommissionRuleOut.model_fields})


@router.put("/commission-rule", response_model=CommissionRuleOut)
async def update_commission_rule(
    payload: CommissionRuleIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("vendas", "approve")),
) -> CommissionRuleOut:
    total = payload.agency_share_pct + payload.lister_share_pct + payload.seller_share_pct
    if total != Decimal(100):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"As cotas precisam somar 100% (somam {total}%)",
        )

    await db.execute(
        text(
            """
            update sales.commission_rules
            set default_pct = :default_pct, agency_share_pct = :agency_share_pct,
                lister_share_pct = :lister_share_pct, seller_share_pct = :seller_share_pct,
                updated_at = now()
            where tenant_id = :tid
            """
        ),
        {**payload.model_dump(), "tid": str(user.tenant_id)},
    )
    await record_audit(db, user, "commission_rule", user.tenant_id, "update")
    return await get_commission_rule(db, user)


# ── Painel do módulo ─────────────────────────────────────────────────────────
@router.get("/dashboard")
async def sales_dashboard(
    db: DbDep,
    months: int = 12,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> dict:
    """Indicadores próprios do módulo: VGV, conversão, ticket, comissões e ranking."""
    pipeline_id = await _default_pipeline(db)

    stage_rows = (
        (
            await db.execute(
                text(
                    """
                    select s.key, s.name, s.sort_order,
                           count(l.id) filter (where l.status = 'aberto') as abertos
                    from sales.pipeline_stages s
                    left join sales.leads l on l.stage_id = s.id
                    where s.pipeline_id = :pid
                    group by s.key, s.name, s.sort_order
                    order by s.sort_order
                    """
                ),
                {"pid": str(pipeline_id)},
            )
        )
        .mappings()
        .all()
    )
    funnel = funnel_conversion([(r["key"], r["name"], r["abertos"]) for r in stage_rows])

    deal_rows = (
        (
            await db.execute(
                text(
                    """
                    select d.sale_amount, d.commission_pct, d.closed_at, l.created_at
                    from sales.deals d
                    left join sales.proposals p on p.id = d.proposal_id
                    left join sales.leads l on l.id = p.lead_id
                    where d.status <> 'cancelado'
                      and d.closed_at >= date_trunc('month', current_date)
                                          - make_interval(months => :months)
                    """
                ),
                {"months": months},
            )
        )
        .mappings()
        .all()
    )
    kpis = compute_sales_kpis(
        [
            (
                r["sale_amount"],
                (r["sale_amount"] * r["commission_pct"] / 100).quantize(Decimal("0.01")),
                r["closed_at"],
                r["created_at"].date() if r["created_at"] else None,
            )
            for r in deal_rows
        ]
    )

    pipeline_value = (
        await db.execute(
            text(
                """
                select coalesce(sum(pr.offer_amount), 0)
                from sales.proposals pr
                where pr.status in ('aberta', 'contraproposta')
                """
            )
        )
    ).scalar_one()

    commissions = (
        (
            await db.execute(
                text(
                    """
                    select
                      coalesce(sum(amount) filter (where status = 'pendente'), 0) as a_pagar,
                      coalesce(sum(amount) filter (where status = 'pago'), 0) as pagas
                    from sales.commissions
                    where beneficiary <> 'agency'
                    """
                )
            )
        )
        .mappings()
        .first()
    )

    ranking = (
        (
            await db.execute(
                text(
                    """
                    select u.full_name as corretor,
                           count(distinct d.id) as vendas,
                           coalesce(sum(c.amount), 0) as comissao
                    from sales.commissions c
                    join sales.deals d on d.id = c.deal_id and d.status <> 'cancelado'
                    join core.users u on u.id = c.user_id
                    where c.beneficiary = 'seller_broker'
                      and d.closed_at >= date_trunc('month', current_date)
                                          - make_interval(months => :months)
                    group by u.full_name
                    order by count(distinct d.id) desc, sum(c.amount) desc
                    limit 10
                    """
                ),
                {"months": months},
            )
        )
        .mappings()
        .all()
    )

    return {
        "periodo_meses": months,
        "vgv": kpis.vgv,
        "vendas": kpis.deals_count,
        "ticket_medio": kpis.average_ticket,
        "comissao_gerada": kpis.commission_total,
        "ciclo_medio_dias": kpis.average_cycle_days,
        "valor_em_negociacao": pipeline_value,
        "comissoes": dict(commissions),
        "funil": [
            {
                "key": s.key,
                "name": s.name,
                "count": s.count,
                "conversion_pct": s.conversion_pct,
            }
            for s in funnel
        ],
        "ranking_corretores": [dict(r) for r in ranking],
    }


# ── Helpers ──────────────────────────────────────────────────────────────────
_PROPOSAL_SELECT = """
    select pr.*, p.code as property_code, p.title as property_title,
           c.name as buyer_name, u.full_name as broker_name
    from sales.proposals pr
    join properties.properties p on p.id = pr.property_id
    left join crm.clients c on c.id = pr.buyer_id
    left join core.users u on u.id = pr.broker_id
"""

_DEAL_SELECT = """
    select d.*, p.code as property_code, p.title as property_title,
           b.name as buyer_name, s.name as seller_name
    from sales.deals d
    join properties.properties p on p.id = d.property_id
    left join crm.clients b on b.id = d.buyer_id
    left join crm.clients s on s.id = d.seller_id
"""


@router.get("/ranking")
async def sales_ranking(
    db: DbDep,
    days: int = 30,
    user: CurrentUser = Depends(require_permission("vendas", "view")),
) -> dict:
    """Ranking da equipe de vendas no período (padrão: últimos 30 dias).

    Cada linha traz o que o gerente quer ver de golpe: leads recebidos,
    propostas enviadas, negócios fechados, comissão gerada e taxa de
    conversão (fechados/leads). A tendência compara com o período anterior
    do mesmo tamanho — assim o "dobrei este mês" ou "caí pela metade" fica
    óbvio.
    """
    period = max(1, min(days, 365))
    rows = (
        (
            await db.execute(
                text(
                    """
                    with periodo as (
                      select
                        current_date - :days as ini,
                        current_date         as fim,
                        current_date - (:days * 2) as ini_prev,
                        current_date - :days as fim_prev
                    )
                    select
                      u.id as user_id,
                      u.full_name as corretor,
                      count(distinct l.id) filter (
                        where l.created_at::date between p.ini and p.fim
                      ) as leads,
                      count(distinct pr.id) filter (
                        where pr.created_at::date between p.ini and p.fim
                      ) as propostas,
                      count(distinct d.id) filter (
                        where d.closed_at between p.ini and p.fim
                          and d.status <> 'cancelado'
                      ) as vendas,
                      coalesce(sum(c.amount) filter (
                        where d.closed_at between p.ini and p.fim
                          and d.status <> 'cancelado'
                      ), 0) as comissao,
                      count(distinct d.id) filter (
                        where d.closed_at between p.ini_prev and p.fim_prev
                          and d.status <> 'cancelado'
                      ) as vendas_prev
                    from core.users u
                    cross join periodo p
                    left join sales.leads l on l.assigned_to = u.id
                    left join sales.proposals pr on pr.lead_id = l.id
                    left join sales.deals d on d.proposal_id = pr.id
                    left join sales.commissions c
                      on c.deal_id = d.id and c.user_id = u.id
                      and c.beneficiary = 'seller_broker'
                    where u.status = 'active'
                    group by u.id, u.full_name
                    having count(distinct l.id) filter (
                             where l.created_at::date between p.ini and p.fim
                           ) > 0
                        or count(distinct d.id) filter (
                             where d.closed_at between p.ini and p.fim
                               and d.status <> 'cancelado'
                           ) > 0
                    order by vendas desc, comissao desc, leads desc
                    limit 20
                    """
                ),
                {"days": period},
            )
        )
        .mappings()
        .all()
    )

    ranking = []
    for r in rows:
        leads = int(r["leads"] or 0)
        vendas = int(r["vendas"] or 0)
        vendas_prev = int(r["vendas_prev"] or 0)
        # Delta em pontos absolutos; o consumidor decide como formatar.
        delta = vendas - vendas_prev
        conv = round(vendas / leads * 100, 1) if leads > 0 else None
        ranking.append(
            {
                "user_id": str(r["user_id"]),
                "corretor": r["corretor"],
                "leads": leads,
                "propostas": int(r["propostas"] or 0),
                "vendas": vendas,
                "comissao": float(r["comissao"] or 0),
                "conversao": conv,
                "vendas_prev": vendas_prev,
                "delta_vendas": delta,
            }
        )
    return {"periodo_dias": period, "items": ranking}


async def _default_pipeline(db) -> UUID:
    pipeline_id = (
        await db.execute(
            text("select id from sales.pipelines order by is_default desc, created_at limit 1")
        )
    ).scalar()
    if pipeline_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Funil de vendas não configurado")
    return pipeline_id


async def _next_broker(db) -> UUID | None:
    """Round-robin entre corretores, pelo número de leads de venda em aberto."""
    return (
        await db.execute(
            text(
                """
                select u.id
                from core.users u
                join core.user_roles ur on ur.user_id = u.id
                join core.roles r on r.id = ur.role_id and r.name = 'Corretor'
                left join sales.leads l on l.assigned_to = u.id and l.status = 'aberto'
                where u.status = 'active'
                group by u.id, u.full_name
                order by count(l.id), u.full_name
                limit 1
                """
            )
        )
    ).scalar()


async def _post_commission_to_finance(
    db, user: CurrentUser, deal_id: UUID, code: str, agency_amount: Decimal
) -> None:
    """Lança a parte da imobiliária como conta a receber.

    É o que faz a venda aparecer no caixa do tenant sem passar pelo módulo de
    locação — os dois módulos alimentam o mesmo financeiro central, cada um
    pela sua conta.
    """
    if agency_amount <= 0:
        return

    account_id = (
        await db.execute(
            text("select id from finance.chart_of_accounts where code = '1.02' limit 1")
        )
    ).scalar()
    cost_center_id = (
        await db.execute(text("select id from finance.cost_centers where name = 'Vendas' limit 1"))
    ).scalar()

    await db.execute(
        text(
            """
            insert into finance.receivables
                (tenant_id, description, account_id, cost_center_id, due_date,
                 competence_date, amount, source, source_id)
            values (:tid, :desc, :account_id, :cost_center_id, current_date,
                    current_date, :amount, 'sales_deal', :did)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "desc": f"Comissão de venda — {code}",
            "account_id": str(account_id) if account_id else None,
            "cost_center_id": str(cost_center_id) if cost_center_id else None,
            "amount": agency_amount,
            "did": str(deal_id),
        },
    )


def _proposal_out(row) -> ProposalOut:
    assessment = assess_proposal(asking_price=row["asking_price"], offer_amount=row["offer_amount"])
    return ProposalOut(
        **{
            k: row[k]
            for k in (
                "id",
                "code",
                "lead_id",
                "property_id",
                "buyer_id",
                "broker_id",
                "asking_price",
                "offer_amount",
                "down_payment",
                "financing_type",
                "financing_bank",
                "conditions",
                "valid_until",
                "status",
                "round",
                "parent_id",
                "decision_notes",
                "created_at",
            )
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        buyer_name=row["buyer_name"],
        broker_name=row["broker_name"],
        discount_amount=assessment.discount_amount,
        discount_pct=assessment.discount_pct,
    )


async def _get_lead(db, lead_id: UUID) -> LeadOut:
    row = (
        (await db.execute(text(f"{_LEAD_SELECT} where l.id = :lid"), {"lid": str(lead_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lead não encontrado")
    return _lead_out(row)


async def _get_proposal(db, proposal_id: UUID) -> ProposalOut:
    row = (
        (
            await db.execute(
                text(f"{_PROPOSAL_SELECT} where pr.id = :pid"), {"pid": str(proposal_id)}
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Proposta não encontrada")
    return _proposal_out(row)


async def _to_deal_out(db, row) -> DealOut:
    commissions = (
        (
            await db.execute(
                text(
                    """
                    select c.beneficiary, c.user_id, u.full_name as user_name,
                           c.share_pct, c.amount, c.status
                    from sales.commissions c
                    left join core.users u on u.id = c.user_id
                    where c.deal_id = :did
                    order by c.beneficiary
                    """
                ),
                {"did": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )
    total = sum((c["amount"] for c in commissions), Decimal("0.00"))

    return DealOut(
        **{
            k: row[k]
            for k in (
                "id",
                "code",
                "proposal_id",
                "property_id",
                "buyer_id",
                "seller_id",
                "sale_amount",
                "down_payment",
                "financing_type",
                "financing_bank",
                "commission_pct",
                "closed_at",
                "deed_date",
                "keys_handed_at",
                "status",
                "notes",
                "created_at",
            )
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        buyer_name=row["buyer_name"],
        seller_name=row["seller_name"],
        commission_total=total,
        commissions=[CommissionOut(**c) for c in commissions],
    )


async def _get_deal(db, deal_id: UUID) -> DealOut:
    row = (
        (await db.execute(text(f"{_DEAL_SELECT} where d.id = :did"), {"did": str(deal_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Negócio não encontrado")
    return await _to_deal_out(db, row)
