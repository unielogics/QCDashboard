/**
 * The earnings plan as the API stores it (`operating-plan-v2`) and as the plan
 * screens hold it while it is being edited.
 *
 * A figure in the working copy may be the text someone is typing ("12."), so
 * every amount is `Amount`: a number as saved, or a string as typed. The engine
 * reads both; `toWire` in ./edit turns the working copy back into numbers.
 */

export const PLAN_MODEL = "operating-plan-v2";

export type Amount = number | string | null;
export type StreamType = "units" | "hourly" | "services" | "recurring" | "rental" | "commission" | "custom";
export type LineBehavior = "fixed" | "unit" | "pct";
export type ReviewStatus = "proposed" | "approved" | "rejected";
export type BaselineTreatment = "unreconciled" | "included_in_baseline" | "incremental_to_baseline" | "outside_operating_earnings";
export type CategoryAnswer = "included" | "not_applicable" | "help";
export type ItemBlock = "changes" | "growth" | "activities";

/**
 * One metric of a revenue stream. Volume metrics multiply into what the stream sells in a month and the others into
 * the price of one unit. A measure `alongside` counts the same month another way (the labor hours behind the units
 * sold): revenue does not follow it, it moves with the stream's volume unless the plan changes it, and a cost can.
 */
export type PlanFactor = { id: string; label: string; value: Amount; unit: string; volume: boolean; alongside?: boolean; custom?: boolean };
/**
 * Revenue is the known figure, so a stream states what it brings in an average month (`monthly_revenue`), or is the
 * one stream that holds what the others do not explain (`remainder`), and its price is never typed: it is that
 * revenue divided by the stream's volume. A stream with neither is its metrics multiplied together, which is how
 * plans were described before revenue was stated; `modernize` in ./edit turns those into stated streams.
 */
export type PlanStream = {
  id: string; name: string; type: StreamType; added?: boolean;
  monthly_revenue?: Amount; remainder?: boolean;
  factors: PlanFactor[];
};
/** `measure` is the measure alongside the linked stream's volume that a per-unit cost follows; none follows the volume itself. */
export type PlanLine = { id: string; group: string; label: string; base: Amount; behavior: LineBehavior; link: string; measure?: string | null; added?: boolean };
export type PlanTarget = {
  kind: "pricing" | "factor" | "line" | "group";
  stream_id?: string | null; factor_id?: string | null; line_id?: string | null; group?: string | null;
};

/** What every change, growth activity and new activity carries. */
export type PlanItemFields = {
  id: string;
  start_month: number;
  setup_cost: Amount;
  setup_cadence: "one_time" | "monthly";
  note: string;
  evidence_note: string;
  owner: string;
  included: boolean;
  source_file_ids?: string[];
  status: ReviewStatus;
  // Staff review fields: written only by the review route, never shown to the business.
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  review_reason?: string;
  review_stamp?: string | null;
  baseline_treatment?: BaselineTreatment;
  baseline_reconciliation_note?: string;
};
/**
 * How a change's `value` is read. "amount" is in the unit of what is changed: dollars a year for a fixed cost, a group
 * or pricing, the metric's own unit for a revenue metric, dollars a unit for a per-unit cost, points of revenue for a
 * percent-of-revenue cost. "annual" is dollars a year for a cost that follows a stream or revenue, measured at the
 * source's volume. "percent" is a percent of the figure itself.
 */
export type ChangeMode = "amount" | "annual" | "percent";
export type PlanChange = PlanItemFields & { target: PlanTarget; direction: "up" | "down"; mode: ChangeMode; value: Amount };
export type PlanGrowth = PlanItemFields & { name: string; monthly_spend: Amount; stream_id: string; factor_id: string; added_per_month: Amount };
export type PlanActivity = PlanItemFields & { name: string; monthly_amount: Amount };
export type PlanItemRow = PlanChange | PlanGrowth | PlanActivity;
export type PlanAllocation = { id: string; label: string; purpose: "existing" | "planned" | "reserve" | "other"; monthly_amount: Amount; notes?: string };
export type PlanCorrection = { amount: Amount; reason: string };
export type PlanSource = {
  stamp: string | null;
  confirmations: Record<string, "confirmed" | "corrected">;
  corrections: Record<string, PlanCorrection>;
};
export type PlanCarriedOver = { id: string; kind: string; label: string; detail: string; annual_amount: number | null; resolved: boolean };

export type EarningsPlanBody = {
  schema_version: typeof PLAN_MODEL;
  business_name: string;
  period_start: string | null;
  period_end: string | null;
  currency: string;
  plan_start: string | null;
  source: PlanSource;
  streams: PlanStream[];
  lines: PlanLine[];
  category_answers: Record<string, CategoryAnswer>;
  changes: PlanChange[];
  growth: PlanGrowth[];
  activities: PlanActivity[];
  allocations: PlanAllocation[];
  carried_over: PlanCarriedOver[];
  attestation: boolean;
  notes: string;
};

// ---------------------------------------------------------------------------
// The file's baseline as the engine reads it (evaluation.plan.baseline)
// ---------------------------------------------------------------------------

export type PlanBaselineGroup = {
  key: string; label: string; amount: number;
  category?: string | null; derived?: boolean;
  /** The latest P&L's figure for the same line, annualized. Comparison only. */
  statement_amount?: number | null;
};
export type PlanBaselineSource = {
  kind?: "tax_return" | "profit_and_loss" | null; label?: string | null; file_id?: string | null; file_name?: string | null;
  form?: string | null; year?: number | string | null; period_start?: string | null; period_end?: string | null;
  period_assumed?: boolean | null; months_covered?: number | null; currency?: string | null; basis?: string | null;
  accepted?: boolean | null; selected_by?: string | null; fallback?: boolean | null; annualized?: boolean | null;
};
export type PlanBaseline = {
  available?: boolean;
  reason?: string | null;
  revenue: number | null; cogs: number | null; operating_expenses: number | null; noi: number | null; ebitda: number | null;
  debt_service_current: number | null;
  /** None when the file has no saved loan terms. */
  debt_service_with_terms: number | null;
  debt_service_current_monthly?: number | null;
  debt_service_with_terms_monthly?: number | null;
  released_monthly?: number | null;
  /** Operating costs a year the saved loan terms themselves add. They come off coverage with the terms, not off earnings. */
  loan_operating_annual?: number | null;
  /** False while the budget lists such a cost without a confirmed amount: it is counted as zero until then. */
  loan_operating_confirmed?: boolean;
  terms_label?: string | null;
  statement?: { file_id?: string; label?: string; months_covered?: number | null; annualized?: boolean } | null;
  source_name?: string;
  source?: PlanBaselineSource;
  groups: PlanBaselineGroup[];
};
export type PlanQuestion = { key: string; label: string };

// ---------------------------------------------------------------------------
// The engine's result (the same keys as app/services/earnings_plan_math.py)
// ---------------------------------------------------------------------------

export type PlanScenario = {
  revenue: number; cogs: number; opex: number; noi: number; ebitda: number; activity_spend: number;
  lines: Record<string, number>;
  stream_revenue: Record<string, number>;
  stream_volume: Record<string, number>;
  /** A year's quantity of every measure alongside a stream's volume, keyed "stream:metric". */
  measures: Record<string, number>;
  factors: Record<string, number[]>;
};
/** What one unit brings in and costs: a year's quantity, and dollars per one of it. */
export type PlanPerUnit = { quantity: number; revenue: number; cost: number; noi: number };
/** `factor_id` null is the stream's own volume; otherwise a measure alongside it. A side is null when there is nothing to divide by. */
export type PlanPerUnitRow = { stream_id: string; factor_id: string | null; today: PlanPerUnit; proposed: PlanPerUnit | null; reviewed: PlanPerUnit | null };
export type PlanSixMetrics = {
  ebitda: number; noi: number;
  dscr: number | null; free_cash_flow: number | null; operating_margin: number | null; debt_service: number | null;
};
export type PlanDebtViews = { current_debt: PlanSixMetrics; with_terms: PlanSixMetrics | null };
export type PlanItemKind = "change" | "growth" | "activity";
export type PlanItemSummary = {
  id: string; kind: PlanItemKind; key: string; area: number; label: string; start_month: number;
  /** Counted in the working plan: switched on and not rejected. */
  included: boolean;
  /** Counted in the reviewed plan: switched on and approved. */
  reviewed: boolean;
  status: ReviewStatus; on: boolean;
};
export type PlanMove = { label: string; amount: number };
export type PlanEffect = { ebitda: number; noi: number; revenue: number; first_year: number; one_time: number; moves: PlanMove[] };
export type PlanSection = { key: string; label: string; areas: number[]; ebitda: number; items: string[] };
export type PlanBridgeStep = { key: number; label: string; value: number };
export type PlanMonth = { ebitda: number; noi: number };
export type PlanView = "proposed" | "reviewed";
export type ToFinishCode = "no_source" | "confirm_source" | "reconcile_revenue" | "answer_category" | "explain_change" | "attest";
export type ToFinishItem = { code: ToFinishCode; step: 0 | 1 | 2 | 3; label: string; key?: string; item_id?: string };

export type PlanResult = {
  model: {
    volume: Record<string, number>; revenue: Record<string, number>; total: number; difference: number; reconciles: boolean;
    /** Today's value of every metric (a stated stream's price is worked out, not typed) and of every measure alongside. */
    factors: Record<string, number[]>; measures: Record<string, number>;
  };
  /** One row for each stream volume and each measure alongside that has something to divide by. */
  per_unit: PlanPerUnitRow[];
  rates: Record<string, number>;
  behaviors: Record<string, LineBehavior>;
  items: PlanItemSummary[];
  proposed: PlanScenario;
  reviewed: PlanScenario;
  months: Record<PlanView, PlanMonth[]>;
  first_year: Record<PlanView, PlanMonth>;
  effects: Record<string, PlanEffect>;
  sections: PlanSection[];
  bridge: Record<PlanView, PlanBridgeStep[]>;
  metrics: { today: PlanDebtViews; proposed: PlanDebtViews; reviewed: PlanDebtViews };
  debt_service: { current: number | null; with_terms: number | null; plan: number | null; loan_operating: number };
  target: { ratio: number; proposed: number | null; reviewed: number | null };
  goal: { amount: number | null; proposed_gap: number | null; reviewed_gap: number | null };
  released: { available_monthly: number; allocated_monthly: number; over_allocated: boolean; unallocated_monthly: number };
  to_finish: ToFinishItem[];
};

// ---------------------------------------------------------------------------
// What the plan screens load (GET .../operating-plan/v2 and the client link)
// ---------------------------------------------------------------------------

export type PlanGoal = { status: "set" | "awaiting_staff"; metric?: string; amount: number | null; currency: string | null; revision: number; updated_at?: string | null };
export type PlanVersion = {
  id: string; version_number: number; created_at: string; actor_name?: string | null;
  source?: string; status?: string; pdf_file_id?: string | null; pdf_url?: string | null;
};
export type StreamTemplate = { label: string; unit_word: string; factors: Array<[string, string, boolean]> };
export type PlanWarning = { code: string; message: string };

/** The server's evaluation, of which the screens use only what cannot be computed in the browser. */
export type PlanServerEvaluation = {
  context_stamp?: string;
  plan: Partial<PlanResult> & {
    baseline: PlanBaseline;
    questions: PlanQuestion[];
    source_stamp: string | null;
    source_changed: boolean;
    stale_reviews: string[];
    labels?: Record<string, string>;
    warnings: PlanWarning[];
  };
};

export type PlanWorkspace = {
  kind: "operating_plan";
  model: typeof PLAN_MODEL;
  origin: "seeded" | "carried_over" | "saved";
  family_id: string | null;
  body: EarningsPlanBody;
  evaluation: PlanServerEvaluation;
  goal: PlanGoal | null;
  context_stamp: string;
  stream_templates: Record<string, StreamTemplate>;
  draft: { revision: number; base_version_id: string | null; updated_at: string; stored_model?: string | null; dirty: boolean } | null;
  current_version_id: string | null;
  versions: PlanVersion[];
  /** Client link only: false when the link may read but not edit. */
  can_edit?: boolean;
  /** Client link only: the link was already submitted once. */
  completed?: boolean;
};
