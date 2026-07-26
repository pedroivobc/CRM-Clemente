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
  slug: string | null;
  kind: string;
  purpose: "venda" | "locacao" | "ambos";
  usage_type: "residencial" | "comercial" | "ambos";
  status: PropertyStatus;
  title: string;
  description: string | null;
  address: Address;
  address_visibility: "completo" | "rua" | "bairro";
  public_address: Address;
  registry_number: string | null;
  iptu_code: string | null;
  features: Record<string, unknown>;
  year_built: number | null;
  floors: number | null;
  unit_floor: number | null;
  lot_area: string | null;
  area_util: string | null;
  bedrooms: number | null;
  suites: number | null;
  bathrooms: number | null;
  parking_spots: number | null;
  pet_allowed: boolean | null;
  republic_allowed: boolean | null;
  has_leisure_area: boolean | null;
  rental_warranties: string[];
  sale_price: string | null;
  rent_price: string | null;
  condo_fee: string | null;
  iptu_amount: string | null;
  tour_url: string | null;
  is_exclusive: boolean;
  publish_site: boolean;
  publish_portals: boolean;
  published_at: string | null;
  publish_blockers: string[];
  is_publishable: boolean;
  cover_url: string | null;
  photos: Photo[];
  owners: PropertyOwner[];
  created_at: string;
};

export type ShowcaseSettings = {
  public_key: string | null;
  whatsapp: string | null;
  phone: string | null;
  email: string | null;
  headline: string | null;
  lead_capture_enabled: boolean;
};

export type WatermarkSettings = {
  enabled: boolean;
  position: "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";
  opacity: string;
  apply_on_site: boolean;
  apply_on_portals: boolean;
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

/* ── Vendas ───────────────────────────────────────────────────────────── */

export type FinancingType =
  | "a_vista"
  | "financiamento"
  | "fgts"
  | "consorcio"
  | "permuta"
  | "misto";

export type SalesLead = {
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
  budget_min: string | null;
  budget_max: string | null;
  financing_type: FinancingType | null;
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

export type SalesBoard = { pipeline_id: string; stages: Stage[]; leads: SalesLead[] };

export type Proposal = {
  id: string;
  code: string;
  lead_id: string | null;
  property_id: string;
  property_code: string;
  property_title: string;
  buyer_id: string | null;
  buyer_name: string | null;
  broker_id: string | null;
  broker_name: string | null;
  asking_price: string;
  offer_amount: string;
  discount_amount: string;
  discount_pct: string;
  down_payment: string | null;
  financing_type: FinancingType | null;
  financing_bank: string | null;
  conditions: string | null;
  valid_until: string | null;
  status: "aberta" | "contraproposta" | "aceita" | "recusada" | "expirada" | "cancelada";
  round: number;
  parent_id: string | null;
  decision_notes: string | null;
  created_at: string;
};

export type Commission = {
  beneficiary: "agency" | "lister" | "seller_broker" | "partner";
  user_id: string | null;
  user_name: string | null;
  share_pct: string;
  amount: string;
  status: "pendente" | "pago" | "cancelado";
};

export type Deal = {
  id: string;
  code: string;
  proposal_id: string | null;
  property_id: string;
  property_code: string;
  property_title: string;
  buyer_id: string | null;
  buyer_name: string | null;
  seller_id: string | null;
  seller_name: string | null;
  sale_amount: string;
  down_payment: string | null;
  financing_type: FinancingType | null;
  financing_bank: string | null;
  commission_pct: string;
  commission_total: string;
  closed_at: string;
  deed_date: string | null;
  keys_handed_at: string | null;
  status: "em_andamento" | "concluido" | "cancelado";
  notes: string | null;
  commissions: Commission[];
  created_at: string;
};

export type FunnelStage = {
  key: string;
  name: string;
  count: number;
  conversion_pct: string;
};

export type SalesDashboard = {
  periodo_meses: number;
  vgv: string;
  vendas: number;
  ticket_medio: string;
  comissao_gerada: string;
  ciclo_medio_dias: number | null;
  valor_em_negociacao: string;
  comissoes: { a_pagar: string; pagas: string };
  funil: FunnelStage[];
  ranking_corretores: { corretor: string; vendas: number; comissao: string }[];
};

export type RentalsDashboard = {
  carteira: {
    contratos_ativos: number;
    em_assinatura: number;
    aluguel_administrado: string;
    taxa_mensal_prevista: string;
    vigencias_a_vencer: number;
  };
  cobrancas: {
    vencidas: number;
    valor_vencido: string;
    recebido_mes: string;
    cobrado_mes: string;
    inadimplencia_pct: string;
  };
  repasses: { a_repassar: string; proprietarios: number };
  reajustes_devidos: number;
  funil: FunnelStage[];
};

export type CommissionRule = {
  default_pct: string;
  agency_share_pct: string;
  lister_share_pct: string;
  seller_share_pct: string;
};

/* ── Operação ─────────────────────────────────────────────────────────── */

export type PropertyKey = {
  id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  label: string;
  copies: number;
  board_position: string | null;
  notes: string | null;
  active: boolean;
  out_count: number;
  overdue: boolean;
  current_holder: string | null;
  due_back_at: string | null;
};

export type KeyMovement = {
  id: string;
  key_id: string;
  key_label: string;
  board_position: string | null;
  property_id: string;
  property_code: string;
  taken_by: string;
  purpose: string;
  taken_at: string;
  due_back_at: string;
  returned_at: string | null;
  signature_url: string | null;
  is_out: boolean;
  is_overdue: boolean;
  hours_overdue: number;
  notes: string | null;
};

export type Condition = "otimo" | "bom" | "regular" | "ruim";

export type InspectionPhoto = {
  id: string;
  url: string;
  caption: string | null;
  item_id: string | null;
};

export type InspectionItem = {
  id: string;
  name: string;
  condition: Condition | null;
  notes: string | null;
  sort_order: number;
  photos: InspectionPhoto[];
};

export type InspectionRoom = {
  id: string;
  name: string;
  sort_order: number;
  notes: string | null;
  items: InspectionItem[];
};

export type InspectionIssue = {
  id: string;
  room_name: string | null;
  description: string;
  responsibility: "locatario" | "proprietario" | "indefinido";
  estimated_cost: string | null;
  entry_condition: Condition | null;
  exit_condition: Condition | null;
  resolved: boolean;
};

export type InspectionMeter = { id: string; meter: "agua" | "luz" | "gas"; reading: string };

export type InspectionKind = "entrada" | "saida" | "periodica";
export type InspectionStatus = "agendada" | "em_andamento" | "concluida" | "cancelada";

/** Linha da listagem: o suficiente para a fila do vistoriador. */
export type InspectionSummary = {
  id: string;
  kind: InspectionKind;
  status: InspectionStatus;
  scheduled_at: string | null;
  performed_at: string | null;
  property_code: string;
  property_title: string;
  inspector_name: string | null;
  total_items: number;
  filled_items: number;
  progress_pct: number;
  report_url: string | null;
};

export type Inspection = {
  id: string;
  property_id: string;
  property_code: string;
  property_title: string;
  contract_id: string | null;
  kind: InspectionKind;
  inspector_user_id: string | null;
  inspector_name: string | null;
  scheduled_at: string | null;
  performed_at: string | null;
  status: InspectionStatus;
  general_notes: string | null;
  report_url: string | null;
  compared_with_id: string | null;
  progress_pct: number;
  total_items: number;
  filled_items: number;
  rooms: InspectionRoom[];
  meters: InspectionMeter[];
  issues: InspectionIssue[];
  created_at: string;
};

export type ServiceProvider = {
  id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  avg_rating: string | null;
  jobs_done: number;
  active: boolean;
  specialties: string[];
};

export type TicketQuote = {
  id: string;
  provider_id: string;
  provider_name: string;
  amount: string;
  description: string | null;
  lead_days: number | null;
  valid_until: string | null;
  status: "pendente" | "aprovado" | "recusado";
  is_cheapest: boolean;
};

export type TicketEvent = {
  id: string;
  kind: string;
  summary: string;
  user_name: string | null;
  created_at: string;
};

export type TicketPhoto = { id: string; moment: string; url: string; caption: string | null };

export type TicketStatus =
  | "aberto"
  | "triagem"
  | "orcamento"
  | "aprovacao"
  | "execucao"
  | "concluido"
  | "cancelado";

export type Ticket = {
  id: string;
  code: string;
  property_id: string;
  property_code: string;
  property_title: string;
  contract_id: string | null;
  title: string;
  description: string | null;
  specialty: string | null;
  priority: "baixa" | "normal" | "alta" | "urgente";
  status: TicketStatus;
  payer: "proprietario" | "locatario" | "imobiliaria" | null;
  opened_by: string | null;
  approved_at: string | null;
  approved_quote_id: string | null;
  final_cost: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  approver: string | null;
  approver_reason: string | null;
  quote_spread: string;
  quotes: TicketQuote[];
  events: TicketEvent[];
  photos: TicketPhoto[];
  rating: number | null;
  created_at: string;
};
