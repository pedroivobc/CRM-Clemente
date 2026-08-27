const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function money(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Sob consulta";
  return BRL.format(Number(value));
}

export function priceText(p: {
  purpose: string;
  sale_price: string | null;
  rent_price: string | null;
}): { value: string; per?: string } {
  if (p.purpose === "locacao" || (p.rent_price && !p.sale_price)) {
    return { value: money(p.rent_price), per: "/mês" };
  }
  return { value: money(p.sale_price || p.rent_price) };
}

export function localityText(addr: { bairro?: string; cidade?: string; uf?: string }): string {
  const first = [addr.bairro, addr.cidade].filter(Boolean).join(" · ");
  return first + (addr.uf ? ` — ${addr.uf}` : "");
}

export const KIND_LABELS: Record<string, string> = {
  casa: "Casa", casa_geminada: "Casa geminada", casa_condominio: "Casa em condomínio",
  sobrado: "Sobrado", apartamento: "Apartamento", cobertura: "Cobertura", kitnet: "Kitnet",
  studio: "Studio", flat: "Flat", garden: "Garden", loft: "Loft",
  sala_comercial: "Sala comercial", loja: "Loja", ponto_comercial: "Ponto comercial",
  galpao: "Galpão", andar_corporativo: "Andar corporativo", predio: "Prédio",
  hotel_pousada: "Hotel / pousada", terreno: "Terreno", lote_condominio: "Lote em condomínio",
  sitio_chacara: "Sítio / chácara", fazenda: "Fazenda", vaga_garagem: "Vaga de garagem",
  outro: "Outro",
};

export const PURPOSE_LABELS: Record<string, string> = {
  venda: "Comprar",
  locacao: "Alugar",
  ambos: "Comprar ou alugar",
};

export function kindLabel(k: string): string {
  return KIND_LABELS[k] ?? k;
}

export function specs(p: { bedrooms: number | null; parking: number | null; area: string | null }): string[] {
  const out: string[] = [];
  if (p.bedrooms) out.push(`${p.bedrooms} ${p.bedrooms === 1 ? "quarto" : "quartos"}`);
  if (p.parking) out.push(`${p.parking} ${p.parking === 1 ? "vaga" : "vagas"}`);
  if (p.area) out.push(`${Math.round(Number(p.area))} m²`);
  return out;
}
