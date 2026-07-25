import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  FileText,
  Gauge,
  Plus,
  TriangleAlert,
} from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { ProgressBar } from "@/pages/operacao/Vistorias";
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
import { dateTime, money, toDecimalInput, toDecimalString } from "@/lib/format";
import {
  CONDITIONS,
  CONDITION_LABELS,
  INSPECTION_KINDS,
  INSPECTION_STATUS,
  METERS,
  RESPONSIBILITIES,
} from "@/lib/labels";
import type {
  Condition,
  Inspection,
  InspectionIssue,
  InspectionItem,
  InspectionRoom,
} from "@/lib/types";

export function VistoriaDetalhe() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);
  const [finishing, setFinishing] = React.useState(false);
  const [addingRoom, setAddingRoom] = React.useState(false);

  const { data: inspection, isLoading } = useQuery({
    queryKey: ["inspections", id],
    queryFn: () => api.get<Inspection>(`/inspections/${id}`),
  });

  const report = useMutation({
    mutationFn: () => api.post<{ report_url: string }>(`/inspections/${id}/report`),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["inspections", id] });
      window.open(result.report_url, "_blank", "noopener");
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="grid h-64 place-items-center">
        <Spinner />
      </div>
    );
  }
  if (!inspection) return <ErrorNote>Vistoria não encontrada.</ErrorNote>;

  const editable = inspection.status !== "concluida" && can("vistorias", "edit");

  return (
    <>
      <Link
        to="/vistorias"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Vistorias
      </Link>

      {/* Cabeçalho fixo: no celular o vistoriador rola muito, e o progresso
          precisa continuar à vista. */}
      <div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:rounded-lg lg:border lg:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <CodeTag>{inspection.property_code}</CodeTag>
          <h1 className="font-display text-lg font-semibold text-ink">
            Vistoria de {INSPECTION_KINDS[inspection.kind].toLowerCase()}
          </h1>
          <Badge tone={INSPECTION_STATUS[inspection.status].tone}>
            {INSPECTION_STATUS[inspection.status].label}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-[12.5px] text-muted">{inspection.property_title}</p>

        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1">
            <ProgressBar pct={inspection.progress_pct} />
          </div>
          <span className="font-mono text-[12.5px] text-ink-soft">
            {inspection.filled_items}/{inspection.total_items}
          </span>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {editable ? (
            <Button
              size="sm"
              disabled={inspection.filled_items === 0}
              onClick={() => setFinishing(true)}
            >
              <Check />
              Concluir vistoria
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            loading={report.isPending}
            onClick={() => {
              setError(null);
              report.mutate();
            }}
          >
            <FileText />
            {inspection.report_url ? "Gerar laudo novamente" : "Gerar laudo"}
          </Button>
          {inspection.report_url ? (
            <a
              href={inspection.report_url}
              target="_blank"
              rel="noopener"
              className="inline-flex h-8 items-center rounded-md px-2.5 text-[13px] text-[var(--brand-primary)] hover:underline"
            >
              Abrir último laudo
            </a>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      {inspection.issues.length > 0 ? (
        <IssuesCard issues={inspection.issues} inspectionId={id} editable={can("vistorias", "edit")} />
      ) : null}

      <MetersCard inspection={inspection} editable={editable} />

      <div className="mt-5 space-y-3">
        {inspection.rooms.map((room) => (
          <RoomCard key={room.id} room={room} inspectionId={id} editable={editable} />
        ))}
      </div>

      {editable ? (
        <Button variant="outline" className="mt-4 w-full sm:w-auto" onClick={() => setAddingRoom(true)}>
          <Plus />
          Acrescentar cômodo
        </Button>
      ) : null}

      <AddRoomDialog
        open={addingRoom}
        inspectionId={id}
        onOpenChange={() => setAddingRoom(false)}
      />
      <FinishDialog
        open={finishing}
        inspection={inspection}
        onOpenChange={() => setFinishing(false)}
      />
    </>
  );
}

/* ── Cômodos e itens ──────────────────────────────────────────────────── */

function RoomCard({
  room,
  inspectionId,
  editable,
}: {
  room: InspectionRoom;
  inspectionId: string;
  editable: boolean;
}) {
  const filled = room.items.filter((item) => item.condition).length;
  const complete = room.items.length > 0 && filled === room.items.length;
  const [addingItem, setAddingItem] = React.useState(false);

  return (
    <Card>
      <details open={!complete} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5">
          <ChevronDown className="size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
          <span className="flex-1 font-display text-[15px] font-medium text-ink">{room.name}</span>
          <span
            className={`font-mono text-[12px] ${complete ? "text-positive" : "text-muted"}`}
          >
            {filled}/{room.items.length}
          </span>
        </summary>

        <div className="divide-y divide-line-soft border-t border-line">
          {room.items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              inspectionId={inspectionId}
              editable={editable}
            />
          ))}
        </div>

        {editable ? (
          <div className="px-4 py-3 sm:px-5">
            <Button size="sm" variant="ghost" onClick={() => setAddingItem(true)}>
              <Plus />
              Acrescentar item
            </Button>
          </div>
        ) : null}
      </details>

      <AddItemDialog
        open={addingItem}
        room={room}
        inspectionId={inspectionId}
        onOpenChange={() => setAddingItem(false)}
      />
    </Card>
  );
}

function ItemRow({
  item,
  inspectionId,
  editable,
}: {
  item: InspectionItem;
  inspectionId: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = React.useState(item.notes ?? "");
  const [showNotes, setShowNotes] = React.useState(Boolean(item.notes));
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["inspections", inspectionId] });

  const save = useMutation({
    mutationFn: (patch: { condition?: Condition; notes?: string }) =>
      api.patch(`/inspections/items/${item.id}`, patch),
    onSuccess: invalidate,
  });

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      await api.upload(`/inspections/${inspectionId}/photos?item_id=${item.id}`, file);
      await invalidate();
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[14px] text-ink">{item.name}</span>
        {!editable ? (
          item.condition ? (
            <ConditionChip condition={item.condition} />
          ) : (
            <span className="text-[12px] text-muted italic">não avaliado</span>
          )
        ) : null}
      </div>

      {editable ? (
        <div className="mt-2 grid max-w-xl grid-cols-4 gap-1.5">
          {CONDITIONS.map((option) => {
            const active = item.condition === option.key;
            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={active}
                onClick={() => save.mutate({ condition: option.key })}
                className="h-11 rounded-md border text-[13px] font-medium transition-colors"
                style={
                  active
                    ? { background: option.color, borderColor: option.color, color: "#fff" }
                    : { borderColor: "var(--color-line)", color: option.color }
                }
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}

      {item.photos.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.photos.map((photo) => (
            <a key={photo.id} href={photo.url} target="_blank" rel="noopener">
              <img
                src={photo.url}
                alt={photo.caption ?? `Foto de ${item.name}`}
                className="size-16 rounded-md border border-line object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}

      {editable ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadPhoto(file);
              e.target.value = "";
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            loading={uploading}
            onClick={() => fileRef.current?.click()}
          >
            <Camera />
            Foto
          </Button>
          {!showNotes ? (
            <Button size="sm" variant="ghost" onClick={() => setShowNotes(true)}>
              Observação
            </Button>
          ) : null}
        </div>
      ) : null}

      {showNotes && editable ? (
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if (notes !== (item.notes ?? "")) save.mutate({ notes });
          }}
          placeholder="Risco no canto direito, cerca de 20 cm"
          className="mt-2 min-h-16 text-[13px]"
        />
      ) : item.notes && !editable ? (
        <p className="mt-1.5 text-[12.5px] text-muted">{item.notes}</p>
      ) : null}
    </div>
  );
}

function ConditionChip({ condition }: { condition: Condition }) {
  const option = CONDITIONS.find((c) => c.key === condition);
  if (!option) return null;
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[12px] font-medium"
      style={{ color: option.color, borderColor: option.color }}
    >
      {option.label}
    </span>
  );
}

/* ── Medidores ────────────────────────────────────────────────────────── */

function MetersCard({ inspection, editable }: { inspection: Inspection; editable: boolean }) {
  const queryClient = useQueryClient();
  const [meter, setMeter] = React.useState("agua");
  const [reading, setReading] = React.useState("");

  const save = useMutation({
    mutationFn: () => api.post(`/inspections/${inspection.id}/meters`, { meter, reading }),
    onSuccess: () => {
      setReading("");
      queryClient.invalidateQueries({ queryKey: ["inspections", inspection.id] });
    },
  });

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <Gauge className="size-4 text-muted" />
            Medidores
          </span>
        }
        hint="Água, luz e gás na data da vistoria — o que separa a conta de quem sai da de quem entra."
      />
      <div className="px-4 py-3 sm:px-5">
        {inspection.meters.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {inspection.meters.map((m) => (
              <div key={m.id} className="rounded-md border border-line px-3 py-1.5 text-[13px]">
                <span className="text-muted">{METERS[m.meter]}</span>
                <strong className="ml-2 font-mono font-medium text-ink">{m.reading}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="mb-3 text-[13px] text-muted">Nenhuma leitura registrada.</p>
        )}

        {editable ? (
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Medidor" className="w-32">
              <Select value={meter} onChange={(e) => setMeter(e.target.value)}>
                {Object.entries(METERS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Leitura" className="w-40">
              <Input
                value={reading}
                onChange={(e) => setReading(e.target.value)}
                inputMode="numeric"
                className="font-mono"
                placeholder="01234"
              />
            </Field>
            <Button
              variant="outline"
              loading={save.isPending}
              disabled={!reading.trim()}
              onClick={() => save.mutate()}
            >
              Registrar
            </Button>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

/* ── Pendências apuradas ──────────────────────────────────────────────── */

function IssuesCard({
  issues,
  inspectionId,
  editable,
}: {
  issues: InspectionIssue[];
  inspectionId: string;
  editable: boolean;
}) {
  return (
    <Card className="mb-5 border-caution/30">
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            <TriangleAlert className="size-4 text-caution" />
            Pendências apuradas
          </span>
        }
        hint="A responsabilidade é uma sugestão da comparação com a entrada. Quem decide é a equipe."
      />
      <ul className="divide-y divide-line-soft">
        {issues.map((issue) => (
          <IssueRow
            key={issue.id}
            issue={issue}
            inspectionId={inspectionId}
            editable={editable}
          />
        ))}
      </ul>
    </Card>
  );
}

function IssueRow({
  issue,
  inspectionId,
  editable,
}: {
  issue: InspectionIssue;
  inspectionId: string;
  editable: boolean;
}) {
  const queryClient = useQueryClient();
  const [cost, setCost] = React.useState(toDecimalInput(issue.estimated_cost));

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch(`/inspections/issues/${issue.id}`, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inspections", inspectionId] }),
  });

  return (
    <li className="px-4 py-3 sm:px-5">
      <p className="text-[13.5px] text-ink">{issue.description}</p>
      <p className="mt-0.5 text-[12px] text-muted">
        {issue.room_name ? `${issue.room_name} · ` : ""}
        {issue.entry_condition
          ? `entrada ${CONDITION_LABELS[issue.entry_condition]} → saída ${
              issue.exit_condition ? CONDITION_LABELS[issue.exit_condition] : "—"
            }`
          : "Sem registro na vistoria de entrada"}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        {editable ? (
          <>
            <Field label="Responsabilidade" className="w-44">
              <Select
                value={issue.responsibility}
                onChange={(e) => save.mutate({ responsibility: e.target.value })}
              >
                {Object.entries(RESPONSIBILITIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estimativa (R$)" className="w-32">
              <Input
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                onBlur={() => {
                  if (cost !== toDecimalInput(issue.estimated_cost)) {
                    save.mutate({ estimated_cost: toDecimalString(cost) || null });
                  }
                }}
                inputMode="decimal"
                className="font-mono"
                placeholder="0,00"
              />
            </Field>
          </>
        ) : (
          <>
            <Badge>{RESPONSIBILITIES[issue.responsibility]}</Badge>
            <span className="font-mono text-[13px] text-ink-soft">
              {money(issue.estimated_cost)}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

/* ── Diálogos ─────────────────────────────────────────────────────────── */

function AddRoomDialog({
  open,
  inspectionId,
  onOpenChange,
}: {
  open: boolean;
  inspectionId: string;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");

  const create = useMutation({
    mutationFn: () => api.post(`/inspections/${inspectionId}/rooms`, { name: name.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections", inspectionId] });
      setName("");
      onOpenChange();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Acrescentar cômodo"
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Acrescentar
          </Button>
        </>
      }
    >
      <Field label="Nome do cômodo" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Segundo quarto"
          autoFocus
        />
      </Field>
    </Dialog>
  );
}

function AddItemDialog({
  open,
  room,
  inspectionId,
  onOpenChange,
}: {
  open: boolean;
  room: InspectionRoom;
  inspectionId: string;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");

  const create = useMutation({
    mutationFn: () =>
      api.post(`/inspections/rooms/${room.id}/items`, {
        name: name.trim(),
        sort_order: room.items.length,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections", inspectionId] });
      setName("");
      onOpenChange();
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Acrescentar item em ${room.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button loading={create.isPending} disabled={!name.trim()} onClick={() => create.mutate()}>
            Acrescentar
          </Button>
        </>
      }
    >
      <Field label="Item" required>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rodapé"
          autoFocus
        />
      </Field>
    </Dialog>
  );
}

function FinishDialog({
  open,
  inspection,
  onOpenChange,
}: {
  open: boolean;
  inspection: Inspection;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const finish = useMutation({
    mutationFn: () => api.post(`/inspections/${inspection.id}/finish`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inspections"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  const pending = inspection.total_items - inspection.filled_items;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Concluir vistoria"
      description={
        inspection.kind === "saida"
          ? "Ao concluir, o sistema compara com a vistoria de entrada e lista o que piorou."
          : "Depois de concluída, a vistoria não aceita mais alterações."
      }
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={finish.isPending}
            onClick={() => {
              setError(null);
              finish.mutate();
            }}
          >
            Concluir
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <dl className="divide-y divide-line-soft rounded-md border border-line">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Itens avaliados</dt>
            <dd className="font-mono text-[13px] tabular">
              {inspection.filled_items}/{inspection.total_items}
            </dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Medidores</dt>
            <dd className="font-mono text-[13px] tabular">{inspection.meters.length}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Iniciada em</dt>
            <dd className="font-mono text-[13px]">{dateTime(inspection.created_at)}</dd>
          </div>
        </dl>

        {pending > 0 ? (
          <p className="rounded-md border border-caution/25 bg-caution-soft px-3 py-2 text-[12.5px] text-caution">
            {pending === 1
              ? "1 item ficou sem avaliação e não entrará no laudo."
              : `${pending} itens ficaram sem avaliação e não entrarão no laudo.`}
          </p>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
