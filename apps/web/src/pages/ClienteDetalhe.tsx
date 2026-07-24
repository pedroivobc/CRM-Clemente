import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Paperclip, Plus } from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  Dialog,
  ErrorNote,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, dateTime, phone as formatPhone } from "@/lib/format";
import { CHANNELS, CLIENT_ROLES } from "@/lib/labels";
import type { Client, ClientDocument, Interaction } from "@/lib/types";

const DOC_TYPES = [
  "RG",
  "CPF",
  "CNH",
  "comprovante_de_residencia",
  "comprovante_de_renda",
  "contrato_social",
  "certidao",
  "outro",
];

export function ClienteDetalhe() {
  const { id = "" } = useParams();
  const { can } = useAuth();

  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: () => api.get<Client>(`/clients/${id}`),
  });

  if (isLoading || !client) {
    return (
      <Card className="grid h-48 place-items-center">
        <Spinner />
      </Card>
    );
  }

  return (
    <>
      <Link
        to="/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Clientes
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-2xl font-semibold text-ink">{client.name}</h1>
          <Badge tone="neutral">{client.kind === "PF" ? "Pessoa física" : "Pessoa jurídica"}</Badge>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {client.roles.map((role) => (
            <Badge key={role} tone="brand">
              {CLIENT_ROLES[role] ?? role}
            </Badge>
          ))}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Dados" />
            <dl className="divide-y divide-line-soft">
              <Row label="CPF / CNPJ" mono>
                {client.cpf_cnpj_formatted ?? "—"}
              </Row>
              <Row label="RG / IE">{client.rg_ie ?? "—"}</Row>
              <Row label="Nascimento">{date(client.birth_date)}</Row>
              <Row label="Endereço">
                {client.address?.logradouro
                  ? [
                      [client.address.logradouro, client.address.numero].filter(Boolean).join(", "),
                      client.address.bairro,
                      [client.address.cidade, client.address.uf].filter(Boolean).join("/"),
                    ]
                      .filter(Boolean)
                      .join(" — ")
                  : "—"}
              </Row>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Contatos" />
            {client.contacts.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">Nenhum contato cadastrado.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {client.contacts.map((contact) => (
                  <li key={contact.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-[13px] text-ink">
                        {contact.kind === "email" ? contact.value : formatPhone(contact.value)}
                      </p>
                      <p className="text-[11px] text-muted capitalize">{contact.kind}</p>
                    </div>
                    {contact.is_primary ? <Badge tone="neutral">Principal</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Documents clientId={id} canEdit={can("clientes", "edit")} />
          <Timeline clientId={id} canEdit={can("clientes", "edit")} />
        </div>
      </div>
    </>
  );
}

function Row({
  label,
  children,
  mono,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="shrink-0 text-[12px] text-muted">{label}</dt>
      <dd className={`text-right text-[13px] text-ink ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function Documents({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [docType, setDocType] = React.useState(DOC_TYPES[0]);
  const [validUntil, setValidUntil] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["client", clientId, "documents"],
    queryFn: () => api.get<ClientDocument[]>(`/clients/${clientId}/documents`),
  });

  const upload = useMutation({
    mutationFn: () => {
      const params = new URLSearchParams({ doc_type: docType });
      if (validUntil) params.set("valid_until", validUntil);
      return api.upload<ClientDocument>(`/clients/${clientId}/documents?${params}`, file!);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["documents", "expiring"] });
      setOpen(false);
      setFile(null);
      setValidUntil("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader
        title="Documentos"
        hint="Com controle de validade e alerta de vencimento"
        action={
          canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Paperclip />
              Anexar
            </Button>
          ) : null
        }
      />
      {!data || data.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nenhum documento anexado.</p>
      ) : (
        <ul className="divide-y divide-line-soft">
          {data.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
              <FileText className="size-4 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[13px] font-medium text-ink hover:underline"
                >
                  {doc.file_name}
                </a>
                <p className="text-[12px] text-muted">
                  {doc.doc_type.replace(/_/g, " ")}
                  {doc.valid_until ? ` · validade ${date(doc.valid_until)}` : ""}
                </p>
              </div>
              {doc.expired ? <Badge tone="critical">Vencido</Badge> : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Anexar documento"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={upload.isPending}
              disabled={!file}
              onClick={() => {
                setError(null);
                upload.mutate();
              }}
            >
              Anexar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Tipo de documento" required>
            <Select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Validade" hint="Deixe em branco se o documento não vence">
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </Field>
          <Field label="Arquivo" required>
            <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </div>
      </Dialog>
    </Card>
  );
}

function Timeline({ clientId, canEdit }: { clientId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [channel, setChannel] = React.useState("nota");
  const [summary, setSummary] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["client", clientId, "timeline"],
    queryFn: () => api.get<Interaction[]>(`/clients/${clientId}/timeline`),
  });

  const create = useMutation({
    mutationFn: () => api.post(`/clients/${clientId}/timeline`, { channel, summary }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["client", clientId, "timeline"] });
      setOpen(false);
      setSummary("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Card>
      <CardHeader
        title="Histórico"
        hint="Mensagens, ligações, visitas e anotações"
        action={
          canEdit ? (
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              <Plus />
              Registrar
            </Button>
          ) : null
        }
      />

      {!data || data.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">
          Nenhuma interação registrada. Toda conversa registrada aqui fica no histórico do cliente.
        </p>
      ) : (
        <ol className="px-5 py-4">
          {data.map((item, index) => (
            <li key={item.id} className="relative flex gap-3 pb-5 last:pb-0">
              {index < data.length - 1 ? (
                <span className="absolute top-5 left-[5px] h-full w-px bg-line" aria-hidden />
              ) : null}
              <span
                className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-surface bg-[var(--brand-primary)]"
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] font-medium text-ink">
                    {CHANNELS[item.channel] ?? item.channel}
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {dateTime(item.occurred_at)}
                  </span>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-soft">{item.summary}</p>
                {item.user_name ? (
                  <p className="mt-0.5 text-[11px] text-muted">por {item.user_name}</p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Registrar interação"
        description="O registro fica no histórico do cliente e não se perde entre conversas."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              loading={create.isPending}
              disabled={!summary.trim()}
              onClick={() => {
                setError(null);
                create.mutate();
              }}
            >
              Registrar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Canal" required>
            <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
              {Object.entries(CHANNELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="O que aconteceu" required>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Ex.: enviada a 2ª via do boleto de julho pelo WhatsApp"
            />
          </Field>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </div>
      </Dialog>
    </Card>
  );
}
