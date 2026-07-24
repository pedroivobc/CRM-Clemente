export type Branding = {
  display_name: string;
  logo_url: string | null;
  favicon_url: string | null;
  color_primary: string;
  color_secondary: string;
  color_accent: string;
};

export type TenantPublic = {
  tenant_id: string;
  name: string;
  plan: "venda" | "locacao" | "completo";
  subdomain: string;
  branding: Branding;
};

export type Me = {
  user_id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  tenant_name: string;
  plan: "venda" | "locacao" | "completo";
  roles: string[];
  permissions: string[];
  modules: string[];
};

export type Address = {
  cep?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export type Contact = {
  id: string;
  kind: "phone" | "whatsapp" | "email";
  value: string;
  is_primary: boolean;
};

export type Client = {
  id: string;
  kind: "PF" | "PJ";
  name: string;
  cpf_cnpj: string | null;
  cpf_cnpj_formatted: string | null;
  rg_ie: string | null;
  birth_date: string | null;
  address: Address;
  notes: string | null;
  roles: string[];
  contacts: Contact[];
  created_at: string;
};

export type ClientDocument = {
  id: string;
  doc_type: string;
  file_name: string;
  url: string;
  valid_until: string | null;
  expired: boolean;
  created_at: string;
};

export type Interaction = {
  id: string;
  channel: string;
  direction: string | null;
  summary: string;
  occurred_at: string;
  user_name: string | null;
};

export type Photo = {
  id: string;
  url: string | null;
  watermark_status: "pending" | "done" | "error";
  is_cover: boolean;
  sort_order: number;
};

export type PropertyOwner = {
  client_id: string;
  name: string;
  ownership_pct: string;
  is_payee: boolean;
};

export type PropertyStatus =
  | "captacao"
  | "disponivel"
  | "reservado"
  | "alugado"
  | "vendido"
  | "em_manutencao"
  | "inativo";

export type Property = {
  id: string;
  code: string;
  kind: string;
  purpose: "venda" | "locacao" | "ambos";
  status: PropertyStatus;
  title: string;
  description: string | null;
  address: Address;
  registry_number: string | null;
  iptu_code: string | null;
  features: Record<string, unknown>;
  sale_price: string | null;
  rent_price: string | null;
  condo_fee: string | null;
  iptu_amount: string | null;
  tour_url: string | null;
  cover_url: string | null;
  photos: Photo[];
  owners: PropertyOwner[];
  created_at: string;
};

export type FinanceEntry = {
  id: string;
  description: string;
  counterparty_id: string | null;
  counterparty_name: string | null;
  account_id: string | null;
  account_name: string | null;
  cost_center_id: string | null;
  due_date: string;
  competence_date: string;
  amount: string;
  status: "pendente" | "pago" | "recebido" | "cancelado";
  paid_at: string | null;
  paid_amount: string | null;
  overdue: boolean;
  notes: string | null;
  proof_url: string | null;
};

export type Account = {
  id: string;
  code: string;
  name: string;
  kind: "receita" | "despesa";
  active: boolean;
};

export type CostCenter = { id: string; name: string; active: boolean };

export type FinanceSummary = {
  a_receber: string;
  a_pagar: string;
  receber_vencido: string;
  pagar_vencido: string;
  recebido_mes: string;
  pago_mes: string;
  resultado_mes: string;
};

export type CashflowPoint = {
  day: string;
  entradas: string;
  saidas: string;
  saldo_dia: string;
  saldo_acumulado: string;
};

export type Cashflow = {
  days: number;
  saldo_projetado: string;
  series: CashflowPoint[];
};

export type DreRow = {
  month: string;
  kind: "receita" | "despesa";
  account: string;
  amount: string;
};

export type Dashboard = {
  plano: string;
  modulos: string[];
  cadastros: {
    clientes: number;
    imoveis: number;
    imoveis_disponiveis: number;
    imoveis_alugados: number;
    documentos_a_vencer: number;
  };
  financeiro: {
    a_receber: string;
    a_pagar: string;
    receber_vencidos: number;
    pagar_vencidos: number;
  };
  imoveis_por_status: { status: PropertyStatus; total: number }[];
};

export type Collaborator = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  status: "active" | "inactive";
  auth_user_id: string | null;
  roles: string[];
};

export type Role = {
  id: string;
  name: string;
  is_system: boolean;
  permissions: string[];
};

export type AuditEntry = {
  id: number;
  entity: string;
  entity_id: string | null;
  action: string;
  occurred_at: string;
  user_name: string | null;
};

export type ExpiringDocument = {
  id: string;
  doc_type: string;
  valid_until: string;
  client_id: string;
  client_name: string;
  days_left: number;
};
