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

/* ── Locação ──────────────────────────────────────────────────────────── */

export type Stage = {
  id: string;
  key: string;
  name: string;
  sort_order: number;
  sla_hours: number | null;
  is_won: boolean;
};

export type Lead = {
  id: string;
  stage_id: string;
  stage_name: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  client_id: string | null;
  client_name: string | null;
  property_id: string | null;
  property_code: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  status: "aberto" | "ganho" | "perdido";
  loss_reason: string | null;
  notes: string | null;
  stage_since: string;
  hours_in_stage: number;
  sla_hours: number | null;
  sla_breached: boolean;
  created_at: string;
};

export type Board = { pipeline_id: string; stages: Stage[]; leads: Lead[] };

export type LossReason = { id: string; name: string };

export type ContractParty = {
  client_id: string;
  name: string;
  role: "locatario" | "locador" | "fiador";
  is_payee: boolean;
  share_pct: string;
  wallet_id: string | null;
};

export type Contract = {
  id: string;
  code: string;
  property_id: string;
  property_code: string;
  property_title: string;
  rent_amount: string;
  condo_fee: string;
  iptu_amount: string;
  insurance_amount: string;
  total_monthly: string;
  admin_fee_pct: string;
  admin_fee_amount: string;
  price_index: "IGPM" | "IPCA";
  start_date: string;
  end_date: string;
  due_day: number;
  guarantee_type: string | null;
  guarantee_amount: string | null;
  late_fine_pct: string;
  daily_interest_pct: string;
  punctuality_discount: string;
  status: "rascunho" | "em_assinatura" | "ativo" | "encerrado" | "cancelado";
  signed_doc_path: string | null;
  last_adjustment_at: string | null;
  next_adjustment_at: string;
  adjustment_due: boolean;
  days_to_expiry: number;
  parties: ContractParty[];
  notes: string | null;
  created_at: string;
};

export type ChargeItem = {
  kind: string;
  description: string | null;
  amount: string;
  beneficiary: "owner" | "agency";
};

export type ChargeSplit = {
  beneficiary: "agency" | "owner";
  client_id: string | null;
  wallet_id: string | null;
  amount: string;
};

export type Charge = {
  id: string;
  contract_id: string;
  contract_code: string;
  property_code: string;
  tenant_name: string | null;
  competence: string;
  due_date: string;
  gross_amount: string;
  status: "pendente" | "pago" | "vencido" | "baixado_manual" | "cancelado";
  overdue: boolean;
  days_late: number;
  provider_charge_id: string | null;
  boleto_line: string | null;
  boleto_url: string | null;
  pix_copy_paste: string | null;
  pix_qrcode: string | null;
  receipt_path: string | null;
  paid_amount: string | null;
  paid_at: string | null;
  items: ChargeItem[];
  splits: ChargeSplit[];
  created_at: string;
};

export type PayoutItem = {
  kind: string;
  description: string | null;
  amount: string;
  charge_id: string | null;
};

export type Payout = {
  id: string;
  owner_client_id: string;
  owner_name: string;
  reference_month: string;
  gross_amount: string;
  admin_fee: string;
  deductions: string;
  net_amount: string;
  status: "aberto" | "fechado" | "pago" | "cancelado";
  items: PayoutItem[];
};

export type ExpiringContract = {
  id: string;
  code: string;
  end_date: string;
  rent_amount: string;
  days_left: number;
  property_code: string;
  property_title: string;
  tenant_name: string | null;
};

export type AdjustmentPreview = {
  index_name: string;
  months_used: number;
  accumulated_pct: string;
  previous_rent: string;
  new_rent: string;
  difference: string;
};
