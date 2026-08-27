import * as React from "react";

import { api } from "./api";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

/**
 * Depois do login, troca o `<link rel=manifest>`, o `<meta theme-color>` e
 * o favicon do painel para os do tenant. O usuário instala o PWA e o ícone
 * no launcher já é a marca da imobiliária dele.
 *
 * Se já instalou antes do branding chegar, precisa reinstalar — é
 * limitação do sistema operacional, não do nosso lado.
 */
export function useBrandedPwa(color: string | null | undefined, name: string | null | undefined) {
  React.useEffect(() => {
    if (!color && !name) return;
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Ícone SVG dinâmico da API — inclui iniciais e cor do tenant.
        const iconUrl = `${BASE}/api/v1/tenant/icon.svg`;
        const favicon = document.querySelector<HTMLLinkElement>("link[rel='icon']");
        if (favicon) favicon.href = iconUrl;

        if (color) {
          const themeColor = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
          if (themeColor) themeColor.setAttribute("content", color);
        }

        // Manifest: baixamos o JSON via API autenticada, transformamos em
        // blob URL e trocamos no <link>.
        const manifest = await api.get<Record<string, unknown>>("/tenant/manifest.webmanifest");
        const blob = new Blob([JSON.stringify(manifest)], {
          type: "application/manifest+json",
        });
        objectUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        const link = document.querySelector<HTMLLinkElement>("link[rel='manifest']");
        if (link) link.href = objectUrl;
      } catch {
        /* silencioso — o app funciona sem PWA branded */
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [color, name]);
}
