import { useQuery } from "@tanstack/react-query";
import { Medal, Minus, TrendingDown, TrendingUp } from "lucide-react";
import * as React from "react";

import { Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money } from "@/lib/format";

type Period = 7 | 30 | 90 | 180 | 365;

const PERIODS: { value: Period; label: string }[] = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 365, label: "12 meses" },
];

export type SalesRow = {
  user_id: string;
  corretor: string;
  leads: number;
  propostas: number;
  vendas: number;
  comissao: number;
  conversao: number | null;
  delta_vendas: number;
};

export type RentalsRow = {
  user_id: string;
  corretor: string;
  leads: number;
  visitas: number;
  ganhos: number;
  conversao: number | null;
  delta_ganhos: number;
};

type RankingResponse<T> = { periodo_dias: number; items: T[] };

/**
 * Ranking da equipe — apresenta 4 métricas por linha e a comparação com o
 * período anterior. O topo é destacado com medalha; um leaderboard leve
 * mostra a barra proporcional ao 1º colocado para se ler de relance.
 */
export function TeamRanking<T extends SalesRow | RentalsRow>({
  kind,
}: {
  kind: "sales" | "rentals";
}) {
  const [period, setPeriod] = React.useState<Period>(30);
  const path = kind === "sales" ? "/sales/ranking" : "/rentals/ranking";
  const { data, isLoading } = useQuery({
    queryKey: [kind, "ranking", period],
    queryFn: () => api.get<RankingResponse<T>>(`${path}?days=${period}`),
  });

  return (
    <Card>
      <CardHeader
        title="Ranking da equipe"
        hint={`${kind === "sales" ? "Vendas" : "Locação"} — últimos ${period} dias`}
        action={
          <div className="flex items-center gap-1 rounded-md border border-line bg-sunken p-0.5 text-[12px]">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                className={`rounded px-2.5 py-1 ${
                  period === p.value ? "bg-surface text-ink shadow-sm" : "text-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />

      {isLoading || !data ? (
        <div className="grid h-32 place-items-center">
          <Spinner />
        </div>
      ) : data.items.length === 0 ? (
        <p className="px-5 py-6 text-center text-[13px] text-muted">
          Nenhum movimento no período. Assim que a equipe começar a atender leads, o ranking aparece aqui.
        </p>
      ) : kind === "sales" ? (
        <SalesTable items={data.items as SalesRow[]} />
      ) : (
        <RentalsTable items={data.items as RentalsRow[]} />
      )}
    </Card>
  );
}

function SalesTable({ items }: { items: SalesRow[] }) {
  const top = items[0]?.vendas || 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] tracking-wide text-muted uppercase">
            <th className="w-8 py-2 pl-5">#</th>
            <th className="py-2">Corretor</th>
            <th className="py-2 text-right">Leads</th>
            <th className="py-2 text-right">Propostas</th>
            <th className="py-2 text-right">Vendas</th>
            <th className="py-2 text-right">Conversão</th>
            <th className="py-2 pr-5 text-right">Comissão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {items.map((row, i) => (
            <tr key={row.user_id}>
              <td className="py-2.5 pl-5">
                <Rank i={i} />
              </td>
              <td className="py-2.5">
                <div className="font-medium text-ink">{row.corretor}</div>
                <BarLine width={(row.vendas / top) * 100} />
              </td>
              <td className="py-2.5 text-right font-mono tabular text-ink-soft">{row.leads}</td>
              <td className="py-2.5 text-right font-mono tabular text-ink-soft">{row.propostas}</td>
              <td className="py-2.5 text-right">
                <div className="font-mono tabular text-ink">{row.vendas}</div>
                <Delta value={row.delta_vendas} />
              </td>
              <td className="py-2.5 text-right font-mono tabular text-ink-soft">
                {row.conversao === null ? "—" : `${row.conversao}%`}
              </td>
              <td className="py-2.5 pr-5 text-right font-mono tabular text-ink">
                {money(String(row.comissao))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RentalsTable({ items }: { items: RentalsRow[] }) {
  const top = items[0]?.ganhos || 1;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11.5px] tracking-wide text-muted uppercase">
            <th className="w-8 py-2 pl-5">#</th>
            <th className="py-2">Corretor</th>
            <th className="py-2 text-right">Leads</th>
            <th className="py-2 text-right">Visitas</th>
            <th className="py-2 text-right">Fechados</th>
            <th className="py-2 pr-5 text-right">Conversão</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {items.map((row, i) => (
            <tr key={row.user_id}>
              <td className="py-2.5 pl-5">
                <Rank i={i} />
              </td>
              <td className="py-2.5">
                <div className="font-medium text-ink">{row.corretor}</div>
                <BarLine width={(row.ganhos / top) * 100} />
              </td>
              <td className="py-2.5 text-right font-mono tabular text-ink-soft">{row.leads}</td>
              <td className="py-2.5 text-right font-mono tabular text-ink-soft">{row.visitas}</td>
              <td className="py-2.5 text-right">
                <div className="font-mono tabular text-ink">{row.ganhos}</div>
                <Delta value={row.delta_ganhos} />
              </td>
              <td className="py-2.5 pr-5 text-right font-mono tabular text-ink-soft">
                {row.conversao === null ? "—" : `${row.conversao}%`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Rank({ i }: { i: number }) {
  const colors = ["text-yellow-500", "text-slate-400", "text-amber-700"];
  if (i < 3)
    return (
      <span className={`inline-flex items-center gap-1 font-mono text-[12px] ${colors[i]}`}>
        <Medal className="size-4" />
        {i + 1}
      </span>
    );
  return <span className="font-mono text-[12px] text-muted">{i + 1}</span>;
}

function BarLine({ width }: { width: number }) {
  const w = Math.max(0, Math.min(100, width));
  if (w === 0) return null;
  return (
    <div className="mt-1 h-1 max-w-40 rounded-full bg-sunken">
      <div
        className="h-full rounded-full bg-[var(--brand-primary)]"
        style={{ width: `${w}%` }}
      />
    </div>
  );
}

function Delta({ value }: { value: number }) {
  if (value === 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] text-muted">
        <Minus className="size-3" />
        =
      </span>
    );
  const positive = value > 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] ${
        positive ? "text-positive" : "text-critical"
      }`}
    >
      {positive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {positive ? "+" : ""}
      {value}
    </span>
  );
}
