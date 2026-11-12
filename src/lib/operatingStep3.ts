import { updateOperatingExpense, DEFAULT_OPERATING_ESSENTIALS, type OperatingGuidance } from "./operatingGuidance";
import { clearOperatingReview, linkOperatingActionExpense, operatingLabel, proposeExpense, proposeExpenseUnits, type OperatingAction, type OperatingEvaluation, type OperatingExpense, type OperatingPlanBody } from "./operatingPlan";

export function operatingStep3NoiCurrency(baseline?: OperatingEvaluation["baseline"]): string | null | undefined {
  if (baseline?.noi_governance) return baseline.noi_governance.currency;
  if (baseline && "noi_currency" in baseline) return baseline.noi_currency;
  return baseline?.currency;
}

const active = <T extends { excluded?: boolean; duplicate_of?: string | null }>(rows: T[] = []) => rows.filter(row => !row.excluded && !row.duplicate_of);
export const genericExpenseAction = (row: OperatingAction) => ["expense_reduction", "expense_increase"].includes(row.kind ?? "");
export const linkedExpenseChanges = (body: OperatingPlanBody, id: string) => active(body.adjustments).filter(row => row.expense_row_id === id && genericExpenseAction(row) && row.status !== "rejected");
export const operatingProposalDimensionMismatch = (expense: OperatingExpense, action?: OperatingAction | null) => Boolean(action && ((action.cadence || "monthly") !== (expense.cadence || "monthly") || (action.cost_basis || "total") !== (expense.cost_basis || "total") || (action.unit_label || "") !== (expense.unit_label || "")));
export type OperatingChangeGroup = { key: string; category: string; label: string; sourceGroupKey: string; expenses: OperatingExpense[]; activities: OperatingAction[]; removedExpenses?: OperatingExpense[]; rejectedActivities?: OperatingAction[] };
export type OperatingChangeCategory = { key: string; label: string; groups: OperatingChangeGroup[] };

/** View-only grouping: stable row IDs and source keys are never regenerated. */
export function operatingChangeCategories(body: OperatingPlanBody, guidance?: OperatingGuidance | null): OperatingChangeCategory[] {
  const historyRows = body.expenses ?? [], rows = active(body.expenses), actions = active(body.adjustments);
  const essentials = guidance?.essentials?.length ? guidance.essentials : DEFAULT_OPERATING_ESSENTIALS;
  const owner = (action: OperatingAction) => historyRows.find(row => row.id === action.expense_row_id);
  const sourceFor = (action: OperatingAction) => { const expense = owner(action); return expense ? expense.source_group_key || "" : action.source_group_key || ""; };
  const category = (action: OperatingAction) => owner(action) ? owner(action)!.category || "other" : action.expense_category || (action.kind === "marketing_investment" ? "marketing" : action.kind === "processing_cost_change" ? "merchant_processing" : action.kind === "product_cost_change" ? "cogs" : "other");
  const keys = [...new Set([...essentials.map(row => row.category), ...guidance?.expense_groups?.map(row => row.category) ?? [], ...historyRows.map(row => row.category || "other"), ...actions.map(category)])];
  return keys.map(key => {
    const sourceGroups = guidance?.expense_groups?.filter(group => group.category === key) ?? [];
    const historicalRows = historyRows.filter(row => (row.category || "other") === key);
    const scopedRows = rows.filter(row => (row.category || "other") === key), scopedActions = actions.filter(row => category(row) === key);
    const sources = [...new Set([...sourceGroups.map(group => group.key), ...historicalRows.map(row => row.source_group_key || ""), ...scopedActions.map(row => sourceFor(row))])];
    if (!sources.length) sources.push("");
    return { key, label: essentials.find(row => row.category === key)?.label || operatingLabel(key), groups: sources.map(source => ({ key: `${key}:${source || "unscoped"}`, category: key, sourceGroupKey: source, label: sourceGroups.find(row => row.key === source)?.label || (source ? "Previously recorded source group" : "Additional items and activities"), expenses: scopedRows.filter(row => (row.source_group_key || "") === source), removedExpenses: historicalRows.filter(row => (row.excluded || row.duplicate_of) && (row.source_group_key || "") === source), rejectedActivities: scopedActions.filter(row => row.status === "rejected" && sourceFor(row) === source), activities: scopedActions.filter(row => row.status !== "rejected" && (sourceFor(row)) === source && (!row.expense_row_id || !genericExpenseAction(row) || linkedExpenseChanges(body, row.expense_row_id).length !== 1)) })) };
  });
}

/** New current disclosures remain unknown and do not claim an extracted source line. */
export function addOperatingCurrentItem(body: OperatingPlanBody, group: OperatingChangeGroup, id: string): OperatingPlanBody {
  const confirmations = { ...body.category_confirmations }; delete confirmations[group.category];
  return { ...body, no_operating_expenses_confirmed: false, category_confirmations: confirmations, expenses: [...body.expenses ?? [], { id, category: group.category, source_group_key: group.sourceGroupKey, label: "", current_amount: null, cadence: "monthly", source_file_ids: [], notes: "User-entered current cost item; confirm against the reporting source." }] };
}

export function addOperatingPlannedActivity(body: OperatingPlanBody, group: OperatingChangeGroup, id: string): OperatingPlanBody {
  return { ...body, adjustments: [...body.adjustments ?? [], { id, kind: "expense_increase", expense_category: group.category, source_group_key: group.sourceGroupKey, label: "", driver_key: id, current_amount: null, proposed_amount: null, cadence: "monthly", implementation_cost: null, implementation_cost_cadence: "one_time", effective_date: body.projection_start || null, status: "proposed", source_file_ids: [], source_note: "" }] };
}

/** Soft removal preserves records and requires explicit new proposals after restoration. */
export function removeOperatingCurrentItem(body: OperatingPlanBody, id: string): OperatingPlanBody {
  const next = updateOperatingExpense(body, id, { excluded: true });
  return { ...next, adjustments: next.adjustments?.map(row => row.expense_row_id === id ? row.status === "rejected" ? { ...row, excluded: true } : clearOperatingReview({ ...row, excluded: true }) : row) };
}
export function restoreOperatingCurrentItem(body: OperatingPlanBody, id: string): OperatingPlanBody {
  return updateOperatingExpense(body, id, { excluded: false, duplicate_of: null });
}

/** The explicit zero-cost choice creates a disclosure; merely adding an activity does not. */
export function confirmOperatingNewActivity(body: OperatingPlanBody, actionId: string, createId: () => string): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId);
  if (!action || !genericExpenseAction(action) || action.expense_row_id) return body;
  const id = createId(), category = action.expense_category || "other";
  const confirmations = { ...body.category_confirmations }; delete confirmations[category];
  const next = { ...body, category_confirmations: confirmations, no_operating_expenses_confirmed: false, expenses: [...body.expenses ?? [], { id, category, source_group_key: action.source_group_key || "", label: action.label || "New planned activity", current_amount: 0, cost_basis: "total" as const, cadence: action.cadence || "monthly" as const, source_file_ids: [], notes: "User confirmed this new activity has no current cost; not an extracted tax or P&L expense." }] };
  return linkOperatingActionExpense({ ...next, adjustments: next.adjustments?.map(row => row.id === actionId ? { ...row, label: row.label?.trim() ? row.label : "New planned activity" } : row) }, actionId, id);
}

export function linkOperatingPlannedActivity(body: OperatingPlanBody, actionId: string, expenseId: string | null): OperatingPlanBody {
  const before = body.adjustments?.find(row => row.id === actionId), expense = body.expenses?.find(row => row.id === expenseId);
  const changedDimension = before && expense && (before.cadence !== expense.cadence || (before.cost_basis || "total") !== (expense.cost_basis || "total") || (before.unit_label || "") !== (expense.unit_label || ""));
  const next = linkOperatingActionExpense(body, actionId, expenseId);
  return !changedDimension ? next : { ...next, adjustments: next.adjustments?.map(row => row.id === actionId ? { ...row, proposed_amount: null, proposed_units_per_period: null, proposed_unit_cost: null, proposed_fixed_amount: null } : row) };
}

/** Multiple linked proposals require an explicit resolution, never a first-match write. */
export function setOperatingExpenseProposal(body: OperatingPlanBody, id: string, patch: { amount?: string; quantity?: string; rate?: string; fixed?: string }, createId: () => string): OperatingPlanBody {
  const expense = body.expenses?.find(row => row.id === id), linked = linkedExpenseChanges(body, id);
  if (!expense || linked.length > 1 || operatingProposalDimensionMismatch(expense, linked[0])) return body;
  const working = { ...body, adjustments: body.adjustments?.filter(row => row.status !== "rejected") };
  let next: OperatingPlanBody;
  if (expense.cost_basis === "per_unit") {
    const seed = linked.length ? {} : { proposed_units_per_period: expense.current_units_per_period ?? null, proposed_unit_cost: expense.current_unit_cost ?? null, proposed_fixed_amount: expense.current_fixed_amount ?? null };
    next = proposeExpenseUnits(working, id, { ...seed, ...("quantity" in patch ? { proposed_units_per_period: patch.quantity } : {}), ...("rate" in patch ? { proposed_unit_cost: patch.rate } : {}), ...("fixed" in patch ? { proposed_fixed_amount: patch.fixed } : {}) }, createId);
  } else next = proposeExpense(working, id, patch.amount ?? null, createId);
  const updated = next.adjustments?.map(row => row.expense_row_id === id && genericExpenseAction(row) ? clearOperatingReview({ ...row, effective_date: linked.length ? row.effective_date : row.effective_date ?? body.projection_start ?? null }) : row) ?? [];
  const byId = new Map(updated.map(row => [row.id, row]));
  return { ...next, adjustments: [...(body.adjustments ?? []).map(row => byId.get(row.id) ?? row), ...updated.filter(row => !body.adjustments?.some(before => before.id === row.id))] };
}
