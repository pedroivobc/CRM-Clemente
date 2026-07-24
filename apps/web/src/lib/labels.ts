import type { PropertyStatus } from "./types";

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
  apartamento: "Apartamento",
  sala_comercial: "Sala comercial",
  loja: "Loja",
  galpao: "Galpão",
  terreno: "Terreno",
  sitio_chacara: "Sítio / chácara",
  outro: "Outro",
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
