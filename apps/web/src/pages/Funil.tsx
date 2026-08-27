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
import type { Board, Lead, LossReason } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Funil() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [creating, setCreating] = React.useState(false);
  const [losing, setLosing] = React.useState<Lead | null>(null);
  const [dragging, setDragging] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);

  const { data: board, isLoading } = useQuery({
    queryKey: ["rentals", "board"],
    queryFn: () => api.get<Board>("/rentals/board"),
  });

  const move = useMutation({
    mutationFn: ({ leadId, stageId }: { leadId: string; stageId: string }) =>
      api.post(`/rentals/leads/${leadId}/move`, { stage_id: stageId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rentals", "board"] }),
  });

  const canEdit = can("locacao", "edit");

  if (isLoading || !board) {
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );
  }

  const total = board.leads.length;
  const atrasados = board.leads.filter((l) => l.sla_breached).length;

  return (
    <>
      <PageHeader
        eyebrow="Locação"
        title="Funil de locação"
        description="Da captação do interessado ao contrato assinado."
        action={
          can("locacao", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo lead
            </Button>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
        <span>
          {total} {total === 1 ? "lead em aberto" : "leads em aberto"}
        </span>
        {atrasados > 0 ? (
          <Badge tone="critical">
            <AlertTriangle className="size-3" />
            {atrasados} fora do prazo da etapa
          </Badge>
        ) : null}
      </div>

      {/* Kanban: uma coluna por etapa, com rolagem horizontal em telas estreitas. */}
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
                  if (dragging && canEdit) {
                    move.mutate({ leadId: dragging, stageId: stage.id });
                  }
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
                      <p className="font-mono text-[10px] text-muted">
                        SLA {stage.sla_hours}h
                      </p>
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
  lead: Lead;
  draggable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onLose?: () => void;
}) {
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

      {lead.source ? (
        <p className="mt-0.5 text-[12px] text-muted">via {lead.source}</p>
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
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [source, setSource] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post("/rentals/leads", {
        name,
        phone: phone || null,
        email: email || null,
        source: source || null,
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rentals", "board"] });
      onOpenChange(false);
      setName("");
      setPhone("");
      setEmail("");
      setNotes("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo lead"
      description="O lead entra na primeira etapa e é distribuído ao corretor com menos leads em aberto."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!name.trim()}
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
          <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="WhatsApp">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>
        <Field label="Origem" hint="De onde veio o contato">
          <Select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Não informado</option>
            <option value="portal">Portal de imóveis</option>
            <option value="site">Site da imobiliária</option>
            <option value="indicacao">Indicação</option>
            <option value="balcao">Balcão</option>
            <option value="placa">Placa no imóvel</option>
            <option value="whatsapp">WhatsApp</option>
          </Select>
        </Field>
        <Field label="Observações">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="O que o interessado procura"
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
  lead: Lead | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [reasonId, setReasonId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const { data: reasons } = useQuery({
    queryKey: ["rentals", "loss-reasons"],
    queryFn: () => api.get<LossReason[]>("/rentals/loss-reasons"),
    enabled: Boolean(lead),
  });

  React.useEffect(() => {
    if (reasons?.length && !reasonId) setReasonId(reasons[0].id);
  }, [reasons, reasonId]);

  const lose = useMutation({
    mutationFn: () => api.post(`/rentals/leads/${lead!.id}/lose`, { loss_reason_id: reasonId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rentals", "board"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(lead)}
      onOpenChange={onOpenChange}
      title="Marcar lead como perdido"
      description={`O motivo alimenta o relatório de perdas do funil.`}
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
