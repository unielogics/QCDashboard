import type { ParsedReport, ParsedTradeAccount } from "@/lib/types";

export type CreditAccountFilter = "all" | "open" | "adverse" | "past_due";

function fieldKey(key: string): string {
  return key.replace(/([a-z\d])([A-Z])/g, "$1_$2").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export function creditPretty(key: string): string {
  return fieldKey(key).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    .replace(/\bSsn\b/g, "SSN").replace(/\bEin\b/g, "EIN").replace(/\bTin\b/g, "TIN");
}

/** Provider amounts are data, never expressions, ranges, or inferred zeroes. */
export function creditNumber(raw?: string): number | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let text = raw.trim();
  let parenthesized = false;
  if (text.startsWith("(") && text.endsWith(")")) {
    parenthesized = true;
    text = text.slice(1, -1).trim();
  }
  const match = text.match(/^([+-])?\s*(?:(?:USD\s*\$?|\$)\s*)?([+-])?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(?:USD)?$/i);
  if (!match || (match[1] && match[2]) || (parenthesized && (match[1] || match[2]))) return null;
  const magnitude = Number(match[3].replace(/,/g, ""));
  if (!Number.isFinite(magnitude)) return null;
  const negative = parenthesized || (match[1] || match[2]) === "-";
  return magnitude === 0 ? 0 : negative ? -magnitude : magnitude;
}

const money = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function creditMoney(raw?: string): string {
  const value = creditNumber(raw);
  return value === null ? raw?.trim() || "Not provided" : money.format(value);
}

function normalizedFields(account: ParsedTradeAccount): Record<string, string> {
  return Object.fromEntries(Object.entries(account.fields ?? {}).map(([key, value]) => [fieldKey(key), value]));
}

function firstField(fields: Record<string, string>, names: string[]): string | undefined {
  return names.map((name) => fields[name]).find((value) => typeof value === "string" && value.trim().length > 0);
}

export function creditAccountField(account: ParsedTradeAccount, names: string[]): string | undefined {
  return firstField(normalizedFields(account), names);
}

export function creditMonthlyPayment(account: ParsedTradeAccount): string | undefined {
  const fields = normalizedFields(account);
  const monthly = firstField(fields, ["monthly_payment_amount", "monthly_payment"]);
  if (monthly !== undefined) return monthly;
  const frequency = firstField(fields, ["payment_frequency", "payment_cadence", "payment_interval", "payment_period",
    "frequency", "cadence", "payment_per", "per"]);
  if (!frequency || !/^(?:monthly|monthly_payments?|month|per_month|once_per_month|once_a_month|every_month|every_1_month|1_month|12_per_year)$/.test(fieldKey(frequency))) return undefined;
  return firstField(fields, ["payment_amount", "scheduled_payment_amount", "scheduled_payment"]);
}

function positiveSignal(text: string, pattern: RegExp, historical = true): boolean {
  for (const match of text.matchAll(new RegExp(pattern.source, "gi"))) {
    const before = text.slice(0, match.index);
    if (/\b(?:no|not|never|without|0|zero)\s+(?:(?:currently|reported|any|record of|history of)\s+){0,3}$/i.test(before)) continue;
    if (/\b(?:0|zero)\s+(?:days?|times?|occurrences?)\s*$/i.test(before)) continue;
    if (!historical && /\b(?:was|previously|prior|historical|history of)\s+$/i.test(before)) continue;
    return true;
  }
  return false;
}

const delinquency = /past[\s_-]*due|delinquen\w*|(?:30|60|90|120)\s*(?:[-+]\s*)?(?:days?\s*)?(?:late|past[\s_-]*due)/;
const adverse = /past[\s_-]*due|delinquen\w*|(?:30|60|90|120)\s*(?:[-+]\s*)?(?:days?\s*)?(?:late|past[\s_-]*due)|collect(?:ion|ions)|charg(?:e[\s_-]*off|ed[\s_-]*off)|default\w*|repossess\w*|foreclos\w*/;

export function creditAccountState(account: ParsedTradeAccount): {
  isOpen: boolean; isClosed: boolean; isAdverse: boolean; hasPastDue: boolean;
} {
  const fields = normalizedFields(account);
  const status = firstField(fields, ["account_status", "status"]) ?? "";
  const paymentStatus = firstField(fields, ["payment_status", "current_payment_status"]) ?? "";
  const rating = firstField(fields, ["account_rating", "rating"]) ?? "";
  const isClosed = /\b(?:closed|paid in full|settled|terminated)\b/i.test(status) || /^paid$/i.test(status.trim());
  const isOpen = !isClosed && /\b(?:open|active|current|in repayment)\b/i.test(status)
    && !/\b(?:not|never)\s+(?:open|active|current)\b/i.test(status);
  const pastDue = creditNumber(firstField(fields, ["past_due", "amount_past_due", "past_due_amount"]));
  const daysPastDue = creditNumber(fields.days_past_due);
  const hasPastDue = (pastDue !== null && pastDue > 0) || (daysPastDue !== null && daysPastDue > 0)
    || positiveSignal(`${status}; ${paymentStatus}`, delinquency, false);
  const reportedLateCount = Object.entries(fields).some(([key, value]) =>
    /(?:30|60|90|120).*late|late.*(?:30|60|90|120)/.test(key) && (creditNumber(value) ?? 0) > 0);
  return { isOpen, isClosed, hasPastDue,
    isAdverse: hasPastDue || reportedLateCount || positiveSignal(`${status}; ${paymentStatus}; ${rating}`, adverse) };
}

export function creditAccountLabel(account: ParsedTradeAccount): string {
  return firstField(normalizedFields(account), ["company", "creditor", "creditor_name", "lender", "lender_name", "subscriber_name"])?.trim()
    || "Unidentified creditor";
}

export function creditReportSummary(report: ParsedReport): {
  accounts: number; open: number; adverse: number; pastDue: number;
  balance: number | null; balancesReported: number; monthly: number | null; paymentsReported: number;
  inquiries: number; collections: number; publicRecords: number;
} {
  let open = 0, adverseCount = 0, pastDue = 0, balance = 0, monthly = 0, balancesReported = 0, paymentsReported = 0;
  const accounts = report.trade_accounts ?? [];
  for (const account of accounts) {
    const state = creditAccountState(account);
    open += Number(state.isOpen);
    adverseCount += Number(state.isAdverse);
    pastDue += Number(state.hasPastDue);
    const fields = normalizedFields(account);
    const amount = creditNumber(firstField(fields, ["balance", "current_balance", "outstanding_balance"]));
    const payment = creditNumber(creditMonthlyPayment(account));
    if (amount !== null) { balance += amount; balancesReported++; }
    if (payment !== null) { monthly += payment; paymentsReported++; }
  }
  return { accounts: accounts.length, open, adverse: adverseCount, pastDue,
    balance: balancesReported > 0 && Number.isFinite(balance) ? balance : null, balancesReported,
    monthly: paymentsReported > 0 && Number.isFinite(monthly) ? monthly : null, paymentsReported,
    inquiries: report.inquiries?.length ?? 0, collections: report.collections?.length ?? 0, publicRecords: report.public_records?.length ?? 0 };
}

const moneyFields = new Set([
  "balance", "current_balance", "outstanding_balance", "original_balance", "high_balance", "highest_balance",
  "credit_limit", "high_credit", "credit_line", "credit_line_amount", "original_amount", "loan_amount", "original_loan_amount",
  "monthly_payment_amount", "monthly_payment", "payment_amount", "scheduled_payment_amount", "scheduled_payment",
  "minimum_payment", "minimum_payment_amount", "past_due", "past_due_amount", "amount_past_due", "charge_off_amount",
  "original_charge_off", "collection_amount", "amount", "amount_owing", "amount_outstanding",
]);

function identifierField(key: string): boolean {
  const singular = key.replace(/_numbers$/, "_number").replace(/_ids$/, "_id").replace(/^(ssn|account)s$/, "$1");
  return /^(?:ssn(?:_last_?4)?|social_security(?:_number|_no)?|ss_number|tax_(?:id|identification)(?:_number|_no)?|taxid|(?:federal_)?(?:ein|tin|itin)|federal_(?:tax_id|id_number)|(?:employer|taxpayer)_identification_number|account(?:_(?:number|no|num|id))?|(?:credit|loan)_account_number)$/.test(singular);
}

export function creditDisplayField(key: string, value: unknown): string {
  if (value == null) return "Not provided";
  const text = typeof value === "string" ? value.trim()
    : typeof value === "number" && Number.isFinite(value) ? String(value)
      : typeof value === "boolean" ? String(value) : "";
  if (!text) return "Not provided";
  const name = fieldKey(key);
  if (identifierField(name)) {
    if (/[*•●]|x{2,}|#{2,}|\b(?:masked|redacted)\b/i.test(text)) {
      // Preserve the provider's redacted value, while also hiding any full
      // identifier included beside it in the same reported field.
      return text.replace(/\d(?:[\d\s./()-]*\d)?/g, (part) => {
        const digits = part.replace(/\D/g, "");
        return digits.length > 4 ? `••••${digits.slice(-4)}` : part;
      });
    }
    if (/^(?:n\/?a|unknown|none|not (?:provided|reported|available|disclosed)|unavailable|pending|missing)$/i.test(text)) return text;
    const compact = text.replace(/[^a-z\d]/gi, "");
    if (compact) return `••••${compact.slice(-4)}`;
    return text;
  }
  return moneyFields.has(name) ? creditMoney(text) : text;
}

export function filterCreditAccounts(
  accounts: ParsedTradeAccount[], filter: CreditAccountFilter, query: string,
): { account: ParsedTradeAccount; index: number }[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return accounts.map((account, index) => ({ account, index })).filter(({ account }) => {
    const state = creditAccountState(account);
    if (filter === "open" && !state.isOpen) return false;
    if (filter === "adverse" && !state.isAdverse) return false;
    if (filter === "past_due" && !state.hasPastDue) return false;
    const text = Object.entries(account.fields ?? {}).map(([key, value]) => `${creditPretty(key)} ${creditDisplayField(key, value)}`).join(" ").toLocaleLowerCase();
    return words.every((word) => text.includes(word));
  });
}

export function creditFieldGroups(fields: Record<string, string>): { title: string; fields: [string, string][] }[] {
  const groups: { title: string; fields: [string, string][] }[] = [
    { title: "Account details", fields: [] }, { title: "Balances and payments", fields: [] },
    { title: "Dates", fields: [] }, { title: "Payment history and remarks", fields: [] }, { title: "Other reported fields", fields: [] },
  ];
  for (const entry of Object.entries(fields)) {
    const name = fieldKey(entry[0]);
    const index = /history|remark|comment|delinquen|late|disput|payment_pattern/.test(name) ? 3
      : /date|opened|reported|closed_at|updated_at|last_activity/.test(name) ? 2
        : moneyFields.has(name) ? 1
          : /^(?:company|creditor(?:_name)?|lender(?:_name)?|subscriber_name|account_(?:number|no|num|id|status|type|rating)|portfolio_type|responsibility|payment_status|status)$/.test(name) ? 0 : 4;
    groups[index].fields.push(entry);
  }
  return groups.filter((group) => group.fields.length > 0);
}
