import type { Condition, PropertyStatus, TicketStatus } from "./types";

/**
 * As cores precisam ser distinguíveis lado a lado na barra da carteira —
 * por isso ocupam matizes separados, e não tons vizinhos do mesmo laranja.
 */
export const PROPERTY_STATUS: Record<PropertyStatus, { label: string; color: string }> = {
  captacao: { label: "Em captação", color: "#7c3aed" },
  disponivel: { label: "Disponível", color: "#0e7c66" },
  reservado: { label: "Reservado", color: "#ea580c" },
  alugado: { label: "Alugado", color: "#1d4ed8" },
  vendido: { label: "Vendido", color: "#0f172a" },
  em_manutencao: { label: "Em manutenção", color: "#64748b" },
  inativo: { label: "Inativo", color: "#cbd5e1" },
};

export const PROPERTY_KINDS: Record<string, string> = {
  casa: "Casa",
  casa_geminada: "Casa geminada",
  casa_condominio: "Casa em condomínio",
  sobrado: "Sobrado",
  apartamento: "Apartamento",
  cobertura: "Cobertura",
  kitnet: "Kitnet",
  studio: "Studio",
  flat: "Flat",
  garden: "Garden",
  loft: "Loft",
  sala_comercial: "Sala comercial",
  loja: "Loja",
  ponto_comercial: "Ponto comercial",
  galpao: "Galpão",
  andar_corporativo: "Andar corporativo",
  predio: "Prédio",
  hotel_pousada: "Hotel / pousada",
  terreno: "Terreno",
  lote_condominio: "Lote em condomínio",
  sitio_chacara: "Sítio / chácara",
  fazenda: "Fazenda",
  vaga_garagem: "Vaga de garagem",
  outro: "Outro",
};

export const MCMV_FAIXAS: Record<
  "faixa_1" | "faixa_2" | "faixa_3" | "faixa_4",
  { label: string; hint: string }
> = {
  faixa_1: { label: "Faixa 1", hint: "Renda até R$ 2.850 · imóvel até R$ 264 mil" },
  faixa_2: { label: "Faixa 2", hint: "Renda até R$ 4.700 · imóvel até R$ 264 mil" },
  faixa_3: { label: "Faixa 3", hint: "Renda até R$ 8.600 · imóvel até R$ 350 mil" },
  faixa_4: { label: "Faixa 4", hint: "Renda até R$ 12.000 · imóvel até R$ 500 mil" },
};

export const ADDRESS_VISIBILITY: Record<string, { label: string; hint: string }> = {
  completo: { label: "Endereço completo", hint: "Rua, número e complemento aparecem" },
  rua: { label: "Só a rua", hint: "Mostra a rua, esconde o número" },
  bairro: { label: "Só o bairro", hint: "Mostra apenas bairro, cidade e UF" },
};

export const RENTAL_WARRANTIES: Record<string, string> = {
  caucao: "Caução",
  fiador: "Fiador",
  seguro_fianca: "Seguro-fiança",
  titulo_capitalizacao: "Título de capitalização",
};

export const PURPOSES: Record<string, string> = {
  venda: "Venda",
  locacao: "Locação",
  ambos: "Venda e locação",
};

export const CLIENT_ROLES: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  fiador: "Fiador",
  comprador: "Comprador",
  vendedor: "Vendedor",
  lead: "Lead",
  fornecedor: "Fornecedor",
};

export const CHANNELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  email: "E-mail",
  visita: "Visita",
  proposta: "Proposta",
  chamado: "Chamado",
  nota: "Anotação",
};

export const AUDIT_ACTIONS: Record<string, string> = {
  create: "criou",
  update: "editou",
  delete: "excluiu",
  settle: "baixou",
  cancel: "cancelou",
  deactivate: "desativou",
  upload_logo: "trocou o logo de",
  upload_favicon: "trocou o favicon de",
};

export const AUDIT_ENTITIES: Record<string, string> = {
  client: "cliente",
  property: "imóvel",
  user: "colaborador",
  payable: "conta a pagar",
  receivable: "conta a receber",
  tenant_branding: "identidade visual",
};

/* ── Vendas ───────────────────────────────────────────────────────────── */

export const FINANCING_TYPES: Record<string, string> = {
  a_vista: "À vista",
  financiamento: "Financiamento",
  fgts: "FGTS",
  consorcio: "Consórcio",
  permuta: "Permuta",
  misto: "Misto",
};

export const SALES_SOURCES: Record<string, string> = {
  portal: "Portal de imóveis",
  site: "Site da imobiliária",
  indicacao: "Indicação",
  balcao: "Balcão",
  placa: "Placa no imóvel",
  whatsapp: "WhatsApp",
};

export const PROPOSAL_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "positive" | "caution" | "critical" | "brand" }
> = {
  aberta: { label: "Aberta", tone: "brand" },
  contraproposta: { label: "Contraproposta", tone: "caution" },
  aceita: { label: "Aceita", tone: "positive" },
  recusada: { label: "Recusada", tone: "critical" },
  expirada: { label: "Expirada", tone: "neutral" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};

export const DEAL_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "positive" | "caution" | "critical" }
> = {
  em_andamento: { label: "Em andamento", tone: "caution" },
  concluido: { label: "Concluído", tone: "positive" },
  cancelado: { label: "Cancelado", tone: "critical" },
};

export const COMMISSION_BENEFICIARIES: Record<string, string> = {
  agency: "Imobiliária",
  lister: "Corretor captador",
  seller_broker: "Corretor vendedor",
  partner: "Parceiro",
};

/* ── Operação ─────────────────────────────────────────────────────────── */

/**
 * A escala de conservação vai do melhor ao pior e é lida de relance na tela
 * do vistoriador — por isso cada degrau tem cor própria, e não tons vizinhos.
 */
export const CONDITIONS: { key: Condition; label: string; color: string }[] = [
  { key: "otimo", label: "Ótimo", color: "#0e7c66" },
  { key: "bom", label: "Bom", color: "#1d4ed8" },
  { key: "regular", label: "Regular", color: "#a1560a" },
  { key: "ruim", label: "Ruim", color: "#b42318" },
];

export const CONDITION_LABELS: Record<string, string> = Object.fromEntries(
  CONDITIONS.map((c) => [c.key, c.label]),
);

export const INSPECTION_KINDS: Record<string, string> = {
  entrada: "Entrada",
  saida: "Saída",
  periodica: "Periódica",
};

export const INSPECTION_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "positive" | "caution" | "critical" | "brand" }
> = {
  agendada: { label: "Agendada", tone: "neutral" },
  em_andamento: { label: "Em andamento", tone: "brand" },
  concluida: { label: "Concluída", tone: "positive" },
  cancelada: { label: "Cancelada", tone: "neutral" },
};

export const METERS: Record<string, string> = { agua: "Água", luz: "Luz", gas: "Gás" };

export const RESPONSIBILITIES: Record<string, string> = {
  locatario: "Locatário",
  proprietario: "Proprietário",
  indefinido: "A definir",
};

export const SPECIALTIES: Record<string, string> = {
  pintura: "Pintura",
  eletrica: "Elétrica",
  hidraulica: "Hidráulica",
  reforma: "Reforma",
  marcenaria: "Marcenaria",
  chaveiro: "Chaveiro",
  limpeza: "Limpeza",
  jardinagem: "Jardinagem",
  ar_condicionado: "Ar-condicionado",
  gas: "Gás",
  outro: "Outro",
};

export const TICKET_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "positive" | "caution" | "critical" | "brand" }
> = {
  aberto: { label: "Aberto", tone: "brand" },
  triagem: { label: "Em triagem", tone: "brand" },
  orcamento: { label: "Orçando", tone: "caution" },
  aprovacao: { label: "Aguardando aprovação", tone: "caution" },
  execucao: { label: "Em execução", tone: "brand" },
  concluido: { label: "Concluído", tone: "positive" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};

/** A ordem é a do fluxo do chamado, usada na trilha de etapas da tela. */
export const TICKET_FLOW: TicketStatus[] = [
  "aberto",
  "triagem",
  "orcamento",
  "aprovacao",
  "execucao",
  "concluido",
];

export const PRIORITIES: Record<
  string,
  { label: string; tone: "neutral" | "caution" | "critical" }
> = {
  baixa: { label: "Baixa", tone: "neutral" },
  normal: { label: "Normal", tone: "neutral" },
  alta: { label: "Alta", tone: "caution" },
  urgente: { label: "Urgente", tone: "critical" },
};

export const PAYERS: Record<string, string> = {
  proprietario: "Proprietário",
  locatario: "Locatário",
  imobiliaria: "Imobiliária",
};
