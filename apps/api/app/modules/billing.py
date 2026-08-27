"""Cobranças do aluguel com split, baixa manual e repasses ao proprietário.

O cálculo em si vive em ``app.domain.billing`` — aqui ficam a persistência, a
chamada ao gateway e as regras de fluxo (o que pode ser feito quando).
"""

from __future__ import annotations

import calendar
import secrets
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from urllib.parse import quote_plus
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from app.core.audit import record_audit
from app.core.config import get_settings
from app.core.deps import DbDep, require_module, require_permission
from app.core.security import CurrentUser
from app.domain.billing import (
    ChargeComposition,
    ChargeItem,
    PayoutLine,
    build_monthly_charge,
    build_payout_statement,
    compute_late_charges,
    compute_punctuality_discount,
    compute_split,
    money,
    payout_lines_from_payment,
)
from app.providers.base import ChargeRequest, SplitTarget
from app.providers.registry import get_payment_provider

router = APIRouter(
    prefix="/billing",
    tags=["cobranças"],
    dependencies=[Depends(require_module("module_rentals"))],
)


# ── Modelos ──────────────────────────────────────────────────────────────────
class GenerateIn(BaseModel):
    competence: date  # qualquer dia do mês de referência
    contract_id: UUID | None = None  # ausente = todos os contratos ativos


class ChargeItemOut(BaseModel):
    kind: str
    description: str | None
    amount: Decimal
    beneficiary: str


class SplitOut(BaseModel):
    beneficiary: str
    client_id: UUID | None
    wallet_id: str | None
    amount: Decimal


class ChargeOut(BaseModel):
    id: UUID
    contract_id: UUID
    contract_code: str
    property_code: str
    tenant_name: str | None  # locatário
    competence: date
    due_date: date
    gross_amount: Decimal
    status: str
    overdue: bool
    days_late: int
    provider_charge_id: str | None
    boleto_line: str | None
    boleto_url: str | None
    pix_copy_paste: str | None
    pix_qrcode: str | None
    receipt_path: str | None
    paid_amount: Decimal | None
    paid_at: date | None
    items: list[ChargeItemOut]
    splits: list[SplitOut]
    created_at: datetime


class ManualSettleIn(BaseModel):
    paid_at: date
    paid_amount: Decimal | None = None
    method: str = Field("transferencia", pattern="^(boleto|pix|transferencia|dinheiro|outro)$")
    notes: str | None = None


class GenerateResult(BaseModel):
    competence: date
    created: int
    skipped: int
    charges: list[ChargeOut]


class PayoutItemOut(BaseModel):
    kind: str
    description: str | None
    amount: Decimal
    charge_id: UUID | None


class PayoutOut(BaseModel):
    id: UUID
    owner_client_id: UUID
    owner_name: str
    reference_month: date
    gross_amount: Decimal
    admin_fee: Decimal
    deductions: Decimal
    net_amount: Decimal
    status: str
    items: list[PayoutItemOut]


class DeductionIn(BaseModel):
    owner_client_id: UUID
    reference_month: date
    amount: Decimal = Field(gt=0)
    description: str
    contract_id: UUID | None = None


# ── Geração das cobranças do mês ─────────────────────────────────────────────
@router.post("/generate", response_model=GenerateResult)
async def generate_charges(
    payload: GenerateIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "create")),
) -> GenerateResult:
    """Gera a cobrança mensal dos contratos ativos.

    Reexecutar o mesmo mês é seguro: contratos que já têm cobrança na
    competência são pulados, nunca duplicados.
    """
    competence = payload.competence.replace(day=1)

    where = "where c.status = 'ativo'"
    params: dict = {}
    if payload.contract_id:
        where += " and c.id = :cid"
        params["cid"] = str(payload.contract_id)

    contracts = (
        (
            await db.execute(
                text(
                    f"""
                    select c.*, p.code as property_code
                    from rentals.contracts c
                    join properties.properties p on p.id = c.property_id
                    {where}
                      and c.start_date < (cast(:comp as date) + interval '1 month')
                      and c.end_date >= cast(:comp as date)
                    order by c.code
                    """  # noqa: S608
                ),
                {**params, "comp": competence},
            )
        )
        .mappings()
        .all()
    )

    created: list[UUID] = []
    skipped = 0

    for contract in contracts:
        exists = (
            await db.execute(
                text(
                    "select 1 from rentals.charges "
                    "where contract_id = :cid and competence = :comp"
                ),
                {"cid": str(contract["id"]), "comp": competence},
            )
        ).first()
        if exists:
            skipped += 1
            continue

        charge_id = await _create_charge(db, user, contract, competence)
        created.append(charge_id)

    charges = [await _get_charge(db, cid) for cid in created]
    return GenerateResult(
        competence=competence, created=len(created), skipped=skipped, charges=charges
    )


async def _create_charge(db, user: CurrentUser, contract, competence: date) -> UUID:
    """Cria a cobrança, calcula o split e registra no gateway."""
    composition = build_monthly_charge(
        rent_amount=contract["rent_amount"],
        condo_fee=contract["condo_fee"],
        iptu_amount=contract["iptu_amount"],
        insurance_amount=contract["insurance_amount"],
    )
    due_date = _due_date(competence, contract["due_day"])

    owner_rows = (
        (
            await db.execute(
                text(
                    "select client_id, share_pct, wallet_id from rentals.contract_parties "
                    "where contract_id = :cid and role = 'locador' and is_payee "
                    "order by share_pct desc"
                ),
                {"cid": str(contract["id"])},
            )
        )
        .mappings()
        .all()
    )
    owner_shares = [
        (str(o["client_id"]), o["share_pct"], o["wallet_id"]) for o in owner_rows
    ] or None

    split = compute_split(
        composition=composition,
        admin_fee_pct=contract["admin_fee_pct"],
        owner_shares=owner_shares,
    )

    charge_id = (
        await db.execute(
            text(
                """
                insert into rentals.charges
                    (tenant_id, contract_id, competence, due_date, gross_amount)
                values (:tid, :cid, :comp, :due, :gross)
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "cid": str(contract["id"]),
                "comp": competence,
                "due": due_date,
                "gross": composition.total,
            },
        )
    ).scalar_one()

    for item in composition.items:
        await db.execute(
            text(
                """
                insert into rentals.charge_items
                    (tenant_id, charge_id, kind, description, amount, beneficiary)
                values (:tid, :chid, :kind, :desc, :amount, :beneficiary)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "chid": str(charge_id),
                "kind": item.kind,
                "desc": item.description,
                "amount": item.amount,
                "beneficiary": item.beneficiary,
            },
        )

    for part in split.parts:
        await db.execute(
            text(
                """
                insert into rentals.charge_splits
                    (tenant_id, charge_id, beneficiary, client_id, wallet_id, amount)
                values (:tid, :chid, :beneficiary, :client_id, :wallet_id, :amount)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "chid": str(charge_id),
                "beneficiary": part.beneficiary,
                "client_id": part.client_id,
                "wallet_id": part.wallet_id,
                "amount": part.amount,
            },
        )

    # Emissão no gateway. Falha aqui não perde a cobrança: ela fica registrada
    # e pode ser reemitida — o dinheiro do proprietário não some por timeout.
    try:
        provider = get_payment_provider()
        result = await provider.create_charge(
            ChargeRequest(
                customer_ref=str(contract["id"]),
                amount=composition.total,
                due_date=due_date,
                description=f"Aluguel {competence:%m/%Y} — {contract['property_code']}",
                external_ref=str(charge_id),
                splits=[
                    SplitTarget(wallet_id=p.wallet_id or "", amount=p.amount)
                    for p in split.parts
                    if p.beneficiary == "owner"
                ],
                fine_pct=contract["late_fine_pct"],
                interest_pct=contract["daily_interest_pct"],
            )
        )
        await db.execute(
            text(
                """
                update rentals.charges
                set provider = 'mock', provider_charge_id = :pid, boleto_line = :line,
                    boleto_url = :url, pix_copy_paste = :pix, pix_qrcode = :qr
                where id = :chid
                """
            ),
            {
                "pid": result.provider_charge_id,
                "line": result.boleto_line,
                "url": result.boleto_url,
                "pix": result.pix_copy_paste,
                "qr": result.pix_qrcode,
                "chid": str(charge_id),
            },
        )
    except Exception:  # noqa: BLE001 — a cobrança já está registrada localmente
        pass

    return charge_id


def _due_date(competence: date, due_day: int) -> date:
    last_day = calendar.monthrange(competence.year, competence.month)[1]
    return competence.replace(day=min(due_day, last_day))


# ── Consulta ─────────────────────────────────────────────────────────────────
@router.get("/charges", response_model=list[ChargeOut])
async def list_charges(
    db: DbDep,
    competence: date | None = None,
    contract_id: UUID | None = None,
    status_filter: str | None = None,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[ChargeOut]:
    filters, params = [], {}
    if competence:
        filters.append("ch.competence = :comp")
        params["comp"] = competence.replace(day=1)
    if contract_id:
        filters.append("ch.contract_id = :cid")
        params["cid"] = str(contract_id)
    if status_filter:
        filters.append("ch.status = :status")
        params["status"] = status_filter
    where = f"where {' and '.join(filters)}" if filters else ""

    rows = (
        (
            await db.execute(
                text(f"{_CHARGE_SELECT} {where} order by ch.due_date, c.code"),  # noqa: S608
                params,
            )
        )
        .mappings()
        .all()
    )
    return [await _to_charge_out(db, r) for r in rows]


@router.get("/charges/{charge_id}", response_model=ChargeOut)
async def get_charge(
    charge_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> ChargeOut:
    return await _get_charge(db, charge_id)


class DunningRule(BaseModel):
    id: UUID | None = None
    offset_days: int = Field(..., ge=-30, le=90)
    channel: str = Field("whatsapp", pattern="^(whatsapp|email|sms)$")
    message_template: str = Field(..., min_length=10, max_length=1000)
    enabled: bool = True


@router.get("/dunning-rules", response_model=list[DunningRule])
async def list_dunning_rules(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[DunningRule]:
    rows = (
        (
            await db.execute(
                text(
                    "select id, offset_days, channel, message_template, enabled "
                    "from rentals.dunning_rules order by offset_days"
                )
            )
        )
        .mappings()
        .all()
    )
    return [DunningRule(**dict(r)) for r in rows]


@router.put("/dunning-rules", response_model=list[DunningRule])
async def replace_dunning_rules(
    rules: list[DunningRule],
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> list[DunningRule]:
    """Substitui a régua inteira do tenant. Simples e coerente: o gestor edita
    a régua num único formulário, envia, e o backend guarda a versão final —
    sem migrar linhas por id."""
    seen = set()
    for r in rules:
        key = (r.offset_days, r.channel)
        if key in seen:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Duplicidade em offset_days={r.offset_days} canal={r.channel}",
            )
        seen.add(key)

    await db.execute(text("delete from rentals.dunning_rules"))
    for i, r in enumerate(rules):
        await db.execute(
            text(
                """
                insert into rentals.dunning_rules
                    (tenant_id, offset_days, channel, message_template, enabled, sort_order)
                values (:tid, :off, :ch, :tpl, :en, :order)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "off": r.offset_days,
                "ch": r.channel,
                "tpl": r.message_template,
                "en": r.enabled,
                "order": i,
            },
        )
    await record_audit(db, user, "tenant_branding", user.tenant_id, "update")
    return await list_dunning_rules(db, user)


class DunningTask(BaseModel):
    charge_id: UUID
    contract_code: str
    property_code: str
    tenant_name: str | None
    tenant_phone: str | None
    competence: date
    due_date: date
    amount: Decimal
    days_late: int
    offset_days: int
    channel: str
    message_preview: str


@router.get("/dunning/today", response_model=list[DunningTask])
async def dunning_today(
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[DunningTask]:
    """Lista o que a régua manda comunicar hoje.

    Cruza a régua com as cobranças em aberto: uma cobrança que vence em N dias
    dispara a regra ``offset_days = -N``; uma que venceu há M dias dispara
    ``offset_days = +M``. O corretor decide se envia — a página tem o botão
    "WhatsApp" que já monta o link mágico e abre a conversa.
    """
    rows = (
        (
            await db.execute(
                text(
                    """
                    select ch.id as charge_id, ch.competence, ch.due_date,
                           ch.gross_amount as amount,
                           greatest(0, current_date - ch.due_date) as days_late,
                           co.code as contract_code,
                           p.code as property_code,
                           tenant_client.name as tenant_name,
                           tenant_client.phone as tenant_phone,
                           dr.offset_days, dr.channel, dr.message_template
                    from rentals.dunning_rules dr
                    join rentals.charges ch
                      on ch.status = 'pendente'
                     and (ch.due_date - current_date) = -dr.offset_days
                    join rentals.contracts co on co.id = ch.contract_id
                    join properties.properties p on p.id = co.property_id
                    left join lateral (
                      select c.name, c.phone
                      from rentals.contract_parties cp
                      join crm.clients c on c.id = cp.client_id
                      where cp.contract_id = co.id and cp.role = 'locatario'
                      order by cp.created_at limit 1
                    ) tenant_client on true
                    where dr.enabled
                    order by ch.due_date, co.code
                    """
                )
            )
        )
        .mappings()
        .all()
    )
    tasks: list[DunningTask] = []
    for r in rows:
        preview = _render_template(
            r["message_template"],
            tenant_name=r["tenant_name"] or "cliente",
            amount=r["amount"],
            due_date=r["due_date"],
            link="{{link}}",
        )
        tasks.append(
            DunningTask(
                charge_id=r["charge_id"],
                contract_code=r["contract_code"],
                property_code=r["property_code"],
                tenant_name=r["tenant_name"],
                tenant_phone=r["tenant_phone"],
                competence=r["competence"],
                due_date=r["due_date"],
                amount=r["amount"],
                days_late=int(r["days_late"] or 0),
                offset_days=int(r["offset_days"]),
                channel=r["channel"],
                message_preview=preview,
            )
        )
    return tasks


def _render_template(
    template: str, *, tenant_name: str, amount: Decimal, due_date: date, link: str
) -> str:
    """Substitui placeholders da régua no template."""
    return (
        template
        .replace("{{inquilino}}", tenant_name)
        .replace("{{valor}}", f"R$ {amount:.2f}".replace(".", ","))
        .replace("{{vencimento}}", due_date.strftime("%d/%m/%Y"))
        .replace("{{link}}", link)
        .replace("{{imobiliaria}}", "")  # o WhatsApp já mostra o remetente
    )


class MagicLinkOut(BaseModel):
    token: str
    url: str
    expires_at: datetime
    whatsapp_url: str | None
    phone: str | None


@router.post("/charges/{charge_id}/magic-link", response_model=MagicLinkOut)
async def create_charge_magic_link(
    charge_id: UUID,
    db: DbDep,
    minutes: int = 15,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> MagicLinkOut:
    """Gera um link mágico (2ª via sem senha) para enviar ao inquilino no WhatsApp.

    O link vive uns minutos e leva a uma página pública com valor,
    vencimento, linha digitável e Pix — o inquilino não precisa criar
    conta, decorar senha nem pedir para a imobiliária. É o "vale por
    hoje" que reduz o telefone da recepção tocando.
    """
    charge = await _get_charge(db, charge_id)
    if charge.status in ("pago", "baixado_manual", "cancelado"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta cobrança não está em aberto")

    minutes = max(5, min(minutes, 120))
    token = secrets.token_urlsafe(24)
    expires_at = datetime.now(UTC) + timedelta(minutes=minutes)
    await db.execute(
        text(
            """
            insert into core.magic_links
                (tenant_id, token, target_type, target_id, created_by, expires_at)
            values (:tid, :token, 'charge', :target, :uid, :exp)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "token": token,
            "target": str(charge_id),
            "uid": str(user.id),
            "exp": expires_at,
        },
    )

    # Contato e domínio do tenant para montar o link certo do jeito do inquilino.
    tenant_row = (
        (
            await db.execute(
                text(
                    """
                    select t.subdomain, t.custom_domain, tp.whatsapp,
                           (select phone from crm.clients c
                              join properties.property_owners po on po.client_id = c.id
                              -- fallback: telefone do locatário do contrato
                              limit 0) as ignore
                    from core.tenants t
                    left join core.tenant_public tp on tp.tenant_id = t.id
                    where t.id = :tid
                    """
                ),
                {"tid": str(user.tenant_id)},
            )
        )
        .mappings()
        .first()
    )
    site_url = _site_base_url(tenant_row)
    full_url = f"{site_url}/2via/{token}"

    # Telefone: tenta primeiro o locatário do contrato desta cobrança.
    tenant_phone = (
        await db.execute(
            text(
                """
                select c.phone
                from rentals.charges ch
                join rentals.contracts co on co.id = ch.contract_id
                join rentals.contract_parties cp on cp.contract_id = co.id
                join crm.clients c on c.id = cp.client_id
                where ch.id = :cid and cp.role = 'locatario'
                order by cp.created_at
                limit 1
                """
            ),
            {"cid": str(charge_id)},
        )
    ).scalar()

    wa_url: str | None = None
    if tenant_phone:
        digits = "".join(ch for ch in tenant_phone if ch.isdigit())
        if digits and not digits.startswith("55"):
            digits = "55" + digits
        message = (
            f"Olá! Aqui está a 2ª via do aluguel referente a "
            f"{charge.competence.strftime('%m/%Y')}:\n{full_url}\n"
            f"Vencimento {charge.due_date.strftime('%d/%m/%Y')} — "
            f"valor R$ {charge.gross_amount}. Link válido por {minutes} minutos."
        )
        wa_url = f"https://wa.me/{digits}?text={quote_plus(message)}"

    await record_audit(db, user, "charge", charge_id, "update")
    return MagicLinkOut(
        token=token,
        url=full_url,
        expires_at=expires_at,
        whatsapp_url=wa_url,
        phone=tenant_phone,
    )


def _site_base_url(tenant_row) -> str:
    """URL base da vitrine deste tenant — custom_domain quando houver, senão
    subdomínio no ``base_domain`` configurado. Em dev sai http; em produção
    https."""
    settings = get_settings()
    scheme = "https" if settings.is_production else "http"
    if tenant_row and tenant_row["custom_domain"]:
        return f"{scheme}://{tenant_row['custom_domain']}"
    if tenant_row and tenant_row["subdomain"]:
        return f"{scheme}://{tenant_row['subdomain']}.{settings.base_domain}"
    return f"{scheme}://{settings.base_domain}"


@router.get("/charges/{charge_id}/second-copy", response_model=dict)
async def second_copy(
    charge_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> dict:
    """Segunda via: linha digitável e Pix copia-e-cola da cobrança em aberto."""
    charge = await _get_charge(db, charge_id)
    if charge.status in ("pago", "baixado_manual", "cancelado"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Esta cobrança não está em aberto")
    return {
        "charge_id": str(charge.id),
        "due_date": charge.due_date,
        "amount": charge.gross_amount,
        "boleto_line": charge.boleto_line,
        "boleto_url": charge.boleto_url,
        "pix_copy_paste": charge.pix_copy_paste,
        "pix_qrcode": charge.pix_qrcode,
    }


# ── Baixa manual ─────────────────────────────────────────────────────────────
@router.post("/charges/{charge_id}/settle", response_model=ChargeOut)
async def settle_manually(
    charge_id: UUID,
    payload: ManualSettleIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> ChargeOut:
    """Baixa manual — pagamento feito por fora do gateway.

    Multa, juros e desconto por pontualidade são aplicados aqui com as mesmas
    regras do fluxo automático, para os dois caminhos darem o mesmo número.
    """
    charge = await _get_charge(db, charge_id)
    if charge.status in ("pago", "baixado_manual"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cobrança já baixada")
    if charge.status == "cancelado":
        raise HTTPException(status.HTTP_409_CONFLICT, "Cobrança cancelada")

    contract = (
        (
            await db.execute(
                text("select * from rentals.contracts where id = :cid"),
                {"cid": str(charge.contract_id)},
            )
        )
        .mappings()
        .first()
    )

    late = compute_late_charges(
        amount=charge.gross_amount,
        due_date=charge.due_date,
        payment_date=payload.paid_at,
        fine_pct=contract["late_fine_pct"],
        daily_interest_pct=contract["daily_interest_pct"],
    )
    discount = compute_punctuality_discount(
        discount_amount=contract["punctuality_discount"],
        due_date=charge.due_date,
        payment_date=payload.paid_at,
    )

    extra_items: list[tuple[str, str, Decimal]] = []
    if late.fine > 0:
        extra_items.append(("multa", f"Multa por atraso de {late.days_late} dia(s)", late.fine))
    if late.interest > 0:
        extra_items.append(("juros", f"Juros de mora ({late.days_late} dia(s))", late.interest))
    if discount > 0:
        extra_items.append(("desconto", "Desconto por pontualidade", -discount))

    for kind, description, amount in extra_items:
        await db.execute(
            text(
                """
                insert into rentals.charge_items
                    (tenant_id, charge_id, kind, description, amount, beneficiary)
                values (:tid, :chid, :kind, :desc, :amount, 'owner')
                """
            ),
            {
                "tid": str(user.tenant_id),
                "chid": str(charge_id),
                "kind": kind,
                "desc": description,
                "amount": amount,
            },
        )

    expected = money(charge.gross_amount + late.total - discount)
    paid = money(payload.paid_amount) if payload.paid_amount is not None else expected

    await db.execute(
        text(
            "update rentals.charges set gross_amount = :total, status = 'baixado_manual' "
            "where id = :chid"
        ),
        {"total": expected, "chid": str(charge_id)},
    )
    await db.execute(
        text(
            """
            insert into rentals.payments
                (tenant_id, charge_id, paid_amount, paid_at, method, is_manual, notes)
            values (:tid, :chid, :amount, :paid_at, :method, true, :notes)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "chid": str(charge_id),
            "amount": paid,
            "paid_at": payload.paid_at,
            "method": payload.method,
            "notes": payload.notes,
        },
    )

    await _rebuild_splits(db, user, charge_id, contract)
    await _post_to_receivables(db, user, charge_id)
    await _accrue_payout(db, user, charge_id)

    await record_audit(
        db,
        user,
        "charge",
        charge_id,
        "settle_manual",
        after={"paid_amount": str(paid), "paid_at": str(payload.paid_at)},
    )
    return await _get_charge(db, charge_id)


@router.post("/charges/{charge_id}/cancel", response_model=ChargeOut)
async def cancel_charge(
    charge_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "approve")),
) -> ChargeOut:
    charge = await _get_charge(db, charge_id)
    if charge.status in ("pago", "baixado_manual"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Cobrança já paga não pode ser cancelada")

    if charge.boleto_line:
        try:
            provider = get_payment_provider()
            row = (
                await db.execute(
                    text("select provider_charge_id from rentals.charges where id = :chid"),
                    {"chid": str(charge_id)},
                )
            ).scalar()
            if row:
                await provider.cancel_charge(row)
        except Exception:  # noqa: BLE001 — cancelamento local vale mesmo se o gateway falhar
            pass

    await db.execute(
        text("update rentals.charges set status = 'cancelado' where id = :chid"),
        {"chid": str(charge_id)},
    )
    await record_audit(db, user, "charge", charge_id, "cancel")
    return await _get_charge(db, charge_id)


# ── Repasses ─────────────────────────────────────────────────────────────────
@router.get("/payouts", response_model=list[PayoutOut])
async def list_payouts(
    db: DbDep,
    reference_month: date | None = None,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> list[PayoutOut]:
    where = "where p.reference_month = :ref" if reference_month else ""
    rows = (
        (
            await db.execute(
                text(
                    f"""
                    select p.*, c.name as owner_name
                    from rentals.payouts p
                    join crm.clients c on c.id = p.owner_client_id
                    {where}
                    order by p.reference_month desc, c.name
                    """  # noqa: S608
                ),
                {"ref": reference_month.replace(day=1)} if reference_month else {},
            )
        )
        .mappings()
        .all()
    )
    return [await _to_payout_out(db, r) for r in rows]


@router.post("/payouts/deductions", response_model=PayoutOut)
async def add_deduction(
    payload: DeductionIn,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "edit")),
) -> PayoutOut:
    """Abate um serviço pago pela imobiliária por conta do proprietário."""
    reference = payload.reference_month.replace(day=1)
    payout_id = await _ensure_payout(db, user, payload.owner_client_id, reference)

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
            "cid": str(payload.contract_id) if payload.contract_id else None,
            "desc": payload.description,
            "amount": -money(payload.amount),
        },
    )
    await _recalculate_payout(db, payout_id)
    await record_audit(
        db,
        user,
        "payout",
        payout_id,
        "deduction",
        after={"amount": str(payload.amount), "description": payload.description},
    )
    return await _get_payout(db, payout_id)


@router.post("/payouts/{payout_id}/close", response_model=PayoutOut)
async def close_payout(
    payout_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "approve")),
) -> PayoutOut:
    await db.execute(
        text("update rentals.payouts set status = 'fechado' where id = :pid"),
        {"pid": str(payout_id)},
    )
    await record_audit(db, user, "payout", payout_id, "close")
    return await _get_payout(db, payout_id)


@router.get("/payouts/{payout_id}", response_model=PayoutOut)
async def get_payout(
    payout_id: UUID,
    db: DbDep,
    user: CurrentUser = Depends(require_permission("financeiro", "view")),
) -> PayoutOut:
    return await _get_payout(db, payout_id)


# ── Internos ─────────────────────────────────────────────────────────────────
_CHARGE_SELECT = """
    select ch.*, c.code as contract_code, p.code as property_code,
           (select cl.name from rentals.contract_parties cp
             join crm.clients cl on cl.id = cp.client_id
            where cp.contract_id = c.id and cp.role = 'locatario' limit 1) as tenant_name,
           (select sum(pay.paid_amount) from rentals.payments pay
             where pay.charge_id = ch.id) as paid_amount,
           (select max(pay.paid_at) from rentals.payments pay
             where pay.charge_id = ch.id) as paid_at
    from rentals.charges ch
    join rentals.contracts c on c.id = ch.contract_id
    join properties.properties p on p.id = c.property_id
"""


async def _rebuild_splits(db, user: CurrentUser, charge_id: UUID, contract) -> None:
    """Recalcula o split depois de multa, juros ou desconto entrarem na conta."""
    items = (
        (
            await db.execute(
                text(
                    "select kind, description, amount, beneficiary "
                    "from rentals.charge_items where charge_id = :chid"
                ),
                {"chid": str(charge_id)},
            )
        )
        .mappings()
        .all()
    )
    composition = ChargeComposition(
        [ChargeItem(i["kind"], i["amount"], i["description"], i["beneficiary"]) for i in items]
    )

    owner_rows = (
        (
            await db.execute(
                text(
                    "select client_id, share_pct, wallet_id from rentals.contract_parties "
                    "where contract_id = :cid and role = 'locador' and is_payee "
                    "order by share_pct desc"
                ),
                {"cid": str(contract["id"])},
            )
        )
        .mappings()
        .all()
    )
    owner_shares = [
        (str(o["client_id"]), o["share_pct"], o["wallet_id"]) for o in owner_rows
    ] or None

    split = compute_split(
        composition=composition,
        admin_fee_pct=contract["admin_fee_pct"],
        owner_shares=owner_shares,
    )

    await db.execute(
        text("delete from rentals.charge_splits where charge_id = :chid"),
        {"chid": str(charge_id)},
    )
    for part in split.parts:
        await db.execute(
            text(
                """
                insert into rentals.charge_splits
                    (tenant_id, charge_id, beneficiary, client_id, wallet_id, amount)
                values (:tid, :chid, :beneficiary, :client_id, :wallet_id, :amount)
                """
            ),
            {
                "tid": str(user.tenant_id),
                "chid": str(charge_id),
                "beneficiary": part.beneficiary,
                "client_id": part.client_id,
                "wallet_id": part.wallet_id,
                "amount": part.amount,
            },
        )


async def _post_to_receivables(db, user: CurrentUser, charge_id: UUID) -> None:
    """Espelha a taxa de administração no contas a receber do financeiro central."""
    row = (
        (
            await db.execute(
                text(
                    """
                    select ch.competence, ch.due_date, c.code,
                           (select amount from rentals.charge_splits s
                             where s.charge_id = ch.id and s.beneficiary = 'agency') as admin_fee
                    from rentals.charges ch
                    join rentals.contracts c on c.id = ch.contract_id
                    where ch.id = :chid
                    """
                ),
                {"chid": str(charge_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None or not row["admin_fee"]:
        return

    account_id = (
        await db.execute(
            text("select id from finance.chart_of_accounts where code = '1.01' limit 1")
        )
    ).scalar()

    await db.execute(
        text(
            """
            insert into finance.receivables
                (tenant_id, description, account_id, due_date, competence_date, amount,
                 status, paid_at, paid_amount, source, source_id)
            values (:tid, :desc, :account_id, :due, :comp, :amount,
                    'recebido', :due, :amount, 'rental_charge', :chid)
            """
        ),
        {
            "tid": str(user.tenant_id),
            "desc": f"Taxa de administração — {row['code']} ({row['competence']:%m/%Y})",
            "account_id": str(account_id) if account_id else None,
            "due": row["due_date"],
            "comp": row["competence"],
            "amount": row["admin_fee"],
            "chid": str(charge_id),
        },
    )


async def _accrue_payout(db, user: CurrentUser, charge_id: UUID) -> None:
    """Credita o valor recebido no repasse do proprietário daquele mês."""
    charge = (
        (
            await db.execute(
                text(
                    "select ch.*, c.admin_fee_pct from rentals.charges ch "
                    "join rentals.contracts c on c.id = ch.contract_id where ch.id = :chid"
                ),
                {"chid": str(charge_id)},
            )
        )
        .mappings()
        .first()
    )
    items = (
        (
            await db.execute(
                text(
                    "select kind, description, amount, beneficiary "
                    "from rentals.charge_items where charge_id = :chid"
                ),
                {"chid": str(charge_id)},
            )
        )
        .mappings()
        .all()
    )
    composition = ChargeComposition(
        [ChargeItem(i["kind"], i["amount"], i["description"], i["beneficiary"]) for i in items]
    )
    split = compute_split(composition=composition, admin_fee_pct=charge["admin_fee_pct"])

    owners = (
        (
            await db.execute(
                text(
                    "select client_id from rentals.contract_parties "
                    "where contract_id = :cid and role = 'locador' and is_payee"
                ),
                {"cid": str(charge["contract_id"])},
            )
        )
        .scalars()
        .all()
    )
    if not owners:
        return

    reference = charge["competence"]
    # Com vários proprietários o rateio já foi feito no split; o extrato do mês
    # é gerado para o primeiro beneficiário de cada cota.
    for owner_id in owners[:1]:
        payout_id = await _ensure_payout(db, user, owner_id, reference)
        lines = payout_lines_from_payment(
            composition=composition, split=split, charge_id=str(charge_id)
        )
        for line in lines:
            await db.execute(
                text(
                    """
                    insert into rentals.payout_items
                        (tenant_id, payout_id, charge_id, contract_id, kind,
                         description, amount)
                    values (:tid, :pid, :chid, :cid, :kind, :desc, :amount)
                    """
                ),
                {
                    "tid": str(user.tenant_id),
                    "pid": str(payout_id),
                    "chid": str(charge_id),
                    "cid": str(charge["contract_id"]),
                    "kind": line.kind,
                    "desc": line.description,
                    "amount": line.amount,
                },
            )
        await _recalculate_payout(db, payout_id)


async def _ensure_payout(
    db, user: CurrentUser, owner_client_id: UUID | str, reference: date
) -> UUID:
    return (
        await db.execute(
            text(
                """
                insert into rentals.payouts (tenant_id, owner_client_id, reference_month)
                values (:tid, :owner, :ref)
                on conflict (tenant_id, owner_client_id, reference_month)
                do update set updated_at = now()
                returning id
                """
            ),
            {
                "tid": str(user.tenant_id),
                "owner": str(owner_client_id),
                "ref": reference.replace(day=1),
            },
        )
    ).scalar_one()


async def _recalculate_payout(db, payout_id: UUID) -> None:
    items = (
        (
            await db.execute(
                text(
                    "select kind, description, amount from rentals.payout_items "
                    "where payout_id = :pid"
                ),
                {"pid": str(payout_id)},
            )
        )
        .mappings()
        .all()
    )
    statement = build_payout_statement(
        [PayoutLine(i["kind"], i["amount"], i["description"]) for i in items]
    )
    await db.execute(
        text(
            """
            update rentals.payouts
            set gross_amount = :gross, admin_fee = :fee,
                deductions = :deductions, net_amount = :net
            where id = :pid
            """
        ),
        {
            "gross": statement.gross_amount,
            "fee": statement.admin_fee,
            "deductions": statement.deductions,
            "net": statement.net_amount,
            "pid": str(payout_id),
        },
    )


async def _to_charge_out(db, row) -> ChargeOut:
    items = (
        (
            await db.execute(
                text(
                    "select kind, description, amount, beneficiary from rentals.charge_items "
                    "where charge_id = :chid order by created_at"
                ),
                {"chid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )
    splits = (
        (
            await db.execute(
                text(
                    "select beneficiary, client_id, wallet_id, amount "
                    "from rentals.charge_splits where charge_id = :chid "
                    "order by beneficiary"
                ),
                {"chid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )

    is_open = row["status"] in ("pendente", "vencido")
    days_late = (date.today() - row["due_date"]).days if is_open else 0

    return ChargeOut(
        **{
            k: row[k]
            for k in (
                "id",
                "contract_id",
                "competence",
                "due_date",
                "gross_amount",
                "status",
                "provider_charge_id",
                "boleto_line",
                "boleto_url",
                "pix_copy_paste",
                "pix_qrcode",
                "receipt_path",
                "paid_amount",
                "paid_at",
                "created_at",
            )
        },
        contract_code=row["contract_code"],
        property_code=row["property_code"],
        tenant_name=row["tenant_name"],
        overdue=is_open and days_late > 0,
        days_late=max(0, days_late),
        items=[ChargeItemOut(**i) for i in items],
        splits=[SplitOut(**s) for s in splits],
    )


async def _get_charge(db, charge_id: UUID) -> ChargeOut:
    row = (
        (await db.execute(text(f"{_CHARGE_SELECT} where ch.id = :chid"), {"chid": str(charge_id)}))
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Cobrança não encontrada")
    return await _to_charge_out(db, row)


async def _to_payout_out(db, row) -> PayoutOut:
    items = (
        (
            await db.execute(
                text(
                    "select kind, description, amount, charge_id from rentals.payout_items "
                    "where payout_id = :pid order by created_at"
                ),
                {"pid": str(row["id"])},
            )
        )
        .mappings()
        .all()
    )
    return PayoutOut(
        id=row["id"],
        owner_client_id=row["owner_client_id"],
        owner_name=row["owner_name"],
        reference_month=row["reference_month"],
        gross_amount=row["gross_amount"],
        admin_fee=row["admin_fee"],
        deductions=row["deductions"],
        net_amount=row["net_amount"],
        status=row["status"],
        items=[PayoutItemOut(**i) for i in items],
    )


async def _get_payout(db, payout_id: UUID) -> PayoutOut:
    row = (
        (
            await db.execute(
                text(
                    """
                    select p.*, c.name as owner_name
                    from rentals.payouts p
                    join crm.clients c on c.id = p.owner_client_id
                    where p.id = :pid
                    """
                ),
                {"pid": str(payout_id)},
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Repasse não encontrado")
    return await _to_payout_out(db, row)
