import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  FileText,
  FileWarning,
  Handshake,
  Megaphone,
  Send,
  Sparkles,
  Trophy,
  UserMinus,
  UserPlus,
  Wallet,
} from "lucide-react";
import * as React from "react";
import { Link } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import { Badge, Card, CardHeader, Spinner } from "@/components/ui";
import { api } from "@/lib/api";
import { money, relativeDays } from "@/lib/format";
import { PROPERTY_STATUS } from "@/lib/labels";
import { PainelLocacao } from "@/pages/locacao/PainelLocacao";
import { PainelVendas } from "@/pages/vendas/PainelVendas";
import type { Dashboard as DashboardData, ExpiringDocument } from "@/lib/types";

type Tab = "carteira" | "locacao" | "vendas";

/**
 * Painel inicial montado conforme o plano contratado.
 *
 * Cada módulo tem indicadores próprios e não empresta número do outro: quem
 * contrata só locação nunca vê VGV, e quem contrata só vendas nunca vê
 * inadimplência de aluguel. Com os dois módulos, as abas separam as leituras.
 */
export function Dashboard() {
  const { me, can, hasModule } = useAuth();
  const hasRentals = hasModule("module_rentals");
  const hasSales = hasModule("module_sales");

  const tabs: { value: Tab; label: string }[] = [
    { value: "carteira", label: "Carteira" },
    ...(hasRentals ? ([{ value: "locacao", label: "Locação" }] as const) : []),
    ...(hasSales ? ([{ value: "vendas", label: "Vendas" }] as const) : []),
  ];

  // Abre no módulo do plano quando há só um; com os dois, começa na carteira.
  const [tab, setTab] = React.useState<Tab>(
    hasRentals && !hasSales ? "locacao" : !hasRentals && hasSales ? "vendas" : "carteira",
  );

  const firstName = me?.full_name.split(" ")[0] ?? "";

  return (
    <>
      <header className="mb-6">
        <p className="mb-1 font-mono text-[11px] tracking-widest text-muted uppercase">Painel</p>
        <h1 className="font-display text-2xl font-semibold text-ink">
          Bom trabalho, {firstName}.
        </h1>
        <p className="mt-1 text-[13px] text-muted">
          Situação da operação e o que precisa de atenção hoje.
        </p>
      </header>

      {tabs.length > 1 ? (
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
      ) : null}

      {tab === "carteira" ? <PainelCarteira canSeeFinance={can("financeiro", "view")} canSeeClients={can("clientes", "view")} /> : null}
      {tab === "locacao" ? <PainelLocacao /> : null}
      {tab === "vendas" ? <PainelVendas /> : null}
    </>
  );
}

/** Bloco comum aos dois módulos: imóveis cadastrados, caixa e pendências. */
function PainelCarteira({
  canSeeFinance,
  canSeeClients,
}: {
  canSeeFinance: boolean;
  canSeeClients: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => api.get<DashboardData>("/dashboard"),
  });

  const { data: expiring } = useQuery({
    queryKey: ["documents", "expiring"],
    queryFn: () => api.get<ExpiringDocument[]>("/clients/documents/expiring?days=30"),
    enabled: canSeeClients,
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
      <MondayStrip />
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        <PortfolioStrip data={data} />
        <ActivityFeed />
      </div>
      <div className="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
        {canSeeFinance ? <FinancePosition data={data} /> : null}
        <PendingItems expiring={expiring ?? []} />
      </div>
    </div>
  );
}

type ActivityEntry = {
  id: string;
  event_type: string;
  summary: string;
  actor_name: string | null;
  created_at: string;
};

const EVENT_ICON: Record<string, { icon: React.ReactNode; tone: string }> = {
  "lead.created": { icon: <UserPlus className="size-4" />, tone: "text-[var(--brand-primary)]" },
  "lead.won": { icon: <Trophy className="size-4" />, tone: "text-positive" },
  "lead.lost": { icon: <UserMinus className="size-4" />, tone: "text-muted" },
  "proposal.created": { icon: <Send className="size-4" />, tone: "text-[var(--brand-primary)]" },
  "deal.closed": { icon: <Trophy className="size-4" />, tone: "text-positive" },
  "contract.activated": { icon: <FileText className="size-4" />, tone: "text-positive" },
};

/**
 * Feed do time — o Twitter interno da imobiliária. Atualiza sozinho a
 * cada 45s e mostra as últimas 30 movimentações. O gerente lê de manhã
 * pra saber o pulso; o corretor vê que a equipe está se mexendo.
 */
function ActivityFeed() {
  const { data } = useQuery({
    queryKey: ["activity"],
    queryFn: () => api.get<ActivityEntry[]>("/dashboard/activity?limit=30"),
    refetchInterval: 45_000,
  });

  return (
    <Card>
      <CardHeader
        title="Pulso do time"
        hint="O que rolou hoje na imobiliária"
      />
      {!data || data.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-muted">
          Assim que a equipe se movimentar (leads, propostas, negócios), aparece aqui.
        </p>
      ) : (
        <ul className="max-h-[360px] divide-y divide-line-soft overflow-y-auto">
          {data.map((entry) => {
            const meta = EVENT_ICON[entry.event_type] ?? {
              icon: <Sparkles className="size-4" />,
              tone: "text-muted",
            };
            return (
              <li key={entry.id} className="flex items-start gap-3 px-5 py-3">
                <span className={`mt-0.5 ${meta.tone}`} aria-hidden>
                  {meta.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] leading-snug text-ink">{entry.summary}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">
                    {entry.actor_name ?? "Sistema"} · {relativeTime(entry.created_at)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min atrás`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h atrás`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d atrás`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

type MondayData = {
  receita_7dias: number;
  em_atraso: number;
  em_atraso_qtd: number;
  contratos_vencendo_60d: number;
  contratos_ativos: number;
  leads_abertos: number;
  propostas_abertas: number;
  imoveis_anunciados: number;
  imoveis_em_captacao: number;
};

/**
 * Faixa "manhã de segunda" — seis números lidos num golpe de vista, para
 * o dono da imobiliária começar a semana sabendo o essencial sem clicar.
 * Nenhum recurso novo por baixo: agrega dados que já existem no sistema.
 */
function MondayStrip() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "segunda"],
    queryFn: () => api.get<MondayData>("/dashboard/segunda"),
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <Card className="grid h-32 place-items-center">
        <Spinner />
      </Card>
    );
  }

  const tiles = [
    {
      key: "receita",
      label: "Receita nos próximos 7 dias",
      value: money(String(data.receita_7dias)),
      hint: data.receita_7dias > 0 ? "cobranças a vencer" : "sem cobranças a vencer",
      icon: <Wallet className="size-4" />,
      to: "/cobrancas",
      tone: "positive" as const,
    },
    {
      key: "atraso",
      label: "Em atraso",
      value: money(String(data.em_atraso)),
      hint:
        data.em_atraso_qtd > 0
          ? `${data.em_atraso_qtd} ${data.em_atraso_qtd === 1 ? "cobrança" : "cobranças"}`
          : "carteira em dia",
      icon: <AlertTriangle className="size-4" />,
      to: "/cobrancas?status=vencidos",
      tone: data.em_atraso > 0 ? ("critical" as const) : ("neutral" as const),
    },
    {
      key: "contratos",
      label: "Contratos vencendo em 60 dias",
      value: String(data.contratos_vencendo_60d),
      hint: `${data.contratos_ativos} ${data.contratos_ativos === 1 ? "ativo" : "ativos"}`,
      icon: <CalendarClock className="size-4" />,
      to: "/contratos",
      tone: data.contratos_vencendo_60d > 0 ? ("caution" as const) : ("neutral" as const),
    },
    {
      key: "leads",
      label: "Leads em aberto",
      value: String(data.leads_abertos),
      hint: "aguardando atendimento",
      icon: <Sparkles className="size-4" />,
      to: "/funil",
      tone: "brand" as const,
    },
    {
      key: "propostas",
      label: "Propostas em aberto",
      value: String(data.propostas_abertas),
      hint: "esperando resposta",
      icon: <Handshake className="size-4" />,
      to: "/vendas",
      tone: "brand" as const,
    },
    {
      key: "vitrine",
      label: "Imóveis anunciados",
      value: String(data.imoveis_anunciados),
      hint: `${data.imoveis_em_captacao} em captação`,
      icon: <Megaphone className="size-4" />,
      to: "/imoveis",
      tone: "neutral" as const,
    },
  ];

  return (
    <section aria-label="Manhã de segunda">
      <div className="mb-2 flex items-baseline gap-2">
        <h2 className="font-display text-[15px] font-semibold text-ink">Manhã de segunda</h2>
        <p className="text-[12px] text-muted">o essencial para começar a semana</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {tiles.map((tile) => (
          <Link
            key={tile.key}
            to={tile.to}
            className="group rounded-xl border border-line bg-surface p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--brand-primary)]"
          >
            <div className="flex items-center gap-2 text-muted group-hover:text-ink">
              <span
                className={
                  {
                    positive: "text-positive",
                    critical: "text-critical",
                    caution: "text-caution",
                    brand: "text-[var(--brand-primary)]",
                    neutral: "text-muted",
                  }[tile.tone]
                }
              >
                {tile.icon}
              </span>
              <span className="text-[11.5px] font-medium tracking-wide uppercase">
                {tile.label}
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-semibold tabular text-ink">
              {tile.value}
            </div>
            <p className="mt-1 text-[12px] text-muted">{tile.hint}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}

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
        hint="Lançamentos em aberto de todos os módulos"
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

function PendingItems({ expiring }: { expiring: ExpiringDocument[] }) {
  return (
    <Card>
      <CardHeader title="Documentos a vencer" hint="Próximos 30 dias" />
      {expiring.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-[13px] text-muted">Nenhum documento vencendo. Cadastro em dia.</p>
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
