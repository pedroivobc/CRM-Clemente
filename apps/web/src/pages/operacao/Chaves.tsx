import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Plus, Undo2 } from "lucide-react";
import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import { SignaturePad } from "@/components/SignaturePad";
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
import { dateTime } from "@/lib/format";
import type { KeyMovement, Property, PropertyKey } from "@/lib/types";

/** Prazo sugerido: fim do dia útil seguinte, no formato do input datetime-local. */
function defaultDueBack(): string {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(18, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(
    due.getHours(),
  )}:${pad(due.getMinutes())}`;
}

function overdueLabel(hours: number): string {
  if (hours < 24) return `Atrasada há ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Atrasada há ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function Chaves() {
  const { can } = useAuth();
  const [taking, setTaking] = React.useState<PropertyKey | null>(null);
  const [creating, setCreating] = React.useState(false);

  const { data: keys, isLoading } = useQuery({
    queryKey: ["keys", "list"],
    queryFn: () => api.get<PropertyKey[]>("/keys"),
  });

  const { data: overdue } = useQuery({
    queryKey: ["keys", "overdue"],
    queryFn: () => api.get<KeyMovement[]>("/keys/alerts/overdue"),
  });

  // As chaves fora saem da lista de retiradas em aberto, e não do chaveiro:
  // é a retirada que carrega o identificador usado para devolver.
  const { data: out } = useQuery({
    queryKey: ["keys", "movements", "abertas"],
    queryFn: () => api.get<KeyMovement[]>("/keys/movements?only_out=true"),
  });

  const available = keys?.filter((k) => k.out_count === 0) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Operação"
        title="Chaveiro"
        description="Onde está cada chave, com quem, desde quando e até quando."
        action={
          can("chaves", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Cadastrar chave
            </Button>
          ) : null
        }
      />

      {overdue && overdue.length > 0 ? (
        <Card className="mb-5 border-critical/30">
          <CardHeader
            title={
              <span className="flex items-center gap-2 text-critical">
                <AlertTriangle className="size-4" />
                {overdue.length === 1
                  ? "1 chave fora do prazo"
                  : `${overdue.length} chaves fora do prazo`}
              </span>
            }
            hint="Cobre a devolução antes de fechar o dia."
          />
          <ul className="divide-y divide-line-soft">
            {overdue.map((movement) => (
              <li
                key={movement.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-[13px]"
              >
                <CodeTag>{movement.property_code}</CodeTag>
                <span className="text-ink">{movement.key_label}</span>
                <span className="text-muted">com {movement.taken_by}</span>
                <span className="ml-auto flex items-center gap-2">
                  <Badge tone="critical">{overdueLabel(movement.hours_overdue)}</Badge>
                  <ReturnButton movement={movement} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card className="mb-5">
        <CardHeader
          title="Fora do chaveiro"
          hint={out && out.length > 0 ? `${out.length} em poder de alguém` : undefined}
        />
        {out === undefined ? (
          <div className="grid h-32 place-items-center">
            <Spinner />
          </div>
        ) : out.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Todas as chaves estão no quadro.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Imóvel</Th>
                <Th>Chave</Th>
                <Th className="hidden lg:table-cell">Motivo</Th>
                <Th>Com quem</Th>
                <Th className="hidden md:table-cell">Devolver até</Th>
                <Th>
                  <span className="sr-only">Ações</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {out.map((movement) => (
                <Tr key={movement.id}>
                  <Td>
                    <CodeTag>{movement.property_code}</CodeTag>
                  </Td>
                  <Td className="text-ink">{movement.key_label}</Td>
                  <Td className="hidden text-muted lg:table-cell">{movement.purpose}</Td>
                  <Td className="text-ink-soft">{movement.taken_by}</Td>
                  <Td className="hidden md:table-cell">
                    <span
                      className={`font-mono text-[12.5px] ${
                        movement.is_overdue ? "text-critical" : "text-ink-soft"
                      }`}
                    >
                      {dateTime(movement.due_back_at)}
                    </span>
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-2">
                      {movement.is_overdue ? (
                        <Badge tone="critical">{overdueLabel(movement.hours_overdue)}</Badge>
                      ) : null}
                      {can("chaves", "edit") ? <ReturnButton movement={movement} /> : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="No quadro" hint={`${available.length} disponíveis para retirada`} />
        {isLoading ? (
          <div className="grid h-32 place-items-center">
            <Spinner />
          </div>
        ) : available.length === 0 ? (
          <EmptyState
            icon={KeyRound}
            title="Nenhuma chave no quadro"
            description="Cadastre as chaves dos imóveis para controlar retirada e devolução."
          />
        ) : (
          <KeyTable keys={available} onTake={can("chaves", "edit") ? setTaking : undefined} />
        )}
      </Card>

      <TakeKeyDialog propertyKey={taking} onOpenChange={() => setTaking(null)} />
      <NewKeyDialog open={creating} onOpenChange={() => setCreating(false)} />
    </>
  );
}

function KeyTable({
  keys,
  onTake,
}: {
  keys: PropertyKey[];
  onTake?: (key: PropertyKey) => void;
}) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Imóvel</Th>
          <Th>Chave</Th>
          <Th className="hidden sm:table-cell">Posição</Th>
          <Th className="hidden md:table-cell">Cópias</Th>
          <Th>
            <span className="sr-only">Ações</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {keys.map((key) => (
          <Tr key={key.id}>
            <Td>
              <div className="flex items-center gap-2">
                <CodeTag>{key.property_code}</CodeTag>
                <span className="hidden truncate text-muted lg:inline">{key.property_title}</span>
              </div>
            </Td>
            <Td className="text-ink">{key.label}</Td>
            <Td className="hidden font-mono text-[12.5px] text-muted sm:table-cell">
              {key.board_position ?? "—"}
            </Td>
            <Td className="hidden font-mono text-[12.5px] text-ink-soft md:table-cell">
              {key.copies}
            </Td>
            <Td>
              <div className="flex justify-end">
                {onTake ? (
                  <Button size="sm" variant="outline" onClick={() => onTake(key)}>
                    Registrar retirada
                  </Button>
                ) : null}
              </div>
            </Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function ReturnButton({ movement }: { movement: KeyMovement }) {
  const queryClient = useQueryClient();
  const give = useMutation({
    mutationFn: () => api.post(`/keys/movements/${movement.id}/return`, {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["keys"] }),
  });

  return (
    <Button size="sm" loading={give.isPending} onClick={() => give.mutate()}>
      <Undo2 />
      Devolver
    </Button>
  );
}

function TakeKeyDialog({
  propertyKey,
  onOpenChange,
}: {
  propertyKey: PropertyKey | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [document, setDocument] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [purpose, setPurpose] = React.useState("Visita ao imóvel");
  const [dueBackAt, setDueBackAt] = React.useState(defaultDueBack());
  const [signature, setSignature] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (propertyKey) {
      setName("");
      setDocument("");
      setPhone("");
      setPurpose("Visita ao imóvel");
      setDueBackAt(defaultDueBack());
      setSignature(null);
      setError(null);
    }
  }, [propertyKey]);

  const take = useMutation({
    mutationFn: () =>
      api.post(`/keys/${propertyKey!.id}/take`, {
        purpose,
        due_back_at: new Date(dueBackAt).toISOString(),
        taken_by_name: name.trim(),
        taken_by_document: document.trim() || null,
        taken_by_phone: phone.trim() || null,
        signature,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(propertyKey)}
      onOpenChange={onOpenChange}
      title="Retirada de chave"
      description="Quem levou, para quê e até quando devolve."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={take.isPending}
            disabled={!name.trim() || !purpose.trim()}
            onClick={() => {
              setError(null);
              take.mutate();
            }}
          >
            Registrar retirada
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-sunken px-3 py-2 text-[13px]">
          <CodeTag>{propertyKey?.property_code}</CodeTag>
          <span className="text-ink">{propertyKey?.label}</span>
          {propertyKey?.board_position ? (
            <span className="font-mono text-[12px] text-muted">
              posição {propertyKey.board_position}
            </span>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Quem está levando" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
            />
          </Field>
          <Field label="CPF" hint="Recomendado para quem não é da equipe">
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              inputMode="numeric"
              className="font-mono"
              placeholder="000.000.000-00"
            />
          </Field>
          <Field label="Telefone">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              className="font-mono"
              placeholder="(00) 00000-0000"
            />
          </Field>
          <Field label="Devolver até" required>
            <Input
              type="datetime-local"
              value={dueBackAt}
              onChange={(e) => setDueBackAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Motivo" required>
          <Select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            <option>Visita ao imóvel</option>
            <option>Vistoria</option>
            <option>Manutenção</option>
            <option>Entrega ao locatário</option>
            <option>Cópia de chave</option>
            <option>Outro</option>
          </Select>
        </Field>

        <SignaturePad onChange={setSignature} />

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

function NewKeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: () => void }) {
  const queryClient = useQueryClient();
  const [propertyId, setPropertyId] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [copies, setCopies] = React.useState("1");
  const [boardPosition, setBoardPosition] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const { data: properties } = useQuery({
    queryKey: ["properties", "para-chaves"],
    queryFn: () => api.get<Page<Property>>("/properties?page_size=200"),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/keys", {
        property_id: propertyId,
        label: label.trim(),
        copies: Number(copies) || 1,
        board_position: boardPosition.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["keys"] });
      setPropertyId("");
      setLabel("");
      setCopies("1");
      setBoardPosition("");
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Cadastrar chave"
      description="Uma entrada por jogo de chaves guardado no quadro."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!propertyId || !label.trim()}
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
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Identificação" required className="sm:col-span-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Jogo principal"
            />
          </Field>
          <Field label="Cópias">
            <Input
              value={copies}
              onChange={(e) => setCopies(e.target.value)}
              inputMode="numeric"
              className="font-mono"
            />
          </Field>
        </div>
        <Field label="Posição no quadro" hint="A etiqueta física, para achar sem procurar">
          <Input
            value={boardPosition}
            onChange={(e) => setBoardPosition(e.target.value)}
            className="font-mono"
            placeholder="A-14"
          />
        </Field>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
