import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, FileText, Plus } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

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
} from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { dateTime } from "@/lib/format";
import { INSPECTION_KINDS, INSPECTION_STATUS } from "@/lib/labels";
import type { InspectionSummary, Property } from "@/lib/types";

export function Vistorias() {
  const { can } = useAuth();
  const [creating, setCreating] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  const { data: inspections, isLoading } = useQuery({
    queryKey: ["inspections", filter],
    queryFn: () =>
      api.get<InspectionSummary[]>(`/inspections${filter ? `?status_filter=${filter}` : ""}`),
  });

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Vistorias"
        description="Entrada, saída e periódicas. O laudo de saída nasce da comparação com o de entrada."
        action={
          can("vistorias", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Nova vistoria
            </Button>
          ) : null
        }
      />

      <div className="mb-5 max-w-56">
        <Field label="Situação">
          <Select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">Todas</option>
            <option value="agendada">Agendadas</option>
            <option value="em_andamento">Em andamento</option>
            <option value="concluida">Concluídas</option>
          </Select>
        </Field>
      </div>

      <Card>
        <CardHeader
          title="Fila de vistorias"
          hint={inspections?.length ? `${inspections.length} no período` : undefined}
        />
        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : inspections?.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="Nenhuma vistoria por aqui"
            description="Agende a vistoria de entrada antes da entrega das chaves."
          />
        ) : (
          <ul className="divide-y divide-line-soft">
            {inspections?.map((inspection) => (
              <li key={inspection.id}>
                <Link
                  to={`/vistorias/${inspection.id}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition-colors hover:bg-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <CodeTag>{inspection.property_code}</CodeTag>
                      <span className="text-[14px] text-ink">{INSPECTION_KINDS[inspection.kind]}</span>
                      <Badge tone={INSPECTION_STATUS[inspection.status].tone}>
                        {INSPECTION_STATUS[inspection.status].label}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {inspection.property_title}
                      {inspection.inspector_name ? ` · ${inspection.inspector_name}` : ""}
                    </p>
                  </div>

                  <div className="w-full sm:w-44">
                    <ProgressBar pct={inspection.progress_pct} />
                    <p className="mt-1 font-mono text-[11.5px] text-muted">
                      {inspection.filled_items}/{inspection.total_items} itens
                    </p>
                  </div>

                  <div className="w-full text-[12.5px] sm:w-40 sm:text-right">
                    <span className="font-mono text-ink-soft">
                      {dateTime(inspection.performed_at ?? inspection.scheduled_at)}
                    </span>
                    {inspection.report_url ? (
                      <span className="mt-0.5 flex items-center gap-1 text-muted sm:justify-end">
                        <FileText className="size-3.5" />
                        Laudo emitido
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewInspectionDialog open={creating} onOpenChange={() => setCreating(false)} />
    </>
  );
}

export function ProgressBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div
        className="h-full rounded-full transition-[width]"
        style={{
          width: `${pct}%`,
          background: pct === 100 ? "var(--color-positive)" : "var(--brand-primary)",
        }}
      />
    </div>
  );
}

function NewInspectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [propertyId, setPropertyId] = React.useState("");
  const [kind, setKind] = React.useState("entrada");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [useScript, setUseScript] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ["properties", "para-vistoria"],
    queryFn: () => api.get<Page<Property>>("/properties?page_size=200"),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>("/inspections", {
        property_id: propertyId,
        kind,
        scheduled_at: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        use_default_script: useScript,
      }),
    onSuccess: (inspection) => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      onOpenChange();
      navigate(`/vistorias/${inspection.id}`);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Nova vistoria"
      description="A vistoria de saída procura sozinha a de entrada do mesmo imóvel para comparar."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!propertyId}
            onClick={() => {
              setError(null);
              create.mutate();
            }}
          >
            Criar e começar
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
          <Field label="Tipo" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
              <option value="periodica">Periódica</option>
            </Select>
          </Field>
          <Field label="Agendada para">
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
          </Field>
        </div>

        <label className="flex items-start gap-2.5 rounded-md border border-line px-3 py-2.5">
          <input
            type="checkbox"
            checked={useScript}
            onChange={(e) => setUseScript(e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--brand-primary)]"
          />
          <span className="text-[13px]">
            <span className="font-medium text-ink">Usar o roteiro padrão</span>
            <span className="mt-0.5 block text-[12px] text-muted">
              Sala, cozinha, quarto, banheiro e área de serviço já com os itens de sempre. Dá para
              acrescentar ou renomear na hora da vistoria.
            </span>
          </span>
        </label>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
