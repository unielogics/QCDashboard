import { operatingActionMissingFields, operatingCommandSupported } from "./operatingActionFields";
import type { OperatingAction, OperatingPlanBody } from "./operatingPlan";

const commandMissingMessage = "Enter a command value; a cleared amount is unknown, not zero.";
/** Collapse equivalent missing-field aliases, without suppressing command conflicts. */
export function operatingActionIssuePath(path: string, action: OperatingAction, body: OperatingPlanBody): string | null {
  const prefix = `adjustments.${action.id}.`;
  if (path.startsWith("adjustments.") && !path.startsWith(prefix)) return null;
  let suffix = path.startsWith(prefix) ? path.slice(prefix.length) : path;
  if (!operatingCommandSupported(action) && suffix === commandMissingMessage) { if (!action.command) return null; suffix = "command"; }
  if (action.command && !operatingCommandSupported(action) && ["This command target does not match its action or current expense item.", "The command's current baseline is unknown.", "The command’s current baseline is unknown."].includes(suffix)) suffix = "command";
  const liveMissing = operatingActionMissingFields(action, body);
  if (operatingCommandSupported(action) && (suffix === commandMissingMessage || suffix === "command" && (!action.command || liveMissing.includes("command.value")))) suffix = "command.value";
  // A populated parent command can be a real target/allocation incompatibility.
  if (suffix === "command" && operatingCommandSupported(action) && action.command && !liveMissing.includes("command.value")) return `${prefix}command`;
  const missing = liveMissing;
  const inputFields = new Set(["label", "driver_key", "explanation", "implementation_cost", "command", "command.value", "proposed_amount", "current_amount", "product_name", "revenue_return_multiple", "contribution_margin_pct", "units_per_period", "current_unit_cost", "proposed_unit_cost", "current_unit_price", "proposed_unit_price", "current_units_per_period", "proposed_units_per_period", "current_fixed_amount", "proposed_fixed_amount", "expense_row_id", "unit_label", "processing_volume", "processing_transaction_count", "current_processing_rate_pct", "proposed_processing_rate_pct", "current_processing_rate_basis", "proposed_processing_rate_basis", "current_processing_fixed_fee", "proposed_processing_fixed_fee", "current_processing_per_transaction_fee", "proposed_processing_per_transaction_fee", "unit_change_value", "historical_revenue_annual"]);
  if (inputFields.has(suffix) && !missing.includes(suffix)) return null;
  if (["current_proposed_math", "marketing_return_assumptions", "proposed_cost", "current_cost"].includes(suffix) && missing.length) return null;
  return `${prefix}${suffix}`;
}
