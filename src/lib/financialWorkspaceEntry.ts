import type { SheetKind } from "@/components/sheet/types";
import { activeFinancialDebts, meaningfulFinancialDebts, type FinancialBody, type FinancialDebtRow } from "./financialWorkspaceApi";
import { parseFigure } from "./debtTypes";

export type FinancialWorkspaceView = "form" | "worksheet" | "pdf" | "history";

export function financialDebtChoiceLabel(row: FinancialDebtRow, ordinal: number): string {
  const balance = parseFigure(row.balance); const payment = parseFigure(row.monthly_payment);
  const money = (value: number) => value.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  return `Row ${ordinal} · ${row.lender || "Unnamed loan"}${row.loan_reference ? ` · Reference ${row.loan_reference}` : ""} · ${balance == null ? "balance unknown" : `${money(balance)} balance`} · ${payment == null ? "payment unknown" : `${money(payment)}/mo`}`;
}

/** Opening a schedule starts with its existing rows; adding a row is separate. */
export function financialWorkspaceEntryView(kind: SheetKind, requested?: FinancialWorkspaceView, _rowId?: string): FinancialWorkspaceView {
  if (requested === "pdf" || requested === "history") return requested;
  if (kind === "debt_schedule") return "worksheet";
  return requested ?? "form";
}

const DEBT_FIELDS = ["lender", "debt_type", "original_amount", "balance", "originated_on", "rate", "monthly_payment", "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes", "factor_rate", "payment_amount", "payment_frequency"];

/** IDs and source metadata alone must not turn an untouched editor into a loan. */
export function isBlankFinancialDebt(row: FinancialDebtRow): boolean {
  return (row.status ?? "active") === "active" && !row.duplicate_of_id && !row.evidence_links?.length
    && !["document_id", "source_file_id", "selected_payoff_file_id", "debt_intake_source"].some((key) => Boolean(row[key]))
    && !(row.evidence && typeof row.evidence === "object" && Object.keys(row.evidence).length)
    && !DEBT_FIELDS.some((key) => row[key] != null && String(row[key]).trim() !== "");
}

export function financialDebtEntrySelection(body: FinancialBody, preferred?: string | null): string | null {
  const rows = (body.debts as FinancialDebtRow[] | undefined) ?? [];
  if (preferred && rows.some((row) => row.id === preferred)) return preferred;
  return meaningfulFinancialDebts(body)[0]?.id ?? activeFinancialDebts(body).find((row) => !isBlankFinancialDebt(row))?.id ?? null;
}

/** Keep old blank drafts intact, exposing one only when explicitly selected. */
export function financialDebtNavigationRows(body: FinancialBody, selectedId: string | null, showExcluded = false): FinancialDebtRow[] {
  const rows = showExcluded ? (body.debts as FinancialDebtRow[] | undefined) ?? [] : activeFinancialDebts(body);
  return rows.filter((row) => !isBlankFinancialDebt(row) || row.id === selectedId);
}

export function addFinancialDebtDraft(body: FinancialBody, createId: () => string): { body: FinancialBody; rowId: string } {
  const rows = (body.debts as FinancialDebtRow[] | undefined) ?? [];
  const reusable = rows.find(isBlankFinancialDebt);
  if (reusable) return { body: body.no_debt === true ? { ...body, no_debt: false } : body, rowId: reusable.id };
  const row: FinancialDebtRow = { id: createId(), lender: "", status: "active", evidence_links: [] };
  return { body: { ...body, no_debt: false, debts: [...rows, row] }, rowId: row.id };
}

/** An Add popup owns a local row until its explicit Save succeeds. */
export function newFinancialDebtEntry(body: FinancialBody, createId: () => string): FinancialDebtRow {
  const reusable = ((body.debts as FinancialDebtRow[] | undefined) ?? []).find(isBlankFinancialDebt);
  return reusable ? structuredClone(reusable) : { id: createId(), lender: "", status: "active", evidence_links: [] };
}

export function commitFinancialDebtEntry(body: FinancialBody, entry: FinancialDebtRow): FinancialBody {
  if (isBlankFinancialDebt(entry)) throw new Error("Enter loan details before saving this row.");
  const rows = (body.debts as FinancialDebtRow[] | undefined) ?? [];
  const existing = rows.find((row) => row.id === entry.id);
  if (existing && !isBlankFinancialDebt(existing)) throw new Error("This loan row already exists. Edit it directly in the worksheet.");
  return { ...body, no_debt: false, debts: existing ? rows.map((row) => row.id === entry.id ? { ...entry } : row) : [...rows, { ...entry }] };
}
