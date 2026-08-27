"""Prestadores e chamados de manutenção.

O objetivo do desenho é que a informação **não saia do sistema**: orçamento,
aprovação, execução e conversa com o prestador ficam registrados no chamado,
onde a equipe inteira enxerga — e não no WhatsApp pessoal de quem atendeu.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.format import brl
from app.core.security import CurrentUser
from app.domain.operations import average_rating, quote_spread, who_approves
from app.services.storage import BUCKET_DOCUMENTS, get_storage, tenant_path

router = APIRouter(
    prefix="/maintenance",
    tags=["manutenção"],
    dependencies=[Depends(require_module("module_rentals"))],
)

SPECIALTIES = (
    "pintura",
    "eletrica",
    "hidraulica",
    "reforma",
    "marcenaria",
    "chaveiro",
    "limpeza",
    "jardinagem",
    "ar_condicionado",
    "gas",
    "outro",
)


# ── Prestadores ──────────────────────────────────────────────────────────────
class ProviderIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    document: str | None = None
    phone: str | None = None
    email: str | None = None
    notes: str | None = None
    specialties: list[str] = Field(default_factory=list)


class ProviderOut(BaseModel):
    id: UUID
    name: str
    document: str | None
    phone: str | None
    email: str | None
    notes: str | None
    avg_rating: Decimal | None
    jobs_done: int
    active: bool
    specialties: list[str]


@router.get("/providers", response_model=list[ProviderOut])
async def list_providers(
    db: DbDep,
    specialty: str | None = None,
    user: CurrentUser = Depends(require_permission("manutencao", "view")),
) -> list[ProviderOut]:
    filters, params = ["p.active"], {}
    if specialty:
        filters.append(
            "exists (select 1 from maintenance.provider_specialties s "
            "where s.provider_id = p.id and s.specialty = :specialty)"
        )
        params["specialty"] = specialty

    rows = (
        (
            await db.execute(
                text(
                    f"""
                    select p.*,
                           coalesce(array_agg(s.specialty) filter (where s.specialty is not null),
                                    '{{}}') as specialties
                    from maintenance.service_providers p
                    left join maintenance.provider_specialties s on s.provider_id = p.id
                    where {" and ".join(filters)}
                    group by p.id
                    order by p.avg_rating desc nulls last, p.name
                    """  # noqa: S608
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    return [ProviderOut(**{k: r[k] for k in ProviderOut.model_fields}) for r in rows]


@router.post("/providers", response_model=ProviderOut, status_code=status.HTTP_201_CREATED)
async def create_provider(
    payload: ProviderIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "create")),
) -> ProviderOut:
    invalid = set(payload.specialties) - set(SPECIALTIES)
    if invalid:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"Especialidade inválida: {', '.join(sorted(invalid))}"
        )

    provider_id = (
        await db.execute(
            text(
                """
                insert into maintenance.service_providers
                    (tenant_id, name, document, phone, email, notes)
                values (:tid, :name, :doc, :phone, :email, :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "name": payload.name,
                "doc": payload.document,
                "phone": payload.phone,
                "email": payload.email,
                "notes": payload.notes,
            },
        )
    ).scalar_one()

    for specialty in dict.fromkeys(payload.specialties):
        await db.execute(
            text(
                "insert into maintenance.provider_specialties (tenant_id, provider_id, specialty) "
                "values (:tid, :pid, :specialty)"
            ),
            {"tid": str(user.tenant_id), "pid": str(provider_id), "specialty": specialty},
        )

    return await _get_provider(db, provider_id)


# ── Chamados ─────────────────────────────────────────────────────────────────
class TicketIn(BaseModel):
    property_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    contract_id: UUID | None = None
    opened_by_client_id: UUID | None = None
    specialty: str | None = None
    priority: str = Field("normal", pattern="^(baixa|normal|alta|urgente)$")


class TriageIn(BaseModel):
    payer: str = Field(pattern="^(proprietario|locatario|imobiliaria)$")
    specialty: str | None = None
    priority: str | None = Field(None, pattern="^(baixa|normal|alta|urgente)$")
    notes: str | None = None


class QuoteIn(BaseModel):
    provider_id: UUID
    amount: Decimal = Field(gt=0)
    description: str | None = None
    lead_days: int | None = None
    valid_until: date | None = None


class ApproveIn(BaseModel):
    quote_id: UUID
    scheduled_for: date | None = None
    notes: str | None = None


class MessageIn(BaseModel):
    summary: str = Field(min_length=1)


class CompleteIn(BaseModel):
    final_cost: Decimal | None = None
    notes: str | None = None


class RatingIn(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = None


class QuoteOut(BaseModel):
    id: UUID
    provider_id: UUID
    provider_name: str
    amount: Decimal
    description: str | None
    lead_days: int | None
    valid_until: date | None
    status: str
    is_cheapest: bool


class EventOut(BaseModel):
    id: UUID
    kind: str
    summary: str
    user_name: str | None
    created_at: datetime


class TicketPhotoOut(BaseModel):
    id: UUID
    moment: str
    url: str
    caption: str | None


class TicketOut(BaseModel):
    id: UUID
    code: str
    property_id: UUID
    property_code: str
    property_title: str
    contract_id: UUID | None
    title: str
    description: str | None
    specialty: str | None
    priority: str
    status: str
    payer: str | None
    opened_by: str | None
    approved_at: datetime | None
    approved_quote_id: UUID | None
    final_cost: Decimal | None
    scheduled_for: date | None
    completed_at: datetime | None
    # Quem precisa aprovar o orçamento escolhido, e por quê.
    approver: str | None
    approver_reason: str | None
    quote_spread: Decimal
    quotes: list[QuoteOut] = Field(default_factory=list)
    events: list[EventOut] = Field(default_factory=list)
    photos: list[TicketPhotoOut] = Field(default_factory=list)
    rating: int | None
    created_at: datetime


@router.get("/tickets", response_model=list[TicketOut])
async def list_tickets(
    db: DbDep,
    status_filter: str | None = None,
    property_id: UUID | None = None,
    user: CurrentUser = Depends(require_permission("manutencao", "view")),
) -> list[TicketOut]:
    filters, params = [], {}
    if status_filter:
        filters.append("t.status = :status")
        params["status"] = status_filter
    if property_id:
        filters.append("t.property_id = :pid")
        params["pid"] = str(property_id)
    where = f"where {' and '.join(filters)}" if filters else ""

    rows = (
        (
            await db.execute(
                text(
                    f"{_TICKET_SELECT} {where} "  # noqa: S608
                    "order by case t.priority when 'urgente' then 0 when 'alta' then 1 "
                    "when 'normal' then 2 else 3 end, t.created_at desc"
                ),
                params,
            )
        )
        .mappings()
        .all()
    )
    return [await _to_ticket_out(db, r) for r in rows]


@router.post("/tickets", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
async def create_ticket(
    payload: TicketIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "create")),
) -> TicketOut:
    code = (
        await db.execute(
            text("select maintenance.next_ticket_code(:tid)"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    ticket_id = (
        await db.execute(
            text(
                """
                insert into maintenance.tickets
                    (tenant_id, code, property_id, contract_id, opened_by_client_id,
                     opened_by_user_id, title, description, specialty, priority)
                values (:tid, :code, :pid, :cid, :client, :uid, :title, :desc, :spec, :priority)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "pid": str(payload.property_id),
                "cid": str(payload.contract_id) if payload.contract_id else None,
                "client": (
                    str(payload.opened_by_client_id) if payload.opened_by_client_id else None
                ),
                "uid": str(user.user_id) if not payload.opened_by_client_id else None,
                "title": payload.title,
                "desc": payload.description,
                "spec": payload.specialty,
                "priority": payload.priority,
            },
        )
    ).scalar_one()

    await _log(db, user, ticket_id, "abertura", f"Chamado {code} aberto")
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/triage", response_model=TicketOut)
async def triage_ticket(
    ticket_id: UUID,
    payload: TriageIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    """Triagem: define quem paga e encaminha para orçamento."""
    fields = {"payer": payload.payer, "status": "orcamento"}
    if payload.specialty:
        fields["specialty"] = payload.specialty
    if payload.priority:
        fields["priority"] = payload.priority

    sets = ", ".join(f"{k} = :{k}" for k in fields)
    await db.execute(
        text(f"update maintenance.tickets set {sets} where id = :tid"),  # noqa: S608
        {**fields, "tid": str(ticket_id)},
    )
    await _log(
        db,
        user,
        ticket_id,
        "triagem",
        payload.notes or f"Triagem concluída — custo do {payload.payer}",
    )
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/quotes", response_model=TicketOut)
async def add_quote(
    ticket_id: UUID,
    payload: QuoteIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    """Registra um orçamento. O fluxo prevê comparar até três."""
    existing = (
        await db.execute(
            text("select count(*) from maintenance.quotes where ticket_id = :tid"),
            {"tid": str(ticket_id)},
        )
    ).scalar_one()
    if existing >= 3:
        raise HTTPException(status.HTTP_409_CONFLICT, "Já há três orçamentos neste chamado")

    provider_name = (
        await db.execute(
            text("select name from maintenance.service_providers where id = :pid"),
            {"pid": str(payload.provider_id)},
        )
    ).scalar()
    if provider_name is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Prestador não encontrado")

    await db.execute(
        text(
            """
            insert into maintenance.quotes
                (tenant_id, ticket_id, provider_id, amount, description, lead_days, valid_until)
            values (:tid, :ticket, :provider, :amount, :desc, :lead, :valid)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "ticket": str(ticket_id),
            "provider": str(payload.provider_id),
            "amount": payload.amount,
            "desc": payload.description,
            "lead": payload.lead_days,
            "valid": payload.valid_until,
        },
    )
    await db.execute(
        text(
            "update maintenance.tickets set status = 'aprovacao' "
            "where id = :tid and status in ('aberto', 'triagem', 'orcamento')"
        ),
        {"tid": str(ticket_id)},
    )
    await _log(
        db,
        user,
        ticket_id,
        "orcamento",
        f"Orçamento de {provider_name}: {brl(payload.amount)}",
    )
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/approve", response_model=TicketOut)
async def approve_ticket(
    ticket_id: UUID,
    payload: ApproveIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "approve")),
) -> TicketOut:
    """Aprova o orçamento escolhido e libera a execução."""
    quote = (
        (
            await db.execute(
                text(
                    "select q.*, p.name as provider_name from maintenance.quotes q "
                    "join maintenance.service_providers p on p.id = q.provider_id "
                    "where q.id = :qid and q.ticket_id = :tid"
                ),
                {"qid": str(payload.quote_id), "tid": str(ticket_id)},
            )
        )
        .mappings()
        .first()
    )
    if quote is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Orçamento não encontrado")

    await db.execute(
        text("update maintenance.quotes set status = 'recusado' where ticket_id = :tid"),
        {"tid": str(ticket_id)},
    )
    await db.execute(
        text("update maintenance.quotes set status = 'aprovado' where id = :qid"),
        {"qid": str(payload.quote_id)},
    )
    await db.execute(
        text(
            """
            update maintenance.tickets
            set status = 'execucao', approved_quote_id = :qid, approved_by_user_id = :uid,
                approved_at = now(), scheduled_for = :scheduled
            where id = :tid
            """
        ),
        {
            "qid": str(payload.quote_id),
            "uid": str(user.user_id),
            "scheduled": payload.scheduled_for,
            "tid": str(ticket_id),
        },
    )
    await _log(
        db,
        user,
        ticket_id,
        "aprovacao",
        payload.notes or f"Aprovado o orçamento de {quote['provider_name']}",
    )
    await record_audit(
        db,
        user,
        "maintenance_ticket",
        ticket_id,
        "approve",
        after={"quote_id": str(payload.quote_id), "amount": str(quote["amount"])},
    )
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/messages", response_model=TicketOut)
async def add_message(
    ticket_id: UUID,
    payload: MessageIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    """Registra a conversa com o prestador dentro do chamado."""
    await _log(db, user, ticket_id, "mensagem", payload.summary)
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/photos", response_model=TicketOut)
async def upload_ticket_photo(
    ticket_id: UUID,
    db: DbDep,
    moment: str = "antes",
    caption: str | None = None,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    if moment not in ("antes", "depois"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Momento deve ser 'antes' ou 'depois'")

    content = await file.read()
    ext = (file.filename or "foto.jpg").rsplit(".", 1)[-1].lower()
    path = tenant_path(user.tenant_id, "chamados", str(ticket_id), f"{uuid4().hex}.{ext}")
    await get_storage().upload(BUCKET_DOCUMENTS, path, content, file.content_type or "image/jpeg")

    await db.execute(
        text(
            "insert into maintenance.photos (tenant_id, ticket_id, moment, storage_path, caption) "
            "values (:tid, :ticket, :moment, :path, :caption)"
        ),
        {
            "tid": str(user.tenant_id),
            "ticket": str(ticket_id),
            "moment": moment,
            "path": path,
            "caption": caption,
        },
    )
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/complete", response_model=TicketOut)
async def complete_ticket(
    ticket_id: UUID,
    payload: CompleteIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    """Conclui o serviço e lança o custo conforme quem paga.

    Proprietário paga via desconto no repasse; locatário, via cobrança avulsa;
    a imobiliária, como despesa própria — os três caminhos vão para o
    financeiro central, cada um no seu lugar.
    """
    ticket = await _get_ticket(db, ticket_id)
    if ticket.status == "concluido":
        raise HTTPException(status.HTTP_409_CONFLICT, "Chamado já concluído")

    approved = next((q for q in ticket.quotes if q.status == "aprovado"), None)
    cost = (
        payload.final_cost
        if payload.final_cost is not None
        else (approved.amount if approved else None)
    )

    await db.execute(
        text(
            "update maintenance.tickets set status = 'concluido', final_cost = :cost, "
            "completed_at = now(), closed_at = now() where id = :tid"
        ),
        {"cost": cost, "tid": str(ticket_id)},
    )

    if approved:
        await db.execute(
            text(
                "update maintenance.service_providers set jobs_done = jobs_done + 1 "
                "where id = :pid"
            ),
            {"pid": str(approved.provider_id)},
        )

    if cost and ticket.payer:
        await _post_cost_to_finance(db, user, ticket, cost)

    await _log(
        db,
        user,
        ticket_id,
        "conclusao",
        payload.notes or (f"Serviço concluído — {brl(cost)}" if cost else "Serviço concluído"),
    )
    return await _get_ticket(db, ticket_id)


@router.post("/tickets/{ticket_id}/rate", response_model=TicketOut)
async def rate_ticket(
    ticket_id: UUID,
    payload: RatingIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "edit")),
) -> TicketOut:
    """Avaliação do serviço, que alimenta a nota do prestador."""
    await db.execute(
        text(
            """
            insert into maintenance.ratings (ticket_id, tenant_id, score, comment)
            values (:tid, :tenant, :score, :comment)
            on conflict (ticket_id) do update
              set score = excluded.score, comment = excluded.comment, rated_at = now()
            """
        ),
        {
            "tid": str(ticket_id),
            "tenant": str(user.tenant_id),
            "score": payload.score,
            "comment": payload.comment,
        },
    )

    provider_id = (
        await db.execute(
            text(
                "select q.provider_id from maintenance.quotes q "
                "join maintenance.tickets t on t.approved_quote_id = q.id "
                "where t.id = :tid"
            ),
            {"tid": str(ticket_id)},
        )
    ).scalar()

    if provider_id:
        scores = (
            (
                await db.execute(
                    text(
                        """
                        select r.score from maintenance.ratings r
                        join maintenance.tickets t on t.id = r.ticket_id
                        join maintenance.quotes q on q.id = t.approved_quote_id
                        where q.provider_id = :pid
                        """
                    ),
                    {"pid": str(provider_id)},
                )
            )
            .scalars()
            .all()
        )
        await db.execute(
            text("update maintenance.service_providers set avg_rating = :avg where id = :pid"),
            {"avg": average_rating(list(scores)), "pid": str(provider_id)},
        )

    await _log(db, user, ticket_id, "avaliacao", f"Serviço avaliado com {payload.score} de 5")
    return await _get_ticket(db, ticket_id)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(
    ticket_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("manutencao", "view")),
) -> TicketOut:
    return await _get_ticket(db, ticket_id)


# ── Helpers ──────────────────────────────────────────────────────────────────
_TICKET_SELECT = """
    select t.*, p.code as property_code, p.title as property_title,
           coalesce(c.name, u.full_name) as opened_by,
           r.score as rating
    from maintenance.tickets t
    join properties.properties p on p.id = t.property_id
    left join crm.clients c on c.id = t.opened_by_client_id
    left join core.users u on u.id = t.opened_by_user_id
    left join maintenance.ratings r on r.ticket_id = t.id
"""


async def _log(db, user: CurrentUser, ticket_id: UUID, kind: str, summary: str) -> None:
    await db.execute(
        text(
            "insert into maintenance.events (tenant_id, ticket_id, kind, user_id, summary) "
            "values (:tid, :ticket, :kind, :uid, :summary)"
        ),
        {
            "tid": str(user.tenant_id),
            "ticket": str(ticket_id),
            "kind": kind,
            "uid": str(user.user_id),
            "summary": summary,
        },
    )


async def _post_cost_to_finance(db, user: CurrentUser, ticket: TicketOut, cost: Decimal) -> None:
    """Encaminha o custo do reparo para o lugar certo do financeiro."""
    description = f"Manutenção {ticket.code} — {ticket.title}"

    if ticket.payer == "proprietario":
        # Abatido do repasse do proprietário do imóvel, no mês corrente.
        owner_id = (
            await db.execute(
                text(
                    "select client_id from properties.property_owners "
                    "where property_id = :pid and is_payee limit 1"
                ),
                {"pid": str(ticket.property_id)},
            )
        ).scalar()
        if owner_id:
            payout_id = (
                await db.execute(
                    text(
                        """
                        insert into rentals.payouts (tenant_id, owner_client_id, reference_month)
                        values (:tid, :owner, date_trunc('month', current_date)::date)
                        on conflict (tenant_id, owner_client_id, reference_month)
                        do update set updated_at = now()
                        returning id
                        """
                    ),
                    {"tid": str(user.tenant_id), "owner": str(owner_id)},
                )
            ).scalar_one()
            await db.execute(
                text(
                    """
                    insert into rentals.payout_items
                        (tenant_id, payout_id, contract_id, kind, description, amount)
                    values (:tid, :pid, :cid, 'desconto_manutencao', :desc, :amount)
                    """
                ),
                {
                    "tid": str(user.tenant_id),
                    "pid": str(payout_id),
                    "cid": str(ticket.contract_id) if ticket.contract_id else None,
                    "desc": description,
                    "amount": -cost,
                },
            )
            await db.execute(
                text(
                    """
                    update rentals.payouts p set
                      gross_amount = coalesce(g.gross, 0),
                      admin_fee = coalesce(g.fee, 0),
                      deductions = coalesce(g.deductions, 0),
                      net_amount = coalesce(g.net, 0)
                    from (
                      select
                        sum(amount) filter (where amount > 0) as gross,
                        -sum(amount) filter (where kind = 'taxa_adm') as fee,
                        -sum(amount) filter (where kind = 'desconto_manutencao') as deductions,
                        sum(amount) as net
                      from rentals.payout_items where payout_id = :pid
                    ) g
                    where p.id = :pid
                    """
                ),
                {"pid": str(payout_id)},
            )
        return

    if ticket.payer == "locatario":
        # Cobrança avulsa do locatário.
        await db.execute(
            text(
                """
                insert into finance.receivables
                    (tenant_id, description, due_date, competence_date, amount, source, source_id)
                values (:tid, :desc, current_date + 10, current_date, :amount,
                        'maintenance_ticket', :ticket)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "desc": description,
                "amount": cost,
                "ticket": str(ticket.id),
            },
        )
        return

    # Imobiliária: despesa própria.
    await db.execute(
        text(
            """
            insert into finance.payables
                (tenant_id, description, due_date, competence_date, amount)
            values (:tid, :desc, current_date + 10, current_date, :amount)
            """
        ),
        {"tid": str(user.tenant_id), "desc": description, "amount": cost},
    )


async def _to_ticket_out(db, row) -> TicketOut:
    quotes_rows = (
        (
            await db.execute(
                text(
                    """
                    select q.*, p.name as provider_name
                    from maintenance.quotes q
                    join maintenance.service_providers p on p.id = q.provider_id
                    where q.ticket_id = :tid
                    order by q.amount
                    """
                ),
                {"tid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )
    amounts = [q["amount"] for q in quotes_rows]
    cheapest = min(amounts) if amounts else None

    quotes = [
        QuoteOut(
            **{
                k: q[k]
                for k in (
                    "id",
                    "provider_id",
                    "amount",
                    "description",
                    "lead_days",
                    "valid_until",
                    "status",
                )
            },
            provider_name=q["provider_name"],
            is_cheapest=q["amount"] == cheapest,
        )
        for q in quotes_rows
    ]

    events = (
        (
            await db.execute(
                text(
                    """
                    -- Ordem cronológica: o histórico de um chamado é lido como
                    -- conversa, do primeiro contato até a conclusão.
                    select e.id, e.kind, e.summary, e.created_at, u.full_name as user_name
                    from maintenance.events e
                    left join core.users u on u.id = e.user_id
                    where e.ticket_id = :tid
                    order by e.created_at
                    """
                ),
                {"tid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )

    photos_rows = (
        (
            await db.execute(
                text(
                    "select id, moment, storage_path, caption from maintenance.photos "
                    "where ticket_id = :tid order by created_at"
                ),
                {"tid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )
    storage = get_storage()

    # Quem aprova depende do valor do orçamento mais barato e de quem paga.
    approver = approver_reason = None
    if cheapest is not None and row["status"] in ("orcamento", "aprovacao"):
        limit = (
            await db.execute(text("select agency_limit_amount from maintenance.approval_rules"))
        ).scalar() or Decimal("300")
        decision = who_approves(amount=cheapest, payer=row["payer"], agency_limit=limit)
        approver, approver_reason = decision.approver, decision.reason

    return TicketOut(
        **{
            k: row[k]
            for k in (
                "id",
                "code",
                "property_id",
                "contract_id",
                "title",
                "description",
                "specialty",
                "priority",
                "status",
                "payer",
                "approved_at",
                "approved_quote_id",
                "final_cost",
                "scheduled_for",
                "completed_at",
                "created_at",
            )
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        opened_by=row["opened_by"],
        approver=approver,
        approver_reason=approver_reason,
        quote_spread=quote_spread(list(amounts)),
        quotes=quotes,
        events=[EventOut(**dict(e)) for e in events],
        photos=[
            TicketPhotoOut(
                id=p["id"],
                moment=p["moment"],
                url=storage.public_url(BUCKET_DOCUMENTS, p["storage_path"]),
                caption=p["caption"],
            )
            for p in photos_rows
        ],
        rating=row["rating"],
    )


async def _get_ticket(db, ticket_id: UUID) -> TicketOut:
    row = (
        (await db.execute(text(f"{_TICKET_SELECT} where t.id = :tid"), {"tid": str(ticket_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Chamado não encontrado")
    return await _to_ticket_out(db, row)


async def _get_provider(db, provider_id: UUID) -> ProviderOut:
    row = (
        (
            await db.execute(
                text(
                    """
                    select p.*,
                           coalesce(array_agg(s.specialty) filter (where s.specialty is not null),
                                    '{}') as specialties
                    from maintenance.service_providers p
                    left join maintenance.provider_specialties s on s.provider_id = p.id
                    where p.id = :pid
                    group by p.id
                    """
                ),
                {"pid": str(provider_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Prestador não encontrado")
    return ProviderOut(**{k: row[k] for k in ProviderOut.model_fields})
