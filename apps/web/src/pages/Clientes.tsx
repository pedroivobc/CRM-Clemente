import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Users } from "lucide-react";
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  LoadingRows,
  PageHeader,
  Select,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { api, type Page } from "@/lib/api";
import { cep as formatCep, phone as formatPhone } from "@/lib/format";
import { CLIENT_ROLES } from "@/lib/labels";
import type { Address, Client } from "@/lib/types";

export function Clientes() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = React.useState("");
  const [role, setRole] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  // Evita uma requisição por tecla digitada.
  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams();
  if (debounced) query.set("search", debounced);
  if (role) query.set("role", role);

  const { data, isLoading } = useQuery({
    queryKey: ["clients", debounced, role],
    queryFn: () => api.get<Page<Client>>(`/clients?${query.toString()}`),
  });

  return (
    <>
      <PageHeader
        eyebrow="Cadastro"
        title="Clientes"
        description="Proprietários, locatários, fiadores e leads — um mesmo cliente pode acumular papéis."
        action={
          can("clientes", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo cliente
            </Button>
          ) : null
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nome ou CPF/CNPJ"
              className="pl-9"
              aria-label="Buscar clientes"
            />
          </div>
          <Select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-48"
            aria-label="Filtrar por papel"
          >
            <option value="">Todos os papéis</option>
            {Object.entries(CLIENT_ROLES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>

        {!isLoading && data?.items.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debounced || role ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
            description={
              debounced || role
                ? "Ajuste a busca ou o filtro de papel."
                : "Cadastre proprietários e locatários para começar a montar a carteira."
            }
            action={
              can("clientes", "create") && !debounced && !role ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Novo cliente
                </Button>
              ) : null
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Nome</Th>
                <Th className="hidden sm:table-cell">CPF / CNPJ</Th>
                <Th className="hidden md:table-cell">Contato</Th>
                <Th>Papéis</Th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <LoadingRows columns={4} />
              ) : (
                data?.items.map((client) => (
                  <Tr
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/clientes/${client.id}`)}
                  >
                    <Td>
                      <Link
                        to={`/clientes/${client.id}`}
                        className="font-medium text-ink hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {client.name}
                      </Link>
                      <span className="ml-2 text-[11px] text-muted">{client.kind}</span>
                    </Td>
                    <Td className="hidden font-mono text-[13px] text-ink-soft sm:table-cell">
                      {client.cpf_cnpj_formatted ?? "—"}
                    </Td>
                    <Td className="hidden text-ink-soft md:table-cell">{primaryContact(client)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        {client.roles.length === 0 ? (
                          <span className="text-[12px] text-muted">—</span>
                        ) : (
                          client.roles.map((r) => (
                            <Badge key={r} tone="neutral">
                              {CLIENT_ROLES[r] ?? r}
                            </Badge>
                          ))
                        )}
                      </div>
                    </Td>
                  </Tr>
                ))
              )}
            </tbody>
          </Table>
        )}

        {data && data.total > 0 ? (
          <p className="px-4 py-3 text-[12px] text-muted">
            {data.total} {data.total === 1 ? "cliente" : "clientes"}
          </p>
        ) : null}
      </Card>

      <ClientFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function primaryContact(client: Client): string {
  const contact = client.contacts.find((c) => c.is_primary) ?? client.contacts[0];
  if (!contact) return "—";
  return contact.kind === "email" ? contact.value : formatPhone(contact.value);
}

export function ClientFormDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (client: Client) => void;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = React.useState<"PF" | "PJ">("PF");
  const [name, setName] = React.useState("");
  const [document, setDocument] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [roles, setRoles] = React.useState<string[]>([]);
  const [address, setAddress] = React.useState<Address>({});
  const [error, setError] = React.useState<string | null>(null);
  const [lookingUpCep, setLookingUpCep] = React.useState(false);

  function reset() {
    setKind("PF");
    setName("");
    setDocument("");
    setPhone("");
    setEmail("");
    setRoles([]);
    setAddress({});
    setError(null);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const contacts = [];
      if (phone) contacts.push({ kind: "whatsapp", value: phone.replace(/\D/g, ""), is_primary: true });
      if (email) contacts.push({ kind: "email", value: email, is_primary: !phone });
      return api.post<Client>("/clients", {
        kind,
        name,
        cpf_cnpj: document || null,
        roles,
        contacts,
        address,
      });
    },
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      reset();
      onCreated?.(client);
    },
    onError: (err: Error) => setError(err.message),
  });

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setLookingUpCep(true);
    try {
      const found = await api.get<Address & { cep: string }>(`/clients/utils/cep/${digits}`);
      setAddress((current) => ({ ...current, ...found, numero: current.numero }));
    } catch {
      // CEP não encontrado não impede o cadastro: o endereço pode ser digitado.
    } finally {
      setLookingUpCep(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
      title="Novo cliente"
      description="Os papéis definem onde o cliente aparece no sistema."
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!name.trim()}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Cadastrar cliente
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Tipo" required>
            <Select value={kind} onChange={(e) => setKind(e.target.value as "PF" | "PJ")}>
              <option value="PF">Pessoa física</option>
              <option value="PJ">Pessoa jurídica</option>
            </Select>
          </Field>
          <Field label={kind === "PF" ? "Nome completo" : "Razão social"} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={kind === "PF" ? "CPF" : "CNPJ"} hint="Opcional, mas validado quando informado">
            <Input
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              inputMode="numeric"
              className="font-mono"
              placeholder={kind === "PF" ? "000.000.000-00" : "00.000.000/0000-00"}
            />
          </Field>
          <Field label="WhatsApp">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              inputMode="tel"
              placeholder="(32) 99999-9999"
            />
          </Field>
          <Field label="E-mail">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">Papéis</legend>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CLIENT_ROLES).map(([value, label]) => {
              const active = roles.includes(value);
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() =>
                    setRoles((current) =>
                      active ? current.filter((r) => r !== value) : [...current, value],
                    )
                  }
                  aria-pressed={active}
                  className={
                    active
                      ? "rounded-full border border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] px-3 py-1 text-[12.5px] font-medium text-[var(--brand-primary)]"
                      : "rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-soft hover:bg-sunken"
                  }
                >
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="CEP" hint={lookingUpCep ? "Buscando…" : undefined}>
            <Input
              value={address.cep ?? ""}
              onChange={(e) => setAddress({ ...address, cep: e.target.value })}
              onBlur={(e) => lookupCep(e.target.value)}
              inputMode="numeric"
              className="font-mono"
              placeholder="00000-000"
            />
          </Field>
          <Field label="Logradouro" className="sm:col-span-2">
            <Input
              value={address.logradouro ?? ""}
              onChange={(e) => setAddress({ ...address, logradouro: e.target.value })}
            />
          </Field>
          <Field label="Número">
            <Input
              value={address.numero ?? ""}
              onChange={(e) => setAddress({ ...address, numero: e.target.value })}
            />
          </Field>
          <Field label="Bairro" className="sm:col-span-2">
            <Input
              value={address.bairro ?? ""}
              onChange={(e) => setAddress({ ...address, bairro: e.target.value })}
            />
          </Field>
          <Field label="Cidade">
            <Input
              value={address.cidade ?? ""}
              onChange={(e) => setAddress({ ...address, cidade: e.target.value })}
            />
          </Field>
          <Field label="UF">
            <Input
              value={address.uf ?? ""}
              maxLength={2}
              onChange={(e) => setAddress({ ...address, uf: e.target.value.toUpperCase() })}
            />
          </Field>
        </div>

        {address.cep ? (
          <p className="font-mono text-[11px] text-muted">CEP {formatCep(address.cep)}</p>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
