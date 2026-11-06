import type { FinancialCockpit } from "./financialCockpit";
import type { FileRequestItem } from "./fileRequestsApi";

export type FinancialStatementRequestKind = "profit_and_loss" | "balance_sheet";
const known = (value: unknown) => typeof value === "number" && Number.isFinite(value);

/** Metadata or a blank template does not establish financial figures. Zero is known. */
export function profitAndLossIsEmpty(value: FinancialCockpit["profit_and_loss"] | undefined): boolean {
  return !value || ![value.gross_revenue, value.cost_of_goods_sold, value.gross_profit,
    value.total_operating_expenses, value.operating_income, value.net_income, value.ebitda].some(known);
}

export function balanceSheetIsEmpty(value: FinancialCockpit["balance_sheet"] | undefined): boolean {
  return !value || ![value.cash, value.total_current_assets, value.total_current_liabilities,
    value.total_assets, value.total_liabilities, value.total_equity].some(known);
}

export function financialStatementRequest(kind: FinancialStatementRequestKind, businessName: string): FileRequestItem {
  return {
    document_type: kind,
    name: kind === "profit_and_loss" ? "Profit and loss statement" : "Balance sheet",
    quantity: 1, unit: "files", subject: businessName.trim() || "business", period: "current",
    instructions: kind === "profit_and_loss"
      ? "Please provide a current profit and loss statement with its reporting period shown."
      : "Please provide a current balance sheet with its as-of date shown.",
  };
}

const normalized = (value: string) => value.trim().toLowerCase();
/** Add a card's request to an unsent batch without losing staff edits or adding duplicates. */
export function queueFileRequestPrefill(current: FileRequestItem[], incoming: FileRequestItem, untouchedDefault: FileRequestItem): FileRequestItem[] {
  if (current.length === 1 && JSON.stringify(current[0]) === JSON.stringify(untouchedDefault)) return [{ ...incoming }];
  if (current.some((item) => item.document_type === incoming.document_type && item.unit === incoming.unit
    && normalized(item.subject) === normalized(incoming.subject) && normalized(item.period) === normalized(incoming.period)
    && normalized(item.name) === normalized(incoming.name))) return current;
  return [...current, { ...incoming }];
}
