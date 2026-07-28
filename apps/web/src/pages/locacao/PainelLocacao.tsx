import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";

import { TeamRanking } from "@/components/TeamRanking";
import { Badge, Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { RentalsDashboard } from "@/lib/types";

export function PainelLocacao() {
  const { data, isLoading } = useQuery({
    queryKey: ["rentals", "dashboard"],
    queryFn: () => api.get<RentalsDashboard>("/rentals/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <Card className="grid h-40 place-items-center">
        <Spinner />
      </Card>
    );
  }

  const inadimplencia = Number(data.cobrancas.inadimplencia_pct);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Carteira administrada"
          hint="Contratos ativos e receita recorrente"
          action={
            <Link
              to="/contratos"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
            >
              Ver contratos <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <dl className="grid divide-line-soft sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
          <Metric
            label="Contratos ativos"
            value={String(data.carteira.contratos_ativos)}
            note={
              data.carteira.em_assinatura > 0
                ? `${data.carteira.em_assinatura} em assinatura`
                : undefined
            }
          />
          <Metric
            label="Aluguel administrado"
            value={money(data.carteira.aluguel_administrado)}
            note="Soma dos aluguéis ativos"
          />
          <Metric
            label="Taxa mensal prevista"
            value={money(data.carteira.taxa_mensal_prevista)}
            note="Receita recorrente da imobiliária"
            positive
          />
          <Metric
            label="Inadimplência"
            value={`${inadimplencia.toFixed(1).replace(".", ",")}%`}
            note={
              Number(data.cobrancas.valor_vencido) > 0
                ? `${money(data.cobrancas.valor_vencido)} vencido`
                : "Nenhuma cobrança vencida"
            }
            alert={inadimplencia > 0}
          />
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <FunnelCard data={data} />

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Repasses do mês"
              hint="A creditar aos proprietários"
              action={
                <Link
                  to="/cobrancas"
                  className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
                >
                  Abrir <ArrowRight className="size-3.5" />
                </Link>
              }
            />
            <div className="px-5 py-4">
              <p className="font-mono text-2xl font-medium tabular text-ink">
                {money(data.repasses.a_repassar)}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                {data.repasses.proprietarios}{" "}
                {data.repasses.proprietarios === 1 ? "proprietário" : "proprietários"}
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Precisa de atenção" />
            <ul className="divide-y divide-line-soft">
              <AlertRow
                label="Cobranças vencidas"
                value={data.cobrancas.vencidas}
                to="/cobrancas"
                tone="critical"
              />
              <AlertRow
                label="Vigências a vencer em 90 dias"
                value={data.carteira.vigencias_a_vencer}
                to="/contratos"
                tone="caution"
              />
              <AlertRow
                label="Reajustes devidos"
                value={data.reajustes_devidos}
                to="/contratos"
                tone="caution"
                icon
              />
            </ul>
          </Card>
        </div>
      </div>

      <TeamRanking kind="rentals" />
    </div>
  );
}

function FunnelCard({ data }: { data: RentalsDashboard }) {
  const max = Math.max(1, ...data.funil.map((s) => s.count));

  return (
    <Card>
      <CardHeader
        title="Funil de locação"
        hint="Leads em aberto por etapa"
        action={
          <Link
            to="/funil"
            className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
          >
            Abrir funil <ArrowRight className="size-3.5" />
          </Link>
        }
      />
      <div className="space-y-2.5 px-5 py-4">
        {data.funil.every((s) => s.count === 0) ? (
          <p className="py-6 text-center text-[13px] text-muted">
            Nenhum lead em aberto. Cadastre o primeiro interessado no funil.
          </p>
        ) : (
          data.funil.map((stage) => (
            <div key={stage.key} className="flex items-center gap-3">
              <span className="w-32 shrink-0 truncate text-[12.5px] text-ink-soft">
                {stage.name}
              </span>
              <span className="h-5 flex-1 overflow-hidden rounded bg-sunken">
                <span
                  className="flex h-full items-center justify-end rounded pr-2 transition-[width] duration-500"
                  style={{
                    width: `${Math.max(6, (stage.count / max) * 100)}%`,
                    background: "var(--brand-primary)",
                  }}
                >
                  <span className="font-mono text-[11px] font-medium text-[var(--brand-contrast)]">
                    {stage.count}
                  </span>
                </span>
              </span>
              <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted">
                {Number(stage.conversion_pct).toFixed(0)}%
              </span>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function AlertRow({
  label,
  value,
  to,
  tone,
  icon,
}: {
  label: string;
  value: number;
  to: string;
  tone: "critical" | "caution";
  icon?: boolean;
}) {
  return (
    <li className="flex items-center justify-between gap-3 px-5 py-2.5">
      <span className="text-[13px] text-ink-soft">{label}</span>
      {value > 0 ? (
        <Link to={to}>
          <Badge tone={tone}>
            {icon ? <TrendingUp className="size-3" /> : <AlertTriangle className="size-3" />}
            {value}
          </Badge>
        </Link>
      ) : (
        <span className="font-mono text-[12px] text-muted">0</span>
      )}
    </li>
  );
}

function Metric({
  label,
  value,
  note,
  positive,
  alert,
}: {
  label: string;
  value: string;
  note?: string;
  positive?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl font-medium tabular ${
          positive ? "text-positive" : alert ? "text-critical" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {note ? (
        <p className={`mt-0.5 text-[12px] ${alert ? "text-critical" : "text-muted"}`}>{note}</p>
      ) : null}
    </div>
  );
}
