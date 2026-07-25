import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSignature, Plus, TrendingUp } from "lucide-react";
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
import type {
  AdjustmentPreview,
  Client,
  Contract,
  ExpiringContract,
  Property,
} from "@/lib/types";

const STATUS_TONES: Record<Contract["status"], { label: string; tone: "neutral" | "positive" | "caution" | "critical" }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  em_assinatura: { label: "Em assinatura", tone: "caution" },
  ativo: { label: "Ativo", tone: "positive" },
  encerrado: { label: "Encerrado", tone: "neutral" },
  cancelado: { label: "Cancelado", tone: "critical" },
};

const PARTY_ROLES: Record<string, string> = {
  locatario: "Locatário",
  locador: "Proprietário",
  fiador: "Fiador",
};

const GUARANTEES: Record<string, string> = {
  fiador: "Fiador",
  caucao: "Caução",
  seguro_fianca: "Seguro-fiança",
  titulo_capitalizacao: "Título de capitalização",
};

export function Contratos() {
  const { can } = useAuth();
  const [creating, setCreating] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState("");

  const { data: contracts, isLoading } = useQuery({
    queryKey: ["contracts", statusFilter],
    queryFn: () =>
      api.get<Contract[]>(`/contracts${statusFilter ? `?status_filter=${statusFilter}` : ""}`),
  });

  const { data: expiring } = useQuery({
    queryKey: ["contracts", "expiring"],
    queryFn: () => api.get<ExpiringContract[]>("/contracts/alerts/expiring?days=90"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Locação"
        title="Contratos"
        description="Vigência, reajuste e garantia de cada locação administrada."
        action={
          can("locacao", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo contrato
            </Button>
          ) : null
        }
      />

      {expiring && expiring.length > 0 ? (
        <Card className="mb-5">
          <CardHeader
            title="Vigências a vencer"
            hint="Contratos que terminam nos próximos 90 dias"
          />
          <ul className="divide-y divide-line-soft">
            {expiring.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                <CalendarClock
                  className={`size-4 shrink-0 ${item.days_left <= 30 ? "text-critical" : "text-caution"}`}
                />
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/contratos/${item.id}`}
                    className="text-[13px] font-medium text-ink hover:underline"
                  >
                    {item.code} — {item.property_title}
                  </Link>
                  <p className="text-[12px] text-muted">
                    {item.tenant_name ?? "Sem locatário"} · termina em {date(item.end_date)}
                  </p>
                </div>
                <Badge tone={item.days_left <= 30 ? "critical" : "caution"}>
                  {item.days_left} dias
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-48"
            aria-label="Filtrar por situação"
          >
            <option value="">Todas as situações</option>
            {Object.entries(STATUS_TONES).map(([value, { label }]) => (
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
        ) : contracts?.length === 0 ? (
          <EmptyState
            icon={FileSignature}
            title="Nenhum contrato"
            description="Cadastre o primeiro contrato de locação para começar a gerar as cobranças mensais."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contrato</Th>
                <Th className="hidden md:table-cell">Locatário</Th>
                <Th className="hidden sm:table-cell">Vigência</Th>
                <Th className="text-right">Aluguel</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {contracts?.map((contract) => {
                const locatario = contract.parties.find((p) => p.role === "locatario");
                const info = STATUS_TONES[contract.status];
                return (
                  <Tr key={contract.id}>
                    <Td>
                      <Link
                        to={`/contratos/${contract.id}`}
                        className="flex items-center gap-2 font-medium text-ink hover:underline"
                      >
                        <CodeTag tone="brand">{contract.code}</CodeTag>
                        <span className="line-clamp-1">{contract.property_title}</span>
                      </Link>
                    </Td>
                    <Td className="hidden text-ink-soft md:table-cell">
                      {locatario?.name ?? "—"}
                    </Td>
                    <Td className="hidden font-mono text-[12.5px] text-ink-soft sm:table-cell">
                      {date(contract.start_date)} — {date(contract.end_date)}
                    </Td>
                    <Td className="text-right font-mono tabular text-ink">
                      {money(contract.rent_amount)}
                    </Td>
                    <Td>
                      <Badge tone={info.tone}>{info.label}</Badge>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <ContractFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

export function ContratoDetalhe() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [showAdjust, setShowAdjust] = React.useState(false);

  const { data: contract, isLoading } = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api.get<Contract>(`/contracts/${id}`),
  });

  const { data: preview } = useQuery({
    queryKey: ["contract", id, "preview"],
    queryFn: () => api.get<{ body: string }>(`/contracts/${id}/preview`),
    enabled: Boolean(contract),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["contract", id] });
    queryClient.invalidateQueries({ queryKey: ["contracts"] });
  };

  const action = useMutation({
    mutationFn: (verb: "sign" | "activate" | "terminate") =>
      api.post(`/contracts/${id}/${verb}`),
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading || !contract) {
    return (
      <Card className="grid h-48 place-items-center">
        <Spinner />
      </Card>
    );
  }

  const info = STATUS_TONES[contract.status];

  return (
    <>
      <Link
        to="/contratos"
        className="mb-4 inline-block text-[13px] text-muted hover:text-ink"
      >
        ← Contratos
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <CodeTag tone="brand">{contract.code}</CodeTag>
            <Badge tone={info.tone}>{info.label}</Badge>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">
            {contract.property_title}
          </h1>
          <p className="mt-1 text-[13px] text-muted">
            Imóvel {contract.property_code} · vigência de {date(contract.start_date)} a{" "}
            {date(contract.end_date)}
          </p>
        </div>

        {can("locacao", "approve") ? (
          <div className="flex flex-wrap gap-2">
            {contract.status === "rascunho" ? (
              <Button loading={action.isPending} onClick={() => action.mutate("sign")}>
                <FileSignature />
                Enviar para assinatura
              </Button>
            ) : null}
            {contract.status === "em_assinatura" ? (
              <Button loading={action.isPending} onClick={() => action.mutate("activate")}>
                Ativar contrato
              </Button>
            ) : null}
            {contract.status === "ativo" ? (
              <>
                {contract.adjustment_due ? (
                  <Button variant="outline" onClick={() => setShowAdjust(true)}>
                    <TrendingUp />
                    Reajustar
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  loading={action.isPending}
                  onClick={() => action.mutate("terminate")}
                >
                  Encerrar
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
      </header>

      {error ? (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Valores mensais" />
            <dl className="divide-y divide-line-soft">
              <Row label="Aluguel">{money(contract.rent_amount)}</Row>
              <Row label="Condomínio">{money(contract.condo_fee)}</Row>
              <Row label="IPTU">{money(contract.iptu_amount)}</Row>
              <Row label="Total cobrado do locatário" strong>
                {money(contract.total_monthly)}
              </Row>
              <Row label={`Taxa de administração (${Number(contract.admin_fee_pct)}%)`}>
                {money(contract.admin_fee_amount)}
              </Row>
            </dl>
            <p className="border-t border-line px-5 py-3 text-[12px] text-muted">
              A taxa incide sobre o aluguel. Condomínio e IPTU são repassados integralmente ao
              proprietário.
            </p>
          </Card>

          {preview ? (
            <Card>
              <CardHeader title="Texto do contrato" hint="Gerado a partir do template" />
              <pre className="overflow-x-auto px-5 py-4 font-sans text-[13px] leading-relaxed whitespace-pre-wrap text-ink-soft">
                {preview.body}
              </pre>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Partes" />
            <ul className="divide-y divide-line-soft">
              {contract.parties.map((party) => (
                <li key={`${party.client_id}-${party.role}`} className="px-5 py-3">
                  <Link
                    to={`/clientes/${party.client_id}`}
                    className="text-[13px] font-medium text-ink hover:underline"
                  >
                    {party.name}
                  </Link>
                  <p className="text-[12px] text-muted">
                    {PARTY_ROLES[party.role] ?? party.role}
                    {party.is_payee ? " · recebe o repasse" : ""}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Condições" />
            <dl className="divide-y divide-line-soft">
              <Row label="Vencimento">todo dia {contract.due_day}</Row>
              <Row label="Reajuste">
                {contract.price_index === "IGPM" ? "IGP-M" : "IPCA"}
              </Row>
              <Row label="Próximo reajuste">
                {date(contract.next_adjustment_at)}
                {contract.adjustment_due ? (
                  <Badge tone="caution" className="ml-2">
                    devido
                  </Badge>
                ) : null}
              </Row>
              <Row label="Garantia">
                {contract.guarantee_type
                  ? GUARANTEES[contract.guarantee_type]
                  : "Sem garantia"}
              </Row>
              <Row label="Multa por atraso">{Number(contract.late_fine_pct)}%</Row>
              <Row label="Juros ao dia">{Number(contract.daily_interest_pct)}%</Row>
            </dl>
          </Card>
        </div>
      </div>

      <AdjustmentDialog
        contractId={id}
        open={showAdjust}
        onOpenChange={setShowAdjust}
        onApplied={invalidate}
      />
    </>
  );
}

function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`text-right font-mono text-[13px] tabular ${
          strong ? "font-medium text-ink" : "text-ink-soft"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

function AdjustmentDialog({
  contractId,
  open,
  onOpenChange,
  onApplied,
}: {
  contractId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => void;
}) {
  const [error, setError] = React.useState<string | null>(null);

  const { data: preview, isLoading } = useQuery({
    queryKey: ["contract", contractId, "adjustment"],
    queryFn: () => api.get<AdjustmentPreview>(`/contracts/${contractId}/adjustment/preview`),
    enabled: open,
  });

  const apply = useMutation({
    mutationFn: () => api.post(`/contracts/${contractId}/adjustment/apply`),
    onSuccess: () => {
      onApplied();
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Reajuste anual"
      description="Calculado pelo índice acumulado dos doze meses anteriores ao aniversário do contrato."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={apply.isPending}
            disabled={!preview || preview.months_used === 0}
            onClick={() => {
              setError(null);
              apply.mutate();
            }}
          >
            Aplicar reajuste
          </Button>
        </>
      }
    >
      {isLoading || !preview ? (
        <div className="grid h-24 place-items-center">
          <Spinner />
        </div>
      ) : preview.months_used === 0 ? (
        <ErrorNote>
          Não há série do {preview.index_name} cadastrada para o período. Importe os índices antes
          de aplicar o reajuste.
        </ErrorNote>
      ) : (
        <div className="space-y-4">
          <dl className="divide-y divide-line-soft rounded-md border border-line">
            <Row label={`Índice (${preview.index_name}, ${preview.months_used} meses)`}>
              {Number(preview.accumulated_pct).toFixed(4).replace(".", ",")}%
            </Row>
            <Row label="Aluguel atual">{money(preview.previous_rent)}</Row>
            <Row label="Novo aluguel" strong>
              {money(preview.new_rent)}
            </Row>
            <Row label="Diferença">{money(preview.difference)}</Row>
          </dl>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </div>
      )}
    </Dialog>
  );
}

function ContractFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = React.useState("");
  const [ownerId, setOwnerId] = React.useState("");
  const [tenantId, setTenantId] = React.useState("");
  const [form, setForm] = React.useState({
    rent_amount: "",
    condo_fee: "",
    iptu_amount: "",
    admin_fee_pct: "10",
    price_index: "IGPM",
    start_date: "",
    end_date: "",
    due_day: "10",
    guarantee_type: "",
  });
  const [error, setError] = React.useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((c) => ({ ...c, ...patch }));

  const { data: properties } = useQuery({
    queryKey: ["properties", "para-locacao"],
    queryFn: () => api.get<Page<Property>>("/properties?purpose=locacao&page_size=200"),
    enabled: open,
  });

  const { data: clients } = useQuery({
    queryKey: ["clients", "todos"],
    queryFn: () => api.get<Page<Client>>("/clients?page_size=200"),
    enabled: open,
  });

  // Preenche os valores a partir do imóvel escolhido — é o que a equipe espera.
  React.useEffect(() => {
    const property = properties?.items.find((p) => p.id === propertyId);
    if (property) {
      set({
        rent_amount: property.rent_price ?? "",
        condo_fee: property.condo_fee ?? "",
        iptu_amount: property.iptu_amount ?? "",
      });
      const owner = property.owners.find((o) => o.is_payee) ?? property.owners[0];
      if (owner) setOwnerId(owner.client_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const create = useMutation({
    mutationFn: () =>
      api.post<Contract>("/contracts", {
        property_id: propertyId,
        rent_amount: form.rent_amount,
        condo_fee: form.condo_fee || "0",
        iptu_amount: form.iptu_amount || "0",
        admin_fee_pct: form.admin_fee_pct,
        price_index: form.price_index,
        start_date: form.start_date,
        end_date: form.end_date,
        due_day: Number(form.due_day),
        guarantee_type: form.guarantee_type || null,
        parties: [
          ...(ownerId ? [{ client_id: ownerId, role: "locador", is_payee: true }] : []),
          ...(tenantId ? [{ client_id: tenantId, role: "locatario" }] : []),
        ],
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contracts"] });
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const valid = propertyId && tenantId && form.rent_amount && form.start_date && form.end_date;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo contrato de locação"
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!valid}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Criar contrato
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
          <Field label="Proprietário" hint="Recebe o repasse">
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Selecione</option>
              {clients?.items.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Locatário" required>
            <Select value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
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
          <Field label="Aluguel (R$)" required>
            <Input
              value={form.rent_amount}
              onChange={(e) => set({ rent_amount: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Condomínio (R$)">
            <Input
              value={form.condo_fee}
              onChange={(e) => set({ condo_fee: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="IPTU (R$)">
            <Input
              value={form.iptu_amount}
              onChange={(e) => set({ iptu_amount: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
          <Field label="Taxa adm. (%)" required hint="Normalmente entre 10% e 13%">
            <Input
              value={form.admin_fee_pct}
              onChange={(e) => set({ admin_fee_pct: e.target.value })}
              inputMode="decimal"
              className="font-mono"
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Início" required>
            <Input
              type="date"
              value={form.start_date}
              onChange={(e) => set({ start_date: e.target.value })}
            />
          </Field>
          <Field label="Fim" required>
            <Input
              type="date"
              value={form.end_date}
              onChange={(e) => set({ end_date: e.target.value })}
            />
          </Field>
          <Field label="Dia do vencimento">
            <Input
              value={form.due_day}
              onChange={(e) => set({ due_day: e.target.value })}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
          <Field label="Índice de reajuste">
            <Select
              value={form.price_index}
              onChange={(e) => set({ price_index: e.target.value })}
            >
              <option value="IGPM">IGP-M</option>
              <option value="IPCA">IPCA</option>
            </Select>
          </Field>
        </div>

        <Field label="Garantia">
          <Select
            value={form.guarantee_type}
            onChange={(e) => set({ guarantee_type: e.target.value })}
          >
            <option value="">Sem garantia</option>
            {Object.entries(GUARANTEES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
