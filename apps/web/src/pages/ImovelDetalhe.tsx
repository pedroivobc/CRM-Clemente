import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ImagePlus, Star, Trash2 } from "lucide-react";
import * as React from "react";
import { Link, useParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeTag,
  ErrorNote,
  Select,
  Spinner,
} from "@/components/ui";
import { api } from "@/lib/api";
import { money, shortAddress } from "@/lib/format";
import { PROPERTY_KINDS, PROPERTY_STATUS, PURPOSES } from "@/lib/labels";
import type { Photo, Property, PropertyStatus } from "@/lib/types";

export function ImovelDetalhe() {
  const { id = "" } = useParams();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [error, setError] = React.useState<string | null>(null);

  const { data: property, isLoading } = useQuery({
    queryKey: ["property", id],
    queryFn: () => api.get<Property>(`/properties/${id}`),
  });

  const changeStatus = useMutation({
    mutationFn: (status: PropertyStatus) => api.patch<Property>(`/properties/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property", id] });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (err: Error) => setError(err.message),
  });

  if (isLoading || !property) {
    return (
      <Card className="grid h-48 place-items-center">
        <Spinner />
      </Card>
    );
  }

  const features = property.features as Record<string, number | string | undefined>;

  return (
    <>
      <Link
        to="/imoveis"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink"
      >
        <ArrowLeft className="size-3.5" />
        Imóveis
      </Link>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2">
            <CodeTag tone="brand">{property.code}</CodeTag>
            <span className="text-[12px] text-muted">
              {PROPERTY_KINDS[property.kind] ?? property.kind} · {PURPOSES[property.purpose]}
            </span>
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink">{property.title}</h1>
          <p className="mt-1 text-[13px] text-muted">{shortAddress(property.address)}</p>
        </div>

        {can("imoveis", "edit") ? (
          <div className="flex items-center gap-2">
            <label className="text-[12px] text-muted" htmlFor="status">
              Situação
            </label>
            <Select
              id="status"
              value={property.status}
              onChange={(e) => changeStatus.mutate(e.target.value as PropertyStatus)}
              className="w-44"
            >
              {Object.entries(PROPERTY_STATUS).map(([value, { label }]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <Badge tone="neutral">{PROPERTY_STATUS[property.status]?.label}</Badge>
        )}
      </header>

      {error ? (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Photos propertyId={id} photos={property.photos} canEdit={can("imoveis", "edit")} />

          {property.description ? (
            <Card>
              <CardHeader title="Descrição" />
              <p className="px-5 py-4 text-[13.5px] leading-relaxed whitespace-pre-line text-ink-soft">
                {property.description}
              </p>
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Valores" />
            <dl className="divide-y divide-line-soft">
              {property.purpose !== "venda" ? (
                <MoneyRow label="Aluguel" value={property.rent_price} />
              ) : null}
              {property.purpose !== "locacao" ? (
                <MoneyRow label="Venda" value={property.sale_price} />
              ) : null}
              <MoneyRow label="Condomínio" value={property.condo_fee} />
              <MoneyRow label="IPTU" value={property.iptu_amount} />
            </dl>
          </Card>

          <Card>
            <CardHeader title="Ficha" />
            <dl className="divide-y divide-line-soft">
              <InfoRow label="Quartos">{features.quartos ?? "—"}</InfoRow>
              <InfoRow label="Vagas">{features.vagas ?? "—"}</InfoRow>
              <InfoRow label="Área útil">
                {features.area_util ? `${features.area_util} m²` : "—"}
              </InfoRow>
              <InfoRow label="Matrícula" mono>
                {property.registry_number ?? "—"}
              </InfoRow>
              <InfoRow label="Inscrição IPTU" mono>
                {property.iptu_code ?? "—"}
              </InfoRow>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Proprietários" />
            {property.owners.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-muted">Nenhum proprietário vinculado.</p>
            ) : (
              <ul className="divide-y divide-line-soft">
                {property.owners.map((owner) => (
                  <li key={owner.client_id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link
                      to={`/clientes/${owner.client_id}`}
                      className="text-[13px] font-medium text-ink hover:underline"
                    >
                      {owner.name}
                    </Link>
                    <span className="font-mono text-[12px] text-muted">
                      {Number(owner.ownership_pct)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function MoneyRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="font-mono text-[14px] tabular text-ink">{money(value)}</dd>
    </div>
  );
}

function InfoRow({
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
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className={`text-[13px] text-ink ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
  );
}

function Photos({
  propertyId,
  photos,
  canEdit,
}: {
  propertyId: string;
  photos: Photo[];
  canEdit: boolean;
}) {
  const queryClient = useQueryClient();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["property", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["properties"] });
  };

  const upload = useMutation({
    mutationFn: async (files: FileList) => {
      for (const file of Array.from(files)) {
        await api.upload(`/properties/${propertyId}/photos`, file);
      }
    },
    onSuccess: invalidate,
    onError: (err: Error) => setError(err.message),
  });

  const setCover = useMutation({
    mutationFn: (photoId: string) =>
      api.put(`/properties/${propertyId}/photos/${photoId}/cover`),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (photoId: string) => api.delete(`/properties/${propertyId}/photos/${photoId}`),
    onSuccess: invalidate,
  });

  const processing = photos.some((p) => p.watermark_status === "pending");

  return (
    <Card>
      <CardHeader
        title="Fotos"
        hint={
          processing
            ? "Aplicando a marca d'água — as fotos aparecem assim que ficarem prontas"
            : "Publicadas com a marca d'água da imobiliária"
        }
        action={
          canEdit ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  setError(null);
                  if (e.target.files?.length) upload.mutate(e.target.files);
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                size="sm"
                loading={upload.isPending}
                onClick={() => inputRef.current?.click()}
              >
                <ImagePlus />
                Enviar fotos
              </Button>
            </>
          ) : null
        }
      />

      <div className="p-5">
        {error ? (
          <div className="mb-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}

        {photos.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">
            Nenhuma foto enviada. As fotos publicadas recebem a marca d'água automaticamente.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((photo) => (
              <figure
                key={photo.id}
                className="group relative overflow-hidden rounded-md border border-line bg-sunken"
              >
                <div className="aspect-[4/3]">
                  {photo.url ? (
                    <img
                      src={photo.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center">
                      <span className="font-mono text-[11px] text-muted">
                        {photo.watermark_status === "error" ? "falhou" : "processando…"}
                      </span>
                    </div>
                  )}
                </div>

                {photo.is_cover ? (
                  <span className="absolute top-2 left-2">
                    <Badge tone="brand">
                      <Star className="size-3" />
                      Capa
                    </Badge>
                  </span>
                ) : null}

                {canEdit ? (
                  <figcaption className="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-ink/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    {!photo.is_cover ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 bg-surface"
                        onClick={() => setCover.mutate(photo.id)}
                      >
                        Definir capa
                      </Button>
                    ) : null}
                    <Button
                      size="icon"
                      variant="outline"
                      className="size-7 bg-surface"
                      onClick={() => remove.mutate(photo.id)}
                      aria-label="Excluir foto"
                    >
                      <Trash2 />
                    </Button>
                  </figcaption>
                ) : null}
              </figure>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
