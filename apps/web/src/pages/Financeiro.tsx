import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Wallet, X } from "lucide-react";
import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
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
import { date, money, monthLabel } from "@/lib/format";
import type {
  Account,
  Cashflow,
  CostCenter,
  DreRow,
  FinanceEntry,
  FinanceSummary,
} from "@/lib/types";

type Kind = "receivables" | "payables";

export function Financeiro() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const kind = (params.get("tipo") as Kind) ?? "receivables";
  const [creating, setCreating] = React.useState(false);

  const { data: summary } = useQuery({
    queryKey: ["finance", "summary"],
    queryFn: () => api.get<FinanceSummary>("/finance/reports/summary"),
  });

  return (
    <>
      <PageHeader
        eyebrow="Gestão"
        title="Financeiro"
        description="Contas a pagar e receber, fluxo de caixa projetado e resultado por competência."
        action={
          can("financeiro", "create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus />
              Novo lançamento
            </Button>
          ) : null
        }
      />

      {summary ? <SummaryStrip summary={summary} /> : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_360px]">
        <Card>
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            {(
              [
                ["receivables", "A receber"],
                ["payables", "A pagar"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setParams({ tipo: value })}
                className={
                  kind === value
                    ? "rounded-md bg-[color-mix(in_srgb,var(--brand-primary)_10%,white)] px-3 py-1.5 text-[13px] font-medium text-[var(--brand-primary)]"
                    : "rounded-md px-3 py-1.5 text-[13px] text-ink-soft hover:bg-sunken"
                }
              >
                {label}
              </button>
            ))}
          </div>
          <EntriesTable kind={kind} canEdit={can("financeiro", "edit")} />
        </Card>

        <div className="space-y-5">
          <CashflowCard />
          {can("relatorios", "view") ? <DreCard /> : null}
        </div>
      </div>

      <EntryFormDialog open={creating} onOpenChange={setCreating} defaultKind={kind} />
    </>
  );
}

function SummaryStrip({ summary }: { summary: FinanceSummary }) {
  const result = Number(summary.resultado_mes);

  return (
    <Card>
      <dl className="grid divide-line-soft sm:grid-cols-3 sm:divide-x">
        {/* O total em aberto é neutro; só a parcela vencida merece alarme. */}
        <Metric
          label="A receber em aberto"
          value={money(summary.a_receber)}
          note={
            Number(summary.receber_vencido) > 0
              ? `${money(summary.receber_vencido)} vencido`
              : "Nenhum vencido"
          }
          noteAlert={Number(summary.receber_vencido) > 0}
        />
        <Metric
          label="A pagar em aberto"
          value={money(summary.a_pagar)}
          note={
            Number(summary.pagar_vencido) > 0
              ? `${money(summary.pagar_vencido)} vencido`
              : "Nenhum vencido"
          }
          noteAlert={Number(summary.pagar_vencido) > 0}
        />
        <Metric
          label="Resultado do mês"
          value={money(summary.resultado_mes)}
          note={`${money(summary.recebido_mes)} recebido · ${money(summary.pago_mes)} pago`}
          positive={result > 0}
          negative={result < 0}
        />
      </dl>
    </Card>
  );
}

function Metric({
  label,
  value,
  note,
  noteAlert,
  negative,
  positive,
}: {
  label: string;
  value: string;
  note: string;
  noteAlert?: boolean;
  negative?: boolean;
  positive?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={`mt-1 font-mono text-xl font-medium tabular ${
          positive ? "text-positive" : negative ? "text-critical" : "text-ink"
        }`}
      >
        {value}
      </dd>
      <p className={`mt-0.5 text-[12px] ${noteAlert ? "text-critical" : "text-muted"}`}>{note}</p>
    </div>
  );
}

function EntriesTable({ kind, canEdit }: { kind: Kind; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState("pendente");

  const { data, isLoading } = useQuery({
    queryKey: ["finance", kind, status],
    queryFn: () =>
      api.get<Page<FinanceEntry>>(`/finance/${kind}?${status ? `status=${status}` : ""}`),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["finance"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const settle = useMutation({
    mutationFn: (id: string) => api.post(`/finance/${kind}/${id}/settle`, {}),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/finance/${kind}/${id}/cancel`),
    onSuccess: invalidate,
  });

  const settledLabel = kind === "receivables" ? "Recebido" : "Pago";

  return (
    <>
      <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-44"
          aria-label="Filtrar por situação"
        >
          <option value="pendente">Em aberto</option>
          <option value={kind === "receivables" ? "recebido" : "pago"}>{settledLabel}</option>
          <option value="cancelado">Cancelado</option>
          <option value="">Todos</option>
        </Select>
      </div>

      {!isLoading && data?.items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Nenhum lançamento"
          description={
            status === "pendente"
              ? "Nada em aberto nesta categoria."
              : "Nenhum lançamento com essa situação."
          }
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Descrição</Th>
              <Th className="hidden sm:table-cell">Vencimento</Th>
              <Th className="text-right">Valor</Th>
              <Th className="w-px">Situação</Th>
              {canEdit ? <Th className="w-px sr-only">Ações</Th> : null}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <LoadingRows columns={canEdit ? 5 : 4} />
            ) : (
              data?.items.map((entry) => (
                <Tr key={entry.id}>
                  <Td>
                    <p className="font-medium text-ink">{entry.description}</p>
                    <p className="text-[12px] text-muted">
                      {[entry.counterparty_name, entry.account_name].filter(Boolean).join(" · ") ||
                        "Sem classificação"}
                    </p>
                  </Td>
                  <Td className="hidden font-mono text-[13px] text-ink-soft sm:table-cell">
                    {date(entry.due_date)}
                  </Td>
                  <Td className="text-right font-mono tabular text-ink">{money(entry.amount)}</Td>
                  <Td>
                    {entry.status === "cancelado" ? (
                      <Badge tone="neutral">Cancelado</Badge>
                    ) : entry.status === "pendente" ? (
                      entry.overdue ? (
                        <Badge tone="critical">Vencido</Badge>
                      ) : (
                        <Badge tone="caution">Em aberto</Badge>
                      )
                    ) : (
                      <Badge tone="positive">{settledLabel}</Badge>
                    )}
                  </Td>
                  {canEdit ? (
                    <Td>
                      {entry.status === "pendente" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => settle.mutate(entry.id)}
                            loading={settle.isPending && settle.variables === entry.id}
                          >
                            <Check />
                            Baixar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Cancelar lançamento"
                            onClick={() => cancel.mutate(entry.id)}
                          >
                            <X />
                          </Button>
                        </div>
                      ) : null}
                    </Td>
                  ) : null}
                </Tr>
              ))
            )}
          </tbody>
        </Table>
      )}
    </>
  );
}

function CashflowCard() {
  const { data } = useQuery({
    queryKey: ["finance", "cashflow"],
    queryFn: () => api.get<Cashflow>("/finance/reports/cashflow?days=90"),
  });

  if (!data) return null;

  const projected = Number(data.saldo_projetado);
  const peak = Math.max(1, ...data.series.map((p) => Math.abs(Number(p.saldo_acumulado))));

  return (
    <Card>
      <CardHeader title="Fluxo de caixa" hint="Projeção de 90 dias" />
      <div className="px-5 py-4">
        <p
          className={`font-mono text-2xl font-medium tabular ${
            projected >= 0 ? "text-positive" : "text-critical"
          }`}
        >
          {money(data.saldo_projetado)}
        </p>
        <p className="mt-0.5 text-[12px] text-muted">Saldo projetado ao fim do período</p>

        {data.series.length === 0 ? (
          <p className="mt-4 text-[13px] text-muted">
            Nenhum vencimento nos próximos 90 dias.
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {data.series.slice(0, 8).map((point) => {
              const value = Number(point.saldo_acumulado);
              return (
                <li key={point.day} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 font-mono text-[11px] text-muted">
                    {date(point.day).slice(0, 5)}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(Math.abs(value) / peak) * 100}%`,
                        background: value >= 0 ? "var(--color-positive)" : "var(--color-critical)",
                      }}
                    />
                  </span>
                  <span className="w-24 shrink-0 text-right font-mono text-[11px] tabular text-ink-soft">
                    {money(value)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}

function DreCard() {
  const { data } = useQuery({
    queryKey: ["finance", "dre"],
    queryFn: () => api.get<DreRow[]>("/finance/reports/dre?months=3"),
  });

  if (!data || data.length === 0) return null;

  const months = [...new Set(data.map((row) => row.month))].slice(0, 3);

  return (
    <Card>
      <CardHeader title="Resultado por competência" hint="DRE simplificado" />
      <div className="divide-y divide-line-soft">
        {months.map((month) => {
          const rows = data.filter((r) => r.month === month);
          const receita = sum(rows.filter((r) => r.kind === "receita"));
          const despesa = sum(rows.filter((r) => r.kind === "despesa"));
          const resultado = receita - despesa;

          return (
            <div key={month} className="px-5 py-3">
              <p className="text-[12px] text-muted capitalize">{monthLabel(month)}</p>
              <div className="mt-1.5 grid grid-cols-3 gap-2 font-mono text-[12.5px] tabular">
                <span className="text-positive">+{money(receita)}</span>
                <span className="text-critical">−{money(despesa)}</span>
                <span
                  className={`text-right font-medium ${
                    resultado >= 0 ? "text-ink" : "text-critical"
                  }`}
                >
                  {money(resultado)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function sum(rows: DreRow[]): number {
  return rows.reduce((total, row) => total + Number(row.amount), 0);
}

function EntryFormDialog({
  open,
  onOpenChange,
  defaultKind,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultKind: Kind;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = React.useState<Kind>(defaultKind);
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [costCenterId, setCostCenterId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setKind(defaultKind), [defaultKind]);

  const { data: accounts } = useQuery({
    queryKey: ["finance", "accounts"],
    queryFn: () => api.get<Account[]>("/finance/accounts"),
    enabled: open,
  });

  const { data: costCenters } = useQuery({
    queryKey: ["finance", "cost-centers"],
    queryFn: () => api.get<CostCenter[]>("/finance/cost-centers"),
    enabled: open,
  });

  const expectedKind = kind === "receivables" ? "receita" : "despesa";
  const relevantAccounts = accounts?.filter((a) => a.kind === expectedKind) ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/finance/${kind}`, {
        description,
        amount,
        due_date: dueDate,
        account_id: accountId || null,
        cost_center_id: costCenterId || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onOpenChange(false);
      setDescription("");
      setAmount("");
      setDueDate("");
      setAccountId("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Novo lançamento"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            loading={mutation.isPending}
            disabled={!description.trim() || !amount || !dueDate}
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
          >
            Lançar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Tipo" required>
          <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="receivables">Conta a receber</option>
            <option value="payables">Conta a pagar</option>
          </Select>
        </Field>

        <Field label="Descrição" required>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              kind === "receivables" ? "Taxa de administração — julho" : "Energia elétrica — sede"
            }
            autoFocus
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Valor (R$)" required>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="font-mono"
              placeholder="0,00"
            />
          </Field>
          <Field label="Vencimento" required>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Conta">
            <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Sem classificação</option>
              {relevantAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.code} · {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Centro de custo">
            <Select value={costCenterId} onChange={(e) => setCostCenterId(e.target.value)}>
              <option value="">Nenhum</option>
              {costCenters?.map((center) => (
                <option key={center.id} value={center.id}>
                  {center.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
