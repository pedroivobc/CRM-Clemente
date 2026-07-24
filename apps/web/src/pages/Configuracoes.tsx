import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload } from "lucide-react";
import * as React from "react";

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
  PageHeader,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { api } from "@/lib/api";
import { applyBranding } from "@/lib/branding";
import { dateTime } from "@/lib/format";
import { AUDIT_ACTIONS, AUDIT_ENTITIES } from "@/lib/labels";
import type { AuditEntry, Branding, Collaborator, Role } from "@/lib/types";

type Tab = "marca" | "equipe" | "auditoria";

export function Configuracoes() {
  const { can } = useAuth();
  const [tab, setTab] = React.useState<Tab>("marca");

  const tabs: { value: Tab; label: string }[] = [
    { value: "marca", label: "Identidade visual" },
    { value: "equipe", label: "Equipe" },
    { value: "auditoria", label: "Auditoria" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Configurações"
        description="Marca da imobiliária, colaboradores e registro de ações."
      />

      <div className="mb-5 flex gap-1 border-b border-line">
        {tabs.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={
              tab === value
                ? "-mb-px border-b-2 border-[var(--brand-primary)] px-3 py-2 text-[13.5px] font-medium text-[var(--brand-primary)]"
                : "-mb-px border-b-2 border-transparent px-3 py-2 text-[13.5px] text-muted hover:text-ink"
            }
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "marca" ? <BrandingPanel canEdit={can("configuracoes", "edit")} /> : null}
      {tab === "equipe" ? <TeamPanel canEdit={can("configuracoes", "create")} /> : null}
      {tab === "auditoria" ? <AuditPanel /> : null}
    </>
  );
}

function BrandingPanel({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const logoRef = React.useRef<HTMLInputElement>(null);
  const [form, setForm] = React.useState<Branding | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  const { data } = useQuery({
    queryKey: ["branding"],
    queryFn: () => api.get<Branding>("/tenant/branding"),
  });

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.put<Branding>("/tenant/branding", {
        display_name: form!.display_name,
        color_primary: form!.color_primary,
        color_secondary: form!.color_secondary,
        color_accent: form!.color_accent,
      }),
    onSuccess: (updated) => {
      applyBranding(updated);
      queryClient.invalidateQueries({ queryKey: ["branding"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
    onError: (err: Error) => setError(err.message),
  });

  const uploadLogo = useMutation({
    mutationFn: (file: File) => api.upload<Branding>("/tenant/branding/logo?kind=logo", file),
    onSuccess: (updated) => {
      applyBranding(updated);
      setForm(updated);
      queryClient.invalidateQueries({ queryKey: ["branding"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!form) return null;

  const colors: { key: keyof Branding; label: string; hint: string }[] = [
    { key: "color_primary", label: "Cor primária", hint: "Botões, links e destaques" },
    { key: "color_secondary", label: "Cor secundária", hint: "Fundos de apoio" },
    { key: "color_accent", label: "Cor de acento", hint: "Sinalizações pontuais" },
  ];

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader
          title="Identidade visual"
          hint="Aplicada no sistema, nos portais, nos PDFs e na marca d'água das fotos"
        />
        <div className="space-y-5 p-5">
          <Field label="Nome de exibição" required>
            <Input
              value={form.display_name}
              disabled={!canEdit}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            {colors.map(({ key, label, hint }) => (
              <Field key={key} label={label} hint={hint}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={form[key] as string}
                    disabled={!canEdit}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="size-9 shrink-0 cursor-pointer rounded-md border border-line bg-surface p-1"
                    aria-label={label}
                  />
                  <Input
                    value={form[key] as string}
                    disabled={!canEdit}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    className="font-mono uppercase"
                  />
                </div>
              </Field>
            ))}
          </div>

          <div>
            <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Logo</p>
            <div className="flex items-center gap-4">
              <div className="grid h-16 w-32 shrink-0 place-items-center rounded-md border border-line bg-sunken">
                {form.logo_url ? (
                  <img src={form.logo_url} alt="Logo" className="max-h-12 max-w-28 object-contain" />
                ) : (
                  <span className="text-[11px] text-muted">Sem logo</span>
                )}
              </div>
              {canEdit ? (
                <div>
                  <input
                    ref={logoRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadLogo.mutate(file);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    loading={uploadLogo.isPending}
                    onClick={() => logoRef.current?.click()}
                  >
                    <Upload />
                    Enviar logo
                  </Button>
                  <p className="mt-1.5 text-[12px] text-muted">
                    PNG com fundo transparente, até 2 MB. Trocar o logo reprocessa a marca d'água
                    de todas as fotos.
                  </p>
                </div>
              ) : null}
            </div>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          {canEdit ? (
            <div className="flex items-center gap-3">
              <Button loading={save.isPending} onClick={() => save.mutate()}>
                Salvar identidade
              </Button>
              {saved ? <span className="text-[13px] text-positive">Identidade salva.</span> : null}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="h-fit">
        <CardHeader title="Prévia" hint="Como a marca aparece" />
        <div className="space-y-3 p-5">
          <div
            className="rounded-md p-4"
            style={{
              background: `linear-gradient(140deg, ${form.color_primary}, ${form.color_secondary})`,
            }}
          >
            <p className="font-display text-[15px] font-semibold text-white drop-shadow">
              {form.display_name}
            </p>
          </div>
          <div className="flex gap-2">
            <span
              className="flex-1 rounded-md px-3 py-2 text-center text-[13px] font-medium text-white"
              style={{ background: form.color_primary }}
            >
              Botão
            </span>
            <span
              className="rounded-md px-3 py-2 text-[13px] font-medium"
              style={{ background: `${form.color_accent}20`, color: form.color_accent }}
            >
              Acento
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TeamPanel({ canEdit }: { canEdit: boolean }) {
  const [creating, setCreating] = React.useState(false);

  const { data: team } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<Collaborator[]>("/users"),
  });

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: () => api.get<Role[]>("/users/roles/all"),
  });

  return (
    <Card>
      <CardHeader
        title="Equipe"
        hint="Os papéis definem o que cada pessoa vê e pode fazer"
        action={
          canEdit ? (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus />
              Novo colaborador
            </Button>
          ) : null
        }
      />

      <Table>
        <thead>
          <tr>
            <Th>Nome</Th>
            <Th className="hidden sm:table-cell">E-mail</Th>
            <Th>Papéis</Th>
            <Th>Situação</Th>
          </tr>
        </thead>
        <tbody>
          {team?.map((person) => (
            <Tr key={person.id}>
              <Td className="font-medium text-ink">{person.full_name}</Td>
              <Td className="hidden text-ink-soft sm:table-cell">{person.email}</Td>
              <Td>
                <div className="flex flex-wrap gap-1">
                  {person.roles.length === 0 ? (
                    <span className="text-[12px] text-muted">Sem papel</span>
                  ) : (
                    person.roles.map((role) => (
                      <Badge key={role} tone="neutral">
                        {role}
                      </Badge>
                    ))
                  )}
                </div>
              </Td>
              <Td>
                {person.status === "active" ? (
                  <Badge tone="positive">Ativo</Badge>
                ) : (
                  <Badge tone="neutral">Inativo</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>

      <CollaboratorDialog open={creating} onOpenChange={setCreating} roles={roles ?? []} />
    </Card>
  );
}

function CollaboratorDialog({
  open,
  onOpenChange,
  roles,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roles: Role[];
}) {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [roleIds, setRoleIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post("/users", { full_name: fullName, email, phone: phone || null, role_ids: roleIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onOpenChange(false);
      setFullName("");
      setEmail("");
      setPhone("");
      setRoleIds([]);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo colaborador"
      description="O acesso é liberado quando a pessoa entra pela primeira vez com este e-mail."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={create.isPending}
            disabled={!fullName.trim() || !email.trim()}
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
        <Field label="Nome completo" required>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} autoFocus />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="E-mail" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Telefone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" />
          </Field>
        </div>

        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-soft">Papéis</legend>
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const active = roleIds.includes(role.id);
              return (
                <button
                  key={role.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    setRoleIds((current) =>
                      active ? current.filter((id) => id !== role.id) : [...current, role.id],
                    )
                  }
                  className={
                    active
                      ? "rounded-full border border-[var(--brand-primary)] bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] px-3 py-1 text-[12.5px] font-medium text-[var(--brand-primary)]"
                      : "rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-soft hover:bg-sunken"
                  }
                >
                  {role.name}
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

function AuditPanel() {
  const { data } = useQuery({
    queryKey: ["audit"],
    queryFn: () => api.get<AuditEntry[]>("/users/audit/log?limit=100"),
  });

  return (
    <Card>
      <CardHeader title="Registro de ações" hint="Edições, exclusões e baixas financeiras" />
      {!data || data.length === 0 ? (
        <p className="px-5 py-6 text-[13px] text-muted">Nenhuma ação registrada ainda.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Quando</Th>
              <Th>Quem</Th>
              <Th>O quê</Th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <Tr key={entry.id}>
                <Td className="font-mono text-[12.5px] whitespace-nowrap text-muted">
                  {dateTime(entry.occurred_at)}
                </Td>
                <Td className="text-ink-soft">{entry.user_name ?? "—"}</Td>
                <Td className="text-ink">
                  {AUDIT_ACTIONS[entry.action] ?? entry.action}{" "}
                  {AUDIT_ENTITIES[entry.entity] ?? entry.entity}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
