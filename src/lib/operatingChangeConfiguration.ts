import type { OperatingAction } from "./operatingPlan";
import { operatingCommandSupported } from "./operatingActionFields";
/** Existing persisted field names map to visible configuration controls. */
export function operatingConfigurationFieldLabel(field?: string, id?: string, action?: OperatingAction): string | undefined {
  if (!id || !field) return undefined;
  const key = field.split(".").at(-1) || field;
  if (key === "unit_change_value" || key === "unit_change_mode") return "Planned annual unit change";
  const labels: Record<string, string> = { implementation_cost: "Setup or transition cost", explanation: "Activity explanation", source_note: "Activity evidence", source_file_ids: "Supporting documents", label: "Activity name", driver_key: "Activity identity", expense_row_id: "Linked current cost", revenue_return_multiple: "Marketing revenue return multiple", contribution_margin_pct: "Contribution margin percent", current_amount: action?.kind === "revenue_change" ? "Activity current revenue" : "Activity current cost", proposed_amount: action?.kind === "revenue_change" ? "Activity proposed revenue" : "Activity proposed cost", proposed_units_per_period: "Activity proposed quantity", proposed_unit_cost: action?.kind === "product_cost_change" ? "Proposed unit amount" : "Activity proposed rate", proposed_fixed_amount: "Activity proposed fixed cost", units_per_period: "Activity units per period", current_unit_price: "Current unit amount", proposed_unit_price: "Proposed unit amount", current_unit_cost: "Current unit amount", product_name: action?.kind === "marketing_investment" ? "Marketing product service" : "Product service name", unit_label: "Activity unit definition" };
  if (key === "command" && action?.command && !operatingCommandSupported(action)) return `Clear incompatible cost command ${id}`;
  const label = labels[key];
  return label ? `${label} ${id}` : undefined;
}
