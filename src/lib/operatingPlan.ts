import type { FileRequestItem } from "./fileRequestsApi";
import type { FinancialWorkspaceSnapshot } from "./financialWorkspaceApi";
import type { NoiBaselineGovernance } from "./noiGovernance";

export type PlanAmount = string | number | null;
export type OperatingCadence = "weekly" | "biweekly" | "semi_monthly" | "monthly" | "quarterly" | "annual" | "one_time";
export type OperatingCostBasis = "total" | "per_unit";
export type OperatingUnitCost = {
  cost_basis?: OperatingCostBasis; unit_label?: string; current_units_per_period?: PlanAmount;
  current_unit_cost?: PlanAmount; current_fixed_amount?: PlanAmount;
};
export type OperatingActionKind = "price_change" | "product_cost_change" | "revenue_change" | "expense_reduction" | "expense_increase" | "one_time_adjustment" | "processing_cost_change";
export type OperatingExpense = OperatingUnitCost & {
  id: string; category?: string; label?: string; payee?: string; current_amount?: PlanAmount;
  cadence?: OperatingCadence; essential?: boolean; source_file_ids?: string[]; bank_vendor_key?: string | null;
  notes?: string; excluded?: boolean; duplicate_of?: string | null;
};
export type OperatingAction = OperatingUnitCost & {
  id: string; kind?: OperatingActionKind; label?: string; driver_key?: string; expense_row_id?: string | null;
  current_amount?: PlanAmount; proposed_amount?: PlanAmount; cadence?: OperatingCadence;
  units_per_period?: PlanAmount; current_unit_price?: PlanAmount; proposed_unit_price?: PlanAmount;
  current_unit_cost?: PlanAmount; proposed_unit_cost?: PlanAmount; contribution_margin_pct?: PlanAmount;
  implementation_cost?: PlanAmount; implementation_cost_cadence?: "one_time" | "monthly" | "annual";
  effective_date?: string | null; explanation?: string; source_file_ids?: string[]; source_note?: string; owner_name?: string;
  status?: "proposed" | "approved" | "rejected"; excluded?: boolean; duplicate_of?: string | null;
  reviewed_by_user_id?: string | null; reviewed_at?: string | null; review_reason?: string | null; review_source_stamp?: unknown;
  baseline_treatment?: "unreconciled" | "included_in_baseline" | "incremental_to_baseline" | "outside_operating_earnings";
  baseline_reconciliation_note?: string | null;
  processing_volume?: PlanAmount; processing_transaction_count?: PlanAmount;
  current_processing_rate_pct?: PlanAmount; proposed_processing_rate_pct?: PlanAmount;
  current_processing_fixed_fee?: PlanAmount; proposed_processing_fixed_fee?: PlanAmount;
  current_processing_per_transaction_fee?: PlanAmount; proposed_processing_per_transaction_fee?: PlanAmount;
  current_processing_rate_basis?: "all_in" | "processor_markup" | "unknown";
  proposed_processing_rate_basis?: "all_in" | "processor_markup" | "unknown";
  merchant_source_key?: string | null; merchant_offer_id?: string | null;
  proposed_units_per_period?: PlanAmount; proposed_fixed_amount?: PlanAmount;
};
export type OperatingPlanBody = Record<string, unknown> & {
  schema_version?: string; business_name?: string; period_start?: string; period_end?: string; currency?: string;
  basis?: "cash" | "accrual" | "unknown"; no_operating_expenses_confirmed?: boolean; notes?: string;
  projection_start?: string | null;
  expenses?: OperatingExpense[]; adjustments?: OperatingAction[];
  released_cash_flow?: { source_fingerprint: string | null; allocations: ReleasedCashFlowAllocation[] };
};
export type ReleasedCashFlowAllocation = { id: string; label: string; amount_monthly: PlanAmount; expense_row_id?: string | null; notes: string };
export type ReleasedCashFlowEvaluation = {
  required: boolean; available: boolean; status: string; source_fingerprint: string | null;
  currency: string; amount_monthly: number | null; allocated_monthly: number; unallocated_monthly: number | null;
  complete: boolean; missing: string[];
  source: { updated_at: string | null; before_monthly: number | null; after_monthly: number | null; new_operating_expenses_monthly?: number | null; new_financing_fees_monthly?: number | null } | null;
  allocations?: ReleasedCashFlowAllocation[];
};
export type OperatingPlanSchema = { kind?: string; [key: string]: unknown };
export type OperatingProjection = { earnings: number | null; first_year_earnings?: number | null; first_year_dscr_current?: number | null; first_year_dscr_with_refinance?: number | null; coverage_basis?: string; noi: number | null; dscr_current: number | null; dscr_with_refinance: number | null; annual_debt_service: number | null; refinance_annual_debt_service: number | null; target_gap_current: number | null; target_gap_refinance: number | null; status?: string };
export type OperatingEvaluation = {
  released_cash_flow?: ReleasedCashFlowEvaluation;
  context_stamp?: string; disclosure: { operating_monthly: number | null; cogs_monthly: number | null; operating_cash_monthly: number | null; non_operating_monthly: number | null; one_time_total: number | null; active_count: number; excluded_count: number; missing_inputs: string[]; complete: boolean };
  actions: Array<{ id: string; label: string; kind: string; status: string; review_state: string; gross_annual_impact: number | null; implementation_recurring_annual: number | null; implementation_one_time: number | null; net_annual_impact: number | null; first_year_impact: number | null; monthly_impact: number | null; included_in_approved_projection: boolean; issues: string[]; risk_flags: string[]; source_file_ids: string[] }>;
  totals: Record<"proposed" | "approved", { annual_impact: number | null; monthly_impact: number | null; first_year_impact: number | null; one_time_cost: number | null; complete: boolean; count: number; expected_count?: number; known_annual_subtotal?: number; known_first_year_subtotal?: number }>;
  baseline: { noi_governance?: NoiBaselineGovernance; noi_kind?: string | null; noi_label?: string | null; noi_year?: string | number | null; noi_basis?: string | null; noi_staff_reviewed?: boolean; noi_provisional?: boolean; period: string | null; currency: string | null; basis: string | null; revenue: number | null; earnings: number | null; earnings_kind: string | null; noi: number | null; dscr: number | null; annual_debt_service: number | null; provisional: boolean };
  projection: Record<"proposed" | "approved", OperatingProjection>;
  targets?: { current: Array<{ ratio: number; earnings_required: number | null }>; refinance: Array<{ ratio: number; earnings_required: number | null }> };
  missing: string[]; risk_flags: string[]; notes: string[]; all_actions_reviewed: boolean;
  recommendation?: { threshold: number; recommended: boolean | null; reason: string; earnings_gap_annual: number | null };
};
export const OPERATING_CADENCES: Array<[OperatingCadence, string]> = [["weekly", "Week"], ["biweekly", "Every 2 weeks"], ["semi_monthly", "Twice a month"], ["monthly", "Month"], ["quarterly", "Quarter"], ["annual", "Year"], ["one_time", "One time"]];
export const OPERATING_CATEGORIES = ["rent", "salaries", "payroll_taxes", "insurance", "utilities", "marketing", "software", "professional_fees", "supplies", "repairs", "transportation", "cogs", "merchant_processing", "loan_payments", "income_taxes", "owner_draws", "transfers", "depreciation_amortization", "other"];
export const OPERATING_ACTIONS: Array<[OperatingActionKind, string]> = [["price_change", "Customer price change"], ["product_cost_change", "Product cost change"], ["revenue_change", "Revenue / volume change"], ["expense_reduction", "Expense reduction"], ["expense_increase", "Expense increase"], ["processing_cost_change", "Card processing cost change"], ["one_time_adjustment", "One-time adjustment"]];
export const operatingLabel = (value: string) => value.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
export const operatingNumber = (value: unknown): number | null => {
  if (value == null || String(value).trim() === "") return null;
  const result = Number(String(value).replaceAll(",", "").replaceAll("$", ""));
  return Number.isFinite(result) ? result : null;
};
const OPERATING_NUMERIC_FIELDS = new Set(["current_amount", "proposed_amount", "units_per_period", "current_units_per_period", "proposed_units_per_period", "current_fixed_amount", "proposed_fixed_amount", "current_unit_price", "proposed_unit_price", "current_unit_cost", "proposed_unit_cost", "contribution_margin_pct", "implementation_cost", "processing_volume", "processing_transaction_count", "current_processing_rate_pct", "proposed_processing_rate_pct", "current_processing_fixed_fee", "proposed_processing_fixed_fee", "current_processing_per_transaction_fee", "proposed_processing_per_transaction_fee"]);
/** Normalize known numeric fields individually. A bad cell must never erase its rows. */
export function normalizeOperatingPlanBody<T extends Record<string, unknown>>(body: T): T {
  const next = { ...body } as Record<string, unknown>;
  if (next.released_cash_flow && typeof next.released_cash_flow === "object" && !Array.isArray(next.released_cash_flow)) {
    const release = next.released_cash_flow as Record<string, unknown>;
    next.released_cash_flow = { ...release, allocations: Array.isArray(release.allocations) ? release.allocations.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return item;
      const row = item as Record<string, unknown>;
      const amount = operatingNumber(row.amount_monthly);
      return { ...row, amount_monthly: row.amount_monthly == null || String(row.amount_monthly).trim() === "" ? null : amount ?? row.amount_monthly };
    }) : [] };
  }
  for (const key of ["no_operating_expenses_confirmed", "client_attestation"]) {
    if (next[key] === "true" || next[key] === "false") next[key] = next[key] === "true";
  }
  for (const collection of ["expenses", "adjustments"]) {
    if (!Array.isArray(next[collection])) continue;
    next[collection] = (next[collection] as unknown[]).map((value) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return value;
      const row = { ...value } as Record<string, unknown>;
      for (const key of ["review_reason", "baseline_reconciliation_note"]) {
        if (key in row && row[key] == null) row[key] = "";
      }
      for (const key of ["essential", "excluded"]) {
        if (row[key] === "true" || row[key] === "false") row[key] = row[key] === "true";
      }
      for (const key of OPERATING_NUMERIC_FIELDS) {
        if (!(key in row)) continue;
        const input = row[key];
        if (input == null || typeof input === "string" && !input.trim()) row[key] = null;
        else if (typeof input === "number") row[key] = Number.isFinite(input) ? input : null;
        else if (typeof input === "string") {
          const parsed = operatingNumber(input);
          // Keep invalid text visible for correction instead of discarding the draft.
          if (parsed != null) row[key] = parsed;
        }
      }
      return row;
    });
  }
  return next as T;
}
export const cadenceFactor = (cadence?: OperatingCadence) => ({ weekly: 52, biweekly: 26, semi_monthly: 24, monthly: 12, quarterly: 4, annual: 1, one_time: 0 }[cadence ?? "monthly"]);
export const operatingMoney = (value: number | null | undefined, currency = "USD") => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD", maximumFractionDigits: 2 }).format(value);

/** Unit costs replace the period total; the retained source total is never added. */
export function operatingExpenseAmount(row: OperatingExpense | OperatingAction, proposed = false): number | null {
  if (row.cost_basis !== "per_unit") return operatingNumber(proposed ? (row as OperatingAction).proposed_amount : row.current_amount);
  const action = row as OperatingAction;
  const values = [proposed ? action.proposed_units_per_period : row.current_units_per_period, proposed ? action.proposed_unit_cost : row.current_unit_cost, proposed ? action.proposed_fixed_amount : row.current_fixed_amount].map(operatingNumber);
  if (values.some((value) => value == null || value < 0)) return null;
  return values[0]! * values[1]! + values[2]!;
}

export function operatingExpenseProposal(body: OperatingPlanBody, expenseId: string) {
  return body.adjustments?.find((row) => row.expense_row_id === expenseId && !row.excluded && !row.duplicate_of && ["expense_reduction", "expense_increase"].includes(row.kind ?? ""));
}

/** Reconcile an existing proposal with its disclosed cost without erasing its proposed changes. */
export function linkOperatingActionExpense(body: OperatingPlanBody, actionId: string, expenseId: string | null): OperatingPlanBody {
  const expense = expenseId ? body.expenses?.find((row) => row.id === expenseId && !row.excluded && !row.duplicate_of) : null;
  if (expenseId && !expense) return body;
  return { ...body, adjustments: body.adjustments?.map((row) => row.id !== actionId ? row : clearOperatingReview({ ...row, expense_row_id: expenseId, ...(expense ? { driver_key: expense.id, source_file_ids: [...new Set([...(expense.source_file_ids ?? []), ...(row.source_file_ids ?? [])])], ...(row.kind === "processing_cost_change" ? { cost_basis: "total" as const } : { cost_basis: expense.cost_basis ?? "total", unit_label: expense.unit_label ?? "", current_amount: expense.cost_basis === "per_unit" ? null : expense.current_amount, ...(expense.cost_basis === "per_unit" ? { proposed_amount: null } : {}), current_units_per_period: expense.current_units_per_period, current_unit_cost: expense.current_unit_cost, current_fixed_amount: expense.current_fixed_amount, cadence: expense.cadence ?? "monthly" }) } : {}) })) };
}

/** Every category can propose changes in quantity, rate and fixed cost independently. */
export function proposeExpenseUnits(body: OperatingPlanBody, expenseId: string, patch: Partial<Pick<OperatingAction, "proposed_units_per_period" | "proposed_unit_cost" | "proposed_fixed_amount">>, id: () => string): OperatingPlanBody {
  const expense = body.expenses?.find((row) => row.id === expenseId);
  if (!expense) return body;
  const existing = operatingExpenseProposal(body, expenseId);
  const action = clearOperatingReview({ ...existing, ...patch, id: existing?.id ?? id(), cost_basis: "per_unit", unit_label: expense.unit_label ?? "", label: expense.label, expense_row_id: expenseId, driver_key: expenseId, current_amount: null, proposed_amount: null, current_units_per_period: expense.current_units_per_period, current_unit_cost: expense.current_unit_cost, current_fixed_amount: expense.current_fixed_amount, cadence: expense.cadence ?? "monthly", source_file_ids: existing?.source_file_ids ?? expense.source_file_ids ?? [], excluded: false });
  const before = operatingExpenseAmount(action); const after = operatingExpenseAmount(action, true);
  action.kind = before != null && after != null && after > before ? "expense_increase" : "expense_reduction";
  return { ...body, adjustments: existing ? body.adjustments!.map((row) => row.id === existing.id ? action : row) : [...(body.adjustments ?? []), action] };
}

/** A proposal changes forward earnings; the disclosed current expense stays intact. */
export function proposeExpense(body: OperatingPlanBody, expenseId: string, proposed: PlanAmount, id: () => string): OperatingPlanBody {
  const expense = body.expenses?.find((row) => row.id === expenseId);
  if (!expense) return body;
  const existing = operatingExpenseProposal(body, expenseId);
  const before = operatingNumber(expense.current_amount); const after = operatingNumber(proposed);
  const action: OperatingAction = clearOperatingReview({ ...existing, cost_basis: "total", id: existing?.id ?? id(), kind: before != null && after != null && after > before ? "expense_increase" : "expense_reduction", label: expense.label, expense_row_id: expenseId, driver_key: expenseId, current_amount: expense.current_amount, proposed_amount: proposed, cadence: expense.cadence ?? "monthly", source_file_ids: existing?.source_file_ids ?? expense.source_file_ids ?? [], excluded: false });
  return { ...body, adjustments: existing ? body.adjustments!.map((row) => row.id === existing.id ? action : row) : [...(body.adjustments ?? []), action] };
}
/** Edits invalidate the local approval display; the server validates its evidence stamp too. */
export function clearOperatingReview(row: OperatingAction): OperatingAction {
  return { ...row, status: "proposed", reviewed_by_user_id: null, reviewed_at: null, review_reason: "", review_source_stamp: null, baseline_treatment: "unreconciled", baseline_reconciliation_note: "" };
}
export function operatingExpenseTotal(rows: OperatingExpense[]) {
  return rows.filter((row) => !row.excluded && !row.duplicate_of).reduce((result, row) => {
    const amount = operatingExpenseAmount(row);
    if (amount == null) result.missing += 1;
    else if (row.cadence === "one_time") result.oneTime += amount;
    else result.annual += amount * cadenceFactor(row.cadence);
    return result;
  }, { annual: 0, oneTime: 0, missing: 0 });
}

/** Display only; authoritative reconciled projections come from the evaluator. */
export function illustrativeActionImpact(row: OperatingAction): number | null {
  if (row.excluded || row.duplicate_of || row.status === "rejected") return 0;
  const current = operatingExpenseAmount(row); const proposed = operatingExpenseAmount(row, true);
  const units = operatingNumber(row.units_per_period);
  let delta: number | null = null;
  if (row.kind === "price_change" || row.kind === "product_cost_change") {
    const before = operatingNumber(row.kind === "price_change" ? row.current_unit_price : row.current_unit_cost);
    const after = operatingNumber(row.kind === "price_change" ? row.proposed_unit_price : row.proposed_unit_cost);
    if (before != null && after != null && units != null) delta = (row.kind === "price_change" ? after - before : before - after) * units;
  } else if (row.kind === "processing_cost_change") {
    const volume = operatingNumber(row.processing_volume); const oldRate = operatingNumber(row.current_processing_rate_pct); const newRate = operatingNumber(row.proposed_processing_rate_pct);
    const basis = row.current_processing_rate_basis;
    if (volume != null && oldRate != null && newRate != null && basis && basis !== "unknown" && basis === row.proposed_processing_rate_basis) {
      if (basis === "all_in") {
        if (![row.current_processing_fixed_fee, row.proposed_processing_fixed_fee, row.current_processing_per_transaction_fee, row.proposed_processing_per_transaction_fee].some((v) => (operatingNumber(v) ?? 0) !== 0)) delta = volume * (oldRate - newRate) / 100;
      } else {
        const count = operatingNumber(row.processing_transaction_count); const fees = [row.current_processing_fixed_fee, row.proposed_processing_fixed_fee, row.current_processing_per_transaction_fee, row.proposed_processing_per_transaction_fee].map(operatingNumber);
        if (count != null && fees.every((v) => v != null)) delta = volume * (oldRate - newRate) / 100 + fees[0]! - fees[1]! + count * (fees[2]! - fees[3]!);
      }
    }
  } else if (current != null && proposed != null) {
    if (row.kind === "revenue_change") { const margin = operatingNumber(row.contribution_margin_pct); if (margin != null) delta = (proposed - current) * margin / 100; }
    else delta = row.kind === "one_time_adjustment" ? proposed - current : current - proposed;
  }
  if (delta == null) return null;
  const cost = operatingNumber(row.implementation_cost);
  if (cost == null) return null;
  const costFactor = row.implementation_cost_cadence === "monthly" ? 12 : row.implementation_cost_cadence === "annual" ? 1 : 0;
  const factor = row.cadence === "one_time" ? 0 : cadenceFactor(row.cadence);
  return delta * factor - cost * costFactor;
}
export function operatingPlanRequest(businessName: string): FileRequestItem {
  return { document_type: "operating_plan", name: "Operating expenses and earnings plan", quantity: 1, unit: "files", subject: businessName.trim() || "business", period: "current", instructions: "Complete the operating expenses table, including rent, payroll, product costs and card processing fees. Propose any price, product-cost or expense changes with amounts, timing and an explanation. Attach current statements and proposed quotes where applicable." };
}

/** Review routes return the acknowledged workspace, scoped to the family just flushed. */
export function operatingReviewedWorkspace(reply: unknown, familyId: string): FinancialWorkspaceSnapshot {
  const envelope = reply && typeof reply === "object" ? reply as Record<string, unknown> : {};
  const value = (envelope.workspace ?? envelope) as Partial<FinancialWorkspaceSnapshot>;
  if (value.kind !== "operating_plan" || value.family_id !== familyId || !value.body || !value.draft || !Number.isInteger(value.draft.revision)) throw new Error("The review was recorded but its draft could not be refreshed. Reopen this plan before saving a version.");
  return value as FinancialWorkspaceSnapshot;
}
