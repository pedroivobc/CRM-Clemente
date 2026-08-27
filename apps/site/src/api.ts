/*
 * Cliente da API pública. Uma vez descoberta a chave (por host ou por env), o
 * resto do site só sabe conversar com `/public/{key}/*` — não existe fallback
 * para a API autenticada, e é essa a garantia de que aqui nada vaza.
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export async function resolveKey(): Promise<string> {
  const forced = import.meta.env.VITE_PUBLIC_KEY as string | undefined;
  if (forced) return forced;

  const host = window.location.host;
  const resp = await fetch(`${API_BASE}/public/by-host?host=${encodeURIComponent(host)}`);
  if (!resp.ok) throw new Error("Vitrine não encontrada para este endereço.");
  const data = (await resp.json()) as { public_key: string };
  return data.public_key;
}

export function makeClient(key: string) {
  const base = `${API_BASE}/public/${encodeURIComponent(key)}`;
  async function get<T>(path: string): Promise<T> {
    const resp = await fetch(base + path);
    if (!resp.ok) throw new Error(`Erro ${resp.status} em ${path}`);
    return (await resp.json()) as T;
  }
  async function post<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Erro ${resp.status} em ${path}`);
    return (await resp.json()) as T;
  }
  return { get, post };
}

export type Facets = {
  purposes: string[];
  kinds: string[];
  cities: string[];
  neighborhoods: string[];
  price_min: string | null;
  price_max: string | null;
  mcmv_faixas: string[];
};

export type ShowcaseConfig = {
  display_name: string;
  color_primary: string | null;
  color_secondary: string | null;
  color_accent: string | null;
  logo_url: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  headline: string | null;
  lead_capture_enabled: boolean;
  facets: Facets;
};

export type PropertyAddress = {
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type PublicCard = {
  code: string;
  slug: string | null;
  kind: string;
  purpose: string;
  title: string;
  address: PropertyAddress;
  sale_price: string | null;
  rent_price: string | null;
  condo_fee: string | null;
  bedrooms: number | null;
  parking: number | null;
  area: string | null;
  pet_allowed: boolean | null;
  republic_allowed: boolean | null;
  has_leisure_area: boolean | null;
  mcmv_faixa: "faixa_1" | "faixa_2" | "faixa_3" | "faixa_4" | null;
  cover_url: string | null;
  whatsapp_url: string | null;
};

export type PublicDetail = PublicCard & {
  description: string | null;
  usage_type: string;
  iptu_amount: string | null;
  year_built: number | null;
  floors: number | null;
  unit_floor: number | null;
  suites: number | null;
  bathrooms: number | null;
  rental_warranties: string[];
  tour_url: string | null;
  video_url: string | null;
  video_embed: string | null;
  mcmv_parcela_estimada: string | null;
  photos: string[];
};

export type McmvSim = {
  faixa: string;
  faixa_nome: string;
  valor_imovel: string;
  entrada: string;
  financiado: string;
  prazo_meses: number;
  taxa_anual: string;
  parcela_estimada: string;
  renda_minima_sugerida: string;
  cabe_na_renda: boolean;
};

export type PublicPage = {
  items: PublicCard[];
  total: number;
  page: number;
  page_size: number;
};
