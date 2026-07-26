import * as React from "react";

import { useSite } from "../App";

export function Contact() {
  const { config, api } = useSite();
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
      await api.post("/leads", form);
      setSent(true);
      setForm({ name: "", phone: "", email: "", message: "", website: "" });
    } catch {
      setError("Não foi possível enviar. Tente pelo WhatsApp.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="section">
      <div className="container contact-page">
        <div className="info">
          <h1>Fale conosco</h1>
          <p>Deixe uma mensagem ou nos chame pelo canal que preferir. Respondemos rápido.</p>
          {config.whatsapp ? (
            <div className="line">
              <span>WhatsApp</span>
              <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noopener">
                {config.whatsapp}
              </a>
            </div>
          ) : null}
          {config.phone ? (
            <div className="line">
              <span>Telefone</span>
              <a href={`tel:${config.phone.replace(/\D/g, "")}`}>{config.phone}</a>
            </div>
          ) : null}
          {config.email ? (
            <div className="line">
              <span>E-mail</span>
              <a href={`mailto:${config.email}`}>{config.email}</a>
            </div>
          ) : null}
        </div>

        {config.lead_capture_enabled ? (
          <form className="contact-card" onSubmit={submit} style={{ position: "static" }}>
            <h3>Enviar mensagem</h3>
            <div className="lead">
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
                placeholder="Como podemos ajudar?" value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
              />
              <input
                className="honeypot" tabIndex={-1} autoComplete="off"
                value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
              {sent ? <p className="ok">Recebido! Em breve entramos em contato.</p> : (
                <button className="btn" type="submit" disabled={loading}>
                  {loading ? "Enviando…" : "Enviar"}
                </button>
              )}
              {error ? <p style={{ color: "#b42318", fontSize: 13 }}>{error}</p> : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
