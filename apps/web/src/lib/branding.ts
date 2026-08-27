import type { Branding } from "./types";

/** Luminância relativa (WCAG) — decide texto claro ou escuro sobre a cor. */
function luminance(hex: string): number {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(full.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function readableOn(hex: string): string {
  return luminance(hex) > 0.55 ? "#16181d" : "#ffffff";
}

/**
 * Aplica a identidade visual do tenant como CSS variables. Chamado assim que
 * o tenant é resolvido, antes mesmo do login, para que a tela de entrada já
 * apareça com a marca da imobiliária.
 */
export function applyBranding(branding: Branding) {
  const root = document.documentElement;
  root.style.setProperty("--brand-primary", branding.color_primary);
  root.style.setProperty("--brand-secondary", branding.color_secondary);
  root.style.setProperty("--brand-accent", branding.color_accent);
  root.style.setProperty("--brand-contrast", readableOn(branding.color_primary));

  document.title = branding.display_name;

  if (branding.favicon_url) {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = branding.favicon_url;
  }
}
