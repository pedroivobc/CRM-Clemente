import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, ImageOff, Plus, Search } from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
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
import { money, shortAddress } from "@/lib/format";
import { PROPERTY_KINDS, PROPERTY_STATUS, PURPOSES } from "@/lib/labels";
import type { Address, Property, PropertyStatus } from "@/lib/types";

export function Imoveis() {
  const { can } = useAuth();
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const [debounced, setDebounced] = React.useState("");
  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = new URLSearchParams();
  if (debounced) query.set("search", debounced);
  if (status) query.set("status", status);
  if (purpose) query.set("purpose", purpose);

  const { data, isLoading } = useQuery({
    queryKey: ["properties", debounced, status, purpose],
    queryFn: () => api.get<Page<Property>>(`/properties?${query.toString()}`),
  });

  return (
    <>
      <PageHeader
        eyebrow="Carteira"
        title="Imóveis"
        description="Cada imóvel recebe um código sequencial próprio da imobiliária."
        action={
          can("imoveis", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo imóvel
            </Button>
          ) : null
        }
      />

      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por código, título, bairro ou cidade"
              className="pl-9"
              aria-label="Buscar imóveis"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-48"
            aria-label="Filtrar por situação"
          >
            <option value="">Todas as situações</option>
            {Object.entries(PROPERTY_STATUS).map(([value, { label }]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Select
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            className="w-48"
            aria-label="Filtrar por finalidade"
          >
            <option value="">Todas as finalidades</option>
            <option value="locacao">Locação</option>
            <option value="venda">Venda</option>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="grid h-48 place-items-center">
          <Spinner />
        </Card>
      ) : data?.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title={debounced || status || purpose ? "Nenhum imóvel encontrado" : "Nenhum imóvel na carteira"}
            description={
              debounced || status || purpose
                ? "Ajuste a busca ou os filtros."
                : "Cadastre o primeiro imóvel para começar a montar a carteira."
            }
            action={
              can("imoveis", "create") && !debounced && !status && !purpose ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus />
                  Novo imóvel
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
          <p className="mt-4 text-[12px] text-muted">
            {data?.total} {data?.total === 1 ? "imóvel" : "imóveis"}
          </p>
        </>
      )}

      <PropertyFormDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const status = PROPERTY_STATUS[property.status];
  const price = property.purpose === "venda" ? property.sale_price : property.rent_price;

  return (
    <Link
      to={`/imoveis/${property.id}`}
      className="group overflow-hidden rounded-lg border border-line bg-surface shadow-[0_1px_2px_#16181d0a] transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[4/3] bg-sunken">
        {property.cover_url ? (
          <img
            src={property.cover_url}
            alt={property.title}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <div className="grid size-full place-items-center text-muted">
            <ImageOff className="size-6" />
          </div>
        )}
        <span className="absolute top-2.5 left-2.5">
          <CodeTag className="bg-surface/95">{property.code}</CodeTag>
        </span>
        {/* A situação é a informação mais consultada da listagem: vai escrita,
            não só codificada em cor. */}
        <span
          className="absolute top-2.5 right-2.5 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
          style={{ background: status?.color }}
        >
          {status?.label}
        </span>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-1 text-[14px] font-medium text-ink group-hover:underline">
          {property.title}
        </h3>

        <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted">
          {shortAddress(property.address)}
        </p>

        <div className="mt-3 flex items-baseline justify-between gap-2">
          <span className="font-mono text-[15px] font-medium tabular text-ink">
            {money(price)}
            {property.purpose !== "venda" && price ? (
              <span className="text-[11px] font-normal text-muted"> /mês</span>
            ) : null}
          </span>
          <Badge tone="neutral">{PROPERTY_KINDS[property.kind] ?? property.kind}</Badge>
        </div>
      </div>
    </Link>
  );
}

export function PropertyFormDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = React.useState({
    kind: "apartamento",
    purpose: "locacao" as "venda" | "locacao" | "ambos",
    title: "",
    description: "",
    rent_price: "",
    sale_price: "",
    condo_fee: "",
    iptu_amount: "",
    registry_number: "",
    bedrooms: "",
    suites: "",
    bathrooms: "",
    parking_spots: "",
    area_util: "",
    pet_allowed: null as boolean | null,
    republic_allowed: null as boolean | null,
    has_leisure_area: null as boolean | null,
  });
  const [address, setAddress] = React.useState<Address>({});
  const [error, setError] = React.useState<string | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((current) => ({ ...current, ...patch }));

  const mutation = useMutation({
    mutationFn: () =>
      api.post<Property>("/properties", {
        kind: form.kind,
        purpose: form.purpose,
        title: form.title,
        description: form.description || null,
        address,
        registry_number: form.registry_number || null,
        rent_price: form.rent_price || null,
        sale_price: form.sale_price || null,
        condo_fee: form.condo_fee || null,
        iptu_amount: form.iptu_amount || null,
        area_util: form.area_util || null,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        suites: form.suites ? Number(form.suites) : null,
        bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
        parking_spots: form.parking_spots ? Number(form.parking_spots) : null,
        pet_allowed: form.pet_allowed,
        republic_allowed: form.republic_allowed,
        has_leisure_area: form.has_leisure_area,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setForm({ ...form, title: "", description: "", rent_price: "", sale_price: "" });
      setAddress({});
    },
    onError: (err: Error) => setError(err.message),
  });

  async function lookupCep(value: string) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 8) return;
    try {
      const found = await api.get<Address>(`/clients/utils/cep/${digits}`);
      setAddress((current) => ({ ...current, ...found, numero: current.numero }));
    } catch {
      // Endereço pode ser preenchido manualmente.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo imóvel"
      description="O código do imóvel é gerado automaticamente."
      wide
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!form.title.trim()}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Cadastrar imóvel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Título" required hint="Como a equipe se refere ao imóvel">
          <Input
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="Apto 302 — Edifício Aurora, Centro"
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo" required>
            <Select value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
              {Object.entries(PROPERTY_KINDS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Finalidade" required>
            <Select
              value={form.purpose}
              onChange={(e) => set({ purpose: e.target.value as typeof form.purpose })}
            >
              {Object.entries(PURPOSES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-4">
          {form.purpose !== "venda" ? (
            <Field label="Aluguel (R$)">
              <Input
                value={form.rent_price}
                onChange={(e) => set({ rent_price: e.target.value })}
                inputMode="decimal"
                className="font-mono"
              />
            </Field>
          ) : null}
          {form.purpose !== "locacao" ? (
            <Field label="Venda (R$)">
              <Input
                value={form.sale_price}
                onChange={(e) => set({ sale_price: e.target.value })}
                inputMode="decimal"
                className="font-mono"
              />
            </Field>
          ) : null}
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
        </div>

        <div className="grid gap-4 sm:grid-cols-5">
          <Field label="Área útil (m²)" required>
            <Input
              value={form.area_util}
              onChange={(e) => set({ area_util: e.target.value })}
              inputMode="decimal"
            />
          </Field>
          <Field label="Quartos">
            <Input
              value={form.bedrooms}
              onChange={(e) => set({ bedrooms: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Suítes">
            <Input
              value={form.suites}
              onChange={(e) => set({ suites: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Banheiros">
            <Input
              value={form.bathrooms}
              onChange={(e) => set({ bathrooms: e.target.value })}
              inputMode="numeric"
            />
          </Field>
          <Field label="Vagas">
            <Input
              value={form.parking_spots}
              onChange={(e) => set({ parking_spots: e.target.value })}
              inputMode="numeric"
            />
          </Field>
        </div>

        <fieldset className="rounded-md border border-line bg-sunken px-4 py-3">
          <legend className="px-1 text-[12px] text-muted">Perfil do imóvel</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <TriToggle
              label="Aceita pet"
              value={form.pet_allowed}
              onChange={(v) => set({ pet_allowed: v })}
            />
            <TriToggle
              label="Aceita república"
              value={form.republic_allowed}
              onChange={(v) => set({ republic_allowed: v })}
            />
            <TriToggle
              label="Área de lazer"
              value={form.has_leisure_area}
              onChange={(v) => set({ has_leisure_area: v })}
            />
          </div>
        </fieldset>

        <Field label="Matrícula" className="sm:max-w-xs">
          <Input
            value={form.registry_number}
            onChange={(e) => set({ registry_number: e.target.value })}
            className="font-mono"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="CEP">
            <Input
              value={address.cep ?? ""}
              onChange={(e) => setAddress({ ...address, cep: e.target.value })}
              onBlur={(e) => lookupCep(e.target.value)}
              inputMode="numeric"
              className="font-mono"
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

        <Field label="Descrição">
          <Textarea
            value={form.description}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="Características, diferenciais e observações do imóvel"
          />
        </Field>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

export function statusTone(status: PropertyStatus) {
  return PROPERTY_STATUS[status];
}

/**
 * Três estados: sim / não / não informado. Null é o padrão do cadastro, para
 * não afirmar o que a equipe ainda não confirmou com o proprietário.
 */
function TriToggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: { v: boolean | null; label: string }[] = [
    { v: true, label: "Sim" },
    { v: false, label: "Não" },
    { v: null, label: "—" },
  ];
  return (
    <div>
      <span className="mb-1 block text-[12.5px] text-ink-soft">{label}</span>
      <div className="inline-flex overflow-hidden rounded-md border border-line bg-surface">
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={String(o.v)}
              type="button"
              onClick={() => onChange(o.v)}
              className={
                active
                  ? "px-3 py-1.5 text-[12.5px] font-medium bg-[var(--brand-primary)] text-white"
                  : "px-3 py-1.5 text-[12.5px] text-ink-soft hover:bg-sunken"
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
