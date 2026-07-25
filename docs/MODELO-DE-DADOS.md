# Modelo de Dados — Diagrama ER (proposta para aprovação)

Schemas separados no Postgres, todos com `tenant_id UUID NOT NULL` + RLS (exceto tabelas globais marcadas). Colunas padrão omitidas dos diagramas por brevidade: `id UUID PK`, `tenant_id`, `created_at`, `updated_at`, `created_by`.

Convenção: nomes de tabela em inglês (padrão do setor de software), rótulos da interface 100% em pt-BR.

---

## Schema `core` — tenants, usuários, RBAC, branding

```mermaid
erDiagram
    tenants ||--|| tenant_branding : "tem"
    tenants ||--o{ tenant_domains : "subdomínios"
    tenants ||--o{ tenant_modules : "módulos habilitados"
    tenants ||--o{ users : "colaboradores"
    users ||--o{ user_roles : ""
    roles ||--o{ user_roles : ""
    roles ||--o{ role_permissions : ""
    permissions ||--o{ role_permissions : ""
    users ||--o{ audit_log : "ações"
    tenants ||--o{ api_keys : "API pública"

    tenants {
        text name
        text plan "venda | locacao | completo"
        text status "active | suspended"
    }
    tenant_branding {
        text display_name
        text logo_path
        text favicon_path
        text color_primary
        text color_secondary
        text color_accent
    }
    tenant_domains {
        text subdomain UK
        text custom_domain
    }
    tenant_modules {
        text module "module_rentals | module_sales | ..."
        boolean enabled
    }
    users {
        uuid auth_user_id FK "auth.users (Supabase)"
        text full_name
        text email
        text phone
        text status
    }
    roles {
        text name "Admin, Gestor, Corretor, Financeiro, Atendimento, Vistoriador, RH"
        boolean is_system
    }
    permissions {
        text module
        text action "view | create | edit | delete | approve"
    }
    audit_log {
        text entity
        uuid entity_id
        text action
        jsonb before
        jsonb after
    }
```

---

## Schema `crm` — clientes, papéis, timeline, funis

```mermaid
erDiagram
    clients ||--o{ client_roles : "acumula papéis"
    clients ||--o{ client_contacts : "telefones/e-mails"
    clients ||--o{ client_documents : "docs com validade"
    clients ||--o{ interactions : "timeline unificada"
    pipelines ||--o{ pipeline_stages : ""
    pipeline_stages ||--o{ leads : "etapa atual"
    clients ||--o{ leads : "lead vinculado"
    leads ||--o{ lead_stage_history : "movimentações + SLA"
    leads ||--o{ visits : "visitas"
    loss_reasons ||--o{ leads : "motivo de perda"
    leads ||--o| credit_analyses : "análise cadastral"
    clients ||--o{ referrals : "indicou"
    clients ||--o| health_scores : ""

    clients {
        text kind "PF | PJ"
        text name
        text cpf_cnpj UK "validado"
        jsonb address "via ViaCEP"
        date birth_date
    }
    client_roles {
        text role "proprietario | locatario | fiador | comprador | vendedor | lead"
    }
    client_documents {
        text doc_type "RG, CPF, renda, certidões"
        text storage_path
        date valid_until "alerta de vencimento"
    }
    interactions {
        text channel "whatsapp | ligacao | visita | proposta | chamado | nota"
        text direction
        jsonb payload
        timestamptz occurred_at
    }
    pipelines {
        text module "rentals | sales"
        text name
    }
    pipeline_stages {
        text name "lead → qualificação → visita → análise → proposta → contrato"
        int sort_order
        int sla_hours
    }
    leads {
        text module "rentals | sales"
        uuid property_id FK
        uuid assigned_to FK "round-robin / região"
        text source
        text status "open | won | lost"
    }
    visits {
        uuid property_id FK
        timestamptz scheduled_at
        text status "agendada | realizada | cancelada"
        text feedback
    }
    credit_analyses {
        jsonb doc_checklist
        numeric declared_income
        numeric min_income_required "3x aluguel (configurável)"
        text guarantee_type "fiador | caucao | seguro_fianca | titulo_capitalizacao"
        text result "aprovado | reprovado | pendente"
    }
    referrals {
        text code UK "link/código único"
        uuid referred_client_id FK
        uuid resulting_contract_id FK
        text reward_status
    }
    health_scores {
        int score
        jsonb factors "pagamentos, chamados, CSAT, tempo de contrato"
        text risk_level
    }
```

---

## Schema `properties` — imóveis, fotos, proprietários

> Publicação (migration 0010): `properties.properties` ganhou `slug`,
> `publish_site`/`publish_portals`/`is_exclusive`/`published_at`,
> `address_visibility` (completo/rua/bairro, = displayAddress do VRSync) e os
> campos de anúncio `usage_type`, `year_built`, `floors`, `unit_floor`,
> `lot_area`, `rental_warranties`. Somaram-se `properties.portal_publications`
> (rastreio por canal ZAP/VivaReal/OLX/site) e `properties.watermark_settings`
> (marca d'água por tenant e por canal). O controle de publicação é
> independente do `status` operacional.


```mermaid
erDiagram
    properties ||--o{ property_photos : "original + marcada"
    properties ||--o{ property_media : "vídeos, tour virtual"
    properties ||--o{ property_owners : "N:N com clients"

    properties {
        text kind "casa | apto | sala | terreno | ..."
        text purpose "venda | locacao | ambos"
        text status "captacao | disponivel | reservado | alugado | vendido | manutencao | inativo"
        jsonb address
        text registry_number "matrícula"
        text iptu_code "inscrição municipal"
        jsonb features "quartos, vagas, área..."
        numeric sale_price
        numeric rent_price
        numeric condo_fee
        numeric iptu_amount
    }
    property_photos {
        text original_path "privado"
        text watermarked_path "público"
        int sort_order
        boolean is_cover
    }
    property_owners {
        uuid client_id FK
        numeric ownership_pct
        boolean is_payee "recebe repasse"
    }
```

---

## Schema `rentals` — contratos, cobranças, split, repasses

```mermaid
erDiagram
    contracts ||--o{ contract_parties : "locatário, proprietário, fiador"
    contract_templates ||--o{ contracts : "gera"
    contracts ||--o{ contract_adjustments : "reajustes anuais"
    contracts ||--o{ signature_requests : "ClickSign"
    contracts ||--o{ charges : "cobranças mensais"
    charges ||--o{ charge_splits : "taxa adm × repasse"
    charges ||--o| payments : "pagamento"
    contracts ||--o{ payouts : "repasses ao proprietário"
    payouts ||--o{ payout_items : "aluguel − taxa − descontos"
    charges ||--o{ receipts : "recibo PDF"
    price_indexes ||--o{ contract_adjustments : "IGP-M / IPCA"

    contracts {
        uuid property_id FK
        numeric rent_amount
        numeric admin_fee_pct "10–13%, por contrato"
        text price_index "IGPM | IPCA"
        date start_date
        date end_date "alertas 90/60/30"
        text guarantee_type
        numeric late_fine_pct
        numeric daily_interest_pct
        numeric punctuality_discount
        text status "rascunho | em_assinatura | ativo | encerrado"
        text signed_doc_path
    }
    charges {
        date due_date
        numeric amount
        text status "pendente | pago | vencido | baixado_manual | cancelado"
        text provider "asaas"
        text provider_charge_id
        text boleto_line
        text pix_qrcode
        text pix_copy_paste
    }
    charge_splits {
        text beneficiary "agency | owner"
        uuid wallet_id "subconta Asaas"
        numeric amount
    }
    payments {
        numeric paid_amount
        timestamptz paid_at
        text method "boleto | pix | manual"
        boolean is_manual "baixa manual"
    }
    payouts {
        uuid owner_client_id FK
        date reference_month
        numeric gross_amount
        numeric admin_fee
        numeric deductions "manutenção c/ comprovante"
        numeric net_amount
        text statement_path "extrato PDF"
        text status
    }
    payout_items {
        text kind "aluguel | taxa_adm | desconto_manutencao | multa | juros"
        numeric amount
        uuid maintenance_ticket_id FK
        text receipt_path
    }
    signature_requests {
        text provider "clicksign"
        text envelope_id
        text status "enviado | visualizado | assinado | recusado"
        jsonb signers
    }
    price_indexes {
        text index_name "IGPM | IPCA (global, sem tenant)"
        date reference_month
        numeric monthly_pct
    }
```

---

## Schema `finance` — financeiro central

```mermaid
erDiagram
    chart_of_accounts ||--o{ entries : ""
    cost_centers ||--o{ entries : "venda | locacao | adm"
    payables ||--o{ entries : ""
    receivables ||--o{ entries : ""
    nfse_invoices }o--|| rentals_charges : "nota ↔ cobrança"

    chart_of_accounts {
        text code
        text name
        text kind "receita | despesa"
    }
    cost_centers {
        text name
    }
    payables {
        uuid supplier_client_id FK
        date due_date
        numeric amount
        text recurrence "mensal | anual | ..."
        text proof_path "comprovante"
        text status
    }
    receivables {
        uuid source_charge_id FK "integra motor de locação"
        date due_date
        numeric amount
        text status
    }
    entries {
        date competence_date "DRE por competência"
        numeric amount
        text direction "in | out"
    }
    nfse_invoices {
        uuid charge_id FK
        uuid contract_id FK
        text provider "focus_nfe"
        text provider_ref
        numeric service_amount "SOMENTE taxa de administração"
        text status "pendente | autorizada | erro | cancelada"
        text pdf_path
        text xml_path
    }
```

Painel de conciliação = consulta: toda `charge` paga sem `nfse_invoice` autorizada entra na fila de pendências.

---

## Schemas operacionais

> Implementado na Fase 4 (`0009_operations.sql`). Os nomes abaixo são os que
> existem no banco: cada schema tem tabelas curtas (`inspections.rooms`,
> `inspections.items`), sem repetir o schema no nome da tabela.

```mermaid
erDiagram
    %% keys
    property_keys ||--o{ key_movements : "retirada/devolução"
    property_keys {
        uuid property_id FK
        text label "jogo principal, reserva…"
        int copies
        text board_position "código no chaveiro"
        boolean active
    }
    key_movements {
        uuid taken_by_client_id FK
        uuid taken_by_user_id FK
        text taken_by_name "quem não é cliente nem da equipe"
        text purpose
        timestamptz due_back_at "alerta de atraso"
        timestamptz returned_at
        text signature_path "assinatura desenhada na tela"
    }

    %% inspections
    inspections ||--o{ rooms : "por cômodo"
    rooms ||--o{ items : "checklist"
    items ||--o{ photos : "ilimitadas"
    inspections ||--o{ meter_readings : "água/luz/gás"
    inspections ||--o{ issues : "pendências da saída"
    inspections {
        uuid property_id FK
        uuid contract_id FK
        text kind "entrada | saida | periodica"
        uuid inspector_user_id FK
        uuid compared_with_id FK "a vistoria de entrada correspondente"
        text report_path "laudo em PDF com a marca do tenant"
        text status "agendada | em_andamento | concluida | cancelada"
    }
    items {
        text name
        text condition "otimo | bom | regular | ruim"
        text notes
        int sort_order
    }
    issues {
        text description
        text responsibility "locatario | proprietario | indefinido"
        text entry_condition "estado que motivou a sugestão"
        text exit_condition
        numeric estimated_cost
        boolean resolved
    }
```

```mermaid
erDiagram
    %% maintenance
    service_providers ||--o{ provider_specialties : ""
    tickets ||--o{ quotes : "até 3 orçamentos"
    tickets ||--o{ events : "linha do tempo"
    tickets ||--o{ photos : "antes/depois"
    service_providers ||--o{ quotes : ""
    tickets ||--o| ratings : "avaliação do serviço"

    approval_rules {
        numeric agency_limit_amount "alçada da imobiliária, padrão 300,00"
    }
    service_providers {
        text name
        text document
        text phone
        numeric avg_rating "média das avaliações"
        int jobs_done
    }
    provider_specialties {
        text specialty "pintura | eletrica | hidraulica | reforma | …"
    }
    tickets {
        text code "CH-0001"
        uuid property_id FK
        uuid contract_id FK
        uuid opened_by_client_id FK "portal do locatário"
        text status "aberto | triagem | orcamento | aprovacao | execucao | concluido"
        text priority "baixa | normal | alta | urgente"
        text payer "proprietario | locatario | imobiliaria"
        uuid approved_quote_id FK
        uuid approved_by_user_id FK
        numeric final_cost "lançado no financeiro conforme o payer"
    }
    quotes {
        numeric amount
        int lead_days
        date valid_until
        text status "pendente | aprovado | recusado"
    }

    %% support (omnichannel)
    conversations ||--o{ messages : ""
    conversations {
        text channel "whatsapp | voip | portal"
        uuid client_id FK
        uuid assigned_user_id FK
        text queue
        text_array tags
        text status "bot | fila | atendimento | resolvido"
        timestamptz first_response_at "TME/TMA/FCR"
    }
    messages {
        text direction
        text body
        text media_path
        boolean from_bot
    }
    conversations ||--o| csat_responses : "pós-atendimento"
    csat_responses {
        int score
        text comment
    }
    call_logs {
        uuid client_id FK
        text provider_call_id
        text recording_path "vinculada à timeline"
        int duration_secs
    }
```

```mermaid
erDiagram
    %% hr
    employees ||--o{ time_entries : "ponto c/ geolocalização"
    employees ||--o{ vacations : ""
    payroll_runs ||--o{ payslips : ""
    employees ||--o{ payslips : ""
    employees ||--o{ employee_documents : "dossiê"

    employees {
        uuid user_id FK
        text position
        numeric salary
        date hired_at
    }
    time_entries {
        timestamptz clocked_at
        text kind "entrada | saida | intervalo"
        point geo
    }
    payslips {
        date reference_month
        jsonb earnings "proventos"
        jsonb deductions "INSS, IRRF (tabelas parametrizáveis), VT/VR"
        numeric net_amount
        text pdf_path "holerite (gerencial, não substitui eSocial)"
    }

    %% portal
    portal_users {
        uuid auth_user_id FK
        uuid client_id FK
        text role "locatario | locador"
    }
    feedback_items {
        uuid client_id FK
        text kind "sugestao | reclamacao"
        text status
    }

    %% sales (apenas casca — sem lógica nesta fase)
    sales_leads {
        uuid client_id FK
        uuid property_id FK
    }
    sales_proposals {
        uuid sales_lead_id FK
        numeric amount
    }
    sales_deals {
        uuid sales_proposal_id FK
        text status
    }
```

---

## Observações transversais

- **Dinheiro:** `NUMERIC(14,2)`; percentuais `NUMERIC(7,4)`. Nunca float.
- **Tabelas globais (sem tenant):** `rentals.price_indexes` (IGP-M/IPCA), tabelas de INSS/IRRF parametrizáveis.
- **Storage:** buckets por finalidade (`property-photos`, `documents`, `contracts`, `reports`, `branding`) com caminho prefixado por `tenant_id` e políticas de acesso equivalentes ao RLS.
- **Índices:** todo FK + `(tenant_id, status)` nas tabelas de fluxo (leads, charges, tickets, conversations).
- **NPS/CSAT, indicadores de atendimento e health score** são derivados (views materializadas) — não duplicam dado bruto.
