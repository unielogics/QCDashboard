// Activity-log humanization helpers.
//
// Mirror of app/services/activity_log.py's field_label /
// format_field_value / format_field_change on the Python side. Both
// sides need the same mapping so the AI prompt's diff lines and the
// frontend's activity feed read identically — when the AI says "Base
// rate moved from 7.50% to 7.80%" the operator should see the same
// in the UI.
//
// Keep this in sync with the backend file. Adding a field on one side
// only is a footgun.

const FIELD_LABELS: Record<string, string> = {
  amount: "Loan amount",
  base_rate: "Base rate",
  discount_points: "Discount points",
  final_rate: "Final rate",
  origination_pct: "Origination",
  lender_fees: "Lender fees",
  term_months: "Term",
  amortization_style: "Amortization",
  prepay_penalty: "Prepay penalty",
  ltv: "LTV",
  ltc: "LTC",
  arv: "ARV",
  purpose: "Purpose",
  property_type: "Property type",
  monthly_rent: "Monthly rent",
  dscr: "DSCR",
  vacancy_pct: "Vacancy",
  expense_ratio_pct: "Expense ratio",
  annual_taxes: "Annual taxes",
  annual_insurance: "Annual insurance",
  monthly_hoa: "Monthly HOA",
  reserves_required: "Reserves required",
  fico_override: "FICO override",
  entity_type: "Entity type",
  experience_tier: "Experience tier",
  construction_holdback_pct: "Construction holdback",
  draw_count: "Draws",
  exit_strategy: "Exit strategy",
  cash_to_borrower: "Cash to borrower",
  seasoning_months: "Seasoning",
  property_count: "Properties",
  stage: "Stage",
  lender_id: "Lender",
  close_date: "Close date",
  // HUD line fields
  label: "Label",
  category: "Category",
  payee: "Payee",
  note: "Note",
};


type ValueKind =
  | "money"
  | "percent_rate"
  | "percent_fraction"
  | "points"
  | "ratio"
  | "months"
  | "integer"
  | "date"
  | "enum";


const FIELD_VALUE_KINDS: Record<string, ValueKind> = {
  amount: "money",
  arv: "money",
  lender_fees: "money",
  monthly_rent: "money",
  annual_taxes: "money",
  annual_insurance: "money",
  monthly_hoa: "money",
  reserves_required: "money",
  cash_to_borrower: "money",
  base_rate: "percent_rate",
  final_rate: "percent_rate",
  origination_pct: "percent_fraction",
  ltv: "percent_fraction",
  ltc: "percent_fraction",
  vacancy_pct: "percent_fraction",
  expense_ratio_pct: "percent_fraction",
  construction_holdback_pct: "percent_fraction",
  discount_points: "points",
  dscr: "ratio",
  term_months: "months",
  seasoning_months: "months",
  fico_override: "integer",
  draw_count: "integer",
  property_count: "integer",
  close_date: "date",
  amortization_style: "enum",
  prepay_penalty: "enum",
  purpose: "enum",
  property_type: "enum",
  entity_type: "enum",
  experience_tier: "enum",
  exit_strategy: "enum",
  stage: "enum",
};


export function fieldLabel(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  if (!field) return "—";
  // snake_case → Title Case
  const s = field.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}


export function formatFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  const kind = FIELD_VALUE_KINDS[field];
  return formatByKind(value, kind);
}


function formatByKind(value: unknown, kind: ValueKind | undefined): string {
  const num = coerceNumber(value);
  try {
    if (kind === "money" && num !== null) {
      return `$${num.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
    }
    if (kind === "percent_rate" && num !== null) {
      return `${num.toFixed(2)}%`;
    }
    if (kind === "percent_fraction" && num !== null) {
      return `${(num * 100).toFixed(2)}%`;
    }
    if (kind === "points" && num !== null) {
      return `${num.toFixed(3)} pts`;
    }
    if (kind === "ratio" && num !== null) {
      return num.toFixed(2);
    }
    if (kind === "months" && num !== null) {
      const n = Math.trunc(num);
      if (n > 0 && n % 12 === 0) {
        const years = n / 12;
        return `${years} year${years !== 1 ? "s" : ""}`;
      }
      return `${n} month${n !== 1 ? "s" : ""}`;
    }
    if (kind === "integer" && num !== null) {
      return Math.trunc(num).toLocaleString("en-US");
    }
    if (kind === "enum") {
      let s = String(value);
      if (s.includes(".")) s = s.split(".").pop() ?? s;
      return s
        .split("_")
        .map((w) => (w.length ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(" ");
    }
    if (kind === "date") {
      const s = String(value);
      return s.includes("T") ? s.split("T")[0] : s;
    }
  } catch {
    // fall through to generic stringification
  }
  if (typeof value === "number") {
    // Generic short number: trim trailing zeros without losing precision.
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)));
  }
  return String(value);
}


function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}


export function formatFieldChange(change: {
  field?: unknown;
  before?: unknown;
  after?: unknown;
}): string {
  const field = String(change.field ?? "");
  return (
    `${fieldLabel(field)}: ` +
    `${formatFieldValue(field, change.before)} → ` +
    `${formatFieldValue(field, change.after)}`
  );
}
