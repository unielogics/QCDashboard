import { clearOperatingReview, linkOperatingActionExpense, operatingNumber, type OperatingPlanBody, type OperatingAction } from "./operatingPlan";
import { operatingCommandSupported } from "./operatingActionFields";
import { linkOperatingPlannedActivity } from "./operatingStep3";

export type ResolvedMarketingCost = { action_id: string; cadence: string; proposed_amount: number | null };
export function operatingOwnNewMarketingExpense(body: OperatingPlanBody, action: OperatingAction) {
  const expense = body.expenses?.find(row => row.id === action.expense_row_id && !row.excluded && !row.duplicate_of);
  return expense && expense.category === "marketing" && expense.cost_basis !== "per_unit" && operatingNumber(expense.current_amount) === 0 && !expense.source_group_key && !expense.source_candidate_key && !expense.itemization_parent_id && !expense.source_file_ids?.length && expense.notes?.startsWith("User confirmed this new activity has no current cost;") && !body.adjustments?.some(row => row.id !== action.id && row.expense_row_id === expense.id && !row.excluded && row.status !== "rejected") ? expense : undefined;
}
/** An explicit frequency choice updates only the user's new-zero item and its linked activity. */
export function setOperatingNewMarketingCadence(body: OperatingPlanBody, actionId: string, cadence: OperatingAction["cadence"]): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId && row.kind === "marketing_investment" && !row.excluded && row.status !== "rejected");
  const expense = action && operatingOwnNewMarketingExpense(body, action);
  if (!action || !expense || !cadence) return body;
  return { ...body, expenses: body.expenses?.map(row => row.id === expense.id ? { ...row, cadence } : row), adjustments: body.adjustments?.map(row => row.id === action.id ? clearOperatingReview({ ...row, cadence }) : row) };
}
/** Relinking keeps source records intact and retains an unused synthetic zero disclosure as history. */
export function linkOperatingMarketingExpense(body: OperatingPlanBody, actionId: string, expenseId: string | null): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId && row.kind === "marketing_investment");
  if (!action) return body;
  const previous = operatingOwnNewMarketingExpense(body, action);
  const next = linkOperatingPlannedActivity(body, actionId, expenseId);
  return previous && expenseId && expenseId !== previous.id ? { ...next, expenses: next.expenses?.map(row => row.id === previous.id ? { ...row, excluded: true } : row) } : next;
}
/** Explicit conversion preserves entered totals and identity; it never calculates returns. */
export function modelOperatingMarketingReturns(body: OperatingPlanBody, actionId: string, resolved?: ResolvedMarketingCost): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId && !row.excluded && !row.duplicate_of && row.status !== "rejected");
  if (!action || !["expense_increase", "expense_reduction", "marketing_investment"].includes(action.kind || "")) return body;
  const expense = body.expenses?.find(row => row.id === action.expense_row_id && !row.excluded && !row.duplicate_of);
  if (expense && expense.category !== "marketing") return body;
  if (expense && (action.cadence || "monthly") !== (expense.cadence || "monthly")) return body;
  const needsResolved = Boolean(action.command || action.cost_basis === "per_unit");
  if (needsResolved && (!resolved || resolved.action_id !== action.id || resolved.cadence !== (action.cadence || "monthly") || operatingNumber(resolved.proposed_amount) == null)) return body;
  const ownNewZero = Boolean(expense && expense.cost_basis !== "per_unit" && operatingNumber(expense.current_amount) === 0 && !expense.itemization_parent_id && !expense.source_candidate_key && !expense.source_file_ids?.length && !action.source_file_ids?.length && expense.notes?.startsWith("User confirmed this new activity has no current cost;") && !body.adjustments?.some(row => row.id !== action.id && row.expense_row_id === expense.id && !row.excluded && row.status !== "rejected"));
  const next: OperatingPlanBody = { ...body,
    expenses: ownNewZero ? body.expenses?.map(row => row.id === expense!.id ? { ...row, source_group_key: "" } : row) : body.expenses,
    adjustments: body.adjustments?.map(row => row.id === action.id ? clearOperatingReview({ ...row, kind: "marketing_investment", expense_category: "marketing", source_group_key: ownNewZero ? "" : row.source_group_key, command: undefined, cost_basis: "total", proposed_amount: needsResolved ? resolved!.proposed_amount : row.proposed_amount, current_units_per_period: null, proposed_units_per_period: null, current_unit_cost: null, proposed_unit_cost: null, current_fixed_amount: null, proposed_fixed_amount: null, units_per_period: null, current_unit_price: null, proposed_unit_price: null, unit_label: "", revenue_return_multiple: row.revenue_return_multiple ?? null, contribution_margin_pct: row.contribution_margin_pct ?? null, product_name: row.product_name || "" }) : row) };
  return expense ? linkOperatingActionExpense(next, action.id, expense.id) : next;
}

/** A malformed legacy marketing command can be deliberately removed without touching its direct spend or assumptions. */
export function clearOperatingIncompatibleCommand(body: OperatingPlanBody, actionId: string): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId && !operatingCommandSupported(row) && row.command && !row.excluded && row.status !== "rejected");
  return action ? { ...body, adjustments: body.adjustments?.map(row => row.id === actionId ? clearOperatingReview({ ...row, command: undefined }) : row) } : body;
}
