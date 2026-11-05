// What a business debt schedule may call an obligation, and what a complete
// row has to say.
//
// One list, used by every surface that shows a "type of debt": the borrower's
// link, the on-screen modal in the room, the desk's editor and the review page.
// The value is the slug the backend stores in `dos_debts.category`; the label is
// what a person reads. The backend keeps the same list in
// `app/services/debt_types.py` and normalises anything typed before the list
// existed ("LOC", "Term") to the slug it means — change both lists together.
//
// The merchant cash advance is the one that matters: a funder that lowered a
// remittance because sales fell has changed what the schedule is reporting, so
// the form asks about it, and only on a row that says it is an advance.

export type DebtTypeOption = { value: string; label: string };

export const DEBT_TYPES: readonly DebtTypeOption[] = [
  { value: "term_loan", label: "Term loan" },
  { value: "line_of_credit", label: "Line of credit" },
  { value: "sba_loan", label: "SBA loan" },
  { value: "equipment", label: "Equipment loan or lease" },
  { value: "vehicle", label: "Vehicle loan" },
  { value: "real_estate", label: "Commercial mortgage or real estate loan" },
  { value: "mca", label: "Merchant cash advance (MCA)" },
  { value: "revenue_based", label: "Revenue-based financing" },
  { value: "invoice_factoring", label: "Invoice factoring or A/R financing" },
  { value: "credit_card", label: "Business credit card" },
  { value: "floorplan", label: "Floorplan line" },
  { value: "lease", label: "Lease" },
  { value: "personal_loan", label: "Personal loan used for the business" },
  { value: "tax_payment_plan", label: "Tax liability or payment plan" },
  { value: "other", label: "Other" },
];

const LABELS: Record<string, string> = Object.fromEntries(DEBT_TYPES.map((t) => [t.value, t.label]));

/** The kinds the schedule asks the advance question of: a merchant cash
 *  advance, and revenue-based financing, which is the same product under the
 *  name most daily-pull funders sell it by. */
export const ADVANCE_DEBT_TYPES: ReadonlySet<string> = new Set(["mca", "revenue_based"]);

/** "loan" is the column's historic default, written by code and never chosen
 *  by a person, so it reads as "not stated" — on both sides. */
export function isUnstatedType(value: string | undefined | null): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return !text || text === "loan";
}

/** What a person reads for a stored type: the label for a slug we know, the
 *  text itself for a value typed before the list existed, nothing for blank. */
export function debtTypeLabel(value: string | undefined | null): string {
  if (isUnstatedType(value)) return "";
  const text = String(value ?? "").trim();
  return LABELS[text] ?? text;
}

/** Whether the row is an advance and must answer the follow-up. Matches the
 *  backend's reading of a typed value, so a legacy "Merchant Cash Advance" row
 *  asks the question before anyone re-picks it from the list. */
export function isAdvanceType(value: string | undefined | null): boolean {
  const text = String(value ?? "").trim().toLowerCase().replace(/[_-]+/g, " ");
  if (!text) return false;
  if (ADVANCE_DEBT_TYPES.has(text.replace(/ /g, "_"))) return true;
  return /(^|[^a-z0-9])(mca|merchant cash|cash advance|merchant advance|advances?|revenue based|rbf)([^a-z0-9]|$)/.test(text);
}

/** A typed figure as a number, or null when the box is blank or not a number.
 *  "TBD" is not nought: the backend reads it as unknown too, and a 0 written
 *  into a monthly payment would tell the DSCR the obligation costs nothing. */
export function parseFigure(value: string | undefined | null): number | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const negative = /^\(.*\)$/.test(raw) || raw.startsWith("-");
  const cleaned = raw.replace(/^[-(]|\)$/g, "").replace(/[,$%\s]/g, "");
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const parsed = Number.parseFloat(cleaned);
  return negative ? -parsed : parsed;
}

/** The input id the form gives a field on a card, so a failed submit can
 *  scroll to and focus the first thing still missing. */
export function debtFieldId(field: RequiredDebtField, index: number): string {
  const prefix: Record<RequiredDebtField, string> = {
    lender: "lender",
    debt_type: "type",
    original_amount: "original",
    balance: "balance",
    rate: "rate",
    monthly_payment: "monthly",
    payment_status: "status",
    mca_modified: "mca",
  };
  return `${prefix[field]}-${index}`;
}

/** Scroll the first missing answer into view and focus it. A no-op outside a
 *  browser or when the control is not on the page. */
export function focusFirstProblem(problems: readonly DebtRowProblem[]): void {
  const first = problems[0];
  if (!first || typeof document === "undefined") return;
  const element = document.getElementById(debtFieldId(first.missing[0], first.index - 1));
  if (!element) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
  if (element instanceof HTMLElement) element.focus({ preventScroll: true });
}

/** A row as every form holds it: strings off the inputs, never numbers. */
export type DebtRowFields = {
  lender?: string;
  debt_type?: string;
  original_amount?: string;
  balance?: string;
  rate?: string;
  monthly_payment?: string;
  originated_on?: string;
  maturity_on?: string;
  secured?: string;
  payment_status?: string;
  collateral?: string;
  mca_modified?: string;
  mca_modification_note?: string;
  notes?: string;
  editable?: boolean;
};

export type RequiredDebtField =
  | "lender"
  | "debt_type"
  | "original_amount"
  | "balance"
  | "rate"
  | "monthly_payment"
  | "payment_status"
  | "mca_modified";

/** The owner: "not all the fields are mandatory, but lender name, type of debt,
 *  original amount, balance, interest rate, monthly payment, current or
 *  delinquent we need it." The dates, secured, collateral and the note may stay
 *  blank. An advance also has to say whether it was modified. Mirrors
 *  `financial_statements.REQUIRED_DEBT_FIELDS`. */
export const REQUIRED_DEBT_FIELDS: readonly RequiredDebtField[] = [
  "lender",
  "debt_type",
  "original_amount",
  "balance",
  "rate",
  "monthly_payment",
  "payment_status",
];

export const REQUIRED_FIELD_WORDS: Record<RequiredDebtField, string> = {
  lender: "lender name",
  debt_type: "type of debt",
  original_amount: "original amount",
  balance: "current balance",
  rate: "interest rate",
  monthly_payment: "monthly payment",
  payment_status: "current or delinquent",
  mca_modified: "whether the advance was modified for lower sales",
};

export type DebtRowProblem = { index: number; lender: string | null; missing: RequiredDebtField[] };

const ANSWER_FIELDS: readonly (keyof DebtRowFields)[] = [
  "lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "originated_on",
  "maturity_on", "secured", "payment_status", "collateral", "mca_modified", "mca_modification_note", "notes",
];

/** A row with nothing on it is someone tabbing through an empty line, not an
 *  obligation; the backend drops it, so it is not checked here either. A row
 *  with anything on it — a type, an amount, a note — is an obligation someone
 *  started, and is kept and checked rather than silently dropped. */
export function isBlankDebtRow(row: DebtRowFields): boolean {
  return ANSWER_FIELDS.every((key) => String(row[key] ?? "").trim() === "");
}

const MONEY_FIELDS: ReadonlySet<RequiredDebtField> = new Set(["original_amount", "balance", "rate", "monthly_payment"]);

/** Whether a required answer is still missing: blank, a type nobody stated, or
 *  a figure that is not a number. Mirrors the backend, which reads "TBD" as
 *  unknown and "loan" as not stated. */
function unanswered(field: RequiredDebtField, value: string | undefined): boolean {
  if (String(value ?? "").trim() === "") return true;
  if (field === "debt_type") return isUnstatedType(value);
  if (MONEY_FIELDS.has(field)) return parseFigure(value) === null;
  return false;
}

/** Which required answers each row still lacks, for a submit. Drafts are never
 *  checked. A row the saver cannot write (`editable` false) is skipped: a
 *  borrower is not held up by a desk row they have no way to complete. Rows are
 *  numbered from one, the way the form shows them. Mirrors
 *  `financial_statements.debt_row_problems`. */
export function debtRowProblems(rows: readonly DebtRowFields[] | undefined): DebtRowProblem[] {
  const problems: DebtRowProblem[] = [];
  (rows ?? []).forEach((row, at) => {
    if (row.editable === false || isBlankDebtRow(row)) return;
    const missing = REQUIRED_DEBT_FIELDS.filter((field) => unanswered(field, row[field]));
    if (isAdvanceType(row.debt_type) && unanswered("mca_modified", row.mca_modified)) missing.push("mca_modified");
    if (missing.length) {
      const lender = String(row.lender ?? "").trim();
      problems.push({ index: at + 1, lender: lender || null, missing });
    }
  });
  return problems;
}

/** The problems as one sentence per obligation: "Obligation 2 (Newtek) still
 *  needs: interest rate, current or delinquent." The same wording the backend
 *  returns in a 422, so the page reads the same whichever side caught it. */
export function describeDebtProblems(problems: readonly DebtRowProblem[]): string {
  return problems
    .map((problem) => {
      const who = problem.lender ? ` (${problem.lender})` : "";
      const words = problem.missing.map((field) => REQUIRED_FIELD_WORDS[field]).join(", ");
      return `Obligation ${problem.index}${who} still needs: ${words}.`;
    })
    .join(" ");
}

/** The set of (row index, field) pairs that are missing, for marking inputs. */
export function missingFieldKeys(problems: readonly DebtRowProblem[]): Set<string> {
  const keys = new Set<string>();
  for (const problem of problems) for (const field of problem.missing) keys.add(`${problem.index - 1}.${field}`);
  return keys;
}
