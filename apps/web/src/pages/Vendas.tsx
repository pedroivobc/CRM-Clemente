import { Card, PageHeader } from "@/components/ui";

/**
 * Casca do módulo de Vendas: a rota existe e só aparece para quem contratou o
 * módulo. O funil, as propostas e os negócios chegam em fase posterior.
 */
export function Vendas() {
  const steps = [
    "Captação do imóvel",
    "Atendimento ao comprador",
    "Visita",
    "Proposta",
    "Contrato",
  ];

  return (
    <>
      <PageHeader
        eyebrow="Módulo"
        title="Vendas"
        description="O módulo está contratado e será liberado em breve."
      />

      <Card>
        <div className="px-6 py-10">
          <p className="max-w-xl text-[14px] leading-relaxed text-ink-soft">
            O funil de vendas seguirá as mesmas etapas que a equipe já usa no dia a dia, com
            propostas, contraproposta e fechamento ligados ao cadastro de imóveis e clientes que
            você já mantém aqui.
          </p>

          <ol className="mt-8 grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-5">
            {steps.map((step, index) => (
              <li key={step} className="bg-surface px-4 py-5">
                <span className="font-mono text-[11px] text-muted">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <p className="mt-1 text-[13px] font-medium text-ink">{step}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-[13px] text-muted">
            Enquanto isso, imóveis com finalidade de venda já podem ser cadastrados normalmente em
            Imóveis.
          </p>
        </div>
      </Card>
    </>
  );
}
