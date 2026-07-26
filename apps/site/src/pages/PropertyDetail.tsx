import * as React from "react";
import { Link, useParams } from "react-router-dom";

import { useSite } from "../App";
import type { PublicDetail } from "../api";
import { kindLabel, localityText, money, priceText, specs } from "../format";
// priceText usado no ContactSidebar

export function PropertyDetail() {
  const { slug = "" } = useParams();
  const { api } = useSite();
  const [item, setItem] = React.useState<PublicDetail | null | "missing">(null);

  React.useEffect(() => {
    setItem(null);
    api
      .get<PublicDetail>(`/properties/${encodeURIComponent(slug)}`)
      .then(setItem)
      .catch(() => setItem("missing"));
  }, [api, slug]);

  if (item === null) return <div className="loading">Carregando…</div>;
  if (item === "missing")
    return (
      <div className="empty">
        Imóvel não encontrado. <Link to="/imoveis">Ver outros imóveis</Link>
      </div>
    );

  const chips = [
    ...specs(item),
    item.suites ? `${item.suites} suíte(s)` : null,
    item.bathrooms ? `${item.bathrooms} banheiro(s)` : null,
    item.year_built ? `Ano ${item.year_built}` : null,
  ].filter(Boolean) as string[];

  return (
    <section className="detail">
      <div className="container">
        <p className="code">{item.code} · {kindLabel(item.kind)}</p>
        <h1>{item.title}</h1>
        <p className="loc">{localityText(item.address)}</p>

        <div className="gallery">
          {item.photos.length > 0 ? (
            item.photos.slice(0, 3).map((url, i) => (
              <img key={i} src={url} alt={`Foto ${i + 1} de ${item.code}`} />
            ))
          ) : (
            <div className="noimg">Fotos em breve</div>
          )}
        </div>

        <div className="detail-grid">
          <div>
            <div className="chips">
              {chips.map((c) => (
                <span key={c} className="chip">{c}</span>
              ))}
            </div>

            {item.description ? (
              <>
                <h2>Descrição</h2>
                <p className="desc">{item.description}</p>
              </>
            ) : null}

            <h2>Ficha do imóvel</h2>
            <dl className="dl">
              <div><dt>Tipo</dt><dd>{kindLabel(item.kind)}</dd></div>
              <div><dt>Finalidade</dt><dd>{item.purpose === "locacao" ? "Aluguel" : "Venda"}</dd></div>
              {item.area ? <div><dt>Área útil</dt><dd>{Math.round(Number(item.area))} m²</dd></div> : null}
              {item.bedrooms ? <div><dt>Quartos</dt><dd>{item.bedrooms}</dd></div> : null}
              {item.parking ? <div><dt>Vagas</dt><dd>{item.parking}</dd></div> : null}
              {item.condo_fee ? <div><dt>Condomínio</dt><dd>{money(item.condo_fee)}</dd></div> : null}
              {item.iptu_amount ? <div><dt>IPTU</dt><dd>{money(item.iptu_amount)}</dd></div> : null}
              {item.floors ? <div><dt>Andares</dt><dd>{item.floors}</dd></div> : null}
              {item.unit_floor ? <div><dt>Andar da unidade</dt><dd>{item.unit_floor}º</dd></div> : null}
            </dl>

            {item.rental_warranties.length > 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 12 }}>
                Garantias aceitas: {item.rental_warranties.join(", ")}.
              </p>
            ) : null}
          </div>

          <ContactSidebar item={item} />
        </div>
      </div>
    </section>
  );
}

function ContactSidebar({ item }: { item: PublicDetail }) {
  const { config, api } = useSite();
  const price = priceText(item);
  const [form, setForm] = React.useState({
    name: "", phone: "", email: "", message: "", website: "",
  });
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/leads", {
        ...form,
        interest: item.purpose === "locacao" ? "locacao" : "venda",
        property_code: item.code,
      });
      setSent(true);
      setForm({ name: "", phone: "", email: "", message: "", website: "" });
    } catch {
      setError("Não foi possível enviar. Tente pelo WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <aside className="contact-card">
      <h3>{item.code}</h3>
      <div className="price">
        {price.value}
        {price.per ? <small> {price.per}</small> : null}
      </div>
      <div className="actions">
        {item.whatsapp_url ? (
          <a className="btn wa" href={item.whatsapp_url} target="_blank" rel="noopener">
            Falar no WhatsApp
          </a>
        ) : null}
        {config.phone ? (
          <a className="btn ghost" href={`tel:${config.phone.replace(/\D/g, "")}`}>
            Ligar {config.phone}
          </a>
        ) : null}
      </div>

      {config.lead_capture_enabled ? (
        <form className="lead" onSubmit={submit}>
          <h4>Deixe seu contato</h4>
          <input
            required placeholder="Seu nome" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            required placeholder="Telefone / WhatsApp" value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <input
            placeholder="E-mail (opcional)" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <textarea
            placeholder="Mensagem (opcional)" value={form.message}
            onChange={(e) => setForm({ ...form, message: e.target.value })}
          />
          <input
            className="honeypot" tabIndex={-1} autoComplete="off"
            value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
          />
          {sent ? <p className="ok">Recebido! Em breve entramos em contato.</p> : (
            <button className="btn" type="submit" disabled={loading}>
              {loading ? "Enviando…" : "Enviar mensagem"}
            </button>
          )}
          {error ? <p style={{ color: "#b42318", fontSize: 13 }}>{error}</p> : null}
        </form>
      ) : null}
    </aside>
  );
}
