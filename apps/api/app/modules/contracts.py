"""Contratos de locação: geração a partir de template, assinatura e reajuste."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import text

from app.core.activity import record_activity
from app.core.audit import record_audit
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.domain.adjustment import (
    compute_adjustment,
    is_adjustment_due,
    next_adjustment_date,
)
from app.providers.base import Signer
from app.providers.registry import get_signature_provider
from app.services.contract_render import render_contract
from app.services.storage import BUCKET_CONTRACTS, get_storage, tenant_path

router = APIRouter(
    prefix="/contracts",
    tags=["contratos"],
    dependencies=[Depends(require_module("module_rentals"))],
)


class PartyIn(BaseModel):
    client_id: UUID
    role: str = Field(pattern="^(locatario|locador|fiador)$")
    is_payee: bool = False
    share_pct: Decimal = Decimal("100")
    wallet_id: str | None = None


class ContractIn(BaseModel):
    property_id: UUID
    template_id: UUID | None = None
    rent_amount: Decimal = Field(gt=0)
    condo_fee: Decimal = Decimal("0")
    iptu_amount: Decimal = Decimal("0")
    insurance_amount: Decimal = Decimal("0")
    admin_fee_pct: Decimal = Field(Decimal("10"), ge=0, le=100)
    price_index: str = Field("IGPM", pattern="^(IGPM|IPCA)$")
    start_date: date
    end_date: date
    due_day: int = Field(10, ge=1, le=28)
    guarantee_type: str | None = None
    guarantee_amount: Decimal | None = None
    late_fine_pct: Decimal = Decimal("2")
    daily_interest_pct: Decimal = Decimal("0.033")
    punctuality_discount: Decimal = Decimal("0")
    notes: str | None = None
    parties: list[PartyIn] = Field(default_factory=list)

    @model_validator(mode="after")
    def _check(self) -> ContractIn:
        if self.end_date <= self.start_date:
            raise ValueError("A data de fim precisa ser posterior à de início")
        roles = [p.role for p in self.parties]
        if roles and "locatario" not in roles:
            raise ValueError("O contrato precisa de ao menos um locatário")
        return self


class PartyOut(BaseModel):
    client_id: UUID
    name: str
    role: str
    is_payee: bool
    share_pct: Decimal
    wallet_id: str | None


class ContractOut(BaseModel):
    id: UUID
    code: str
    property_id: UUID
    property_code: str
    property_title: str
    rent_amount: Decimal
    condo_fee: Decimal
    iptu_amount: Decimal
    insurance_amount: Decimal
    total_monthly: Decimal
    admin_fee_pct: Decimal
    admin_fee_amount: Decimal
    price_index: str
    start_date: date
    end_date: date
    due_day: int
    guarantee_type: str | None
    guarantee_amount: Decimal | None
    late_fine_pct: Decimal
    daily_interest_pct: Decimal
    punctuality_discount: Decimal
    status: str
    signed_doc_path: str | None
    last_adjustment_at: date | None
    next_adjustment_at: date
    adjustment_due: bool
    days_to_expiry: int
    parties: list[PartyOut]
    notes: str | None
    created_at: datetime


class SignatureOut(BaseModel):
    envelope_id: str
    status: str
    signers: list[dict]
    sent_at: datetime


class AdjustmentPreview(BaseModel):
    index_name: str
    months_used: int
    accumulated_pct: Decimal
    previous_rent: Decimal
    new_rent: Decimal
    difference: Decimal


# ── CRUD ─────────────────────────────────────────────────────────────────────
@router.get("", response_model=list[ContractOut])
async def list_contracts(
    db: DbDep,
    status_filter: str | None = None,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> list[ContractOut]:
    where = "where c.status = :status" if status_filter else ""
    rows = (
        (
            await db.execute(
                text(
                    f"""
                    select c.*, p.code as property_code, p.title as property_title
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    {where}
                    order by c.created_at desc
                    """  # noqa: S608
                ),
                {"status": status_filter} if status_filter else {},
            )
        )
        .mappings()
        .all()
    )
    return [await _to_contract_out(db, r) for r in rows]


@router.post("", response_model=ContractOut, status_code=status.HTTP_201_CREATED)
async def create_contract(
    payload: ContractIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "create")),
) -> ContractOut:
    code = (
        await db.execute(
            text("select rentals.next_contract_code(:tid)"), {"tid": str(user.tenant_id)}
        )
    ).scalar_one()

    template_id = (
        payload.template_id
        or (
            await db.execute(
                text(
                    "select id from rentals.contract_templates "
                    "order by is_default desc, created_at limit 1"
                )
            )
        ).scalar()
    )

    contract_id = (
        await db.execute(
            text(
                """
                insert into rentals.contracts
                    (tenant_id, code, property_id, template_id, rent_amount, condo_fee,
                     iptu_amount, insurance_amount, admin_fee_pct, price_index,
                     start_date, end_date, due_day, guarantee_type, guarantee_amount,
                     late_fine_pct, daily_interest_pct, punctuality_discount, notes)
                values (:tid, :code, :property_id, :template_id, :rent_amount, :condo_fee,
                        :iptu_amount, :insurance_amount, :admin_fee_pct, :price_index,
                        :start_date, :end_date, :due_day, :guarantee_type, :guarantee_amount,
                        :late_fine_pct, :daily_interest_pct, :punctuality_discount, :notes)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "code": code,
                "property_id": str(payload.property_id),
                "template_id": str(template_id) if template_id else None,
                **payload.model_dump(
                    include={
                        "rent_amount",
                        "condo_fee",
                        "iptu_amount",
                        "insurance_amount",
                        "admin_fee_pct",
                        "price_index",
                        "start_date",
                        "end_date",
                        "due_day",
                        "guarantee_type",
                        "guarantee_amount",
                        "late_fine_pct",
                        "daily_interest_pct",
                        "punctuality_discount",
                        "notes",
                    }
                ),
            },
        )
    ).scalar_one()

    for party in payload.parties:
        await db.execute(
            text(
                """
                insert into rentals.contract_parties
                    (tenant_id, contract_id, client_id, role, is_payee, share_pct, wallet_id)
                values (:tid, :cid, :client_id, :role, :is_payee, :share_pct, :wallet_id)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "cid": str(contract_id),
                "client_id": str(party.client_id),
                "role": party.role,
                "is_payee": party.is_payee,
                "share_pct": party.share_pct,
                "wallet_id": party.wallet_id,
            },
        )
        role_map = {"locatario": "locatario", "locador": "proprietario", "fiador": "fiador"}
        await db.execute(
            text(
                "insert into crm.client_roles (tenant_id, client_id, role) "
                "values (:tid, :cid, :role) on conflict do nothing"
            ),
            {
                "tid": str(user.tenant_id),
                "cid": str(party.client_id),
                "role": role_map[party.role],
            },
        )

    await record_audit(db, user, "contract", contract_id, "create")
    return await _get_contract(db, contract_id)


@router.get("/{contract_id}", response_model=ContractOut)
async def get_contract(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> ContractOut:
    return await _get_contract(db, contract_id)


@router.get("/{contract_id}/preview", response_model=dict)
async def preview_contract(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> dict:
    """Texto do contrato com as variáveis já substituídas."""
    return {"body": await render_contract(db, contract_id, user.tenant_name)}


@router.post("/{contract_id}/sign", response_model=SignatureOut)
async def send_for_signature(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "approve")),
) -> SignatureOut:
    """Envia o contrato para assinatura eletrônica e trava o rascunho."""
    contract = await _get_contract(db, contract_id)
    if contract.status not in ("rascunho", "em_assinatura"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Só é possível enviar contrato em rascunho")
    if not contract.parties:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cadastre as partes antes de enviar para assinatura"
        )

    body = await render_contract(db, contract_id, user.tenant_name)
    document = body.encode("utf-8")

    signer_rows = (
        (
            await db.execute(
                text(
                    """
                    select c.name, c.cpf_cnpj, ct.value as email, p.role
                    from rentals.contract_parties p
                    join crm.clients c on c.id = p.client_id
                    left join crm.client_contacts ct
                      on ct.client_id = c.id and ct.kind = 'email'
                    where p.contract_id = :cid
                    """
                ),
                {"cid": str(contract_id)},
            )
        )
        .mappings()
        .all()
    )

    provider = get_signature_provider()
    result = await provider.send_for_signature(
        document=document,
        file_name=f"{contract.code}.txt",
        signers=[
            Signer(
                name=r["name"],
                email=r["email"] or "",
                document=r["cpf_cnpj"],
                role=r["role"],
            )
            for r in signer_rows
        ],
        external_ref=str(contract_id),
    )

    path = tenant_path(user.tenant_id, "contratos", f"{contract.code}.txt")
    await get_storage().upload(BUCKET_CONTRACTS, path, document, "text/plain")

    await db.execute(
        text(
            """
            insert into rentals.signature_requests
                (tenant_id, contract_id, provider, envelope_id, status, signers, document_path)
            values (:tid, :cid, :provider, :envelope, :status, cast(:signers as jsonb), :path)
            on conflict (tenant_id, envelope_id) do nothing
            """
        ),
        {
            "tid": str(user.tenant_id),
            "cid": str(contract_id),
            "provider": "mock",
            "envelope": result.envelope_id,
            "status": result.status,
            "signers": __import__("json").dumps(result.signers),
            "path": path,
        },
    )
    await db.execute(
        text("update rentals.contracts set status = 'em_assinatura' where id = :cid"),
        {"cid": str(contract_id)},
    )
    await record_audit(db, user, "contract", contract_id, "send_for_signature")

    return SignatureOut(
        envelope_id=result.envelope_id,
        status=result.status,
        signers=result.signers,
        sent_at=datetime.now(),
    )


@router.post("/{contract_id}/activate", response_model=ContractOut)
async def activate_contract(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "approve")),
) -> ContractOut:
    """Ativa o contrato assinado e marca o imóvel como alugado."""
    contract = await _get_contract(db, contract_id)
    if contract.status == "ativo":
        raise HTTPException(status.HTTP_409_CONFLICT, "Contrato já está ativo")

    await db.execute(
        text("update rentals.contracts set status = 'ativo' where id = :cid"),
        {"cid": str(contract_id)},
    )
    await db.execute(
        text("update properties.properties set status = 'alugado' where id = :pid"),
        {"pid": str(contract.property_id)},
    )
    await record_audit(db, user, "contract", contract_id, "activate")
    activated = await _get_contract(db, contract_id)
    await record_activity(
        db,
        user,
        event_type="contract.activated",
        summary=f"Contrato {activated.code} ativado",
        subject_type="contract",
        subject_id=contract_id,
    )
    return activated


@router.post("/{contract_id}/terminate", response_model=ContractOut)
async def terminate_contract(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "approve")),
) -> ContractOut:
    """Encerra o contrato e devolve o imóvel para disponível."""
    contract = await _get_contract(db, contract_id)
    await db.execute(
        text(
            "update rentals.contracts set status = 'encerrado', terminated_at = current_date "
            "where id = :cid"
        ),
        {"cid": str(contract_id)},
    )
    await db.execute(
        text("update properties.properties set status = 'disponivel' where id = :pid"),
        {"pid": str(contract.property_id)},
    )
    await record_audit(db, user, "contract", contract_id, "terminate")
    return await _get_contract(db, contract_id)


# ── Reajuste ─────────────────────────────────────────────────────────────────
@router.get("/{contract_id}/adjustment/preview", response_model=AdjustmentPreview)
async def preview_adjustment(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> AdjustmentPreview:
    contract = await _get_contract(db, contract_id)
    pcts, months = await _index_series(db, contract.price_index, contract.next_adjustment_at)
    result = compute_adjustment(current_rent=contract.rent_amount, monthly_pcts=pcts)

    return AdjustmentPreview(
        index_name=contract.price_index,
        months_used=months,
        accumulated_pct=result.accumulated_pct,
        previous_rent=result.previous_rent,
        new_rent=result.new_rent,
        difference=result.difference,
    )


@router.post("/{contract_id}/adjustment/apply", response_model=ContractOut)
async def apply_adjustment(
    contract_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "approve")),
) -> ContractOut:
    """Aplica o reajuste anual pelo índice contratado."""
    contract = await _get_contract(db, contract_id)
    if not contract.adjustment_due:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"O reajuste deste contrato só vence em {contract.next_adjustment_at:%d/%m/%Y}",
        )

    pcts, months = await _index_series(db, contract.price_index, contract.next_adjustment_at)
    if months == 0:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Não há série do {contract.price_index} para o período do reajuste",
        )

    result = compute_adjustment(current_rent=contract.rent_amount, monthly_pcts=pcts)

    await db.execute(
        text(
            """
            insert into rentals.contract_adjustments
                (tenant_id, contract_id, applied_at, index_name, accumulated_pct,
                 previous_rent, new_rent, applied_by)
            values (:tid, :cid, current_date, :index, :pct, :prev, :new, :uid)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "cid": str(contract_id),
            "index": contract.price_index,
            "pct": result.accumulated_pct,
            "prev": result.previous_rent,
            "new": result.new_rent,
            "uid": str(user.user_id),
        },
    )
    await db.execute(
        text(
            "update rentals.contracts set rent_amount = :rent, "
            "last_adjustment_at = current_date where id = :cid"
        ),
        {"rent": result.new_rent, "cid": str(contract_id)},
    )
    await record_audit(
        db,
        user,
        "contract",
        contract_id,
        "adjust",
        before={"rent_amount": str(result.previous_rent)},
        after={"rent_amount": str(result.new_rent), "pct": str(result.accumulated_pct)},
    )
    return await _get_contract(db, contract_id)


@router.get("/alerts/expiring", response_model=list[dict])
async def expiring_contracts(
    db: DbDep,
    days: int = 90,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> list[dict]:
    """Contratos ativos com fim de vigência dentro do prazo informado."""
    rows = (
        (
            await db.execute(
                text(
                    """
                    select c.id, c.code, c.end_date, c.rent_amount,
                           (c.end_date - current_date) as days_left,
                           p.code as property_code, p.title as property_title,
                           (select cl.name from rentals.contract_parties cp
                             join crm.clients cl on cl.id = cp.client_id
                            where cp.contract_id = c.id and cp.role = 'locatario'
                            limit 1) as tenant_name
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    where c.status = 'ativo'
                      and c.end_date <= current_date + make_interval(days => :days)
                    order by c.end_date
                    """
                ),
                {"days": days},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.get("/alerts/adjustments", response_model=list[dict])
async def contracts_due_for_adjustment(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("locacao", "view")),
) -> list[dict]:
    rows = (
        (
            await db.execute(
                text(
                    """
                    select c.id, c.code, c.rent_amount, c.price_index,
                           c.start_date, c.last_adjustment_at, p.code as property_code
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    where c.status = 'ativo'
                    order by c.start_date
                    """
                )
            )
        )
        .mappings()
        .all()
    )
    today = date.today()
    return [
        dict(r) for r in rows if is_adjustment_due(r["start_date"], r["last_adjustment_at"], today)
    ]


# ── Helpers ──────────────────────────────────────────────────────────────────
async def _index_series(db, index_name: str, reference: date) -> tuple[list[Decimal], int]:
    """Série dos doze meses anteriores à data de reajuste."""
    rows = (
        (
            await db.execute(
                text(
                    """
                select monthly_pct from rentals.price_indexes
                where index_name = :index
                  and reference_month < date_trunc('month', cast(:ref as date))
                  and reference_month >= date_trunc('month', cast(:ref as date))
                                          - interval '12 months'
                order by reference_month
                """
                ),
                {"index": index_name, "ref": reference},
            )
        )
        .scalars()
        .all()
    )
    return list(rows), len(rows)


async def _to_contract_out(db, row) -> ContractOut:
    parties = (
        (
            await db.execute(
                text(
                    """
                    select p.client_id, c.name, p.role, p.is_payee, p.share_pct, p.wallet_id
                    from rentals.contract_parties p
                    join crm.clients c on c.id = p.client_id
                    where p.contract_id = :cid
                    order by p.role
                    """
                ),
                {"cid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )

    total = row["rent_amount"] + row["condo_fee"] + row["iptu_amount"] + row["insurance_amount"]
    admin_fee = (row["rent_amount"] * row["admin_fee_pct"] / 100).quantize(Decimal("0.01"))
    next_adjust = next_adjustment_date(row["start_date"], row["last_adjustment_at"])

    return ContractOut(
        **{
            k: row[k]
            for k in (
                "id",
                "code",
                "property_id",
                "rent_amount",
                "condo_fee",
                "iptu_amount",
                "insurance_amount",
                "admin_fee_pct",
                "price_index",
                "start_date",
                "end_date",
                "due_day",
                "guarantee_type",
                "guarantee_amount",
                "late_fine_pct",
                "daily_interest_pct",
                "punctuality_discount",
                "status",
                "signed_doc_path",
                "last_adjustment_at",
                "notes",
                "created_at",
            )
        },
        property_code=row["property_code"],
        property_title=row["property_title"],
        total_monthly=total,
        admin_fee_amount=admin_fee,
        next_adjustment_at=next_adjust,
        adjustment_due=date.today() >= next_adjust,
        days_to_expiry=(row["end_date"] - date.today()).days,
        parties=[PartyOut(**p) for p in parties],
    )


async def _get_contract(db, contract_id: UUID) -> ContractOut:
    row = (
        (
            await db.execute(
                text(
                    """
                    select c.*, p.code as property_code, p.title as property_title
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    where c.id = :cid
                    """
                ),
                {"cid": str(contract_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contrato não encontrado")
    return await _to_contract_out(db, row)
