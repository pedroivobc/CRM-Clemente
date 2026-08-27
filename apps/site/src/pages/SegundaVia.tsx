import * as React from "react";
import { useParams } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

type MagicOut = {
  kind: string;
  tenant_display_name: string;
  tenant_color_primary: string | null;
  tenant_logo_url: string | null;
  tenant_whatsapp: string | null;
  charge: {
    id: string;
    competence: string;
    due_date: string;
    amount: string;
    boleto_line: string | null;
    boleto_url: string | null;
    pix_copy_paste: string | null;
    pix_qrcode: string | null;
  };
};

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * 2ª via aberta pelo link mágico do WhatsApp.
 *
 * Auto-suficiente: puxa o branding do tenant do próprio payload, então a
 * página abre bonita mesmo antes de qualquer outro dado do site carregar.
 */
export function SegundaVia() {
  const { token = "" } = useParams();
  const [data, setData] = React.useState<MagicOut | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch(`${API_BASE}/public/magic/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : r.json().then((body) => Promise.reject(body))))
      .then((payload: MagicOut) => {
        setData(payload);
        if (payload.tenant_color_primary) {
          document.documentElement.style.setProperty("--brand", payload.tenant_color_primary);
        }
        document.title = `2ª via — ${payload.tenant_display_name}`;
      })
      .catch((body) => {
        setError(
          body?.detail === "Link expirou"
            ? "Este link já expirou. Peça uma nova 2ª via para a imobiliária."
            : "Não foi possível abrir sua 2ª via.",
        );
      });
  }, [token]);

  async function copy(kind: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* clipboard indisponível — o campo mostra o valor pra copiar manual */
    }
  }

  if (error) {
    return (
      <div className="second-via">
        <div className="sv-card sv-empty">
          <h1>2ª via</h1>
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="second-via">
        <p className="sv-loading">Carregando sua 2ª via…</p>
      </div>
    );
  }

  const competence = new Date(data.charge.competence + "T00:00:00");
  const due = new Date(data.charge.due_date + "T00:00:00");
  const amount = Number(data.charge.amount);

  return (
    <div className="second-via">
      <div className="sv-card">
        <header className="sv-header">
          {data.tenant_logo_url ? (
            <img src={data.tenant_logo_url} alt={data.tenant_display_name} />
          ) : (
            <span className="sv-badge">{data.tenant_display_name}</span>
          )}
          <div>
            <p className="sv-eyebrow">2ª via de aluguel</p>
            <h1>{data.tenant_display_name}</h1>
          </div>
        </header>

        <dl className="sv-numbers">
          <div className="sv-amount">
            <dt>Valor</dt>
            <dd>{BRL.format(amount)}</dd>
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{due.toLocaleDateString("pt-BR")}</dd>
          </div>
          <div>
            <dt>Competência</dt>
            <dd>
              {competence.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
            </dd>
          </div>
        </dl>

        {data.charge.pix_copy_paste ? (
          <section className="sv-block">
            <div className="sv-label">Pix copia-e-cola</div>
            <div className="sv-inline">
              <code>{data.charge.pix_copy_paste}</code>
              <button
                className="sv-btn"
                onClick={() => copy("pix", data.charge.pix_copy_paste!)}
              >
                {copied === "pix" ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </section>
        ) : null}

        {data.charge.boleto_line ? (
          <section className="sv-block">
            <div className="sv-label">Linha digitável do boleto</div>
            <div className="sv-inline">
              <code>{data.charge.boleto_line}</code>
              <button
                className="sv-btn"
                onClick={() => copy("boleto", data.charge.boleto_line!)}
              >
                {copied === "boleto" ? "Copiado!" : "Copiar"}
              </button>
            </div>
            {data.charge.boleto_url ? (
              <a className="sv-link" href={data.charge.boleto_url} target="_blank" rel="noopener">
                Abrir boleto em PDF ↗
              </a>
            ) : null}
          </section>
        ) : null}

        {data.tenant_whatsapp ? (
          <p className="sv-hint">
            Alguma dúvida? Fale com a imobiliária pelo WhatsApp {data.tenant_whatsapp}.
          </p>
        ) : null}
        <p className="sv-fine">
          Este link é temporário — solicite uma nova 2ª via se precisar novamente.
        </p>
      </div>
    </div>
  );
}
