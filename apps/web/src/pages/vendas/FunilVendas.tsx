import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Plus, UserRound } from "lucide-react";
import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  CodeTag,
  Dialog,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import { FINANCING_TYPES, SALES_SOURCES } from "@/lib/labels";
import type { LossReason, SalesBoard, SalesLead } from "@/lib/types";
import { cn } from "@/lib/utils";

export function FunilVendas() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [losing, setLosing] = React.useState<SalesLead | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);

  const { data: board, isLoading } = useQuery({
    queryKey: ["sales", "board"],
    queryFn: () => api.get<SalesBoard>("/sales/board"),
  });

  const move = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      api.post(`/sales/leads/${leadId}/move`, { stage_id: stageId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["sales"] }),
  });

  const canEdit = can("vendas", "edit");

  if (isLoading || !board) {
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );
  }

  const atrasados = board.leads.filter((l) => l.sla_breached).length;

  return (
    <>
      <PageHeader
        eyebrow="Vendas"
        title="Funil de vendas"
        description="Do primeiro contato do comprador à venda fechada."
        action={
          can("vendas", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo lead
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span>
          {board.leads.length}{" "}
          {board.leads.length === 1 ? "lead em aberto" : "leads em aberto"}
        </span>
        {atrasados > 0 ? (
          <Badge tone="critical">
            <AlertTriangle className="size-3" />
            {atrasados} fora do prazo da etapa
          </Badge>
        ) : null}
      </div>

      <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3">
          {board.stages.map((stage) => {
            const leads = board.leads.filter((l) => l.stage_id === stage.id);
            const isTarget = hovered === stage.id && dragging !== null;

            return (
              <section
                key={stage.id}
                onDragOver={(e) => {
                  if (!canEdit) return;
                  e.preventDefault();
                  setHovered(stage.id);
                }}
                onDragLeave={() => setHovered(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setHovered(null);
                  if (dragging && canEdit) move.mutate({ leadId: dragging, stageId: stage.id });
                  setDragging(null);
                }}
                className={cn(
                  "flex w-[264px] shrink-0 flex-col rounded-lg border bg-sunken/60 transition-colors",
                  isTarget ? "border-[var(--brand-primary)] bg-surface" : "border-line",
                )}
              >
                <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2.5">
                  <div className="min-w-0">
                    <h2 className="truncate text-[13px] font-medium text-ink">{stage.name}</h2>
                    {stage.sla_hours ? (
                      <p className="font-mono text-[10px] text-muted">SLA {stage.sla_hours}h</p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-surface px-1.5 font-mono text-[11px] text-ink-soft">
                    {leads.length}
                  </span>
                </header>

                <div className="flex flex-1 flex-col gap-2 p-2">
                  {leads.length === 0 ? (
                    <p className="px-1 py-6 text-center text-[12px] text-muted">
                      Nenhum lead aqui
                    </p>
                  ) : (
                    leads.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        draggable={canEdit}
                        onDragStart={() => setDragging(lead.id)}
                        onDragEnd={() => setDragging(null)}
                        onLose={canEdit ? () => setLosing(lead) : undefined}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <LeadFormDialog open={creating} onOpenChange={setCreating} />
      <LoseLeadDialog lead={losing} onOpenChange={() => setLosing(null)} />
    </>
  );
}

function LeadCard({
  lead,
  draggable,
  onDragStart,
  onDragEnd,
  onLose,
}: {
  lead: SalesLead;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLose?: () => void;
}) {
  // O orçamento do comprador é o dado que o corretor mais consulta no funil.
  const budget =
    lead.budget_max || lead.budget_min
      ? `até ${money(lead.budget_max ?? lead.budget_min)}`
      : null;

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group rounded-md border border-line bg-surface p-3 shadow-[0_1px_2px_#16181d08]",
        draggable && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-medium text-ink">{lead.name}</p>
        {lead.property_code ? <CodeTag>{lead.property_code}</CodeTag> : null}
      </div>

      {budget ? (
        <p className="mt-0.5 font-mono text-[12px] tabular text-ink-soft">{budget}</p>
      ) : null}

      {lead.financing_type ? (
        <p className="mt-1 text-[11px] text-muted">
          {FINANCING_TYPES[lead.financing_type]}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
        {lead.assigned_name ? (
          <span className="inline-flex items-center gap-1">
            <UserRound className="size-3" />
            {lead.assigned_name.split(" ")[0]}
          </span>
        ) : null}
        <span
          className={cn(
            "inline-flex items-center gap-1 font-mono",
            lead.sla_breached && "font-medium text-critical",
          )}
        >
          <Clock className="size-3" />
          {formatHours(lead.hours_in_stage)}
        </span>
      </div>

      {onLose ? (
        <button
          type="button"
          onClick={onLose}
          className="mt-2 text-[11px] text-muted opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100 hover:text-critical"
        >
          Marcar como perdido
        </button>
      ) : null}
    </article>
  );
}

function formatHours(hours: number): string {
  if (hours < 1) return "agora";
  if (hours < 24) return `${Math.round(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

function LeadFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    name: "",
    phone: "",
    email: "",
    source: "",
    budget_min: "",
    budget_max: "",
    financing_type: "",
    notes: "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((c) => ({ ...c, ...patch }));

  const create = useMutation({
    mutationFn: () =>
      api.post("/sales/leads", {
        name: form.name,
        phone: form.phone || null,
        email: form.email || null,
        source: form.source || null,
        budget_min: form.budget_min || null,
        budget_max: form.budget_max || null,
        financing_type: form.financing_type || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onOpenChange(false);
      setForm({
        name: "",
        phone: "",
        email: "",
        source: "",
        budget_min: "",
        budget_max: "",
        financing_type: "",
        notes: "",
      });
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo lead de venda"
      description="Orçamento e forma de pagamento orientam a busca de imóveis para o comprador."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!form.name.trim()}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Cadastrar lead
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome do interessado" required>
          <Input value={form.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp">
            <Input
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
              inputMode="tel"
            />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Orçamento mínimo (R$)">
            <Input
              value={form.budget_min}
              onChange={(e) => set({ budget_min: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Orçamento máximo (R$)">
            <Input
              value={form.budget_max}
              onChange={(e) => set({ budget_max: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Como pretende pagar">
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
        </div>

        <Field label="Origem">
          <Select value={form.source} onChange={(e) => set({ source: e.target.value })}>
            <option value="">Não informado</option>
            {Object.entries(SALES_SOURCES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Observações">
          <Textarea
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="O que o comprador procura"
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

function LoseLeadDialog({
  lead,
  onOpenChange,
}: {
  lead: SalesLead | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [reasonId, setReasonId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const { data: reasons } = useQuery({
    queryKey: ["sales", "loss-reasons"],
    queryFn: () => api.get<LossReason[]>("/sales/loss-reasons"),
    enabled: Boolean(lead),
  });

  React.useEffect(() => {
    if (reasons?.length && !reasonId) setReasonId(reasons[0].id);
  }, [reasons, reasonId]);

  const lose = useMutation({
    mutationFn: () => api.post(`/sales/leads/${lead!.id}/lose`, { loss_reason_id: reasonId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(lead)}
      onOpenChange={onOpenChange}
      title="Marcar lead como perdido"
      description="O motivo alimenta o relatório de perdas do funil de vendas."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={lose.isPending}
            disabled={!reasonId}
            onClick={() => {
              setError(null);
              lose.mutate();
            }}
          >
            Marcar como perdido
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-ink-soft">
          Lead: <strong className="font-medium">{lead?.name}</strong>
        </p>
        <Field label="Motivo da perda" required>
          <Select value={reasonId} onChange={(e) => setReasonId(e.target.value)}>
            {reasons?.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {reason.name}
              </option>
            ))}
          </Select>
        </Field>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
