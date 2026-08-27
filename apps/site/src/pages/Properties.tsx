import * as React from "react";
import { useSearchParams } from "react-router-dom";

import { useSite } from "../App";
import type { PublicPage } from "../api";
import { PropertyCard } from "../card";
import { kindLabel } from "../format";

type Filters = {
  purpose: string;
  kind: string;
  neighborhood: string;
  max_price: string;
  mcmv: string;
  sort: string;
};

const MCMV_LABELS: Record<string, string> = {
  faixa_1: "Faixa 1",
  faixa_2: "Faixa 2",
  faixa_3: "Faixa 3",
  faixa_4: "Faixa 4",
};

const SORTS = [
  { value: "recentes", label: "Mais recentes" },
  { value: "menor_preco", label: "Menor preço" },
  { value: "maior_preco", label: "Maior preço" },
  { value: "maior_area", label: "Maior área" },
];

const PAGE_SIZE = 12;

export function Properties() {
  const { config, api } = useSite();
  const [params, setParams] = useSearchParams();
  const filters: Filters = {
    purpose: params.get("purpose") ?? "",
    kind: params.get("kind") ?? "",
    neighborhood: params.get("neighborhood") ?? "",
    max_price: params.get("max_price") ?? "",
    mcmv: params.get("mcmv") ?? "",
    sort: params.get("sort") ?? "recentes",
  };

  const [page, setPage] = React.useState(1);
  const [items, setItems] = React.useState<PublicPage["items"]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setPage(1);
    setItems([]);
  }, [params]);

  React.useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams();
    q.set("page", String(page));
    q.set("page_size", String(PAGE_SIZE));
    q.set("sort", filters.sort);
    if (filters.purpose) q.set("purpose", filters.purpose);
    if (filters.kind) q.set("kind", filters.kind);
    if (filters.neighborhood) q.set("neighborhood", filters.neighborhood);
    if (filters.max_price) q.set("max_price", filters.max_price.replace(/\D/g, ""));
    if (filters.mcmv) q.set("mcmv", filters.mcmv);

    api
      .get<PublicPage>(`/properties?${q.toString()}`)
      .then((data) => {
        setTotal(data.total);
        setItems((prev) => (page === 1 ? data.items : [...prev, ...data.items]));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, page]);

  function update<K extends keyof Filters>(k: K, v: string) {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
  }

  return (
    <section className="section">
      <div className="container">
        <h2>Imóveis</h2>
        <div className="filters">
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Finalidade</label>
            <select value={filters.purpose} onChange={(e) => update("purpose", e.target.value)}>
              <option value="">Todas</option>
              <option value="venda">Comprar</option>
              <option value="locacao">Alugar</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Tipo</label>
            <select value={filters.kind} onChange={(e) => update("kind", e.target.value)}>
              <option value="">Todos</option>
              {config.facets.kinds.map((k) => (
                <option key={k} value={k}>
                  {kindLabel(k)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Bairro</label>
            <select
              value={filters.neighborhood}
              onChange={(e) => update("neighborhood", e.target.value)}
            >
              <option value="">Todos</option>
              {config.facets.neighborhoods.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Até (R$)</label>
            <input
              inputMode="numeric"
              placeholder="sem limite"
              value={filters.max_price}
              onChange={(e) => update("max_price", e.target.value)}
            />
          </div>
          {config.facets.mcmv_faixas.length > 0 ? (
            <div>
              <label style={{ fontSize: 11, color: "var(--muted)" }}>MCMV</label>
              <select value={filters.mcmv} onChange={(e) => update("mcmv", e.target.value)}>
                <option value="">Todos</option>
                <option value="qualquer">Qualquer faixa</option>
                {config.facets.mcmv_faixas.map((f) => (
                  <option key={f} value={f}>
                    {MCMV_LABELS[f] ?? f}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <div>
            <label style={{ fontSize: 11, color: "var(--muted)" }}>Ordenar</label>
            <select value={filters.sort} onChange={(e) => update("sort", e.target.value)}>
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && items.length === 0 ? (
          <div className="loading">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="empty">Nenhum imóvel encontrado com esses filtros.</div>
        ) : (
          <>
            <p className="count">
              {total} {total === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            </p>
            <div className="grid">
              {items.map((p) => (
                <PropertyCard key={p.code} item={p} />
              ))}
            </div>
            {items.length < total ? (
              <button
                className="btn secondary more"
                type="button"
                disabled={loading}
                onClick={() => setPage((n) => n + 1)}
              >
                {loading ? "Carregando…" : "Carregar mais"}
              </button>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
