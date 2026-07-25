import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, PlayCircle, Receipt } from "lucide-react";
import * as React from "react";

import { useAuth } from "@/auth/AuthProvider";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CodeTag,
  Dialog,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { api } from "@/lib/api";
import { date, money, monthLabel } from "@/lib/format";
import type { Charge, Payout } from "@/lib/types";

const CHARGE_STATUS: Record<
  Charge["status"],
  { label: string; tone: "neutral" | "positive" | "caution" | "critical" }
> = {
  pendente: { label: "Em aberto", tone: "caution" },
  pago: { label: "Pago", tone: "positive" },
  baixado_manual: { label: "Baixa manual", tone: "positive" },
  vencido: { label: "Vencido", tone: "critical" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

function currentCompetence(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
}

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/**
 * Mês e ano em selects próprios: o `input type="month"` do navegador é
 * rotulado pelo idioma do navegador, não pelo da página, e a interface aqui
 * é toda em português.
 */
function CompetencePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (competence: string) => void;
}) {
  const [year, month] = value.split("-");
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex items-end gap-2">
      <Field label="Competência" className="w-40">
        <Select
          value={month}
          onChange={(e) => onChange(`${year}-${e.target.value}-01`)}
          aria-label="Mês da competência"
        >
          {MONTHS.map((name, index) => (
            <option key={name} value={String(index + 1).padStart(2, "0")}>
              {name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Ano" className="w-28">
        <Select
          value={year}
          onChange={(e) => onChange(`${e.target.value}-${month}-01`)}
          aria-label="Ano da competência"
        >
          {years.map((y) => (
            <option key={y} value={String(y)}>
              {y}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function Cobrancas() {
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const [competence, setCompetence] = React.useState(currentCompetence());
  const [settling, setSettling] = React.useState<Charge | null>(null);
  const [secondCopy, setSecondCopy] = React.useState<Charge | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [generated, setGenerated] = React.useState<string | null>(null);

  const { data: charges, isLoading } = useQuery({
    queryKey: ["billing", "charges", competence],
    queryFn: () => api.get<Charge[]>(`/billing/charges?competence=${competence}`),
  });

  const { data: payouts } = useQuery({
    queryKey: ["billing", "payouts", competence],
    queryFn: () => api.get<Payout[]>(`/billing/payouts?reference_month=${competence}`),
  });

  const generate = useMutation({
    mutationFn: () => api.post<{ created: number; skipped: number }>("/billing/generate", {
      competence,
    }),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      setGenerated(
        result.created === 0
          ? `Nenhuma cobrança nova. ${result.skipped} já existiam neste mês.`
          : `${result.created} ${result.created === 1 ? "cobrança gerada" : "cobranças geradas"}.` +
              (result.skipped ? ` ${result.skipped} já existiam.` : ""),
      );
      setTimeout(() => setGenerated(null), 6000);
    },
    onError: (err: Error) => setError(err.message),
  });

  const totals = React.useMemo(() => {
    const list = charges ?? [];
    const open = list.filter((c) => c.status === "pendente");
    const paid = list.filter((c) => c.status === "pago" || c.status === "baixado_manual");
    const sum = (items: Charge[]) =>
      items.reduce((total, c) => total + Number(c.gross_amount), 0);
    const adminFee = list.reduce(
      (total, c) =>
        total + Number(c.splits.find((s) => s.beneficiary === "agency")?.amount ?? 0),
      0,
    );
    return { open: sum(open), paid: sum(paid), adminFee, count: list.length };
  }, [charges]);

  return (
    <>
      <PageHeader
        eyebrow="Locação"
        title="Cobranças"
        description="Aluguel do mês, com split entre a imobiliária e o proprietário."
        action={
          can("financeiro", "create") ? (
            <Button loading={generate.isPending} onClick={() => generate.mutate()}>
              <PlayCircle />
              Gerar cobranças do mês
            </Button>
          ) : null
        }
      />

      <div className="mb-5">
        <CompetencePicker value={competence} onChange={setCompetence} />
      </div>

      {generated ? (
        <div className="mb-4 rounded-md border border-positive/25 bg-positive-soft px-3 py-2 text-[13px] text-positive">
          {generated}
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}

      <Card className="mb-5">
        <dl className="grid divide-line-soft sm:grid-cols-3 sm:divide-x">
          <Metric label="Em aberto" value={money(totals.open)} />
          <Metric label="Recebido" value={money(totals.paid)} positive />
          <Metric
            label="Taxa de administração"
            value={money(totals.adminFee)}
            note="Receita da imobiliária no mês"
          />
        </dl>
      </Card>

      <Card className="mb-5">
        <CardHeader
          title={`Cobranças de ${monthLabel(competence)}`}
          hint={totals.count > 0 ? `${totals.count} no mês` : undefined}
        />
        {isLoading ? (
          <div className="grid h-40 place-items-center">
            <Spinner />
          </div>
        ) : charges?.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Nenhuma cobrança neste mês"
            description="Gere as cobranças do mês para os contratos ativos."
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Contrato</Th>
                <Th className="hidden md:table-cell">Locatário</Th>
                <Th className="hidden sm:table-cell">Vencimento</Th>
                <Th className="text-right">Valor</Th>
                <Th className="text-right">Taxa adm.</Th>
                <Th>Situação</Th>
                <Th className="sr-only">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {charges?.map((charge) => {
                const info = CHARGE_STATUS[charge.status];
                const fee = charge.splits.find((s) => s.beneficiary === "agency")?.amount;
                const isOpen = charge.status === "pendente";
                return (
                  <Tr key={charge.id}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <CodeTag>{charge.contract_code}</CodeTag>
                        <span className="font-mono text-[12px] text-muted">
                          {charge.property_code}
                        </span>
                      </div>
                    </Td>
                    <Td className="hidden text-ink-soft md:table-cell">
                      {charge.tenant_name ?? "—"}
                    </Td>
                    <Td className="hidden font-mono text-[12.5px] text-ink-soft sm:table-cell">
                      {date(charge.due_date)}
                    </Td>
                    <Td className="text-right font-mono tabular text-ink">
                      {money(charge.gross_amount)}
                    </Td>
                    <Td className="text-right font-mono tabular text-muted">{money(fee)}</Td>
                    <Td>
                      {charge.overdue && isOpen ? (
                        <Badge tone="critical">
                          Vencido há {charge.days_late}d
                        </Badge>
                      ) : (
                        <Badge tone={info.tone}>{info.label}</Badge>
                      )}
                    </Td>
                    <Td>
                      {isOpen ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setSecondCopy(charge)}
                          >
                            2ª via
                          </Button>
                          {can("financeiro", "edit") ? (
                            <Button size="sm" onClick={() => setSettling(charge)}>
                              <Check />
                              Baixar
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <PayoutsCard payouts={payouts ?? []} competence={competence} />

      <SettleDialog charge={settling} onOpenChange={() => setSettling(null)} />
      <SecondCopyDialog charge={secondCopy} onOpenChange={() => setSecondCopy(null)} />
    </>
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

function PayoutsCard({ payouts, competence }: { payouts: Payout[]; competence: string }) {
  const queryClient = useQueryClient();
  const [deducting, setDeducting] = React.useState<Payout | null>(null);

  return (
    <>
      <Card>
        <CardHeader
          title="Repasses aos proprietários"
          hint={`Extrato de ${monthLabel(competence)}: aluguel recebido − taxa − descontos`}
        />
        {payouts.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-muted">
            Nenhum repasse neste mês. Os valores aparecem conforme as cobranças são pagas.
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Proprietário</Th>
                <Th className="text-right">Recebido</Th>
                <Th className="text-right">Taxa adm.</Th>
                <Th className="text-right">Descontos</Th>
                <Th className="text-right">A repassar</Th>
                <Th className="sr-only">Ações</Th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <Tr key={payout.id}>
                  <Td className="font-medium text-ink">{payout.owner_name}</Td>
                  <Td className="text-right font-mono tabular text-ink-soft">
                    {money(payout.gross_amount)}
                  </Td>
                  <Td className="text-right font-mono tabular text-muted">
                    −{money(payout.admin_fee)}
                  </Td>
                  <Td className="text-right font-mono tabular text-muted">
                    {Number(payout.deductions) > 0 ? `−${money(payout.deductions)}` : "—"}
                  </Td>
                  <Td
                    className={`text-right font-mono font-medium tabular ${
                      Number(payout.net_amount) < 0 ? "text-critical" : "text-ink"
                    }`}
                  >
                    {money(payout.net_amount)}
                  </Td>
                  <Td>
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => setDeducting(payout)}>
                        Lançar desconto
                      </Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <DeductionDialog
        payout={deducting}
        competence={competence}
        onOpenChange={() => setDeducting(null)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["billing", "payouts"] })}
      />
    </>
  );
}

function SettleDialog({
  charge,
  onOpenChange,
}: {
  charge: Charge | null;
  onOpenChange: () => void;
}) {
  const queryClient = useQueryClient();
  const [paidAt, setPaidAt] = React.useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = React.useState("pix");
  const [error, setError] = React.useState<string | null>(null);

  const settle = useMutation({
    mutationFn: () =>
      api.post(`/billing/charges/${charge!.id}/settle`, { paid_at: paidAt, method }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["billing"] });
      queryClient.invalidateQueries({ queryKey: ["finance"] });
      onOpenChange();
    },
    onError: (err: Error) => setError(err.message),
  });

  const late = charge && paidAt > charge.due_date;

  return (
    <Dialog
      open={Boolean(charge)}
      onOpenChange={onOpenChange}
      title="Baixa manual"
      description="Para pagamento feito por fora do boleto ou do Pix."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={settle.isPending}
            onClick={() => {
              setError(null);
              settle.mutate();
            }}
          >
            Confirmar baixa
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-line-soft rounded-md border border-line">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Contrato</dt>
            <dd className="font-mono text-[13px]">{charge?.contract_code}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Valor original</dt>
            <dd className="font-mono text-[13px] tabular">{money(charge?.gross_amount)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Vencimento</dt>
            <dd className="font-mono text-[13px]">{date(charge?.due_date)}</dd>
          </div>
        </dl>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Data do pagamento" required>
            <Input type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
          </Field>
          <Field label="Forma">
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              <option value="pix">Pix</option>
              <option value="transferencia">Transferência</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
              <option value="outro">Outro</option>
            </Select>
          </Field>
        </div>

        {late ? (
          <p className="rounded-md border border-caution/25 bg-caution-soft px-3 py-2 text-[12.5px] text-caution">
            Pagamento após o vencimento: multa e juros do contrato serão somados
            automaticamente à cobrança.
          </p>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}

function SecondCopyDialog({
  charge,
  onOpenChange,
}: {
  charge: Charge | null;
  onOpenChange: () => void;
}) {
  const [copied, setCopied] = React.useState<string | null>(null);

  async function copy(label: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <Dialog
      open={Boolean(charge)}
      onOpenChange={onOpenChange}
      title="Segunda via"
      description="Envie ao locatário a linha digitável ou o Pix copia-e-cola."
      footer={
        <Button variant="outline" onClick={onOpenChange}>
          Fechar
        </Button>
      }
    >
      <div className="space-y-4">
        <dl className="divide-y divide-line-soft rounded-md border border-line">
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Valor</dt>
            <dd className="font-mono text-[13px] tabular">{money(charge?.gross_amount)}</dd>
          </div>
          <div className="flex justify-between px-4 py-2.5">
            <dt className="text-[12px] text-muted">Vencimento</dt>
            <dd className="font-mono text-[13px]">{date(charge?.due_date)}</dd>
          </div>
        </dl>

        {charge?.boleto_line ? (
          <Field label="Linha digitável">
            <div className="flex gap-2">
              <Input readOnly value={charge.boleto_line} className="font-mono text-[12px]" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy("boleto", charge.boleto_line!)}
                aria-label="Copiar linha digitável"
              >
                {copied === "boleto" ? <Check /> : <Copy />}
              </Button>
            </div>
          </Field>
        ) : null}

        {charge?.pix_copy_paste ? (
          <Field label="Pix copia-e-cola">
            <div className="flex gap-2">
              <Input readOnly value={charge.pix_copy_paste} className="font-mono text-[12px]" />
              <Button
                variant="outline"
                size="icon"
                onClick={() => copy("pix", charge.pix_copy_paste!)}
                aria-label="Copiar código Pix"
              >
                {copied === "pix" ? <Check /> : <Copy />}
              </Button>
            </div>
          </Field>
        ) : null}
      </div>
    </Dialog>
  );
}

function DeductionDialog({
  payout,
  competence,
  onOpenChange,
  onSaved,
}: {
  payout: Payout | null;
  competence: string;
  onOpenChange: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      api.post("/billing/payouts/deductions", {
        owner_client_id: payout!.owner_client_id,
        reference_month: competence,
        amount,
        description,
      }),
    onSuccess: () => {
      onSaved();
      onOpenChange();
      setAmount("");
      setDescription("");
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog
      open={Boolean(payout)}
      onOpenChange={onOpenChange}
      title="Lançar desconto no repasse"
      description="Serviço pago pela imobiliária por conta do proprietário."
      footer={
        <>
          <Button variant="outline" onClick={onOpenChange}>
            Cancelar
          </Button>
          <Button
            loading={save.isPending}
            disabled={!amount || !description.trim()}
            onClick={() => {
              setError(null);
              save.mutate();
            }}
          >
            Lançar desconto
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-[13px] text-ink-soft">
          Proprietário: <strong className="font-medium">{payout?.owner_name}</strong>
        </p>
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
          <Field label="Descrição" required>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Troca da resistência do chuveiro"
            />
          </Field>
        </div>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
    </Dialog>
  );
}
