import type { OperatingAction } from "@/lib/operatingPlan";
import { OperatingAmountInput } from "./OperatingAmountInput";

export function MarketingReturnInputs({ action, onChange, disabled, missing = [] }: {
  action: OperatingAction; onChange: (patch: Partial<OperatingAction>) => void; disabled?: boolean; missing?: string[];
}) {
  const units = action.marketing_return_basis === "added_units";
  const input = (key: "added_units_per_period" | "proposed_unit_price" | "revenue_return_multiple", label: string) =>
    <label>{label}<OperatingAmountInput label={`${label} ${action.id}`} value={action[key]} disabled={disabled}
      invalid={missing.includes(key)} onCommit={text => onChange({ [key]: text })} /></label>;
  return <>
    <label>Campaign revenue assumption<select aria-label={`Campaign revenue assumption ${action.id}`}
      disabled={disabled} value={units ? "added_units" : "spend_multiple"} onChange={event =>
        onChange({ marketing_return_basis: event.target.value === "added_units" ? "added_units" : "spend_multiple" })}>
      <option value="spend_multiple">Sales per additional dollar spent</option>
      <option value="added_units">Added units × selling price</option>
    </select></label>
    {units ? <>{input("added_units_per_period", `Added units per ${action.cadence || "monthly"} period`)}
      {input("proposed_unit_price", "Selling price per added unit")}</> : input("revenue_return_multiple", "Marketing revenue return multiple")}
  </>;
}
