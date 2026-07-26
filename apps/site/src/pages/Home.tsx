import * as React from "react";
import { useNavigate } from "react-router-dom";

import { useSite } from "../App";
import type { PublicPage } from "../api";
import { PropertyCard } from "../card";

/**
 * Página inicial: hero com busca rápida (que só monta a querystring e joga
 * para a listagem), destaques com os últimos publicados e uma faixa de
 * contato ao fim.
 */
export function Home() {
  const { config, api } = useSite();
  const nav = useNavigate();
  const [purpose, setPurpose] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [hood, setHood] = React.useState("");
  const [max, setMax] = React.useState("");
  const [highlights, setHighlights] = React.useState<PublicPage | null>(null);

  React.useEffect(() => {
    api.get<PublicPage>("/properties?page_size=6").then(setHighlights).catch(() => setHighlights(null));
  }, [api]);

  function search(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams();
    if (purpose) q.set("purpose", purpose);
    if (kind) q.set("kind", kind);
    if (hood) q.set("neighborhood", hood);
    if (max) q.set("max_price", max.replace(/\D/g, ""));
    nav(`/imoveis?${q.toString()}`);
  }

  return (
    <>
      <section className="hero">
        <div className="container">
          <h1>{config.headline || "Encontre o imóvel certo pra você"}</h1>
          <p>
            Casas e apartamentos selecionados por quem conhece a cidade. Fale conosco pelo canal
            que preferir.
          </p>
          <form className="searchbox" onSubmit={search}>
            <div>
              <label>Finalidade</label>
              <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="">Todas</option>
                <option value="venda">Comprar</option>
                <option value="locacao">Alugar</option>
              </select>
            </div>
            <div>
              <label>Tipo</label>
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="">Todos</option>
                {config.facets.kinds.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Bairro</label>
              <select value={hood} onChange={(e) => setHood(e.target.value)}>
                <option value="">Todos</option>
                {config.facets.neighborhoods.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label>Até (R$)</label>
              <input
                inputMode="numeric"
                placeholder="sem limite"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </div>
            <button className="btn" type="submit">
              Buscar
            </button>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>Destaques</h2>
          {highlights === null ? (
            <div className="loading">Carregando…</div>
          ) : highlights.items.length === 0 ? (
            <div className="empty">Nenhum imóvel publicado ainda.</div>
          ) : (
            <>
              <div className="grid">
                {highlights.items.map((p) => (
                  <PropertyCard key={p.code} item={p} />
                ))}
              </div>
              <button className="btn secondary more" type="button" onClick={() => nav("/imoveis")}>
                Ver todos os imóveis
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
