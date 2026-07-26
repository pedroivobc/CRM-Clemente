import * as React from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { makeClient, resolveKey, type ShowcaseConfig } from "./api";
import { SiteChrome } from "./chrome";
import { Home } from "./pages/Home";
import { Properties } from "./pages/Properties";
import { PropertyDetail } from "./pages/PropertyDetail";
import { Contact } from "./pages/Contact";

// Injetamos a cor primária do tenant como variável CSS assim que o /showcase
// responde, para que o site inteiro se pinte sozinho — não precisa build por
// imobiliária.
function applyBrand(color: string | null | undefined) {
  if (!color) return;
  document.documentElement.style.setProperty("--brand", color);
}

type Ctx = { config: ShowcaseConfig; api: ReturnType<typeof makeClient> };
export const SiteCtx = React.createContext<Ctx | null>(null);
export function useSite(): Ctx {
  const c = React.useContext(SiteCtx);
  if (!c) throw new Error("useSite fora do provider");
  return c;
}

export function App() {
  const [state, setState] = React.useState<{ ctx: Ctx | null; error: string | null }>({
    ctx: null,
    error: null,
  });

  React.useEffect(() => {
    (async () => {
      try {
        const key = await resolveKey();
        const api = makeClient(key);
        const config = await api.get<ShowcaseConfig>("/showcase");
        applyBrand(config.color_primary);
        document.title = config.display_name;
        setState({ ctx: { config, api }, error: null });
      } catch (e) {
        setState({ ctx: null, error: (e as Error).message });
      }
    })();
  }, []);

  if (state.error) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh", padding: 24 }}>
        <div style={{ textAlign: "center", color: "var(--muted)" }}>
          <h1 style={{ margin: "0 0 8px", fontSize: 22 }}>Vitrine indisponível</h1>
          <p>{state.error}</p>
        </div>
      </div>
    );
  }
  if (!state.ctx) {
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <p style={{ color: "var(--muted)" }}>Carregando…</p>
      </div>
    );
  }

  return (
    <SiteCtx.Provider value={state.ctx}>
      <SiteChrome>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/imoveis" element={<Properties />} />
          <Route path="/imoveis/:slug" element={<PropertyDetail />} />
          <Route path="/contato" element={<Contact />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SiteChrome>
    </SiteCtx.Provider>
  );
}
