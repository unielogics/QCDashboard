/**
 * The plan as the file's other screens read it.
 *
 * The earnings plan is edited in its own workspace (lib/earningsPlan). What the
 * API hands the File page, the coverage card and the marketplace is the plan's
 * evaluation in the shape those readers have always taken: a baseline, the
 * proposed and reviewed projections, each change's effect and the six figures
 * side by side. Those types live here, with the two small helpers the same
 * screens use.
 */
import type { OperatingGoalProgress, OperatingCashBridge } from "./operatingGoal";
import type { NoiBaselineGovernance } from "./noiGovernance";

export type PlanAmount = string | number | null;
export type ReleasedCashFlowAllocation = { id: string; label: string; amount_monthly: PlanAmount; expense_row_id?: string | null; action_id?: string | null; purpose?: "existing_cost" | "planned_increment" | "reserve" | "other" | null; notes: string };
export type ReleasedCashFlowEvaluation = {
  required: boolean; available: boolean; status: string; source_fingerprint: string | null;
  currency: string | null; amount_monthly: number | null; allocated_monthly: number; unallocated_monthly: number | null;
  complete: boolean; missing: string[];
  source: { updated_at: string | null; before_monthly: number | null; after_monthly: number | null; new_operating_expenses_monthly?: number | null; new_financing_fees_monthly?: number | null } | null;
  allocations?: ReleasedCashFlowAllocation[];
};
export type OperatingProjection = { earnings: number | null; first_year_earnings?: number | null; first_year_noi?: number | null; noi_status?: "awaiting_review" | "no_actions" | "reviewed_illustration" | "unreviewed_illustration" | "unavailable"; first_year_dscr_current?: number | null; first_year_dscr_with_refinance?: number | null; coverage_basis?: string; noi: number | null; dscr_current: number | null; dscr_with_refinance: number | null; annual_debt_service: number | null; refinance_annual_debt_service: number | null; target_gap_current: number | null; target_gap_refinance: number | null; status?: string };
export type OperatingMetricValues = Record<"earnings" | "noi" | "dscr" | "cash_after_debt" | "operating_margin" | "debt_service", number | null>;
export type OperatingComparison = {
  loan_basis: "current_debt" | "saved_terms" | "incomplete_terms";
  loan_cash_monthly?: number | null;
  target_gap?: Record<"proposed" | "approved", number | null>;
  proposed_basis: string;
  baseline: OperatingMetricValues; proposed: OperatingMetricValues; approved: OperatingMetricValues;
};
export type OperatingEvaluation = {
  comparison?: OperatingComparison;
  goal_progress?: OperatingGoalProgress; cash_bridge?: OperatingCashBridge;
  expense_groups?: Array<{ key: string; category: string; label: string; baseline_annual_amount: number | null; disclosed_annual_amount: number | null; difference_annual: number | null; status: "no_detail" | "incomplete" | "matches_source" | "differs_from_source" | "source_changed"; notes: string[] }>;
  released_cash_flow?: ReleasedCashFlowEvaluation;
  context_stamp?: string; disclosure: { operating_monthly: number | null; cogs_monthly: number | null; operating_cash_monthly: number | null; non_operating_monthly: number | null; one_time_total: number | null; active_count: number; excluded_count: number; missing_inputs: string[]; complete: boolean };
  actions: Array<{ product_name?: string; calculation?: { product_name?: string; revenue_return_multiple?: number | null; incremental_spend?: number | null; incremental_revenue?: number | null; incremental_contribution?: number | null; with_support_annual_impact?: number | null; formula?: string }; id: string; label: string; kind: string; status: string; review_state: string; gross_annual_impact: number | null; implementation_recurring_annual: number | null; implementation_one_time: number | null; net_annual_impact: number | null; first_year_impact: number | null; monthly_impact: number | null; included_in_approved_projection: boolean; proposed_math_valid?: boolean; included_in_proposed_projection?: boolean; issues: string[]; risk_flags: string[]; source_file_ids: string[] }>;
  totals: Record<"proposed" | "approved", { annual_impact: number | null; monthly_impact: number | null; first_year_impact: number | null; one_time_cost: number | null; complete: boolean; count: number; expected_count?: number; known_annual_subtotal?: number; known_first_year_subtotal?: number }>;
  baseline: { noi_governance?: NoiBaselineGovernance; noi_kind?: string | null; noi_currency?: string | null; noi_label?: string | null; noi_year?: string | number | null; noi_basis?: string | null; noi_staff_reviewed?: boolean; noi_provisional?: boolean; period: string | null; currency: string | null; basis: string | null; revenue: number | null; earnings: number | null; earnings_kind: string | null; noi: number | null; dscr: number | null; annual_debt_service: number | null; provisional: boolean };
  projection: Record<"proposed" | "approved", OperatingProjection>;
  targets?: { current: Array<{ ratio: number; earnings_required: number | null }>; refinance: Array<{ ratio: number; earnings_required: number | null }> };
  missing: string[]; risk_flags: string[]; notes: string[]; all_actions_reviewed: boolean;
  recommendation?: { threshold: number; recommended: boolean | null; reason: string; earnings_gap_annual: number | null };
};

export const operatingLabel = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
export const operatingMoney = (value: number | null | undefined, currency = "USD") => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD", maximumFractionDigits: 2 }).format(value);
