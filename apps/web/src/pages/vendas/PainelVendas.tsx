import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { SalesDashboard } from "@/lib/types";

export function PainelVendas() {
  const { data, isLoading } = useQuery({
    queryKey: ["sales", "dashboard"],
    queryFn: () => api.get<SalesDashboard>("/sales/dashboard"),
  });

  if (isLoading || !data) {
    return (
      <Card className="grid h-40 place-items-center">
        <Spinner />
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Resultado de vendas"
          hint={`Últimos ${data.periodo_meses} meses`}
          action={
            <Link
              to="/vendas/negocios"
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--brand-primary)] hover:underline"
            >
              Ver negócios <ArrowRight className="size-3.5" />
            </Link>
          }
        />
        <dl className="grid divide-line-soft sm:grid-cols-2 sm:divide-x lg:grid-cols-4">
          <Metric label="VGV" value={money(data.vgv)} note={`${data.vendas} vendas`} />
          <Metric label="Ticket médio" value={money(data.ticket_medio)} />
          <Metric
            label="Comissão gerada"
            value={money(data.comissao_gerada)}
            positive
          />
          <Metric
            label="Ciclo médio"
            value={data.ciclo_medio_dias === null ? "—" : `${data.ciclo_medio_dias} dias`}
            note="Do lead ao fechamento"
          />
        </dl>
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <FunnelCard data={data} />

        <div className="space-y-5">
          <Card>
            <CardHeader title="Em negociação" hint="Propostas abertas e contrapropostas" />
            <div className="px-5 py-4">
              <p className="font-mono text-2xl font-medium tabular text-ink">
                {money(data.valor_em_negociacao)}
              </p>
              <p className="mt-0.5 text-[12px] text-muted">
                Valor somado das ofertas em aberto
              </p>
            </div>
          </Card>

          <Card>
            <CardHeader title="Comissões dos corretores" />
            <dl className="divide-y divide-line-soft">
              <Row label="A pagar">{money(data.comissoes.a_pagar)}</Row>
              <Row label="Pagas">{money(data.comissoes.pagas)}</Row>
            </dl>
          </Card>

          {data.ranking_corretores.length > 0 ? (
            <Card>
              <CardHeader title="Corretores" hint="Por vendas fechadas no período" />
              <ol className="divide-y divide-line-soft">
                {data.ranking_corretores.map((item, index) => (
                  <li
                    key={item.corretor}
                    className="flex items-center gap-3 px-5 py-2.5"
                  >
                    <span className="w-4 shrink-0 font-mono text-[12px] text-muted">
                      {index + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                      {item.corretor}
                    </span>
                    <span className="font-mono text-[12px] text-muted">
                      {item.vendas} {item.vendas === 1 ? "venda" : "vendas"}
                    </span>
                    <span className="w-24 shrink-0 text-right font-mono text-[12.5px] tabular text-ink-soft">
                      {money(item.comissao)}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * O funil desenhado como barras decrescentes: a leitura que importa é onde a
 * conversão cai, não o número absoluto de cada etapa.
 */
function FunnelCard({ data }: { data: SalesDashboard }) {
  const max = Math.max(1, ...data.funil.map((s) => s.count));

  return (
    <Card>
      <CardHeader
        title="Funil de vendas"
        hint="Leads em aberto por etapa"
        action={
          <Link
            to="/vendas/funil"
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

function Metric({
  label,
  value,
  note,
  positive,
}: {
  label: string;
  value: string;
  note?: string;
  positive?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl font-medium tabular ${
          positive ? "text-positive" : "text-ink"
        }`}
      >
        {value}
      </dd>
      {note ? <p className="mt-0.5 text-[12px] text-muted">{note}</p> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="font-mono text-[13px] tabular text-ink">{children}</dd>
    </div>
  );
}
