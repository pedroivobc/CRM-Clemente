import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, ChevronDown, Plus, Trophy } from "lucide-react";
import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,

  CodeTag,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { date, money } from "@/lib/format";
import { COMMISSION_BENEFICIARIES, DEAL_STATUS, FINANCING_TYPES } from "@/lib/labels";
import type { Client, Collaborator, Deal, Property } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Negocios() {
  const { can } = useAuth();
  const [creating, setCreating] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("");
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const { data: deals, isLoading } = useQuery({
    queryKey: ["sales", "deals", statusFilter],
    queryFn: () =>
      api.get<Deal[]>(`/sales/deals${statusFilter ? `?status_filter=${statusFilter}` : ""}`),
  });

  const totals = React.useMemo(() => {
    const ativos = (deals ?? []).filter((d) => d.status !== "cancelado");
    return {
      vgv: ativos.reduce((total, d) => total + Number(d.sale_amount), 0),
      comissao: ativos.reduce((total, d) => total + Number(d.commission_total), 0),
      count: ativos.length,
    };
  }, [deals]);

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Negócios"
        description="Vendas fechadas, comissões rateadas e acompanhamento até a escritura."
        action={
          can("vendas", "approve") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Fechar venda
            </Button>
          ) : null
        }
      />

      <Card className="mb-5">
        <dl className="grid divide-line-soft sm:grid-cols-3 sm:divide-x">
          <Metric label="VGV" value={money(totals.vgv)} note="Valor geral das vendas listadas" />
          <Metric label="Vendas" value={String(totals.count)} />
          <Metric label="Comissão gerada" value={money(totals.comissao)} positive />
        </dl>
      </Card>

      <Card>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
            aria-label="Filtrar por situação"
          >
            <option value="">Todas as situações</option>
            {Object.entries(DEAL_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : deals?.length === 0 ? (
          <EmptyState
            icon={Trophy}
            title="Nenhuma venda fechada"
            description="Ao fechar uma venda, a comissão é calculada e rateada automaticamente."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Venda</Th>
                <Th className="hidden md:table-cell">Comprador</Th>
                <Th className="hidden sm:table-cell">Fechamento</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-right">Comissão</Th>
                <Th>Situação</Th>
                <Th className="sr-only">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {deals?.map((deal) => (
                <React.Fragment key={deal.id}>
                  <Tr
                    className="cursor-pointer"
                    onClick={() => setExpanded(expanded === deal.id ? null : deal.id)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        <CodeTag tone="brand">{deal.code}</CodeTag>
                        <span className="line-clamp-1 text-[13px] font-medium text-ink">
                          {deal.property_title}
                        </span>
                      </div>
                      {deal.financing_type ? (
                        <p className="mt-0.5 text-[12px] text-muted">
                          {FINANCING_TYPES[deal.financing_type]}
                          {deal.financing_bank ? ` · ${deal.financing_bank}` : ""}
                        </p>
                      ) : null}
                    </Td>
                    <Td className="hidden text-ink-soft md:table-cell">
                      {deal.buyer_name ?? "—"}
                    </Td>
                    <Td className="hidden font-mono text-[12.5px] text-ink-soft sm:table-cell">
                      {date(deal.closed_at)}
                    </Td>
                    <Td className="text-right font-mono font-medium tabular text-ink">
                      {money(deal.sale_amount)}
                    </Td>
                    <Td className="text-right font-mono tabular text-ink-soft">
                      {money(deal.commission_total)}
                      <span className="block text-[11px] text-muted">
                        {Number(deal.commission_pct)}%
                      </span>
                    </Td>
                    <Td>
                      <Badge tone={DEAL_STATUS[deal.status].tone}>
                        {DEAL_STATUS[deal.status].label}
                      </Badge>
                    </Td>
                    <Td>
                      <span className="flex items-center justify-end gap-1 text-[12px] font-medium text-[var(--brand-primary)]">
                        {expanded === deal.id ? "Ocultar" : "Comissões"}
                        <ChevronDown
                          className={cn(
                            "size-3.5 transition-transform",
                            expanded === deal.id && "rotate-180",
                          )}
                        />
                      </span>
                    </Td>
                  </Tr>
                  {expanded === deal.id ? (
                    <tr>
                      <td colSpan={7} className="border-b border-line-soft bg-sunken px-4 py-3">
                        <CommissionPanel deal={deal} />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <DealFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function Metric({
  label,
  value,
  note,
  positive,
}: {
  label: string;
  value: string;
  note?: string;
  positive?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl font-medium tabular ${
          positive ? "text-positive" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-[12px] text-muted">{note}</p> : null}
    </div>
  );
}

function CommissionPanel({ deal }: { deal: Deal }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();

  const pay = useMutation({
    mutationFn: (beneficiary: string) =>
      api.post(`/sales/deals/${deal.id}/commissions/${beneficiary}/pay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  });

  const conclude = useMutation({
    mutationFn: () => api.post(`/sales/deals/${deal.id}/conclude`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  });

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-line-soft rounded-md border border-line bg-surface">
        {deal.commissions.map((commission) => (
          <li
            key={commission.beneficiary}
            className="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div>
              <p className="text-[13px] text-ink">
                {COMMISSION_BENEFICIARIES[commission.beneficiary]}
                {commission.user_name ? ` — ${commission.user_name}` : ""}
              </p>
              <p className="font-mono text-[11px] text-muted">
                {Number(commission.share_pct)}% da comissão
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono text-[13px] tabular text-ink">
                {money(commission.amount)}
              </span>
              {commission.status === "pago" ? (
                <Badge tone="positive">Paga</Badge>
              ) : commission.status === "cancelado" ? (
                <Badge tone="neutral">Cancelada</Badge>
              ) : commission.beneficiary !== "agency" && can("financeiro", "edit") ? (
                <Button
                  size="sm"
                  variant="outline"
                  loading={pay.isPending && pay.variables === commission.beneficiary}
                  onClick={() => pay.mutate(commission.beneficiary)}
                >
                  Marcar como paga
                </Button>
              ) : (
                <Badge tone="caution">Pendente</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>

      {deal.status === "em_andamento" && can("vendas", "approve") ? (
        <Button size="sm" loading={conclude.isPending} onClick={() => conclude.mutate()}>
          <BadgeCheck />
          Concluir negócio
        </Button>
      ) : null}
    </div>
  );
}

function DealFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = React.useState("");
  const [buyerId, setBuyerId] = React.useState("");
  const [sellerId, setSellerId] = React.useState("");
  const [listerId, setListerId] = React.useState("");
  const [sellerBrokerId, setSellerBrokerId] = React.useState("");
  const [form, setForm] = React.useState({
    sale_amount: "",
    down_payment: "",
    financing_type: "",
    financing_bank: "",
    commission_pct: "",
    deed_date: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((c) => ({ ...c, ...patch }));

  const { data: properties } = useQuery({
    queryKey: ["properties", "para-venda"],
    queryFn: () => api.get<Page<Property>>("/properties?purpose=venda&page_size=200"),
    enabled: open,
  });
  const { data: clients } = useQuery({
    queryKey: ["clients", "todos"],
    queryFn: () => api.get<Page<Client>>("/clients?page_size=200"),
    enabled: open,
  });
  const { data: team } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<Collaborator[]>("/users"),
    enabled: open,
  });
  const { data: rule } = useQuery({
    queryKey: ["sales", "commission-rule"],
    queryFn: () => api.get<{ default_pct: string }>("/sales/commission-rule"),
    enabled: open,
  });

  React.useEffect(() => {
    const property = properties?.items.find((p) => p.id === propertyId);
    if (property?.sale_price) set({ sale_amount: property.sale_price });
    const owner = property?.owners.find((o) => o.is_payee) ?? property?.owners[0];
    if (owner) setSellerId(owner.client_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Deal>("/sales/deals", {
        property_id: propertyId,
        buyer_id: buyerId || null,
        seller_id: sellerId || null,
        sale_amount: form.sale_amount,
        down_payment: form.down_payment || null,
        financing_type: form.financing_type || null,
        financing_bank: form.financing_bank || null,
        commission_pct: form.commission_pct || null,
        lister_id: listerId || null,
        seller_broker_id: sellerBrokerId || null,
        deed_date: form.deed_date || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const pct = Number(form.commission_pct || rule?.default_pct || 6);
  const commissionPreview = form.sale_amount
    ? (Number(form.sale_amount) * pct) / 100
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Fechar venda"
      description="O imóvel passa a vendido e a comissão é rateada conforme a regra da imobiliária."
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!propertyId || !form.sale_amount}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Fechar venda
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Imóvel" required>
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">Selecione o imóvel</option>
            {properties?.items.map((property) => (
              <option key={property.id} value={property.id}>
                {property.code} — {property.title}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Comprador">
            <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">Selecione</option>
              {clients?.items.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Vendedor (proprietário)">
            <Select value={sellerId} onChange={(e) => setSellerId(e.target.value)}>
              <option value="">Selecione</option>
              {clients?.items.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Valor da venda (R$)" required>
            <Input
              value={form.sale_amount}
              onChange={(e) => set({ sale_amount: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Sinal (R$)">
            <Input
              value={form.down_payment}
              onChange={(e) => set({ down_payment: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field
            label="Comissão (%)"
            hint={rule ? `Padrão: ${Number(rule.default_pct)}%` : undefined}
          >
            <Input
              value={form.commission_pct}
              onChange={(e) => set({ commission_pct: e.target.value })}
              inputMode="decimal"
              className="font-mono"
              placeholder={rule ? String(Number(rule.default_pct)) : "6"}
            />
          </Field>
          <Field label="Escritura prevista">
            <Input
              type="date"
              value={form.deed_date}
              onChange={(e) => set({ deed_date: e.target.value })}
            />
          </Field>
        </div>

        {commissionPreview ? (
          <p className="rounded-md border border-line bg-sunken px-3 py-2 font-mono text-[12.5px] text-ink-soft">
            Comissão de {money(commissionPreview)} ({pct}% sobre {money(form.sale_amount)})
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Corretor que captou" hint="Cota do captador no rateio">
            <Select value={listerId} onChange={(e) => setListerId(e.target.value)}>
              <option value="">Captação da imobiliária</option>
              {team?.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Corretor que vendeu" hint="Cota do vendedor no rateio">
            <Select
              value={sellerBrokerId}
              onChange={(e) => setSellerBrokerId(e.target.value)}
            >
              <option value="">Sem corretor</option>
              {team?.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.full_name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Forma de pagamento">
            <Select
              value={form.financing_type}
              onChange={(e) => set({ financing_type: e.target.value })}
            >
              <option value="">Não informado</option>
              {Object.entries(FINANCING_TYPES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Banco">
            <Input
              value={form.financing_bank}
              onChange={(e) => set({ financing_bank: e.target.value })}
            />
          </Field>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
