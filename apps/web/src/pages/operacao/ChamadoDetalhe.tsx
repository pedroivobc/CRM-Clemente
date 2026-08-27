import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Check, MessageSquare, ShieldCheck, Star } from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeTag,
  Dialog,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, money, toDecimalInput, toDecimalString } from "@/lib/format";
import { PAYERS, PRIORITIES, SPECIALTIES, TICKET_FLOW, TICKET_STATUS } from "@/lib/labels";
import type { ServiceProvider, Ticket, TicketQuote } from "@/lib/types";

export function ChamadoDetalhe() {
  const { id = "" } = useParams();
  const { can } = useAuth();

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["maintenance", "ticket", id],
    queryFn: () => api.get<Ticket>(`/maintenance/tickets/${id}`),
  });

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!ticket) return <ErrorNote>Chamado não encontrado.</ErrorNote>;

  const editable = ticket.status !== "concluido" && ticket.status !== "cancelado";

  return (
    <>
      <Link
        to="/chamados"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Manutenção
      </Link>

      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <CodeTag>{ticket.code}</CodeTag>
          <h1 className="font-display text-xl font-semibold text-ink">{ticket.title}</h1>
          <Badge tone={TICKET_STATUS[ticket.status].tone}>
            {TICKET_STATUS[ticket.status].label}
          </Badge>
          {ticket.priority !== "normal" ? (
            <Badge tone={PRIORITIES[ticket.priority].tone}>
              {PRIORITIES[ticket.priority].label}
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-[13px] text-muted">
          {ticket.property_code} · {ticket.property_title}
          {ticket.opened_by ? ` · aberto por ${ticket.opened_by}` : ""}
        </p>
      </header>

      <FlowTrail status={ticket.status} />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {ticket.description ? (
            <Card>
              <CardHeader title="O que foi relatado" />
              <p className="px-5 py-4 text-[13.5px] leading-relaxed text-ink-soft">
                {ticket.description}
              </p>
            </Card>
          ) : null}

          {ticket.status === "aberto" && editable && can("manutencao", "edit") ? (
            <TriageCard ticket={ticket} />
          ) : null}

          <QuotesCard ticket={ticket} editable={editable} />

          <PhotosCard ticket={ticket} editable={editable} />

          <TimelineCard ticket={ticket} editable={editable} />
        </div>

        <div className="space-y-5">
          <SummaryCard ticket={ticket} />
          {editable && ticket.status === "execucao" && can("manutencao", "edit") ? (
            <CompleteCard ticket={ticket} />
          ) : null}
          {ticket.status === "concluido" ? <RatingCard ticket={ticket} /> : null}
        </div>
      </div>
    </>
  );
}

/** Trilha do fluxo: onde o chamado está e o que falta. */
function FlowTrail({ status }: { status: Ticket["status"] }) {
  if (status === "cancelado") return null;
  const current = TICKET_FLOW.indexOf(status);

  return (
    <ol className="mb-5 flex flex-wrap gap-1.5">
      {TICKET_FLOW.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step}
            className={`rounded-full px-2.5 py-1 text-[12px] ${
              active
                ? "bg-[color-mix(in_srgb,var(--brand-primary)_12%,white)] font-medium text-[var(--brand-primary)]"
                : done
                  ? "bg-positive-soft text-positive"
                  : "bg-sunken text-muted"
            }`}
          >
            {done ? "✓ " : ""}
            {TICKET_STATUS[step].label}
          </li>
        );
      })}
    </ol>
  );
}

function SummaryCard({ ticket }: { ticket: Ticket }) {
  return (
    <Card>
      <CardHeader title="Resumo" />
      <dl className="divide-y divide-line-soft">
        <Row label="Especialidade" value={ticket.specialty ? SPECIALTIES[ticket.specialty] : "—"} />
        <Row label="Quem paga" value={ticket.payer ? PAYERS[ticket.payer] : "A definir"} />
        <Row label="Aberto em" value={dateTime(ticket.created_at)} mono />
        {ticket.scheduled_for ? (
          <Row label="Agendado para" value={date(ticket.scheduled_for)} mono />
        ) : null}
        {ticket.final_cost ? (
          <Row label="Custo final" value={money(ticket.final_cost)} mono />
        ) : null}
        {ticket.completed_at ? (
          <Row label="Concluído em" value={dateTime(ticket.completed_at)} mono />
        ) : null}
      </dl>
    </Card>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 px-5 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`text-[13px] text-ink-soft ${mono ? "font-mono tabular" : ""}`}>{value}</dd>
    </div>
  );
}

/* ── Triagem ──────────────────────────────────────────────────────────── */

function TriageCard({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const [payer, setPayer] = React.useState("proprietario");
  const [specialty, setSpecialty] = React.useState(ticket.specialty ?? "");
  const [priority, setPriority] = React.useState(ticket.priority);
  const [error, setError] = React.useState<string | null>(null);

  const triage = useMutation({
    mutationFn: () =>
      api.post(`/maintenance/tickets/${ticket.id}/triage`, {
        payer,
        specialty: specialty || null,
        priority,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance"] }),
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader
        title="Triagem"
        hint="Definir quem paga é o que destrava o orçamento — e determina quem precisa aprovar."
      />
      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Quem paga" required>
            <Select value={payer} onChange={(e) => setPayer(e.target.value)}>
              {Object.entries(PAYERS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Especialidade">
            <Select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">Não definida</option>
              {Object.entries(SPECIALTIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Ticket["priority"])}
            >
              {Object.entries(PRIORITIES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <p className="text-[12.5px] text-muted">
          Serviço estrutural costuma ser do proprietário; mau uso, do locatário. Quando a
          imobiliária resolve por conta própria, o custo vira despesa dela.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Button loading={triage.isPending} onClick={() => triage.mutate()}>
          <Check />
          Concluir triagem
        </Button>
      </div>
    </Card>
  );
}

/* ── Orçamentos e aprovação ───────────────────────────────────────────── */

function QuotesCard({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const { can } = useAuth();
  const [adding, setAdding] = React.useState(false);
  const [approving, setApproving] = React.useState<TicketQuote | null>(null);
  const canAdd = editable && ticket.quotes.length < 3 && can("manutencao", "edit");

  return (
    <>
      <Card>
        <CardHeader
          title="Orçamentos"
          hint={
            ticket.quotes.length === 0
              ? "Peça até três para poder comparar."
              : Number(ticket.quote_spread) > 0
                ? `Diferença entre o maior e o menor: ${money(ticket.quote_spread)}`
                : undefined
          }
          action={
            canAdd ? (
              <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
                Lançar orçamento
              </Button>
            ) : null
          }
        />

        {ticket.approver && ticket.status === "aprovacao" ? (
          <div className="flex items-start gap-2 border-b border-line bg-caution-soft px-5 py-3 text-[13px] text-caution">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" />
            <span>
              Aprovação de <strong className="font-medium">{PAYERS[ticket.approver]}</strong>.{" "}
              {ticket.approver_reason}
            </span>
          </div>
        ) : null}

        {ticket.quotes.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Nenhum orçamento lançado ainda.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {ticket.quotes.map((quote) => (
              <li key={quote.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                <div className="w-full min-w-0 sm:flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] text-ink">{quote.provider_name}</span>
                    {quote.is_cheapest && ticket.quotes.length > 1 ? (
                      <Badge tone="positive">Menor preço</Badge>
                    ) : null}
                    {quote.status === "aprovado" ? <Badge tone="brand">Aprovado</Badge> : null}
                    {quote.status === "recusado" ? <Badge>Recusado</Badge> : null}
                  </div>
                  {quote.description ? (
                    <p className="mt-0.5 text-[12.5px] text-muted">{quote.description}</p>
                  ) : null}
                  {quote.lead_days ? (
                    <p className="mt-0.5 text-[12px] text-muted">
                      Prazo de {quote.lead_days} {quote.lead_days === 1 ? "dia" : "dias"}
                      {quote.valid_until ? ` · válido até ${date(quote.valid_until)}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex w-full items-center justify-between gap-3 sm:w-auto">
                  <span className="font-mono text-[15px] font-medium tabular text-ink">
                    {money(quote.amount)}
                  </span>
                  {editable && quote.status === "pendente" && can("manutencao", "approve") ? (
                    <Button size="sm" onClick={() => setApproving(quote)}>
                      Aprovar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <AddQuoteDialog ticket={ticket} open={adding} onOpenChange={() => setAdding(false)} />
      <ApproveDialog
        ticket={ticket}
        quote={approving}
        onOpenChange={() => setApproving(null)}
      />
    </>
  );
}

function AddQuoteDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: Ticket;
  open: boolean;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [providerId, setProviderId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [leadDays, setLeadDays] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const { data: providers } = useQuery({
    queryKey: ["maintenance", "providers", ticket.specialty],
    queryFn: () =>
      api.get<ServiceProvider[]>(
        `/maintenance/providers${ticket.specialty ? `?specialty=${ticket.specialty}` : ""}`,
      ),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post(`/maintenance/tickets/${ticket.id}/quotes`, {
        provider_id: providerId,
        amount: toDecimalString(amount),
        description: description.trim() || null,
        lead_days: leadDays ? Number(leadDays) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      setProviderId("");
      setAmount("");
      setDescription("");
      setLeadDays("");
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Lançar orçamento"
      description="Registre o que o prestador respondeu, para a comparação ficar no chamado."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!providerId || !amount}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Lançar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label="Prestador"
          required
          hint={
            ticket.specialty
              ? `Filtrado por ${SPECIALTIES[ticket.specialty].toLowerCase()}`
              : undefined
          }
        >
          <Select value={providerId} onChange={(e) => setProviderId(e.target.value)}>
            <option value="">Selecione o prestador</option>
            {providers?.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name}
                {provider.avg_rating ? ` — nota ${Number(provider.avg_rating).toFixed(1)}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (R$)" required>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="font-mono"
              placeholder="0,00"
            />
          </Field>
          <Field label="Prazo (dias)">
            <Input
              value={leadDays}
              onChange={(e) => setLeadDays(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
        </div>

        <Field label="O que está incluído">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Troca do sifão, mão de obra e material."
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

function ApproveDialog({
  ticket,
  quote,
  onOpenChange,
}: {
  ticket: Ticket;
  quote: TicketQuote | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [scheduledFor, setScheduledFor] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () =>
      api.post(`/maintenance/tickets/${ticket.id}/approve`, {
        quote_id: quote!.id,
        scheduled_for: scheduledFor || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(quote)}
      onOpenChange={onOpenChange}
      title="Aprovar orçamento"
      description="Os demais orçamentos deste chamado passam a constar como recusados."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={approve.isPending}
            onClick={() => {
              setError(null);
              approve.mutate();
            }}
          >
            Aprovar e liberar execução
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-line-soft rounded-md border border-line">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Prestador</dt>
            <dd className="text-[13px]">{quote?.provider_name}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Valor</dt>
            <dd className="font-mono text-[13px] tabular">{money(quote?.amount)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Quem paga</dt>
            <dd className="text-[13px]">{ticket.payer ? PAYERS[ticket.payer] : "A definir"}</dd>
          </div>
        </dl>

        {ticket.approver_reason ? (
          <p className="rounded-md border border-caution/25 bg-caution-soft px-3 py-2 text-[12.5px] text-caution">
            {ticket.approver_reason}. Confirme que{" "}
            {ticket.approver ? PAYERS[ticket.approver].toLowerCase() : "o responsável"} autorizou
            antes de seguir.
          </p>
        ) : null}

        <Field label="Agendar execução para">
          <Input
            type="date"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

/* ── Fotos ────────────────────────────────────────────────────────────── */

function PhotosCard({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const queryClient = useQueryClient();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [moment, setMoment] = React.useState("antes");
  const [uploading, setUploading] = React.useState(false);

  async function upload(file: File) {
    setUploading(true);
    try {
      await api.upload(`/maintenance/tickets/${ticket.id}/photos?moment=${moment}`, file);
      await queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    } finally {
      setUploading(false);
    }
  }

  const before = ticket.photos.filter((p) => p.moment === "antes");
  const after = ticket.photos.filter((p) => p.moment === "depois");

  return (
    <Card>
      <CardHeader
        title="Fotos"
        hint="Antes e depois: é o que sustenta a cobrança e a conversa com o proprietário."
      />
      <div className="space-y-4 px-5 py-4">
        <PhotoGroup title="Antes" photos={before} />
        <PhotoGroup title="Depois" photos={after} />

        {editable ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Momento" className="w-32">
              <Select value={moment} onChange={(e) => setMoment(e.target.value)}>
                <option value="antes">Antes</option>
                <option value="depois">Depois</option>
              </Select>
            </Field>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
                e.target.value = "";
              }}
            />
            <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
              <Camera />
              Anexar foto
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function PhotoGroup({ title, photos }: { title: string; photos: Ticket["photos"] }) {
  if (photos.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[12px] text-muted">{title}</p>
      <div className="flex flex-wrap gap-2">
        {photos.map((photo) => (
          <a key={photo.id} href={photo.url} target="_blank" rel="noopener">
            <img
              src={photo.url}
              alt={photo.caption ?? title}
              className="size-20 rounded-md border border-line object-cover"
            />
          </a>
        ))}
      </div>
    </div>
  );
}

/* ── Histórico e conversa ─────────────────────────────────────────────── */

function TimelineCard({ ticket, editable }: { ticket: Ticket; editable: boolean }) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = React.useState("");

  const log = useMutation({
    mutationFn: () =>
      api.post(`/maintenance/tickets/${ticket.id}/messages`, { summary: summary.trim() }),
    onSuccess: () => {
      setSummary("");
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });

  return (
    <Card>
      <CardHeader
        title="Histórico"
        hint="Ligou, combinou, remarcou: registre aqui para não ficar só na cabeça de quem atendeu."
      />

      <ol className="divide-y divide-line-soft">
        {ticket.events.map((event) => (
          <li key={event.id} className="px-5 py-3">
            <p className="text-[13.5px] text-ink-soft">{event.summary}</p>
            <p className="mt-0.5 font-mono text-[11.5px] text-muted">
              {dateTime(event.created_at)}
              {event.user_name ? ` · ${event.user_name}` : ""}
            </p>
          </li>
        ))}
      </ol>

      {editable ? (
        <div className="flex gap-2 border-t border-line px-5 py-4">
          <Input
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && summary.trim()) log.mutate();
            }}
            placeholder="Prestador confirmou para quinta de manhã"
          />
          <Button
            variant="outline"
            loading={log.isPending}
            disabled={!summary.trim()}
            onClick={() => log.mutate()}
          >
            <MessageSquare />
            Registrar
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

/* ── Conclusão e avaliação ────────────────────────────────────────────── */

function CompleteCard({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const approved = ticket.quotes.find((q) => q.status === "aprovado");
  const [finalCost, setFinalCost] = React.useState(toDecimalInput(approved?.amount));
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const complete = useMutation({
    mutationFn: () =>
      api.post(`/maintenance/tickets/${ticket.id}/complete`, {
        final_cost: toDecimalString(finalCost) || null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance"] }),
    onError: (err: Error) => setError(err.message),
  });

  const destination =
    ticket.payer === "proprietario"
      ? "desconto no repasse do proprietário"
      : ticket.payer === "locatario"
        ? "cobrança avulsa ao locatário"
        : "despesa da imobiliária";

  return (
    <Card>
      <CardHeader title="Concluir serviço" />
      <div className="space-y-4 px-5 py-4">
        <Field label="Custo final (R$)" hint="Deixe como está se o valor foi o do orçamento">
          <Input
            value={finalCost}
            onChange={(e) => setFinalCost(e.target.value)}
            inputMode="decimal"
            className="font-mono"
          />
        </Field>

        <Field label="Observação">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Serviço executado, sem pendências."
            className="min-h-16"
          />
        </Field>

        <p className="rounded-md border border-line bg-sunken px-3 py-2 text-[12.5px] text-ink-soft">
          Ao concluir, o custo vai para o financeiro como {destination}.
        </p>

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Button className="w-full" loading={complete.isPending} onClick={() => complete.mutate()}>
          <Check />
          Concluir chamado
        </Button>
      </div>
    </Card>
  );
}

function RatingCard({ ticket }: { ticket: Ticket }) {
  const queryClient = useQueryClient();
  const [score, setScore] = React.useState(ticket.rating ?? 0);
  const [comment, setComment] = React.useState("");

  const rate = useMutation({
    mutationFn: (value: number) =>
      api.post(`/maintenance/tickets/${ticket.id}/rate`, {
        score: value,
        comment: comment.trim() || null,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["maintenance"] }),
  });

  return (
    <Card>
      <CardHeader
        title="Avaliação do serviço"
        hint="A nota entra na média do prestador e ordena a lista no próximo orçamento."
      />
      <div className="space-y-3 px-5 py-4">
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-label={`${value} ${value === 1 ? "estrela" : "estrelas"}`}
              onClick={() => {
                setScore(value);
                rate.mutate(value);
              }}
              className="p-0.5"
            >
              <Star
                className={`size-6 ${
                  value <= score ? "fill-caution text-caution" : "text-line"
                }`}
              />
            </button>
          ))}
        </div>

        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          onBlur={() => {
            if (score > 0 && comment.trim()) rate.mutate(score);
          }}
          placeholder="Chegou no horário e limpou tudo depois."
          className="min-h-16"
        />
      </div>
    </Card>
  );
}
