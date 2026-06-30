export interface ItbiTransacao {
  id: string;
  inscricao: string;
  percentual: number;
  cep: string;
  tipo_via: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  natureza: string;
  valor: number;
  data: string;
  ano: number;
  mes: number;
  agente_sfh: boolean;
  tipologia_proxy: string;
  is_mercado: boolean;
  dedup_hash: string;
  import_id: string;
  created_at: string;
}

export interface KpiData {
  totalTransacoes: number;
  volumeTotal: number;
  ticketMedio: number;
  totalBairros: number;
  transacoesCompraVenda: number;
  volumeCompraVenda: number;
}

export interface BairroStats {
  bairro: string;
  count: number;
  volume: number;
  ticketMedio: number;
}

export interface MesStats {
  mes: string;
  count: number;
  volume: number;
  ticketMedio: number;
}

export interface TipologiaStats {
  tipologia: string;
  count: number;
  volume: number;
  ticketMedio: number;
}

export interface FaixaValorStats {
  faixa: string;
  count: number;
  min: number;
  max: number;
}
