import { clearOperatingReview, type OperatingAction, type OperatingExpense, type OperatingEvaluation, type OperatingPlanBody } from "./operatingPlan";
import { addOperatingCurrentItem, addOperatingPlannedActivity, confirmOperatingNewActivity, removeOperatingCurrentItem, type OperatingChangeGroup } from "./operatingStep3";

const active = (row: { excluded?: boolean; duplicate_of?: string | null; status?: string }) => !row.excluded && !row.duplicate_of && row.status !== "rejected";
export type RemovalUndo = { expenseId: string; actionIds: string[] };
export function removePlannerItem(body: OperatingPlanBody, id: string): { body: OperatingPlanBody; undo: RemovalUndo } {
  return { body: removeOperatingCurrentItem(body, id), undo: { expenseId: id, actionIds: (body.adjustments ?? []).filter(row => row.expense_row_id === id && active(row)).map(row => row.id) } };
}
export function undoPlannerRemoval(body: OperatingPlanBody, undo: RemovalUndo): OperatingPlanBody {
  if (body.expenses?.some(row => row.itemization_parent_id === undo.expenseId && active(row))) return body;
  const expense = body.expenses?.find(row => row.id === undo.expenseId);
  if (!expense || !expense.excluded || expense.duplicate_of) return body;
  const confirmations = { ...body.category_confirmations }; delete confirmations[expense.category || "other"];
  return { ...body, category_confirmations: confirmations, expenses: body.expenses?.map(row => row.id === undo.expenseId ? { ...row, excluded: false, duplicate_of: null } : row), adjustments: body.adjustments?.map(row => undo.actionIds.includes(row.id) && row.expense_row_id === undo.expenseId && row.excluded === true && row.status !== "rejected" ? clearOperatingReview({ ...row, excluded: false }) : row) };
}
export function undoPlannerAction(body: OperatingPlanBody, id: string): OperatingPlanBody {
  const row = body.adjustments?.find(action => action.id === id);
  if (!row?.excluded || row.status === "rejected" || row.expense_row_id && !body.expenses?.some(expense => expense.id === row.expense_row_id && !expense.excluded && !expense.duplicate_of)) return body;
  return { ...body, adjustments: body.adjustments?.map(action => action.id === id ? clearOperatingReview({ ...action, excluded: false }) : action) };
}
export function itemizePlannerExpense(body: OperatingPlanBody, parentId: string, id: string): OperatingPlanBody {
  const parent = body.expenses?.find(row => row.id === parentId);
  if (!parent || parent.itemization_parent_id) return body;
  const next = parent.excluded ? body : removeOperatingCurrentItem(body, parentId);
  const confirmations = { ...next.category_confirmations }; delete confirmations[parent.category || "other"];
  const child: OperatingExpense = { id, itemization_parent_id: parent.id, category: parent.category, source_group_key: parent.source_group_key, label: "", cadence: parent.cadence || "annual", cost_basis: "total", current_amount: null, source_file_ids: [], notes: "User-entered itemization; the original total is retained as a read-only reference." };
  return { ...next, no_operating_expenses_confirmed: false, category_confirmations: confirmations, expenses: [...next.expenses ?? [], child] };
}
export const documentedHistoricalCorrection = (body: OperatingPlanBody, key: string) => body.historical_corrections?.some(row => row.source_group_key === key && row.reason.trim().length >= 3) ?? false;

export type CommandScope = { expense?: OperatingExpense; category: string; sourceGroupKey: string; annualPricing?: boolean; sourceFileIds?: string[] };
/** Store intent only. Resolved prices, percentages and allocations come from the evaluator. */
export function setPlannerCommand(body: OperatingPlanBody, scope: CommandScope, command: NonNullable<OperatingAction["command"]>, createId: () => string): OperatingPlanBody {
  const matches = (body.adjustments ?? []).filter(row => active(row) && (scope.annualPricing ? row.kind === "price_change" && row.price_basis === "annual_revenue" : scope.expense ? row.expense_row_id === scope.expense.id && ["expense_reduction", "expense_increase"].includes(row.kind || "") : row.kind === "expense_group_change" && row.expense_category === scope.category && (row.source_group_key || "") === scope.sourceGroupKey));
  if (matches.length > 1) return body;
  const old = matches[0], id = old?.id || createId();
  const kind = scope.annualPricing ? "price_change" : scope.expense ? command.direction === "increase" ? "expense_increase" : "expense_reduction" : "expense_group_change";
  const next: OperatingAction = clearOperatingReview({ ...old, id, kind, label: old?.label || (scope.annualPricing ? "Overall pricing change" : scope.expense?.label || "Group cost change"), driver_key: old?.driver_key || scope.expense?.id || id, expense_row_id: scope.expense?.id || null, expense_category: scope.category, source_group_key: scope.sourceGroupKey, cadence: scope.expense?.cadence || "annual", cost_basis: scope.expense?.cost_basis || "total", unit_label: scope.expense?.unit_label, current_amount: scope.expense?.current_amount ?? null, current_units_per_period: scope.expense?.current_units_per_period, current_unit_cost: scope.expense?.current_unit_cost, current_fixed_amount: scope.expense?.current_fixed_amount, proposed_amount: null, proposed_units_per_period: null, proposed_unit_cost: null, proposed_fixed_amount: null, price_basis: scope.annualPricing ? "annual_revenue" : old?.price_basis, command, source_file_ids: old?.source_file_ids || scope.expense?.source_file_ids || scope.sourceFileIds || [], source_note: old?.source_note || "", implementation_cost: old?.implementation_cost ?? null, effective_date: old ? old.effective_date : body.projection_start || null, excluded: false });
  return { ...body, adjustments: old ? body.adjustments?.map(row => row.id === old.id ? next : row) : [...body.adjustments ?? [], next] };
}

/** Current canonical ledger plus explicit correction records gate the final saved handoff. */
export function plannerSaveIssues(body: OperatingPlanBody, evaluation?: OperatingEvaluation | null): string[] {
  const issues: string[] = [];
  for (const correction of body.historical_corrections ?? []) {
    if (correction.reason.trim().length < 3) issues.push(`historical_corrections.${correction.source_group_key}.reason`);
  }
  for (const ledger of evaluation?.itemization ?? []) {
    if (ledger.status !== "balanced" && !documentedHistoricalCorrection(body, ledger.source_group_key)) issues.push(`expenses.${ledger.parent_expense_row_id}.itemization.${ledger.status}`);
  }
  return issues;
}

/** Explicitly switch one command to editable quantity/rate fields; never multiply percentages locally. */
export function switchPlannerUnitProposal(body: OperatingPlanBody, expenseId: string, resolved?: NonNullable<OperatingEvaluation["commands"]>[number], createId: () => string = () => crypto.randomUUID()): OperatingPlanBody {
  const expense = body.expenses?.find(row => row.id === expenseId && active(row));
  const linked = body.adjustments?.filter(row => active(row) && row.expense_row_id === expenseId && ["expense_reduction", "expense_increase"].includes(row.kind || "")) ?? [];
  if (!expense || expense.cost_basis !== "per_unit" || linked.length > 1) return body;
  const old = linked[0];
  const dimensionsChanged = Boolean(old && ((old.cadence || "monthly") !== (expense.cadence || "monthly") || (old.cost_basis || "total") !== "per_unit" || (old.unit_label || "") !== (expense.unit_label || "")));
  const proposal: OperatingAction = clearOperatingReview({ ...old, id: old?.id || createId(), kind: old?.kind || "expense_reduction", label: old?.label || expense.label, driver_key: old?.driver_key || expense.id, expense_row_id: expense.id, cadence: expense.cadence, cost_basis: "per_unit", unit_label: expense.unit_label, current_amount: null, proposed_amount: null, current_units_per_period: expense.current_units_per_period, current_unit_cost: expense.current_unit_cost, current_fixed_amount: expense.current_fixed_amount, proposed_units_per_period: old?.command || dimensionsChanged ? expense.current_units_per_period ?? null : old?.proposed_units_per_period ?? expense.current_units_per_period ?? null, proposed_unit_cost: old?.command || dimensionsChanged ? expense.current_unit_cost ?? null : old?.proposed_unit_cost ?? expense.current_unit_cost ?? null, proposed_fixed_amount: old?.command || dimensionsChanged ? expense.current_fixed_amount ?? null : old?.proposed_fixed_amount ?? expense.current_fixed_amount ?? null, command: undefined, source_file_ids: old?.source_file_ids || expense.source_file_ids || [], implementation_cost: old?.implementation_cost ?? null, effective_date: old ? old.effective_date : body.projection_start || null, excluded: false });
  if (!dimensionsChanged && old?.command && resolved?.action_id === old.id && resolved.proposed_value != null) {
    if (old.command.target === "unit_cost") proposal.proposed_unit_cost = resolved.proposed_value;
    if (old.command.target === "unit_quantity") proposal.proposed_units_per_period = resolved.proposed_value;
  }
  return { ...body, adjustments: old ? body.adjustments?.map(row => row.id === old.id ? proposal : row) : [...body.adjustments ?? [], proposal] };
}

/** A local Add composer commits only a named item, so cancelled placeholders never enter the draft. */
export function addPlannerNamedItem(body: OperatingPlanBody, group: OperatingChangeGroup, name: string, id: string, parentId?: string | null): OperatingPlanBody {
  if (!name.trim() || body.expenses?.some(row => row.id === id)) return body;
  const next = parentId ? itemizePlannerExpense(body, parentId, id) : addOperatingCurrentItem(body, group, id);
  if (next === body) return body;
  return { ...next, expenses: next.expenses?.map(row => row.id === id ? { ...row, label: name.trim() } : row) };
}
/** The explicit new-activity choice confirms current zero, never a setup cost or future evidence. */
export function addPlannerNamedActivity(body: OperatingPlanBody, group: OperatingChangeGroup, name: string, actionId: string, expenseId: string): OperatingPlanBody {
  if (!name.trim() || body.adjustments?.some(row => row.id === actionId) || body.expenses?.some(row => row.id === expenseId)) return body;
  const next = addOperatingPlannedActivity(body, group, actionId);
  return confirmOperatingNewActivity({ ...next, adjustments: next.adjustments?.map(row => row.id === actionId ? { ...row, label: name.trim() } : row) }, actionId, () => expenseId);
}
