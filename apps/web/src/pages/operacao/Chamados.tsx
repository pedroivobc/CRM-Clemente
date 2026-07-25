import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Wrench } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeTag,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { money, phone as formatPhone } from "@/lib/format";
import { PRIORITIES, SPECIALTIES, TICKET_STATUS } from "@/lib/labels";
import type { Property, ServiceProvider, Ticket } from "@/lib/types";

type Tab = "chamados" | "prestadores";

export function Chamados() {
  const { can } = useAuth();
  const [tab, setTab] = React.useState<Tab>("chamados");
  const [creating, setCreating] = React.useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Manutenção"
        description="Orçamento, aprovação e execução no sistema — não no WhatsApp de quem atendeu."
        action={
          can("manutencao", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              {tab === "chamados" ? "Abrir chamado" : "Cadastrar prestador"}
            </Button>
          ) : null
        }
      />

      <div className="mb-5 flex gap-1 border-b border-line">
        <TabButton active={tab === "chamados"} onClick={() => setTab("chamados")}>
          Chamados
        </TabButton>
        <TabButton active={tab === "prestadores"} onClick={() => setTab("prestadores")}>
          Prestadores
        </TabButton>
      </div>

      {tab === "chamados" ? (
        <>
          <TicketList />
          <NewTicketDialog open={creating} onOpenChange={() => setCreating(false)} />
        </>
      ) : (
        <>
          <ProviderList />
          <NewProviderDialog open={creating} onOpenChange={() => setCreating(false)} />
        </>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-[13.5px] transition-colors ${
        active
          ? "border-[var(--brand-primary)] font-medium text-[var(--brand-primary)]"
          : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

/* ── Chamados ─────────────────────────────────────────────────────────── */

function TicketList() {
  const [filter, setFilter] = React.useState("");

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["maintenance", "tickets", filter],
    queryFn: () =>
      api.get<Ticket[]>(`/maintenance/tickets${filter ? `?status_filter=${filter}` : ""}`),
  });

  const waiting = tickets?.filter((t) => t.status === "aprovacao").length ?? 0;

  return (
    <>
      <div className="mb-5 max-w-56">
        <Field label="Situação">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(TICKET_STATUS).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Card>
        <CardHeader
          title="Chamados"
          hint={
            waiting > 0
              ? `${waiting} ${waiting === 1 ? "aguarda aprovação" : "aguardam aprovação"}`
              : undefined
          }
        />
        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : tickets?.length === 0 ? (
          <EmptyState
            icon={Wrench}
            title="Nenhum chamado"
            description="Abra um chamado quando o locatário reportar um problema no imóvel."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {tickets?.map((ticket) => (
              <li key={ticket.id}>
                <Link
                  to={`/chamados/${ticket.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodeTag>{ticket.code}</CodeTag>
                      <span className="text-[14px] text-ink">{ticket.title}</span>
                      {ticket.priority !== "normal" && ticket.priority !== "baixa" ? (
                        <Badge tone={PRIORITIES[ticket.priority].tone}>
                          {PRIORITIES[ticket.priority].label}
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {ticket.property_code} · {ticket.property_title}
                      {ticket.specialty ? ` · ${SPECIALTIES[ticket.specialty]}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {ticket.final_cost ? (
                      <span className="font-mono text-[13px] text-ink-soft">
                        {money(ticket.final_cost)}
                      </span>
                    ) : ticket.quotes.length > 0 ? (
                      <span className="font-mono text-[12.5px] text-muted">
                        {ticket.quotes.length}{" "}
                        {ticket.quotes.length === 1 ? "orçamento" : "orçamentos"}
                      </span>
                    ) : null}
                    <Badge tone={TICKET_STATUS[ticket.status].tone}>
                      {TICKET_STATUS[ticket.status].label}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function NewTicketDialog({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [specialty, setSpecialty] = React.useState("");
  const [priority, setPriority] = React.useState("normal");
  const [error, setError] = React.useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ["properties", "para-chamado"],
    queryFn: () => api.get<Page<Property>>("/properties?page_size=200"),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/maintenance/tickets", {
        property_id: propertyId,
        title: title.trim(),
        description: description.trim() || null,
        specialty: specialty || null,
        priority,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance"] });
      setPropertyId("");
      setTitle("");
      setDescription("");
      setSpecialty("");
      setPriority("normal");
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Abrir chamado"
      description="Registre o problema como o locatário contou. Quem paga se define na triagem."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!propertyId || !title.trim()}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Abrir chamado
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

        <Field label="Resumo do problema" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Infiltração no teto do banheiro"
          />
        </Field>

        <Field label="Detalhes">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Começou depois da chuva de sábado, mancha aumentando."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Especialidade">
            <Select value={specialty} onChange={(e) => setSpecialty(e.target.value)}>
              <option value="">Definir na triagem</option>
              {Object.entries(SPECIALTIES).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITIES).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

/* ── Prestadores ──────────────────────────────────────────────────────── */

function ProviderList() {
  const { data: providers, isLoading } = useQuery({
    queryKey: ["maintenance", "providers"],
    queryFn: () => api.get<ServiceProvider[]>("/maintenance/providers"),
  });

  if (isLoading) {
    return (
      <div className="grid h-40 place-items-center">
        <Spinner />
      </div>
    );
  }

  if (providers?.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Wrench}
          title="Nenhum prestador cadastrado"
          description="Cadastre os profissionais de confiança para pedir orçamento em um clique."
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {providers?.map((provider) => (
        <Card key={provider.id} className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-display text-[15px] font-medium text-ink">{provider.name}</h3>
            {provider.avg_rating ? (
              <span className="flex shrink-0 items-center gap-1 font-mono text-[13px] text-ink-soft">
                <Star className="size-3.5 fill-caution text-caution" />
                {Number(provider.avg_rating).toFixed(1)}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {provider.specialties.map((s) => (
              <Badge key={s}>{SPECIALTIES[s] ?? s}</Badge>
            ))}
          </div>

          <dl className="mt-3 space-y-1 text-[12.5px]">
            <div className="flex justify-between">
              <dt className="text-muted">Telefone</dt>
              <dd className="font-mono text-ink-soft">{formatPhone(provider.phone)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Serviços concluídos</dt>
              <dd className="font-mono text-ink-soft">{provider.jobs_done}</dd>
            </div>
          </dl>
        </Card>
      ))}
    </div>
  );
}

function NewProviderDialog({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [document, setDocument] = React.useState("");
  const [specialties, setSpecialties] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post("/maintenance/providers", {
        name: name.trim(),
        phone: phone.trim() || null,
        document: document.trim() || null,
        specialties,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["maintenance", "providers"] });
      setName("");
      setPhone("");
      setDocument("");
      setSpecialties([]);
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  function toggle(key: string) {
    setSpecialties((current) =>
      current.includes(key) ? current.filter((s) => s !== key) : [...current, key],
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar prestador"
      description="Quem a imobiliária chama quando algo quebra."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
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
            Cadastrar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Hidráulica Silva"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Telefone">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="font-mono"
              placeholder="(00) 00000-0000"
            />
          </Field>
          <Field label="CPF ou CNPJ">
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium text-ink-soft">Especialidades</legend>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(SPECIALTIES).map(([key, label]) => {
              const active = specialties.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggle(key)}
                  className={`rounded-full border px-3 py-1 text-[12.5px] transition-colors ${
                    active
                      ? "border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_12%,white)] font-medium text-[var(--brand-primary)]"
                      : "border-line text-ink-soft hover:bg-sunken"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
