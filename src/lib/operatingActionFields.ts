import { operatingNumber, type OperatingAction, type OperatingPlanBody } from "./operatingPlan";

const blank = (value: unknown) => value == null || String(value).trim() === "";
const validAmount = (value: unknown) => operatingNumber(value) != null && operatingNumber(value)! >= 0;
/** Required input truth only. All financial results remain canonical server outputs. */
export function operatingActionMissingFields(action: OperatingAction, body: OperatingPlanBody): string[] {
  const missing: string[] = [];
  const text = (key: keyof OperatingAction) => { if (blank(action[key])) missing.push(key); };
  const number = (key: keyof OperatingAction, value: unknown = action[key]) => { if (!validAmount(value)) missing.push(key); };
  text("label"); text("driver_key"); text("explanation"); number("implementation_cost");
  const expense = body.expenses?.find(row => row.id === action.expense_row_id && !row.excluded && !row.duplicate_of);
  if (action.command) { if (!validAmount(action.command.value)) missing.push("command.value"); if (action.kind === "price_change" && action.price_basis === "annual_revenue" && !validAmount(body.historical_revenue_annual)) missing.push("historical_revenue_annual"); return missing; }
  switch (action.kind) {
    case "expense_reduction": case "expense_increase":
      if (!expense) missing.push("expense_row_id");
      if (action.cost_basis === "per_unit") {
        if (blank(action.unit_label ?? expense?.unit_label)) missing.push("unit_label");
        for (const key of ["current_units_per_period", "current_unit_cost", "current_fixed_amount"] as const) number(key, expense ? expense[key] : action[key]);
        for (const key of ["proposed_units_per_period", "proposed_unit_cost", "proposed_fixed_amount"] as const) number(key);
      } else { number("current_amount", expense ? expense.current_amount : action.current_amount); number("proposed_amount"); }
      break;
    case "marketing_investment":
      text("product_name"); if (!expense) missing.push("expense_row_id");
      number("current_amount", expense ? expense.current_amount : action.current_amount); number("proposed_amount"); number("revenue_return_multiple"); number("contribution_margin_pct");
      if (operatingNumber(action.contribution_margin_pct)! > 100) missing.push("contribution_margin_pct");
      break;
    case "price_change":
      if (action.price_basis === "annual_revenue") missing.push("command.value");
      else for (const key of ["units_per_period", "current_unit_price", "proposed_unit_price"] as const) number(key);
      break;
    case "product_cost_change": for (const key of ["units_per_period", "current_unit_cost", "proposed_unit_cost"] as const) number(key); break;
    case "revenue_change": number("current_amount"); number("proposed_amount"); number("contribution_margin_pct"); if (operatingNumber(action.contribution_margin_pct)! > 100) missing.push("contribution_margin_pct"); break;
    case "unit_volume": if (operatingNumber(action.unit_change_value) == null) missing.push("unit_change_value"); break;
    case "expense_group_change": missing.push("command.value"); break;
    case "processing_cost_change":
      number("processing_volume");
      for (const prefix of ["current", "proposed"] as const) {
        number(`${prefix}_processing_rate_pct`);
        const basis = action[`${prefix}_processing_rate_basis`];
        if (!basis || basis === "unknown") missing.push(`${prefix}_processing_rate_basis`);
        if (basis === "processor_markup") { number(`${prefix}_processing_fixed_fee`); number(`${prefix}_processing_per_transaction_fee`); }
      }
      if ((operatingNumber(action.current_processing_per_transaction_fee) ?? 0) > 0 || (operatingNumber(action.proposed_processing_per_transaction_fee) ?? 0) > 0) number("processing_transaction_count");
      break;
    case "one_time_adjustment": number("current_amount"); number("proposed_amount"); break;
  }
  return [...new Set(missing)];
}

export function operatingActionFieldLabel(field: string, action?: OperatingAction): string {
  const key = field.split(".").at(-1) || field;
  const labels: Record<string, string> = { label: "Name the activity", driver_key: "Confirm activity identity", explanation: "Explain why this will work", implementation_cost: "Enter setup cost", expense_row_id: "Choose the linked current cost", product_name: "Name the product or service", current_amount: "Confirm current cost", proposed_amount: action?.kind === "revenue_change" ? "Enter proposed revenue" : "Enter proposed cost", unit_label: "Name the unit", current_units_per_period: "Confirm current quantity", proposed_units_per_period: "Enter proposed quantity", current_unit_cost: "Confirm current unit cost", proposed_unit_cost: "Enter proposed unit cost", current_fixed_amount: "Confirm current fixed cost", proposed_fixed_amount: "Enter proposed fixed cost", units_per_period: "Enter units per period", current_unit_price: "Confirm current unit price", proposed_unit_price: "Enter proposed unit price", contribution_margin_pct: "Enter contribution margin", revenue_return_multiple: "Enter revenue per marketing dollar", processing_volume: "Enter card volume", processing_transaction_count: "Enter transaction count", unit_change_value: "Enter the unit-volume change" };
  if (field.includes("command")) return "Enter the change amount";
  if (field.includes("historical_revenue_annual")) return "Confirm annual revenue";
  if (/processing_rate_basis/.test(key)) return `Confirm ${key.startsWith("current") ? "current" : "proposed"} processing rate basis`;
  if (/processing_rate_pct/.test(key)) return `Enter ${key.startsWith("current") ? "current" : "proposed"} processing rate`;
  if (/processing_fixed_fee|processing_per_transaction_fee/.test(key)) return `Enter ${key.replaceAll("_", " ")}`;
  return labels[key] || "Review this change";
}
