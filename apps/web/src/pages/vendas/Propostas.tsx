import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Handshake, Plus, Repeat, X } from "lucide-react";
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
  Textarea,
  Tr,
} from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { date, money } from "@/lib/format";
import { FINANCING_TYPES, PROPOSAL_STATUS } from "@/lib/labels";
import type { Client, Property, Proposal } from "@/lib/types";

export function Propostas() {
  const { can } = useAuth();
  const [creating, setCreating] = React.useState(false);
  const [countering, setCountering] = React.useState<Proposal | null>(null);
  const [statusFilter, setStatusFilter] = React.useState("");

  const { data: proposals, isLoading } = useQuery({
    queryKey: ["sales", "proposals", statusFilter],
    queryFn: () =>
      api.get<Proposal[]>(
        `/sales/proposals${statusFilter ? `?status_filter=${statusFilter}` : ""}`,
      ),
  });

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Propostas"
        description="Ofertas, contrapropostas e a decisão do vendedor."
        action={
          can("vendas", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Nova proposta
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
            aria-label="Filtrar por situação"
          >
            <option value="">Todas as situações</option>
            {Object.entries(PROPOSAL_STATUS).map(([value, { label }]) => (
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
        ) : proposals?.length === 0 ? (
          <EmptyState
            icon={Handshake}
            title="Nenhuma proposta"
            description="Registre a oferta do comprador para acompanhar a negociação até o fechamento."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Proposta</Th>
                <Th className="hidden md:table-cell">Comprador</Th>
                <Th className="text-right">Pedido</Th>
                <Th className="text-right">Oferta</Th>
                <Th className="hidden text-right sm:table-cell">Diferença</Th>
                <Th>Situação</Th>
                <Th className="sr-only">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {proposals?.map((proposal) => (
                <ProposalRow
                  key={proposal.id}
                  proposal={proposal}
                  canDecide={can("vendas", "approve")}
                  onCounter={() => setCountering(proposal)}
                />
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <ProposalFormDialog open={creating} onOpenChange={setCreating} />
      <CounterDialog proposal={countering} onOpenChange={() => setCountering(null)} />
    </>
  );
}

function ProposalRow({
  proposal,
  canDecide,
  onCounter,
}: {
  proposal: Proposal;
  canDecide: boolean;
  onCounter: () => void;
}) {
  const queryClient = useQueryClient();
  const info = PROPOSAL_STATUS[proposal.status];
  const isOpen = proposal.status === "aberta" || proposal.status === "contraproposta";
  const discount = Number(proposal.discount_amount);

  const decide = useMutation({
    mutationFn: (verb: "accept" | "reject") =>
      api.post(`/sales/proposals/${proposal.id}/${verb}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
    },
  });

  return (
    <Tr>
      <Td>
        <div className="flex items-center gap-2">
          <CodeTag tone="brand">{proposal.code}</CodeTag>
          {proposal.round > 1 ? (
            <span className="font-mono text-[11px] text-muted">{proposal.round}ª rodada</span>
          ) : null}
        </div>
        <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">
          {proposal.property_code} — {proposal.property_title}
        </p>
      </Td>
      <Td className="hidden text-ink-soft md:table-cell">
        {proposal.buyer_name ?? "—"}
        {proposal.financing_type ? (
          <span className="block text-[11px] text-muted">
            {FINANCING_TYPES[proposal.financing_type]}
          </span>
        ) : null}
      </Td>
      <Td className="text-right font-mono tabular text-muted">
        {money(proposal.asking_price)}
      </Td>
      <Td className="text-right font-mono font-medium tabular text-ink">
        {money(proposal.offer_amount)}
      </Td>
      <Td className="hidden text-right font-mono tabular sm:table-cell">
        {discount === 0 ? (
          <span className="text-muted">—</span>
        ) : (
          <span className={discount > 0 ? "text-caution" : "text-positive"}>
            {discount > 0 ? "−" : "+"}
            {money(Math.abs(discount))}
            <span className="block text-[11px] text-muted">
              {Math.abs(Number(proposal.discount_pct)).toFixed(2).replace(".", ",")}%
            </span>
          </span>
        )}
      </Td>
      <Td>
        <Badge tone={info.tone}>{info.label}</Badge>
      </Td>
      <Td>
        {isOpen && canDecide ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="outline" onClick={onCounter}>
              <Repeat />
              Contrapropor
            </Button>
            <Button
              size="sm"
              loading={decide.isPending && decide.variables === "accept"}
              onClick={() => decide.mutate("accept")}
            >
              <Check />
              Aceitar
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Recusar proposta"
              onClick={() => decide.mutate("reject")}
            >
              <X />
            </Button>
          </div>
        ) : null}
      </Td>
    </Tr>
  );
}

function CounterDialog({
  proposal,
  onOpenChange,
}: {
  proposal: Proposal | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (proposal) setAmount(proposal.asking_price);
  }, [proposal]);

  const counter = useMutation({
    mutationFn: () =>
      api.post(`/sales/proposals/${proposal!.id}/counter`, {
        offer_amount: amount,
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onOpenChange();
      setNotes("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(proposal)}
      onOpenChange={onOpenChange}
      title="Contraproposta do vendedor"
      description="A rodada anterior fica registrada; nada do histórico se perde."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={counter.isPending}
            disabled={!amount}
            onClick={() => {
              setError(null);
              counter.mutate();
            }}
          >
            Registrar contraproposta
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-line-soft rounded-md border border-line">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Preço pedido</dt>
            <dd className="font-mono text-[13px] tabular">{money(proposal?.asking_price)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Oferta do comprador</dt>
            <dd className="font-mono text-[13px] tabular">{money(proposal?.offer_amount)}</dd>
          </div>
        </dl>

        <Field label="Valor da contraproposta (R$)" required>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="font-mono"
            autoFocus
          />
        </Field>
        <Field label="Observações">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condições combinadas com o vendedor"
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

export function ProposalFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = React.useState("");
  const [buyerId, setBuyerId] = React.useState("");
  const [form, setForm] = React.useState({
    asking_price: "",
    offer_amount: "",
    down_payment: "",
    financing_type: "",
    financing_bank: "",
    valid_until: "",
    conditions: "",
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

  // O preço pedido vem do cadastro do imóvel; a oferta o corretor digita.
  React.useEffect(() => {
    const property = properties?.items.find((p) => p.id === propertyId);
    if (property?.sale_price) set({ asking_price: property.sale_price });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Proposal>("/sales/proposals", {
        property_id: propertyId,
        buyer_id: buyerId || null,
        asking_price: form.asking_price,
        offer_amount: form.offer_amount,
        down_payment: form.down_payment || null,
        financing_type: form.financing_type || null,
        financing_bank: form.financing_bank || null,
        valid_until: form.valid_until || null,
        conditions: form.conditions || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onOpenChange(false);
      setForm({ ...form, offer_amount: "", down_payment: "", conditions: "" });
    },
    onError: (err: Error) => setError(err.message),
  });

  const preview =
    form.asking_price && form.offer_amount
      ? Number(form.asking_price) - Number(form.offer_amount)
      : null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova proposta"
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!propertyId || !form.asking_price || !form.offer_amount}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Registrar proposta
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

        <Field label="Comprador">
          <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">Ainda não cadastrado</option>
            {clients?.items.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Preço pedido (R$)" required>
            <Input
              value={form.asking_price}
              onChange={(e) => set({ asking_price: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Oferta (R$)" required>
            <Input
              value={form.offer_amount}
              onChange={(e) => set({ offer_amount: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Sinal / entrada (R$)">
            <Input
              value={form.down_payment}
              onChange={(e) => set({ down_payment: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
        </div>

        {preview !== null && preview !== 0 ? (
          <p
            className={`rounded-md border px-3 py-2 text-[12.5px] ${
              preview > 0
                ? "border-caution/25 bg-caution-soft text-caution"
                : "border-positive/25 bg-positive-soft text-positive"
            }`}
          >
            {preview > 0
              ? `A oferta está ${money(preview)} abaixo do preço pedido.`
              : `A oferta está ${money(Math.abs(preview))} acima do preço pedido.`}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-3">
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
              placeholder="Caixa, Itaú…"
            />
          </Field>
          <Field label="Validade da proposta">
            <Input
              type="date"
              value={form.valid_until}
              onChange={(e) => set({ valid_until: e.target.value })}
            />
          </Field>
        </div>

        <Field label="Condições">
          <Textarea
            value={form.conditions}
            onChange={(e) => set({ conditions: e.target.value })}
            placeholder="Prazo de desocupação, móveis inclusos, condições do sinal…"
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

export function proposalValidity(proposal: Proposal): string {
  return proposal.valid_until ? `válida até ${date(proposal.valid_until)}` : "sem prazo";
}
