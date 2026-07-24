import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, FileWarning } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Badge, Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money, relativeDays } from "@/lib/format";
import { PROPERTY_STATUS } from "@/lib/labels";
import type { Dashboard as DashboardData, ExpiringDocument } from "@/lib/types";

export function Dashboard() {
  const { me, can } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard"),
  });

  const { data: expiring } = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: () => api.get<ExpiringDocument[]>("/clients/documents/expiring?days=30"),
    enabled: can("clientes", "view"),
  });

  const firstName = me?.full_name.split(" ")[0] ?? "";

  return (
    <>
      <header className="mb-6">
        <p className="mb-1 font-mono text-[11px] tracking-widest text-muted uppercase">Painel</p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Bom trabalho, {firstName}.
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Situação da carteira e o que precisa de atenção hoje.
        </p>
      </header>

      {isLoading || !data ? (
        <Card className="grid h-40 place-items-center">
          <Spinner />
        </Card>
      ) : (
        <div className="space-y-5">
          <PortfolioStrip data={data} />

          <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
            {can("financeiro", "view") ? <FinancePosition data={data} /> : null}
            <PendingItems data={data} expiring={expiring ?? []} />
          </div>
        </div>
      )}
    </>
  );
}

/**
 * O hero do painel é a composição da carteira: para uma imobiliária, quantos
 * imóveis estão alugados, disponíveis ou em captação *é* o estado do negócio.
 */
function PortfolioStrip({ data }: { data: DashboardData }) {
  const segments = data.imoveis_por_status.filter((s) => s.total > 0);
  const total = segments.reduce((sum, s) => sum + s.total, 0);

  return (
    <Card>
      <CardHeader
        title="Carteira de imóveis"
        hint={
          total > 0
            ? `${total} ${total === 1 ? "imóvel cadastrado" : "imóveis cadastrados"}`
            : "Nenhum imóvel cadastrado ainda"
        }
        action={
          <Link
            to="/imoveis"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
          >
            Ver imóveis <ArrowRight className="size-3.5" />
          </Link>
        }
      />

      <div className="p-5">
        {total === 0 ? (
          <p className="text-[13px] text-muted">
            Assim que os primeiros imóveis forem cadastrados, a composição da carteira aparece aqui.
          </p>
        ) : (
          <>
            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sunken" role="presentation">
              {segments.map((segment) => (
                <div
                  key={segment.status}
                  className="h-full transition-[width] duration-700"
                  style={{
                    width: `${(segment.total / total) * 100}%`,
                    background: PROPERTY_STATUS[segment.status]?.color ?? "#9ca3af",
                  }}
                />
              ))}
            </div>

            <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
              {segments.map((segment) => (
                <div key={segment.status} className="flex items-start gap-2">
                  <span
                    className="mt-1.5 size-2 shrink-0 rounded-full"
                    style={{ background: PROPERTY_STATUS[segment.status]?.color ?? "#9ca3af" }}
                    aria-hidden
                  />
                  <div>
                    <dd className="font-display text-xl leading-none font-semibold tabular">
                      {segment.total}
                    </dd>
                    <dt className="mt-1 text-[12px] text-muted">
                      {PROPERTY_STATUS[segment.status]?.label ?? segment.status}
                    </dt>
                  </div>
                </div>
              ))}
            </dl>
          </>
        )}
      </div>
    </Card>
  );
}

function FinancePosition({ data }: { data: DashboardData }) {
  const { financeiro } = data;
  const rows = [
    {
      label: "A receber em aberto",
      value: financeiro.a_receber,
      overdue: financeiro.receber_vencidos,
      to: "/financeiro?tipo=receivables",
    },
    {
      label: "A pagar em aberto",
      value: financeiro.a_pagar,
      overdue: financeiro.pagar_vencidos,
      to: "/financeiro?tipo=payables",
    },
  ];

  return (
    <Card>
      <CardHeader
        title="Posição financeira"
        hint="Lançamentos em aberto"
        action={
          <Link
            to="/financeiro"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
          >
            Abrir <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <ul className="divide-y divide-line-soft">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between gap-4 px-5 py-4">
            <div>
              <p className="text-[13px] text-ink-soft">{row.label}</p>
              {row.overdue > 0 ? (
                <Link to={row.to} className="mt-1 inline-block">
                  <Badge tone="critical">
                    <AlertTriangle className="size-3" />
                    {row.overdue} {row.overdue === 1 ? "vencido" : "vencidos"}
                  </Badge>
                </Link>
              ) : (
                <p className="mt-1 text-[12px] text-muted">Nenhum vencido</p>
              )}
            </div>
            <p className="font-mono text-lg font-medium tabular text-ink">{money(row.value)}</p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PendingItems({
  data,
  expiring,
}: {
  data: DashboardData;
  expiring: ExpiringDocument[];
}) {
  const hasNothing = expiring.length === 0 && data.cadastros.documentos_a_vencer === 0;

  return (
    <Card>
      <CardHeader title="Precisa de atenção" hint="Próximos 30 dias" />
      {hasNothing ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-muted">Nada pendente. Carteira em dia.</p>
        </div>
      ) : (
        <ul className="divide-y divide-line-soft">
          {expiring.slice(0, 6).map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-5 py-3">
              <FileWarning
                className={`size-4 shrink-0 ${doc.days_left < 0 ? "text-critical" : "text-caution"}`}
              />
              <div className="min-w-0 flex-1">
                <Link
                  to={`/clientes/${doc.client_id}`}
                  className="block truncate text-[13px] font-medium text-ink hover:underline"
                >
                  {doc.client_name}
                </Link>
                <p className="truncate text-[12px] text-muted">
                  {doc.doc_type.replace(/_/g, " ")} · vence {relativeDays(doc.days_left)}
                </p>
              </div>
              <Badge tone={doc.days_left < 0 ? "critical" : "caution"}>
                {doc.days_left < 0 ? "Vencido" : `${doc.days_left}d`}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
