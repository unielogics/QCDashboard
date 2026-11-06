import { parseMoney } from "@/components/sheet/money";
import type { ComputedValues, SheetRow, SheetValues } from "@/components/sheet/types";

export type RealEstateRow = Record<string, string | number | null | undefined> & { id?: string };
export type RealEstateBody = {
  schema_version?: string;
  owner_name?: string | null;
  as_of?: string | null;
  no_real_estate?: boolean;
  notes?: string | null;
  properties?: RealEstateRow[];
  mortgages?: RealEstateRow[];
};
export type RealEstateField = {
  key: string; label: string; type?: string; input?: string; hint?: string | null;
  options?: Array<string | { value: string; label: string }>;
  option_labels?: Record<string, string>;
};
export type RealEstateSchema = {
  kind: "real_estate_schedule"; schema_version: string;
  header: RealEstateField[]; properties: RealEstateField[]; mortgages: RealEstateField[];
  totals: Array<{ key: string; label: string }>;
};
export const REAL_ESTATE_EXPENSES = ["monthly_property_tax", "monthly_insurance", "monthly_hoa", "monthly_maintenance", "monthly_management", "monthly_utilities", "monthly_other_expenses"] as const;
const text = (value: unknown) => value == null ? "" : String(value);
export const meaningfulRealEstateRow = (row: RealEstateRow) => Object.entries(row).some(([key, value]) => key !== "id" && text(value).trim() !== "" && value !== "unknown");
const amount = (value: unknown): number | null => {
  const parsed = parseMoney(value == null ? "" : String(value));
  return parsed.blank || parsed.warn || !Number.isFinite(parsed.value) ? null : parsed.value;
};
const sum = (values: Array<number | null>) => values.some((value) => value == null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);

/** Match the server: blanks remain unknown, and only an explicit free-and-clear answer establishes zero mortgage debt. */
export function realEstateTotals(body: RealEstateBody): ComputedValues {
  const keys = ["property_count", "active_mortgage_count", "estimated_value_total", "mortgage_balance_total", "monthly_rent_total", "monthly_operating_expenses_total", "monthly_mortgage_payments_total", "estimated_equity", "monthly_cash_flow"];
  if (body.no_real_estate === true) return Object.fromEntries(keys.map((key) => [key, 0]));
  const properties = (body.properties ?? []).filter(meaningfulRealEstateRow);
  if (!properties.length) return Object.fromEntries(keys.map((key) => [key, null]));
  const mortgages = (body.mortgages ?? []).filter(meaningfulRealEstateRow);
  const isActive = (row: RealEstateRow) => row.status === "active";
  const active = mortgages.filter(isActive);
  const knownProperties = new Set(properties.map((row) => row.id));
  const debtKnown = !mortgages.some((row) => row.status !== "paid_off" && (!isActive(row) || !knownProperties.has(text(row.property_row_id))))
    && properties.every((property) => property.mortgage_status === "active"
      ? active.some((row) => row.property_row_id === property.id)
      : property.mortgage_status === "free_clear" && !active.some((row) => row.property_row_id === property.id));
  const value = sum(properties.map((row) => amount(row.estimated_value)));
  const balance = debtKnown ? sum(active.map((row) => amount(row.balance))) : null;
  const rent = sum(properties.map((row) => amount(row.monthly_gross_rent)));
  const expenses = sum(properties.map((row) => sum(REAL_ESTATE_EXPENSES.map((key) => amount(row[key])))));
  const payments = debtKnown ? sum(active.map((row) => amount(row.monthly_payment))) : null;
  const principalInterest = debtKnown ? sum(active.map((row) => {
    const payment = amount(row.monthly_payment);
    if (row.payment_basis === "principal_interest") return payment;
    const escrow = amount(row.monthly_escrow);
    return row.payment_basis === "including_escrow" && payment != null && escrow != null && escrow <= payment ? payment - escrow : null;
  })) : null;
  return {
    property_count: properties.length, active_mortgage_count: debtKnown ? active.length : null,
    estimated_value_total: value, mortgage_balance_total: balance, monthly_rent_total: rent,
    monthly_operating_expenses_total: expenses, monthly_mortgage_payments_total: payments,
    estimated_equity: value != null && balance != null ? value - balance : null,
    monthly_cash_flow: rent != null && expenses != null && principalInterest != null ? rent - expenses - principalInterest : null,
  };
}

export const realEstateMoney = (value: number | null | undefined) => value == null ? "Not fully stated" : value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const realEstatePropertyLabel = (row: RealEstateRow, index: number) => [row.address, row.city, row.state].filter(Boolean).join(", ") || `Property ${index + 1}`;
export function realEstateOptionLabel(field: RealEstateField, value: string): string {
  const object = field.options?.find((option) => typeof option !== "string" && option.value === value);
  return typeof object === "object" ? object.label : field.option_labels?.[value] ?? value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

/** Public phone forms and the grid use the same server-supplied field paths. */
export function realEstateBodyFromValues(rows: SheetRow[], values: SheetValues): RealEstateBody {
  const body: RealEstateBody = { properties: [], mortgages: [] };
  for (const row of rows) for (const cell of row.cells ?? []) {
    if (!cell.key || !cell.path) continue;
    const value = values[cell.key] ?? "";
    const [block, id, field] = cell.path;
    if (cell.path.length === 1) {
      (body as Record<string, unknown>)[block] = block === "no_real_estate" ? value === "true" : value;
    } else if ((block === "properties" || block === "mortgages") && id && field) {
      const entries = body[block]!;
      let entry = entries.find((item) => item.id === id);
      if (!entry) { entry = { id }; entries.push(entry); }
      entry[field] = value;
    }
  }
  body.properties = body.properties!.filter(meaningfulRealEstateRow);
  body.mortgages = body.mortgages!.filter(meaningfulRealEstateRow);
  return body;
}

export function realEstateValues(body: RealEstateBody, schema: RealEstateSchema): SheetValues {
  const values: SheetValues = { owner_name: text(body.owner_name), as_of: text(body.as_of), no_real_estate: body.no_real_estate ? "true" : "false", notes: text(body.notes) };
  for (const block of ["properties", "mortgages"] as const) (body[block] ?? []).forEach((row, index) => {
    for (const field of schema[block] ?? []) values[`${block}.${row.id || `r${index + 1}`}.${field.key}`] = text(row[field.key]);
  });
  return values;
}

/** Worksheet formula previews use the same conservative totals as the form. */
export function realEstateTotalsFromValues(values: SheetValues): ComputedValues {
  const body: RealEstateBody = { no_real_estate: values.no_real_estate === "true", properties: [], mortgages: [] };
  for (const [key, value] of Object.entries(values)) {
    const match = /^(properties|mortgages)\.([^.]+)\.(.+)$/.exec(key);
    if (!match) continue;
    const block = match[1] as "properties" | "mortgages";
    let row = body[block]!.find((entry) => entry.id === match[2]);
    if (!row) { row = { id: match[2] }; body[block]!.push(row); }
    row[match[3]] = value;
  }
  return realEstateTotals(body);
}
