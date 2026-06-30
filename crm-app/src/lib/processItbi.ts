import type {
  ItbiTransacao,
  KpiData,
  BairroStats,
  MesStats,
  TipologiaStats,
  FaixaValorStats,
} from "@/types/itbi";

const MESES: Record<number, string> = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez",
};

export function computeKpis(data: ItbiTransacao[]): KpiData {
  const mercado = data.filter((t) => t.is_mercado);
  const compraVenda = mercado.filter((t) => t.natureza === "COMPRA E VENDA");

  const volumeTotal = mercado.reduce((s, t) => s + t.valor, 0);
  const volumeCV = compraVenda.reduce((s, t) => s + t.valor, 0);
  const bairros = new Set(mercado.map((t) => t.bairro).filter(Boolean));

  return {
    totalTransacoes: mercado.length,
    volumeTotal,
    ticketMedio: mercado.length ? volumeTotal / mercado.length : 0,
    totalBairros: bairros.size,
    transacoesCompraVenda: compraVenda.length,
    volumeCompraVenda: volumeCV,
  };
}

export function computeBairros(
  data: ItbiTransacao[],
  top = 20
): BairroStats[] {
  const map: Record<string, { count: number; volume: number }> = {};
  data
    .filter((t) => t.is_mercado && t.bairro)
    .forEach((t) => {
      if (!map[t.bairro]) map[t.bairro] = { count: 0, volume: 0 };
      map[t.bairro].count++;
      map[t.bairro].volume += t.valor;
    });

  return Object.entries(map)
    .map(([bairro, { count, volume }]) => ({
      bairro,
      count,
      volume,
      ticketMedio: volume / count,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, top);
}

export function computeMensal(data: ItbiTransacao[]): MesStats[] {
  const map: Record<string, { count: number; volume: number; ano: number; mes: number }> = {};
  data
    .filter((t) => t.is_mercado)
    .forEach((t) => {
      const key = `${t.ano}-${String(t.mes).padStart(2, "0")}`;
      if (!map[key]) map[key] = { count: 0, volume: 0, ano: t.ano, mes: t.mes };
      map[key].count++;
      map[key].volume += t.valor;
    });

  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, { count, volume, ano, mes }]) => ({
      mes: `${MESES[mes]}/${String(ano).slice(2)}`,
      count,
      volume,
      ticketMedio: volume / count,
    }));
}

export function computeTipologia(data: ItbiTransacao[]): TipologiaStats[] {
  const map: Record<string, { count: number; volume: number }> = {};
  data
    .filter((t) => t.is_mercado)
    .forEach((t) => {
      const tipo = t.tipologia_proxy || "outros";
      if (!map[tipo]) map[tipo] = { count: 0, volume: 0 };
      map[tipo].count++;
      map[tipo].volume += t.valor;
    });

  return Object.entries(map)
    .map(([tipologia, { count, volume }]) => ({
      tipologia: formatTipologia(tipologia),
      count,
      volume,
      ticketMedio: volume / count,
    }))
    .sort((a, b) => b.count - a.count);
}

export function computeFaixas(data: ItbiTransacao[]): FaixaValorStats[] {
  const faixas = [
    { faixa: "Até 150k", min: 0, max: 150000 },
    { faixa: "150k–300k", min: 150000, max: 300000 },
    { faixa: "300k–500k", min: 300000, max: 500000 },
    { faixa: "500k–800k", min: 500000, max: 800000 },
    { faixa: "800k–1,5M", min: 800000, max: 1500000 },
    { faixa: "Acima de 1,5M", min: 1500000, max: Infinity },
  ];

  return faixas.map(({ faixa, min, max }) => ({
    faixa,
    min,
    max,
    count: data.filter(
      (t) => t.is_mercado && t.valor >= min && t.valor < max
    ).length,
  }));
}

function formatTipologia(t: string): string {
  const map: Record<string, string> = {
    apartamento: "Apartamento",
    terreno_ou_outros: "Terreno / Outros",
    casa: "Casa",
  };
  return map[t] ?? t;
}
