import { addPlannerNamedActivity } from "./recognizablePlan";
import { clearOperatingReview, operatingNumber, type OperatingPlanBody } from "./operatingPlan";
import type { OperatingChangeGroup } from "./operatingStep3";
/** The explicit Add button confirms current zero. Funding or opening the composer never creates this record. */
export function addOperatingGrowthActivity(body: OperatingPlanBody, group: OperatingChangeGroup, name: string, actionId: string, expenseId: string): OperatingPlanBody {
  const next = addPlannerNamedActivity(body, { ...group, category: "marketing", sourceGroupKey: "", key: "marketing:unscoped" }, name, actionId, expenseId);
  if (next === body) return body;
  return { ...next, adjustments: next.adjustments?.map(row => row.id === actionId ? clearOperatingReview({ ...row, kind: "marketing_investment", revenue_return_multiple: null, contribution_margin_pct: null, product_name: "" }) : row) };
}

/** Explicit adoption describes entered intent and linked references; it never certifies feasibility or fills money/dates. */
export function draftOperatingActionDetails(body: OperatingPlanBody, actionId: string, files: Array<{ file_id: string; file_name: string }> = []): OperatingPlanBody {
  const action = body.adjustments?.find(row => row.id === actionId && !row.excluded && row.status !== "rejected"); if (!action) return body;
  const patch: Partial<typeof action> = {};
  const value = action.command && operatingNumber(action.command.value);
  if (!action.explanation?.trim() && action.command && value != null) {
    const target = ({ total_cost: "total cost", unit_cost: "variable cost per unit", unit_quantity: "quantity", unit_price: "unit price", annual_price_revenue: "annual pricing at the current volume" } as Record<string, string>)[action.command.target];
    patch.explanation = `Propose a ${action.command.direction} of ${value}${action.command.mode === "percent" ? "%" : " in the entered units"} to ${target || "the selected input"} for ${action.label || "this activity"}. This is a user-entered planning assumption; feasibility still needs review.`;
  }
  const names = (action.source_file_ids || []).map(id => files.find(file => file.file_id === id)?.file_name).filter((name): name is string => Boolean(name));
  if (!action.source_note?.trim() && names.length) patch.source_note = `Baseline references: ${names.join(", ")}. The proposed change is user-entered; these references do not confirm future pricing, realization or feasibility.`;
  if (!Object.keys(patch).length) return body;
  return { ...body, adjustments: body.adjustments?.map(row => row.id === action.id ? clearOperatingReview({ ...row, ...patch }) : row) };
}
