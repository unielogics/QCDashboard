// Hand-typed mirror of backend response shapes.
// (When you scale, switch to OpenAPI codegen — for now the surface is small.)

import type { LoanStage, LoanType, PropertyType, Role, AITaskPriority, AITaskSource, AITaskStatus, BrokerTier, MessageFrom, DocStatus, CalendarEventKind, EntityType, ExperienceTier, CreditPullStatus, DealChatMode, DealChatRole, FeedbackOutputType, FeedbackRating } from "./enums.generated";

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
  address: string;
  city: string | null;
  property_type: PropertyType;
  type: LoanType;
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
}

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
  property_type: PropertyType;
  sqft?: number | null;
  annual_taxes: number;
  annual_insurance: number;
  as_is_value?: number | null;
}

export interface NumbersStep {
  type: LoanType;
  amount: number;
  ltv: number;
  ltc?: number | null;
  arv?: number | null;
  monthly_rent?: number | null;
  base_rate: number;
}

export interface AIRulesStep {
  floor_rate: number;
  max_buy_down_points: number;
  require_soft_pull: boolean;
  auto_send_terms: boolean;
  doc_auto_verify: boolean;
  escalation_delta_bps: number;
  notify_channel: "push" | "email" | "sms" | "sms+email";
  intro_message?: string | null;
}

export interface SmartIntakePayload {
  borrower: BorrowerStep;
  asset: AssetStep;
  numbers: NumbersStep;
  ai_rules: AIRulesStep;
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
  required: boolean;
  auto_request: boolean;
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
  created_at: string;
  updated_at: string;
}

export interface AIChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  created_at: string;
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
