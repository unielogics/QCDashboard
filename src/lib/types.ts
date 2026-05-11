// Hand-typed mirror of backend response shapes.
// (When you scale, switch to OpenAPI codegen — for now the surface is small.)

import type { LoanStage, LoanType, LoanPurpose, PropertyType, Role, AITaskPriority, AITaskSource, AITaskStatus, BrokerTier, MessageFrom, DocStatus, CalendarEventKind, EntityType, ExperienceTier, CreditPullStatus, DealChatMode, DealChatRole, FeedbackOutputType, FeedbackRating } from "./enums.generated";

export interface User {
  id: string;
  clerk_id: string;
  email: string;
  name: string;
  role: Role;
}

export interface Loan {
  id: string;
  deal_id: string;
  client_id: string;
  broker_id: string | null;
  /** Display name of the agent who owns the loan, joined from the
   *  brokers table by the list endpoint. Used by operator pipelines
   *  to show the owner reference; null when the loan is unassigned. */
  broker_name?: string | null;
  /** Borrower display name joined from the clients table. */
  client_name?: string | null;
  lender_id?: string | null;
  address: string;
  city: string | null;
  property_type: PropertyType;
  type: LoanType;
  purpose: LoanPurpose | null;
  stage: LoanStage;
  amount: number;
  ltv: number | null;
  ltc: number | null;
  arv: number | null;
  base_rate: number | null;
  discount_points: number;
  final_rate: number | null;
  origination_pct: number;
  term_months: number | null;
  monthly_rent: number | null;
  annual_taxes: number;
  annual_insurance: number;
  monthly_hoa: number;
  dscr: number | null;
  risk_score: number | null;
  close_date: string | null;
  // Property details (writable via PropertyTab + AI intake tool)
  sqft?: number | null;
  beds?: number | null;
  baths?: number | null;
  year_built?: number | null;
  unit_count?: number | null;
  // Living Loan File
  status_summary?: string | null;
  deal_health?: "on_track" | "at_risk" | "stuck";
  living_profile?: LivingLoanProfile | null;
}

// Output of "The Associate" summarizer — see qcbackend/app/services/ai/summarizer.py
export type MarketWarning = "Rate Pressure" | "Rate Stability" | "Rate Easing";
export interface LivingLoanProfile {
  current_status: string;
  market_context: {
    narrative: string;
    warning: MarketWarning | null;
  };
  bottlenecks: string[];
  next_actions: {
    ai: string[];
    broker: string[];
  };
  deal_health: "on_track" | "at_risk" | "stuck";
}

export interface Client {
  id: string;
  user_id: string | null;
  broker_id: string | null;
  /** Display name of the agent owning this relationship, joined from
   *  brokers.display_name by the list endpoint. Used by operator
   *  pipelines to show the owner reference. */
  broker_name?: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  address?: string | null;
  city: string | null;
  since: string | null;
  tier: string;
  fico: number | null;
  avatar_color: string | null;
  funded_total: number;
  funded_count: number;
  // Investor profile (free-text, edited by the borrower in /profile)
  properties?: string | null;
  experience?: string | null;
  // Agent CRM fields — see ClientStage / ClientType. Optional on the
  // interface so existing rows without these populated still type-check;
  // backend will default new rows to stage="lead" and client_type=null.
  stage?: ClientStage | null;
  client_type?: ClientType | null;
  // Mobile-app experience mode. Optional so the front-end can ship before the
  // backend column lands — deriveExperienceMode() falls back to broker_id.
  client_experience_mode?: ClientExperienceMode | null;
  client_experience_mode_reason?: ClientExperienceModeReason | null;
  client_experience_mode_locked_by?: ClientExperienceModeLockedBy | null;
  // Lead routing / ownership / attribution (alembic 0029).
  lead_source?: LeadSource | null;
  lead_temperature?: LeadTemperature | null;
  financing_support_needed?: FinancingSupportNeeded | null;
  contact_permission?: ContactPermission | null;
  relationship_context?: RelationshipContext | null;
  lead_promotion_status?: LeadPromotionStatus;
  originating_agent_id?: string | null;
  current_agent_id?: string | null;
  source_channel?: string | null;
  // Realtor Client Intelligence Profile (alembic 0030). Free-shape
  // JSONB written by the Realtor AI. Drives the Client Readiness Map
  // card on /clients/[id].
  realtor_profile?: RealtorClientProfile | null;
}

// Lead-routing enum values mirror app/schemas/client.py.
export type LeadSource =
  | "manual_entry"
  | "open_house"
  | "referral"
  | "listing_inquiry"
  | "buyer_consultation"
  | "existing_database"
  | "other";
export type LeadTemperature = "hot" | "warm" | "nurture";
export type FinancingSupportNeeded = "yes" | "maybe" | "no" | "unknown";
export type ContactPermission =
  | "send_invite_now"
  | "save_lead_only"
  | "agent_will_introduce_first";
export type RelationshipContext =
  | "new_lead"
  | "existing_client"
  | "past_client"
  | "referral_from_other"
  | "other";
export type LeadPromotionStatus =
  | "not_ready"
  | "agent_requested_review"
  | "funding_reviewing"
  | "promoted_to_intake"
  | "declined";

export type ClientExperienceMode = "guided" | "self_directed" | "hybrid";
export type ClientExperienceModeReason =
  | "agent_referred"
  | "self_signup"
  | "funding_team_required"
  | "underwriting_conditions"
  | "user_preference"
  | "super_admin_override";
export type ClientExperienceModeLockedBy =
  | "system"
  | "agent"
  | "funding_team"
  | "super_admin";

export interface AITask {
  id: string;
  loan_id: string | null;
  source: AITaskSource;
  priority: AITaskPriority;
  status: AITaskStatus;
  action: string;
  title: string;
  summary: string;
  confidence: number;
  agent: string;
  draft_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  loan_id: string;
  name: string;
  category: string | null;
  s3_key: string | null;
  status: DocStatus;
  requested_on: string | null;
  received_on: string | null;
  verified_at: string | null;
  verified_by: string | null;
}

export interface Message {
  id: string;
  loan_id: string;
  from_role: MessageFrom;
  body: string;
  is_system: boolean;
  is_draft: boolean;
  sent_at: string;
}

// Mirror of backend app/enums.py CalendarEventStatus / Source / ExternalRefKind.
// Kept hand-typed (no codegen) — tiny surface, low churn.
export type CalendarEventStatus = "pending" | "done" | "cancelled";
export type CalendarEventSource = "manual" | "auto" | "ai";

export interface CalendarEvent {
  id: string;
  loan_id: string | null;
  kind: CalendarEventKind;
  title: string;
  description: string | null;
  who: string | null;
  starts_at: string;
  duration_min: number | null;
  priority: AITaskPriority | null;
  status: CalendarEventStatus;
  source: CalendarEventSource;
  owner_user_id: string | null;
  external_ref_kind: string | null;
  external_ref_id: string | null;
}

// Partial-update payload for PATCH /calendar/{id}.
export interface CalendarEventUpdate {
  kind?: CalendarEventKind;
  title?: string;
  description?: string | null;
  who?: string | null;
  starts_at?: string;
  duration_min?: number | null;
  priority?: AITaskPriority | null;
  owner_user_id?: string | null;
  status?: CalendarEventStatus;
}

export interface Broker {
  id: string;
  user_id: string;
  display_name: string;
  tier: BrokerTier;
  joined: string | null;
  lifetime_points: number;
  redeemed_points: number;
  balance_points: number;
  funded_total: number;
  funded_count: number;
}

export interface RecalcResponse {
  final_rate: number;
  monthly_pi: number;
  dscr: number | null;
  cash_to_close_pricing: number;
  hud_total: number;
  warnings: { code: string; message: string; severity: string }[];
  loan_amount?: number | null;
  sizing?: {
    loan_amount: number;
    max_allowed: number;
    binding_constraint: string;
    clamped: boolean;
    ltv: number | null;
    ltc: number | null;
    arv_ltv: number | null;
    effective_ltv_cap: number | null;
    total_cost: number | null;
    cash_to_borrower: number | null;
    cash_to_close: number | null;
  } | null;
}

// ── SmartIntake ────────────────────────────────────────────────────────────
// Mirrors qcbackend/app/schemas/intake.py

export interface BorrowerStep {
  name: string;
  email: string;
  phone: string;
  entity_type: EntityType;
  entity_name?: string | null;
  experience: ExperienceTier;
}

export interface AssetStep {
  address: string;
  city?: string | null;
  // USPS 2-letter state code. Captured separately from city so the
  // backend's loans.state column (alembic 0028) is queryable.
  state?: string | null;
  property_type: PropertyType;
  sqft?: number | null;
  annual_taxes: number;
  annual_insurance: number;
  as_is_value?: number | null;
}

// Existing-portfolio assets a buyer already owns (collected on the new
// SmartIntake flow when side="buyer"). Each becomes a property on the
// Client's experience tab so the AI can reason about liquidity + experience.
// Sent alongside the primary AssetStep (which represents the subject
// property of THIS deal, or a placeholder for buyer-no-property-yet).
export interface OwnedAsset {
  address: string;
  // Optional city + state — the SmartIntakeModal's owned-property
  // collector now splits these out of the address string.
  city?: string | null;
  state?: string | null;
  ownership: "primary" | "investment";
  market_value: number | null;
  balance_owed: number | null;
}

export interface NumbersStep {
  type: LoanType;
  // Loan purpose set by Step 1 toggle. Persisted on Loan.purpose.
  // Wire format matches the backend LoanPurpose enum.
  purpose?: "purchase" | "rate_term_refi" | "cash_out_refi" | null;
  amount: number;
  ltv: number;
  ltc?: number | null;
  arv?: number | null;
  monthly_rent?: number | null;
  base_rate: number;
  // Deal-side specific. Buyer = future purchase context; Seller = listing
  // economics. Both populate `amount` above for the Loan row but enrich
  // downstream reporting + Lender packaging.
  cash_available?: number | null;        // buyer (legacy)
  max_purchase_price?: number | null;    // buyer (legacy)
  sales_price?: number | null;           // seller listing
  // Buyer cash on hand for closing — Phase 2 of the SmartIntakeModal
  // redesign captures this on every purchase flow.
  deposit_available?: number | null;
}

export interface AIRulesStep {
  // Original financial-tactical rules — kept for backward compat. The
  // SmartIntake UI no longer surfaces these directly; sane defaults are
  // sent until the backend stops requiring them.
  floor_rate: number;
  max_buy_down_points: number;
  require_soft_pull: boolean;
  auto_send_terms: boolean;
  doc_auto_verify: boolean;
  escalation_delta_bps: number;
  notify_channel: "push" | "email" | "sms" | "sms+email";
  intro_message?: string | null;
  // New communication-focused fields. The Agent fills these out in Step 4
  // of the new SmartIntake flow so the AI knows how to talk to this client.
  language?: string | null;              // "en" | "es" | etc. (free-text for now)
  backstory?: string | null;             // free-text context for the AI
  target_close_date?: string | null;     // ISO date
  ai_instructions?: string | null;       // freeform "how to speak with this client"
}

// Optional one-off custom doc the operator typed at Step 4. Mirrors
// backend IntakeCustomDoc — `due_date` is absolute (frontend converts
// the inline "+N days" input into today + N before submit).
export interface IntakeCustomDoc {
  name: string;
  due_date?: string | null;
  checklist_key?: string | null;
}

// Pre-loan checklist edits captured in Step 4. Mirrors backend
// IntakeDocumentOverrides — `skip_names` removes firm/agent defaults,
// `add_items` appends one-offs, `due_offset_overrides` retargets the
// due date for a default item without skipping it.
export interface IntakeDocumentOverrides {
  skip_names?: string[];
  add_items?: IntakeCustomDoc[];
  due_offset_overrides?: Record<string, number>;
}

export interface SmartIntakePayload {
  borrower: BorrowerStep;
  asset: AssetStep;
  numbers: NumbersStep;
  ai_rules: AIRulesStep;
  // New top-level fields surfaced by the redesigned SmartIntake. Backend
  // can ignore until support lands; frontend captures regardless.
  deal_side?: "buyer" | "seller" | null;
  owned_assets?: OwnedAsset[] | null;
  document_overrides?: IntakeDocumentOverrides | null;
  // Source attribution + ownership + invite behavior (alembic 0029).
  // Captured by Step 1 + Step 4. Backend persists on Loan row.
  source_attribution?:
    | "direct_borrower"
    | "agent_referral"
    | "existing_client"
    | "website"
    | "phone_call"
    | "other"
    | null;
  referring_agent_id?: string | null;
  assigned_owner_id?: string | null;
  invite_behavior?: "send_immediately" | "save_draft" | "send_after_review";
}

export interface SmartIntakeResponse {
  loan_id: string;
  deal_id: string;
}

// ── AI Task decision ───────────────────────────────────────────────────────
export type AITaskDecisionValue = "approved" | "dismissed";
export interface AITaskDecisionRequest {
  decision: AITaskDecisionValue;
  edited_payload?: Record<string, unknown> | null;
}

// ── Document upload ────────────────────────────────────────────────────────
export interface DocumentUploadInitResponse {
  document_id: string;
  upload_url: string | null;
  s3_key: string;
}

// ── Credit pull ────────────────────────────────────────────────────────────
export interface CreditPull {
  id: string;
  client_id: string;
  status: CreditPullStatus;
  fico: number | null;
  pulled_at: string | null;
  expires_at: string | null;
  // Operator-typed notes from the credit pull. iSoftpull captures
  // these; the client detail page renders them on an operator-only card.
  notes?: string | null;
  // Derived (computed in router) — UI uses these directly to render the
  // "expires in 12 days" pill without doing date math.
  is_expired?: boolean;
  days_until_expiry?: number | null;
  expiring_soon?: boolean;
}

// ── Credit summary (borrower-facing) ───────────────────────────────────────
export interface CreditSummaryBullet {
  kind: "positive" | "neutral" | "warn";
  label: string;
  detail: string | null;
}
export interface CreditSummaryProduct {
  id: string;
  label: string;
  loan_type: string;
  rate?: number;
  max_ltv?: number;
  term?: string;
  min_fico?: number;
  reason?: string; // populated for blocked products
}
export interface CreditSummaryAggregates {
  open_count: number;
  closed_count: number;
  derogatory_count: number;
  total_balance: number;
  total_credit_limit: number;
  total_monthly_payment: number;
  revolving_balance: number;
  revolving_credit_limit: number;
  revolving_utilization: number | null;
  has_mortgage: boolean;
  oldest_account_opened: string | null;
  by_type: Record<string, number>;
}
export interface CreditSummary {
  fico: number | null;
  fico_model: string | null;
  tier: string | null;
  tier_max_ltv: number | null;
  bullets: CreditSummaryBullet[];
  aggregates?: CreditSummaryAggregates;
  recent_inquiries_6mo?: number;
  available_products: CreditSummaryProduct[];
  blocked_products: CreditSummaryProduct[];
  fraud_flag: string | null;
  note?: string;
}

// ── Parsed report (operator-facing — full structured ScrapedReport) ────────
export interface ParsedCreditScore {
  model: string;
  score: number | null;
  reason_codes: string[];
}
export interface ParsedAddressOrEmployment {
  period: string;
  fields: Record<string, string>;
}
export interface ParsedTradeAccount {
  fields: Record<string, string>;
}
export interface ParsedInquiry {
  fields: Record<string, string>;
}
export interface ParsedIdentityRisk {
  ofac: Record<string, string>;
  mla: Record<string, string>;
  fraud_shield: Record<string, string>;
}
export interface ParsedReport {
  personal_info: Record<string, string>;
  addresses: ParsedAddressOrEmployment[];
  employment: ParsedAddressOrEmployment[];
  scores: ParsedCreditScore[];
  identity_risk: ParsedIdentityRisk;
  inquiries: ParsedInquiry[];
  trade_accounts: ParsedTradeAccount[];
  public_records: Record<string, string>[];
  collections: Record<string, string>[];
  fico_8: number | null;
  fico_2: number | null;
  vantage_4: number | null;
  best_score: number | null;
  best_score_model: string | null;
  raw_html_length: number;
}

// ── Stage transition ───────────────────────────────────────────────────────
export interface StageTransitionRequest {
  new_stage: LoanStage;
  note?: string | null;
}

// ── Search response ────────────────────────────────────────────────────────
export interface SearchItem {
  kind: string;
  id: string;
  title: string;
  subtitle?: string;
  client_id?: string;
  loan_id?: string;
}
export interface GroupedResults {
  client_id: string;
  client_name: string;
  items: SearchItem[];
}

// ── Meta (enums + lending limits) ──────────────────────────────────────────
export interface MetaResponse {
  enums: { name: string; values: { value: string; label: string }[] }[];
  limits: Record<string, number>;
}

// ── Activity (loan timeline) ───────────────────────────────────────────────
export interface Activity {
  id: string;
  loan_id: string | null;
  actor_id: string | null;
  actor_label: string | null;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  occurred_at: string;
}

// ── Rate sheet ─────────────────────────────────────────────────────────────
export interface RateSKU {
  id: string;
  label: string;
  loan_type: LoanType;
  rate: number;
  points: number;
  term: string;
  min_fico: number;
  max_ltv: number;
  delta_bps: number;
}

// ── Dashboard report ───────────────────────────────────────────────────────
export interface StageBreakdown {
  stage: LoanStage;
  count: number;
  value: number;
}
export interface TypeBreakdown {
  type: string;
  count: number;
  value: number;
}
export interface DashboardReport {
  funded_ytd: number;
  funded_ytd_delta: number | null;
  pipeline_value: number;
  pipeline_count: number;
  avg_close_days: number | null;
  avg_close_delta: number | null;
  pull_through: number | null;
  pull_through_delta: number | null;
  by_stage: StageBreakdown[];
  by_type: TypeBreakdown[];
}

// ── App settings ───────────────────────────────────────────────────────────
export interface DocChecklistItem {
  name: string;
  // Pretty label shown in UI; falls back to `name` when null.
  display_name?: string | null;
  // 'internal' = operator-ordered (Appraisal, Title, Insurance, PFS).
  // 'external' = borrower upload.
  type?: "internal" | "external";
  required: boolean;
  auto_request: boolean;
  due_offset_days?: number;
  // 'loan_created' or 'doc_received:<name>'.
  anchor?: string;
  // Fan out to N copies (one per Loan.unit_count).
  per_unit?: boolean;
  // Operator UI hint for internal items.
  internal_action?: string | null;
  // Which side of the transaction the item applies to (alembic 0023).
  side?: "buyer" | "seller" | "both";
}

// Per-broker overlay shape (alembic 0023). Stored on
// `brokers.settings_data` JSONB. Layered on top of the firm
// `AppSettingsData` for any loan owned by the broker. See
// app/schemas/broker_settings.py for full docs.
export type LoanSide = "buyer" | "seller";

export interface AgentChecklistOverlay {
  disabled_firm_items: string[];
  extra_items: DocChecklistItem[];
}

export interface AgentCadenceOverride {
  first_reminder_days: number | null;
  second_reminder_days: number | null;
  escalate_after_days: number | null;
}

export interface AgentLetterhead {
  // Identity (name/email/phone) lives on the User row — not duplicated.
  // Realtors don't sign loan docs, so no signature block. v2: move
  // logo + headshot from base64 data URL to S3 keys.
  title: string | null;
  license_number: string | null;
  brokerage_name: string | null;
  logo_data_url?: string | null;
  headshot_data_url?: string | null;
  // S3-backed headshot (preferred). When set, overrides
  // headshot_data_url for prequal PDF rendering.
  headshot_s3_key?: string | null;
  // Legacy shape (kept optional so existing form submissions still
  // compile). Backend strips them at parse time. Will be removed
  // once the agent-settings page rewrite lands across all envs.
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  signature_block?: string | null;
}

// Response from POST /me/broker-settings/headshot/upload-init.
export interface HeadshotUploadInitResponse {
  s3_key: string;
  upload_url: string | null;
}

export interface AgentSettingsData {
  // Keyed by side ONLY: "buyer" | "seller". Loan-type axis dropped
  // post-codex-PR — realtors think transaction-side, not DSCR/F&F.
  checklists: Record<string, AgentChecklistOverlay>;
  // Single cadence override applied to ALL of this broker's loans.
  // Was Record<loan_type, AgentCadenceOverride> in v1.
  cadence: AgentCadenceOverride | null;
  letterhead: AgentLetterhead | null;
}
export interface LoanTypeChecklist {
  docs: DocChecklistItem[];
  first_reminder_days: number;
  second_reminder_days: number;
  escalate_after_days: number;
  auto_approve_risk_score: number;
}
export interface AICadenceSettings {
  morning_digest: string;
  evening_summary: string;
  auto_nudge_borrower: boolean;
  auto_escalate_overdue: boolean;
  auto_draft_replies: boolean;
  anomaly_alerts: boolean;
  weekend_ops: boolean;
  confidence_floor_default: number;
}
export interface ReferralSettings {
  require_approval: boolean;
  auto_link_from_url: boolean;
  block_re_attribution: boolean;
  notify_broker_on_signup: boolean;
  points_per_dollar: number;
  refi_multiplier: number;
  expiry_days: number;
  dispute_sla_business_days: number;
}
export interface PricingSettings {
  daily_pull_time: string;
  auto_publish_threshold_bps: number;
  notify_clients_on_change: boolean;
  lock_window_business_days: number;
}
export interface SecuritySettings {
  sso_enabled: boolean;
  mfa_enforced: boolean;
  mfa_renewal_days: number;
  borrower_portal_mfa: boolean;
  session_timeout_minutes: number;
  ip_allowlist: string[];
}
export interface SimulatorSettings {
  points_min: number;
  points_max: number;
  points_step: number;
  amount_min: number;
  amount_max: number;
  amount_step: number;
  ltv_min: number;
  ltv_max: number;
  ltv_step: number;
  advanced_mode_enabled: boolean;
  show_taxes: boolean;
  show_insurance: boolean;
  show_hoa: boolean;
  show_ltv_toggle: boolean;
}
// Mirrors backend app/schemas/settings.py LetterheadSettings — the
// values rendered into every prequal PDF (header address, signing
// officer name + title, signature image S3 key).
export interface LetterheadSettings {
  officer_name: string;
  officer_title: string;
  office_address_line_1: string;
  office_address_line_2: string;
  office_address_line_3: string;
  signature_s3_key: string | null;
}
export interface AppSettingsData {
  checklists: Record<string, LoanTypeChecklist>;
  // Transaction-side defaults (alembic 0025 / realtor overhaul). Keyed
  // by "buyer" | "seller". The agent's lead-stage UI (and the
  // SmartIntakeModal Step 4 doc-preview when role=BROKER) reads from
  // here and overlays the per-broker checklist overrides on top.
  transaction_checklists?: Record<string, LoanTypeChecklist>;
  ai_cadence: AICadenceSettings;
  referrals: ReferralSettings;
  pricing: PricingSettings;
  security: SecuritySettings;
  simulator: SimulatorSettings;
  letterhead: LetterheadSettings;
}
export interface AppSettingsRead {
  data: AppSettingsData;
}
export type AppSettingsUpdate = Partial<{
  checklists: Record<string, LoanTypeChecklist>;
  ai_cadence: AICadenceSettings;
  referrals: ReferralSettings;
  pricing: PricingSettings;
  security: SecuritySettings;
  simulator: SimulatorSettings;
  letterhead: LetterheadSettings;
}>;
// POST /settings/letterhead/signature/upload-init
export interface SignatureUploadInitResponse {
  s3_key: string;
  upload_url: string | null;
}

// ── Users (Team) ───────────────────────────────────────────────────────────
export interface UserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  created_at: string | null;
}

// ── AI chat ────────────────────────────────────────────────────────────────
export interface AIChatTurn {
  role: "user" | "assistant";
  content: string;
}
export interface AIChatRequest {
  messages: AIChatTurn[];
  loan_id?: string | null;
}
export interface AIChatResponse {
  reply: string;
  model: string;
  used_stub: boolean;
}

// Persisted Underwriter chat threads (Phase 8). The legacy AIChat*
// types above remain for stateless per-loan AIRail usage; everything
// that goes through the topbar/FAB chat panel lives in threads.
export interface AIChatThread {
  id: string;
  title: string;
  last_message_preview: string | null;
  last_message_at: string | null;
  // alembic 0021 — bumped on /threads/{id}/seen. `unread` is
  // computed server-side: true iff last_message_at > last_seen_at.
  last_seen_at?: string | null;
  unread?: boolean;
  created_at: string;
  updated_at: string;
  // Loan-scoped thread when set; account-wide when null. Lightweight
  // loan ref (deal_id + address) is included so the thread list can
  // render rows without a second fetch.
  loan_id?: string | null;
  loan_deal_id?: string | null;
  loan_address?: string | null;
}

// /loans/{id}/required-documents response shape (alembic 0017).
// Drives the vault upload modal's checklist picker. The last item
// is always the "Other / not in checklist" sentinel (is_other=true,
// checklist_key=null).
export interface RequiredDocument {
  checklist_key: string | null;
  label: string;
  required: boolean;
  auto_request: boolean;
  is_other: boolean;
  current_document_id: string | null;
  current_status: DocStatus | null;
  received_on: string | null;
  verified_at: string | null;
  days_since_requested: number | null;
}

// CTAs the AI emits via tool-use. Frontend renders one button per
// action under the assistant bubble; tapping deep-links into the
// vault upload flow or hits a small confirm endpoint.
export interface ChatAction {
  kind:
    | "upload_document"
    | "confirm_document_routing"
    | "complete_property_intake"
    | "open_calendar_event"
    // AI Secretary actions emitted by the Realtor AI. Each maps to
    // a backend confirm-endpoint; the agent's tap fires the side
    // effect. The AI never writes state without operator approval.
    | "request_prequalification"
    | "send_buyer_agreement"
    | "send_listing_agreement"
    | "create_buyer_intake"
    | "create_seller_intake"
    | "schedule_showing"
    | "schedule_picture_day"
    | "prepare_cma_task"
    | "create_listing_prep_checklist"
    | "send_property_matches"
    | "draft_follow_up_text"
    | "draft_follow_up_email"
    | "mark_client_finance_ready"
    | "update_realtor_pipeline_stage";
  label: string;
  document_id?: string | null;
  checklist_key?: string | null;
  calendar_event_id?: string | null;
  // Set on Realtor AI action cards — which client this targets.
  client_id?: string | null;
  // For draft_follow_up_text / draft_follow_up_email / send_property_matches —
  // the AI pre-drafts a message body the agent reviews + edits before sending.
  draft_body?: string | null;
  draft_subject?: string | null;
  confirm?: boolean;
}

// ── Realtor Client Intelligence Profile (alembic 0030) ─────────────────────
// Free-shape JSONB on Client.realtor_profile written by the Realtor AI on
// every conversational turn. Mirrors app/services/ai/realtor_profile.py.
export interface RealtorClientProfile {
  client_id: string;
  agent_id: string;
  client_type: "buyer" | "seller" | "buyer_and_seller" | "unknown";
  relationship_stage:
    | "new_lead"
    | "contacted"
    | "needs_discovery"
    | "agreement_pending"
    | "active_client"
    | "finance_ready"
    | "handoff_to_lending"
    | "under_contract"
    | "closed"
    | "lost";
  intent_summary: string;
  buyer_profile?: {
    target_property_type?: string | null;
    target_location?: string | null;
    target_budget?: number | null;
    target_budget_range?: { low: number; high: number } | null;
    purchase_timeline?: "asap" | "0_30" | "30_60" | "60_plus" | null;
    financing_needed?: boolean | null;
    prequalified?: boolean;
    buyer_agreement_status?: "not_sent" | "sent" | "signed" | "n/a";
    proof_of_funds_status?: "not_collected" | "verbal" | "received";
    urgency_level?: "high" | "medium" | "low";
    showing_activity?: { date: string; address: string; outcome: string }[];
  } | null;
  seller_profile?: {
    property_address?: string | null;
    property_type?: string | null;
    desired_list_price?: number | null;
    selling_timeline?: string | null;
    listing_agreement_status?: "not_sent" | "sent" | "signed";
    photos_status?: "not_scheduled" | "scheduled" | "complete";
    cma_status?: "not_started" | "in_progress" | "complete";
    showing_instructions?: string | null;
    occupancy_status?: "owner" | "tenant" | "vacant" | null;
    payoff_amount?: number | null;
  } | null;
  known_facts?: { field: string; value: string; source: string; captured_at: string }[];
  missing_facts?: string[];
  documents?: { name: string; status: string; document_id?: string }[];
  open_tasks?: { title: string; due_date?: string; reason: string }[];
  next_best_question?: string | null;
  next_best_action?: string | null;
  readiness_score?: number;
}

// Files riding on a chat message. Borrower attaches via the
// composer paperclip → backend creates an is_other Document, runs
// vision scan synchronously, persists chip metadata.
export interface ChatAttachment {
  document_id: string;
  name: string;
  content_type?: string | null;
  status?: string | null;
  suggested_checklist_key?: string | null;
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  created_at: string;
  actions?: ChatAction[] | null;
  attachments?: ChatAttachment[] | null;
}

export interface AIChatThreadDetail extends AIChatThread {
  messages: AIChatMessage[];
}

export interface AIChatSendResponse {
  user_message: AIChatMessage;
  assistant_message: AIChatMessage;
  thread: AIChatThread;
  used_stub: boolean;
}

// ── Account-wide living profile (Phase 8) ─────────────────────────────────
export interface ClientNextAction {
  title: string;
  owner: "client" | "broker" | "ai";
  priority: "low" | "medium" | "high";
  cta:
    | "upload_doc"
    | "run_credit"
    | "complete_profile"
    | "accept_prequal_offer"
    | "decline_prequal_offer"
    | "submit_prequal"
    | "respond_to_message"
    | "none";
  due_at: string | null;
}

export interface ClientLivingProfileBody {
  summary?: string;
  outstanding_documents?: { loan_id?: string; deal_id?: string; name: string; days_overdue?: number }[];
  blocking_credit_issues?: string[];
  next_actions?: ClientNextAction[];
  rate_pressure_notes?: string[];
  suggested_next_loan?: string | null;
}

export interface ClientLivingProfile {
  client_id: string;
  living_profile: ClientLivingProfileBody | null;
  living_summary: string | null;
  living_refreshed_at: string | null;
}

// ── Fintech Orchestrator ──────────────────────────────────────────────────
export type DealHealth = "on_track" | "at_risk" | "stuck";

export type ParticipantRole = "lender" | "broker" | "client" | "super_admin";

export interface LoanParticipant {
  id: string;
  loan_id: string;
  email: string;
  display_name: string | null;
  role: ParticipantRole;
  company: string | null;
  cc_outbound: boolean;
  bcc_outbound: boolean;
  hide_identity: boolean;
}

export interface LoanParticipantCreate {
  email: string;
  role: ParticipantRole;
  display_name?: string;
  company?: string;
  cc_outbound?: boolean;
  bcc_outbound?: boolean;
  hide_identity?: boolean;
  user_id?: string;
}

export type LoanParticipantUpdate = Partial<LoanParticipantCreate>;

export type EmailDraftStatus = "pending" | "approved" | "sent" | "dismissed";

export interface EmailDraft {
  id: string;
  loan_id: string;
  to_email: string;
  cc_emails: string[] | null;
  bcc_emails: string[] | null;
  subject: string;
  body: string;
  status: EmailDraftStatus;
  triggered_by_kind: string | null;
  actioned_by: string | null;
  sent_message_id: string | null;
}

export interface EmailDraftDecisionRequest {
  decision: "approved" | "dismissed";
  body_override?: string;
  subject_override?: string;
}

export interface SummaryRefreshResponse {
  summary: string;
  deal_health: DealHealth;
  used_stub: boolean;
}

export interface InboundEmailRequest {
  sender: string;
  subject: string;
  body: string;
}

export interface InboundEmailResponse {
  loan_id: string | null;
  sender_role: string;
  draft_id: string | null;
  task_id: string | null;
  note: string;
}


// ── Deal Workspace ─────────────────────────────────────────────────────
export interface LoanInstruction {
  id: string;
  loan_id: string;
  body: string;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
  deactivated_at: string | null;
}

export interface LoanChatMessage {
  id: string;
  loan_id: string;
  from_role: DealChatRole;
  from_user_id: string | null;
  body: string;
  client_visible: boolean;
  created_at: string;
}

export interface ChatSendResponse {
  kind: "message" | "instruction" | "ai_task";
  message: LoanChatMessage | null;
  ai_reply: LoanChatMessage | null;
  instruction: LoanInstruction | null;
  ai_task_id: string | null;
  paused_until: string | null;
}

export interface AIModifyCorrection {
  id: string;
  loan_id: string;
  target_message_id: string;
  correction: string;
  created_by: string | null;
  created_at: string;
}

export interface LoanScenario {
  id: string;
  loan_id: string;
  name: string;
  discount_points: number;
  loan_amount: number | null;
  base_rate: number | null;
  annual_taxes: number | null;
  annual_insurance: number | null;
  monthly_hoa: number | null;
  ltv: number | null;
  recalc_snapshot: {
    final_rate?: number;
    monthly_pi?: number;
    dscr?: number | null;
    cash_to_close_pricing?: number;
  } | null;
  created_by: string | null;
  created_at: string;
}

export interface ScenarioCreate {
  name: string;
  discount_points: number;
  loan_amount?: number | null;
  base_rate?: number | null;
  annual_taxes?: number | null;
  annual_insurance?: number | null;
  monthly_hoa?: number | null;
  ltv?: number | null;
}

export interface HudLine {
  id: string;
  loan_id: string;
  code: string;
  label: string;
  amount: number;
  category: string;
  editable: boolean;
}

export interface WorkspaceState {
  instructions: LoanInstruction[];
  chat_messages: LoanChatMessage[];
  scenarios: LoanScenario[];
  hud_lines: HudLine[];
  ai_paused_until: string | null;
  feedback_summary: { up?: number; down?: number };
}

export interface AIFeedback {
  id: string;
  output_type: FeedbackOutputType;
  output_id: string;
  loan_id: string | null;
  rating: FeedbackRating;
  comment: string | null;
  created_by: string;
  created_at: string;
}

// ── FRED + Lender Spreads ──────────────────────────────────────────────
export interface FredObservation {
  date: string; // ISO date
  value: number | null;
}

export interface FredSeriesSummary {
  series_id: string;
  label: string;
  description: string;
  current_value: number | null;
  current_date: string | null;
  previous_value: number | null;
  delta_bps: number | null;
  spread_bps: number;
  estimated_rate: number | null;
  history_7d: FredObservation[];
  history_30d: FredObservation[];
  // `history` is the variable-window slice the caller asked for (1..90 days).
  // Older backends may omit it — frontend should fall back to history_30d.
  history?: FredObservation[];
  history_days?: number;
}

export interface LenderSpread {
  id: string;
  series_id: string;
  spread_bps: number;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Lender admin (Phase: lenders v2) ──────────────────────────────────────
export interface Lender {
  id: string;
  name: string;
  submission_email: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_title: string | null;
  products: LoanType[];
  email_domain: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface LenderCreate {
  name: string;
  products: LoanType[];
  submission_email?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_title?: string | null;
  email_domain?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface LenderUpdate {
  name?: string;
  products?: LoanType[];
  submission_email?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  contact_title?: string | null;
  email_domain?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface ConnectLenderNotifyToggle {
  participant_id: string;
  cc_outbound: boolean;
  bcc_outbound: boolean;
}

export interface ConnectLenderRequest {
  lender_id: string;
  notify: ConnectLenderNotifyToggle[];
}

export interface ConnectLenderResponse {
  loan: Loan;
  lender_id: string;
  lender_name: string;
  cc_count: number;
  bcc_count: number;
  stage_advanced: boolean;
}

export interface LenderSendRequest {
  document_ids: string[];
  delivery: "links" | "zip";
}

export interface LenderSendResponse {
  draft_id: string;
  lender_id: string;
  lender_name: string;
  delivery: "links" | "zip";
  document_count: number;
  zip_s3_key: string | null;
  to_email: string;
  subject: string;
}

export interface FredRefreshResult {
  series: Record<string, { rows: number; latest_date: string | null; latest_value: number | null }>;
  errors: Record<string, string>;
}

// ── Pre-qualification letter requests ──────────────────────────────────
// Backend: app/models/prequal_request.py + app/routers/prequal.py
//
// Status state machine (backend lifecycle 0011+):
//   pending → approved → offer_accepted (a Loan is spawned at THIS step)
//                        offer_declined (no loan ever created)
//             rejected
//
// loan_id is NULL until offer_accepted — submit creates a standalone
// request, not a Loan.
export type PrequalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "offer_accepted"
  | "offer_declined";
// Four products. DSCR splits into purchase vs refi (5pt LTV haircut on
// refi); Fix & Flip is a first-class option alongside Bridge. The
// underwriter-bound LTV ceilings live in PREQUAL_LTV_CAPS below — keep
// them in sync with the backend's LTV_CAPS in app/routers/prequal.py.
export type PrequalLoanType = "dscr_purchase" | "dscr_refi" | "fix_flip" | "bridge";

export const PREQUAL_LTV_CAPS: Record<PrequalLoanType, number> = {
  dscr_purchase: 0.80,
  dscr_refi: 0.75,
  fix_flip: 0.85,
  bridge: 0.85,
};

export const PREQUAL_LOAN_TYPE_LABELS: Record<PrequalLoanType, { title: string; sub: string }> = {
  dscr_purchase: { title: "DSCR Purchase", sub: "30-yr fixed · long-term hold" },
  dscr_refi:     { title: "DSCR Refinance", sub: "30-yr fixed · rate-and-term refi" },
  fix_flip:      { title: "Fix & Flip", sub: "Short-term · rehab financing" },
  bridge:        { title: "Bridge", sub: "Short-term · purchase / value-add" },
};

// Compact display labels for the canonical LoanType (loans.type column).
// These are short pill-friendly strings — DSCR / F&F / GU / Bridge / etc. —
// used on the pipeline table, kanban cards, and any other surface that
// shows the deal's product at a glance. Distinct from PREQUAL_LOAN_TYPE_LABELS
// which is keyed on the prequal-flow product picker (more granular: purchase
// vs refi, fix_flip vs bridge as the only short-term products).
export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  dscr:          "DSCR",
  fix_and_flip:  "F&F",
  ground_up:     "GU",
  bridge:        "Bridge",
  portfolio:     "Portfolio",
  cash_out_refi: "Cash-Out Refi",
};

export function loanTypeLabel(t: LoanType | string | null | undefined): string {
  if (!t) return "—";
  return (LOAN_TYPE_LABELS as Record<string, string>)[t] ?? String(t).replace(/_/g, " ");
}

// Fix & Flip scope-of-work line. Backend validates total_usd >= 0,
// category 1-80 chars, description 0-500 chars (alembic 0014).
export interface PrequalSowLineItem {
  category: string;
  description: string;
  total_usd: number;
}

export interface PrequalRequest {
  id: string;
  loan_id: string | null;
  requester_id: string;
  target_property_address: string;
  // For F&F: purchase_price is the BRV (Before Repair Value). For
  // DSCR / Bridge it's the property purchase / value. Same column,
  // different semantics by product.
  purchase_price: number;
  requested_loan_amount: number;
  // F&F-only (alembic 0014). Borrower's stated ARV + SOW breakdown.
  // Null on non-F&F products.
  arv_estimate: number | null;
  sow_items: PrequalSowLineItem[] | null;
  total_construction: number | null;
  approved_arv: number | null;
  approved_total_construction: number | null;
  approved_purchase_price: number | null;
  approved_loan_amount: number | null;
  // Calculator snapshot the underwriter saved on approve. Shape varies
  // by loan_type — JSON blob, not a fixed shape, since DSCR / Bridge /
  // F&F / GU each compute different fields.
  approved_scenario: Record<string, unknown> | null;
  loan_type: PrequalLoanType;
  expected_closing_date: string | null;
  borrower_notes: string | null;
  admin_notes: string | null;
  // LLC / entity name on the letter. NULL = TBD (borrower hasn't formed
  // the LLC yet — letter falls back to the individual client's name).
  borrower_entity: string | null;
  status: PrequalStatus;
  // Q-XXXX, generated on first approval and frozen across re-approvals.
  quote_number: string | null;
  // Presigned 24h GET URL — minted fresh on every API read so it's never
  // stale. Only present when status === "approved" or "offer_accepted".
  pdf_url: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // Revision chain (alembic 0037). parent_prequal_request_id points to
  // the predecessor in the chain; superseded_by_id is the next link
  // forward (NULL on the chain head). version_num is 1 for originals,
  // 2/3/... for each successive Updated Version.
  parent_prequal_request_id: string | null;
  superseded_by_id: string | null;
  version_num: number;
}

export interface PrequalRequestCreate {
  target_property_address: string;
  purchase_price: number;
  requested_loan_amount: number;
  loan_type: PrequalLoanType;
  expected_closing_date?: string | null;
  borrower_notes?: string | null;
  // null = TBD (borrower hasn't formed the LLC yet)
  borrower_entity?: string | null;
  // F&F-only. Borrower's stated ARV + SOW breakdown. Validated
  // server-side when loan_type='fix_flip'.
  arv_estimate?: number | null;
  sow_items?: PrequalSowLineItem[] | null;
}

export interface PrequalRequestApprove {
  approved_purchase_price: number;
  approved_loan_amount: number;
  admin_notes?: string | null;
  // Calculator snapshot from the review panel. Shape varies by product.
  approved_scenario?: Record<string, unknown> | null;
  // Override the default 90-day validity window.
  expiration_days?: number | null;
  // Admin can correct or fill in the LLC name.
  borrower_entity?: string | null;
  // F&F-only — admin overrides for ARV + SOW + total construction.
  approved_arv?: number | null;
  approved_sow_items?: PrequalSowLineItem[] | null;
  approved_total_construction?: number | null;
}

export interface PrequalRequestReject {
  // Mandatory — borrower sees this verbatim.
  admin_notes: string;
}

export interface PrequalSellerOutcome {
  // Optional borrower note about the outcome (e.g. "seller countered to 410k").
  note?: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Agent Funding Command Center — P0A types (frontend-first)
//
// Architecture rules:
//   1. Nullable ownership — agent_id may be null on existing/imported records.
//      Agent views (`scope: "mine"`) exclude unassigned; Super Admin / Funding
//      Team see all via `scope: "all"`.
//   2. visibility_scope is enforced at the server-projection layer — these
//      types describe internal/full shapes; borrower-facing endpoints must
//      return filtered projections, never raw event/task rows.
//   3. Reassignment: originating_agent_id never changes; current_agent_id
//      changes only via Super Admin and writes an AgentReassignmentAudit row.
//
// Single Client entity carries the full lifecycle via `stage`:
//   - lead → contacted → verified  (Agent-focused stages, "Leads view")
//   - ready_for_lending → processing → funded  (Funding Team owns; "Funding view")
//   - lost is terminal-loss
// "Start Funding" on a Pipeline card transitions stage to ready_for_lending,
// which kicks off Loan creation + handoff to Funding Team. Deals are not
// manually created — they emerge from this status transition.
// ────────────────────────────────────────────────────────────────────────────

export type ClientStage =
  | "lead"
  | "contacted"
  | "verified"
  | "ready_for_lending"
  | "processing"
  | "funded"
  | "lost";

export type ClientType = "buyer" | "seller";

// Stages that belong to the Agent's "Leads view" of the Pipeline. The Agent
// is heavily focused here — qualifying, collecting info, verifying. After
// verified the Agent clicks Start Funding and the Client enters the funding
// pipeline (ready_for_lending onward).
//
// `as const` narrows the array's element type to the literal union (not the
// full ClientStage) so consumers can build exhaustive Record<…> mappings.
export const LEAD_STAGES = ["lead", "contacted", "verified"] as const;

// Stages owned by the Funding Team / Super Admin. Agent retains read-only
// visibility on these for their own clients.
export const FUNDING_STAGES = ["ready_for_lending", "processing", "funded"] as const;

// Buyer-intent + funnel-progression signals. Captured from day one so the
// shared Deal Intelligence Core (P0B) has history to reason over.
export type EngagementSignalType =
  | "invite_opened"
  | "intake_started"
  | "intake_abandoned_step"
  | "doc_uploaded"
  | "document_viewed"
  | "message_viewed"
  | "login"
  | "last_action"
  | "simulator_used"
  | "profile_updated"
  | "credit_pull_started"
  | "credit_pull_completed"
  | "calendar_event_viewed";

export interface EngagementSignal {
  id: string;
  client_id: string;
  deal_id: string | null;
  signal_type: EngagementSignalType;
  metadata: Record<string, unknown> | null;     // e.g. { abandoned_at_step: "asset" }
  occurred_at: string;
}

// Origin stays historical; current_agent_id can change via Super Admin
// reassignment (Architecture Rule #3). Commission/reward status does NOT
// auto-change on reassignment — it stays "pending_review" until manual
// resolution.
export type AttributionCommissionStatus =
  | "pending_review"
  | "originator"
  | "current_only"
  | "split"
  | "waived";

export interface LoanAttribution {
  loan_id: string;
  lead_id: string | null;
  deal_id: string | null;
  originating_agent_id: string | null;
  current_agent_id: string | null;
  source_channel: string | null;
  referral_partner_id: string | null;
  commission_status: AttributionCommissionStatus;
  funded_amount: number | null;
  revenue: number | null;
}

export interface AgentReassignmentAudit {
  id: string;
  client_id: string;
  deal_id: string | null;
  from_agent_id: string | null;
  to_agent_id: string;
  changed_by_user_id: string;
  reason: string | null;
  created_at: string;
}

// Top-of-funnel work item for the Agent. P0A surface uses heuristic generation
// (no-response > N days, missing doc, closing soon, intake stalled). The full
// LLM-driven engine is P1.
export type NextBestActionType =
  | "call_borrower"
  | "request_doc"
  | "send_intake"
  | "submit_to_lender"
  | "review_dscr_risk"
  | "respond_to_borrower_question"
  | "revive_stale_lead"
  | "confirm_closing_logistics";

export type NextBestActionUrgency = "low" | "med" | "high";

export type NextBestActionScope = "agent" | "lead" | "deal" | "borrower";

export interface NextBestAction {
  id: string;
  scope: NextBestActionScope;
  scope_id: string;
  action_type: NextBestActionType;
  reason: string;                                // human-readable trigger
  urgency: NextBestActionUrgency;
  suggested_message: string | null;              // pre-drafted; respects ai_compliance_policy
  required_owner: "agent" | "borrower" | "funding_team" | "underwriter";
  due_date: string | null;
  generated_at: string;
  dismissed_at: string | null;
}

// Documented for future use by the shared core (P0B). Borrower-facing reads
// must be server-projection filtered to only borrower_visible content. P0A
// frontend does not consume raw event rows, so this lives here as a contract
// note for the eventual API integration.
export type VisibilityScope =
  | "internal_only"
  | "agent_visible"
  | "funding_visible"
  | "borrower_visible"
  | "underwriter_visible"
  | "all_internal";

// `scope` query param shared across list hooks (useClients, usePipeline,
// useLoans, useLeads, useDeals). Default is "mine" for Agent, "all" for
// Super Admin / Funding Team. `scope: "mine"` excludes unassigned records.
export type ListScope = "mine" | "all";
