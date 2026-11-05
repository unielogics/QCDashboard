// The debt schedule review table: the lines a file's schedule could carry, the
// desk's answers to them, and the payload that saves it.
//
// A client's own schedule (an AI-built PDF, an Excel) comes in with lines that
// are not loans and almost never says what a lender asks first: the interest
// rate, the amount originally approved and what is still owed. The review turns
// the file into a fillable table: every value the file gave is already in its
// column, every cell it did not give is empty and marked "needed", and the desk
// fills the cells in place, takes off what is not a debt, and saves. The server
// keeps what comes off as dismissed history.
//
// Everything here is pure (drafts in, a payload out) so it is testable without a
// browser and the table component stays markup. The row's fields are the
// schedule form's, not a second list: `debtTypes.ts` owns the vocabulary, the
// required answers and their wording, and `neededFields` asks it.

import { debtRowProblems, debtTypeLabel, isAdvanceType, parseFigure, type DebtRowFields } from "@/lib/debtTypes";

// ── what the server sends and takes ──────────────────────────────────────────

export type RemoveReason = "not_a_loan" | "duplicate" | "paid_off" | "other_business" | "other";

export const REMOVE_REASONS: ReadonlyArray<{ value: RemoveReason; label: string }> = [
  { value: "not_a_loan", label: "Not a loan or debt (an operating expense)" },
  { value: "duplicate", label: "The same debt as another line" },
  { value: "paid_off", label: "Already paid off or closed" },
  { value: "other_business", label: "Belongs to another business or person" },
  { value: "other", label: "Another reason" },
];

export type Cadence = "daily" | "weekly" | "biweekly" | "monthly";

/** How often a payment is made, and how many of them make a month. The same
 *  table the cockpit prices a daily or weekly advance with, so the figure the
 *  desk sees here is the figure the debt service will use. */
export const CADENCES: ReadonlyArray<{ value: Cadence; label: string; perMonth: number }> = [
  { value: "daily", label: "business day", perMonth: 21 },
  { value: "weekly", label: "week", perMonth: 4.33 },
  { value: "biweekly", label: "2 weeks", perMonth: 2.17 },
  { value: "monthly", label: "month", perMonth: 1 },
];

export type PaymentStatus = "current" | "delinquent";
export type Secured = "secured" | "unsecured";
export type LineState = "read" | "on_schedule" | "removed";

export type ReviewHint = { kind: string; label: string; reason: string };

/** What the file said about one cell, and in whose words. */
export type FileCell = {
  value: string | number | boolean | null;
  /** The file's own words, when they are not just the value again ("weekday" read as daily). */
  wording: string | null;
  /** The file's caveat for the cell ("Not confirmed"). */
  note: string | null;
  /** Worked out by us (a month from a per-payment amount and how often). */
  derived: boolean;
};

export type ReviewLine = {
  key: string;
  row_id: string | null;
  state: LineState;
  origin: string | null;
  origin_label: string;
  file_id: string | null;
  file_name: string | null;
  lender: string;
  debt_type: string;
  advance: boolean;
  original_amount: number | null;
  balance: number | null;
  rate: number | null;
  factor_rate: number | null;
  payment_amount: number | null;
  payment_frequency: Cadence | null;
  monthly_payment: number | null;
  payment_status: PaymentStatus | null;
  count_in_dscr: boolean;
  originated_on: string | null;
  maturity_on: string | null;
  secured: Secured | null;
  collateral: string | null;
  mca_modified: boolean | null;
  mca_modification_note: string | null;
  notes: string | null;
  balance_note: string | null;
  payment_note: string | null;
  notes_from_file: string[];
  from_file: Record<string, FileCell> | null;
  hint: ReviewHint | null;
  missing: string[];
  removed_reason: RemoveReason | null;
  removed_by: string | null;
  removed_at: string | null;
};

export type ReviewSource = {
  file_id: string;
  file_name: string;
  uploaded_by: string | null;
  uploaded_at: string | null;
  entity: string | null;
  schedule_date: string | null;
  status_note: string | null;
  scope_note: string | null;
  source_basis: string | null;
  line_count: number;
};

export type DebtScheduleReview = {
  profile_id: string;
  sources: ReviewSource[];
  lines: ReviewLine[];
  removed: ReviewLine[];
  counts: Record<string, number>;
  /** The schedule has been filed as the document on the checklist (our PDF of the rows is behind the slot). */
  filed: boolean;
};

export type ReviewLineWrite = {
  key: string;
  row_id: string | null;
  keep: boolean;
  remove_reason?: RemoveReason | null;
  file_id: string | null;
  lender: string;
  debt_type: string | null;
  original_amount: number | null;
  balance: number | null;
  rate?: number | null;
  factor_rate?: number | null;
  payment_amount: number | null;
  payment_frequency: Cadence | null;
  payment_status: PaymentStatus | null;
  originated_on: string | null;
  maturity_on: string | null;
  secured: Secured | null;
  collateral: string | null;
  notes: string | null;
  mca_modified?: boolean | null;
  mca_modification_note?: string | null;
};

export type ReviewSaved = { kept: number; added: number; updated: number; removed: number; restored: number };
export type ReviewResult = {
  review: DebtScheduleReview;
  saved: ReviewSaved;
  /** This save also filed the schedule on the checklist. */
  filed: boolean;
  /** Why it was not filed when filing was asked for: the schedule form's own sentence. */
  filing_problem: string | null;
};

/** What a save sends: the changed lines, and whether to also file the schedule on the checklist. */
export type ReviewBody = { lines: ReviewLineWrite[]; file_as_schedule: boolean };

// ── the cells ────────────────────────────────────────────────────────────────

/** Every field of a line as the text in its box. */
export type FieldKey =
  | "lender"
  | "debtType"
  | "originalAmount"
  | "balance"
  | "rate"
  | "factorRate"
  | "paymentAmount"
  | "paymentCadence"
  | "paymentStatus"
  | "mcaModified"
  | "mcaNote"
  | "originatedOn"
  | "maturityOn"
  | "secured"
  | "collateral"
  | "note";

export const FIELD_KEYS: readonly FieldKey[] = [
  "lender", "debtType", "originalAmount", "balance", "rate", "factorRate", "paymentAmount", "paymentCadence", "paymentStatus",
  "mcaModified", "mcaNote", "originatedOn", "maturityOn", "secured", "collateral", "note",
];

export type FieldValues = Record<FieldKey, string>;

/** What the file gave for a line, as the text each box would hold, with its own
 *  words and caveats. Null for a row the file never named. */
export type FileSaid = {
  values: Partial<FieldValues>;
  wording: Partial<Record<FieldKey, string>>;
  notes: Partial<Record<FieldKey, string>>;
  /** The month the file gave or we worked out from its payment and how often. */
  monthly: number | null;
  monthlyDerived: boolean;
};

export type LineDraft = FieldValues & {
  key: string;
  rowId: string | null;
  fileId: string | null;
  fileName: string | null;
  state: LineState;
  originLabel: string;
  hint: ReviewHint | null;
  /** The file's other caveats on the line; the balance and payment ones are in `file.notes`. */
  fileNotes: string[];
  removedBy: string | null;
  removedAt: string | null;
  keep: boolean;
  reason: RemoveReason;
  countInDscr: boolean;
  file: FileSaid | null;
  /** The payload this line started as; a line is "changed" when it differs. */
  baseline: string;
};

export type ColumnKey = FieldKey | "monthly" | "fromFile";
export type ColumnKind = "text" | "type" | "money" | "rate" | "cadence" | "computed" | "status" | "yesno" | "date" | "secured" | "notes";
export type ColumnGroup = "lender" | "three" | "payment" | "status" | "advance" | "details" | "file";

export type ColumnSpec = {
  key: ColumnKey;
  label: string;
  group: ColumnGroup;
  kind: ColumnKind;
  /** Pixels on a wide screen. */
  width: number;
  /** What the cell is, for the header's hover. */
  help: string;
  max?: number;
};

/** The columns, in the order a schedule reads. The three Franco asks for are
 *  the accent group; the advance question is a group of its own because the
 *  schedule form requires it of every advance. */
export const COLUMNS: readonly ColumnSpec[] = [
  { key: "lender", label: "Lender", group: "lender", kind: "text", width: 250, help: "Who the debt is owed to.", max: 180 },
  { key: "debtType", label: "Type of debt", group: "lender", kind: "type", width: 200, help: "What kind of obligation it is. An advance is asked its factor rate and whether it was modified." },
  { key: "originalAmount", label: "Original amount approved", group: "three", kind: "money", width: 160, help: "What the lender approved or funded at the start." },
  { key: "balance", label: "Current balance", group: "three", kind: "money", width: 150, help: "What is still owed today." },
  { key: "rate", label: "Interest rate (%) · factor for advances", group: "three", kind: "rate", width: 150, help: "Percent a year for a loan; the factor (such as 1.35) for a merchant cash advance or revenue-based financing." },
  { key: "paymentAmount", label: "Payment", group: "payment", kind: "money", width: 130, help: "One payment, as the lender takes it." },
  { key: "paymentCadence", label: "Per", group: "payment", kind: "cadence", width: 140, help: "How often that payment is taken." },
  { key: "monthly", label: "≈ Monthly", group: "payment", kind: "computed", width: 130, help: "The payment as a month, which is what the debt service counts." },
  { key: "paymentStatus", label: "Current or delinquent", group: "status", kind: "status", width: 150, help: "Whether the debt is being paid on time." },
  { key: "mcaModified", label: "Modified for lower sales?", group: "advance", kind: "yesno", width: 150, help: "Asked of an advance only: did the funder lower the remittance because sales or revenue fell." },
  { key: "mcaNote", label: "What changed", group: "advance", kind: "text", width: 210, help: "How the funder modified it.", max: 1000 },
  { key: "originatedOn", label: "Origin date", group: "details", kind: "date", width: 130, help: "When the debt started (mm/dd/yyyy). Optional." },
  { key: "maturityOn", label: "Maturity date", group: "details", kind: "date", width: 130, help: "When it is due to end (mm/dd/yyyy). Optional." },
  { key: "secured", label: "Secured or unsecured", group: "details", kind: "secured", width: 150, help: "Whether something backs the debt. Optional." },
  { key: "collateral", label: "Type of collateral", group: "details", kind: "text", width: 190, help: "What backs it. Optional.", max: 500 },
  { key: "note", label: "Note", group: "details", kind: "text", width: 210, help: "Anything a reader of the schedule should know. Optional.", max: 2000 },
  { key: "fromFile", label: "From the file", group: "file", kind: "notes", width: 260, help: "The file's own caveats about the line." },
];

export const COLUMN_BY_KEY: Readonly<Record<ColumnKey, ColumnSpec>> = Object.fromEntries(COLUMNS.map((column) => [column.key, column])) as Record<ColumnKey, ColumnSpec>;

// ── text and figures ─────────────────────────────────────────────────────────

const blank = (value: string | null | undefined): boolean => String(value ?? "").trim() === "";

/** A box's figure: null when blank or not a number (never 0). */
export function figure(value: string): number | null {
  return parseFigure(value);
}

export function formatMoneyText(value: string): string {
  const parsed = figure(value);
  if (parsed == null || parsed < 0) return value;
  const hasCents = Math.abs(parsed - Math.round(parsed)) > 0.0000001;
  return parsed.toLocaleString("en-US", { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
}

export function formatRateText(value: string): string {
  const parsed = figure(value);
  if (parsed == null || parsed < 0) return value;
  return String(Number(parsed.toFixed(3)));
}

const pad = (value: number): string => String(value).padStart(2, "0");

/** "2021-03-01" as "03/01/2021". */
export function isoToDisplay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  return match ? `${match[2]}/${match[3]}/${match[1]}` : "";
}

/** A typed date as ISO, or null when it is not a real date. Reads mm/dd/yyyy,
 *  m/d/yyyy, mm-dd-yyyy and yyyy-mm-dd. */
export function displayToIso(typed: string): string | null {
  const raw = typed.trim();
  if (!raw) return null;
  let year: number;
  let month: number;
  let day: number;
  let match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (match) {
    month = Number(match[1]);
    day = Number(match[2]);
    year = Number(match[3]);
  } else {
    match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
    if (!match) return null;
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** A box tidied when the person leaves it: 13665.7 becomes 13,665.70, 7.250
 *  becomes 7.25, 3/1/2021 becomes 03/01/2021. Text that is not a figure or a
 *  date is left as typed, so the mistake stays where the person can see it. */
export function tidyCell(field: FieldKey, typed: string): string {
  if (field === "originalAmount" || field === "balance" || field === "paymentAmount") return formatMoneyText(typed);
  if (field === "rate" || field === "factorRate") return formatRateText(typed);
  if (field === "originatedOn" || field === "maturityOn") {
    const iso = displayToIso(typed);
    return iso ? isoToDisplay(iso) : typed;
  }
  return typed;
}

/** A payment as a month. Null when either half is missing. */
export function monthlyFrom(amount: number | null, cadence: Cadence | ""): number | null {
  if (amount == null || !cadence) return null;
  const perMonth = CADENCES.find((option) => option.value === cadence)?.perMonth;
  return perMonth == null ? null : Math.round(amount * perMonth * 100) / 100;
}

export function monthlyOf(draft: LineDraft): number | null {
  const amount = blank(draft.paymentAmount) ? null : figure(draft.paymentAmount);
  return monthlyFrom(amount, draft.paymentCadence as Cadence | "");
}

export function isAdvanceDraft(draft: Pick<LineDraft, "debtType">): boolean {
  return isAdvanceType(draft.debtType);
}

/** The field a column edits on this line. The rate column is the percent for a
 *  loan and the factor for an advance, never both on one line. */
export function fieldOf(draft: Pick<LineDraft, "debtType">, column: ColumnKey): FieldKey | null {
  if (column === "monthly" || column === "fromFile") return null;
  if (column === "rate") return isAdvanceDraft(draft) ? "factorRate" : "rate";
  return column;
}

/** The column a field shows in. */
export function columnOf(field: FieldKey): ColumnKey {
  return field === "factorRate" ? "rate" : field;
}

/** Whether the line has a cell in this column. The advance questions are the
 *  advance's alone, and "what changed" waits for a yes. */
export function cellApplies(draft: LineDraft, column: ColumnKey): boolean {
  if (column === "mcaModified") return isAdvanceDraft(draft);
  if (column === "mcaNote") return isAdvanceDraft(draft) && draft.mcaModified === "yes";
  return true;
}

// ── a line as a draft ────────────────────────────────────────────────────────

const money = (value: number | null | undefined): string => (value == null ? "" : formatMoneyText(String(value)));
const rateText = (value: number | null | undefined): string => (value == null ? "" : formatRateText(String(value)));

function yesNo(value: boolean | null | undefined): string {
  return value === true ? "yes" : value === false ? "no" : "";
}

/** The file's reading of a line as the text each box would hold. */
export function fileSaidFrom(line: ReviewLine): FileSaid | null {
  const cells = line.from_file;
  if (!cells) return null;
  const said: FileSaid = { values: {}, wording: {}, notes: {}, monthly: null, monthlyDerived: false };
  const put = (field: FieldKey, name: string, format: (value: string | number | boolean) => string) => {
    const cell = cells[name];
    if (!cell) return;
    if (cell.value != null) said.values[field] = format(cell.value);
    if (cell.wording) said.wording[field] = cell.wording;
    if (cell.note) said.notes[field] = cell.note;
  };
  const word = (value: string | number | boolean) => String(value);
  const dollars = (value: string | number | boolean) => money(Number(value));
  const rate = (value: string | number | boolean) => rateText(Number(value));
  const date = (value: string | number | boolean) => isoToDisplay(String(value));
  put("lender", "lender", word);
  put("debtType", "debt_type", word);
  put("originalAmount", "original_amount", dollars);
  put("balance", "balance", dollars);
  put("rate", "rate", rate);
  put("factorRate", "factor_rate", rate);
  put("paymentAmount", "payment_amount", dollars);
  put("paymentCadence", "payment_frequency", word);
  put("paymentStatus", "payment_status", word);
  put("originatedOn", "originated_on", date);
  put("maturityOn", "maturity_on", date);
  put("secured", "secured", word);
  put("collateral", "collateral", word);
  put("mcaModified", "mca_modified", (value) => yesNo(value as boolean));
  put("mcaNote", "mca_modification_note", word);
  const monthly = cells.monthly_payment;
  if (monthly && monthly.value != null) {
    said.monthly = Number(monthly.value);
    said.monthlyDerived = monthly.derived;
    // A file that gave only a month says it as "that amount per month".
    if (said.values.paymentAmount == null) {
      said.values.paymentAmount = money(Number(monthly.value));
      said.values.paymentCadence = "monthly";
      if (monthly.wording) said.wording.paymentAmount = monthly.wording;
    }
  }
  // The payment note belongs to both halves of the payment.
  if (said.notes.paymentCadence && !said.notes.paymentAmount) said.notes.paymentAmount = said.notes.paymentCadence;
  return said;
}

export function emptyValues(): FieldValues {
  return Object.fromEntries(FIELD_KEYS.map((field) => [field, ""])) as FieldValues;
}

/** The line as an editable draft. A line from the removed group starts removed. */
export function draftFromLine(line: ReviewLine, removedGroup = false): LineDraft {
  let paymentAmount = "";
  let paymentCadence = "";
  if (line.payment_amount != null) {
    // A per-payment figure whose cadence the file did not say keeps its amount
    // and leaves "how often" open: it is never guessed into a month.
    paymentAmount = money(line.payment_amount);
    paymentCadence = line.payment_frequency ?? "";
  } else if (line.monthly_payment != null) {
    paymentAmount = money(line.monthly_payment);
    paymentCadence = "monthly";
  }
  const draft: LineDraft = {
    ...emptyValues(),
    key: line.key,
    rowId: line.row_id,
    fileId: line.file_id,
    fileName: line.file_name,
    state: line.state,
    originLabel: line.origin_label,
    hint: line.hint,
    fileNotes: line.notes_from_file,
    removedBy: line.removed_by,
    removedAt: line.removed_at,
    keep: !removedGroup && line.state !== "removed",
    reason: line.removed_reason ?? "not_a_loan",
    countInDscr: line.count_in_dscr,
    file: fileSaidFrom(line),
    baseline: "",
    lender: line.lender,
    debtType: line.debt_type,
    originalAmount: money(line.original_amount),
    balance: money(line.balance),
    rate: rateText(line.rate),
    factorRate: rateText(line.factor_rate),
    paymentAmount,
    paymentCadence,
    paymentStatus: line.payment_status ?? "",
    mcaModified: yesNo(line.mca_modified),
    mcaNote: line.mca_modification_note ?? "",
    originatedOn: isoToDisplay(line.originated_on),
    maturityOn: isoToDisplay(line.maturity_on),
    secured: line.secured ?? "",
    collateral: line.collateral ?? "",
    note: line.notes ?? "",
  };
  // A line only in the file has nothing on the schedule to compare with, so it
  // is always saved; every other line is saved only once it differs from how
  // it started (a removed line that stays removed is not re-written, which
  // would overwrite who took it off and when).
  return { ...draft, baseline: line.state === "read" ? "" : signature(draft) };
}

function signature(draft: LineDraft): string {
  return JSON.stringify(writeFromDraft(draft));
}

/** Whether saving would write this line. */
export function isChanged(draft: LineDraft): boolean {
  return draft.state === "read" || draft.baseline !== signature(draft);
}

/** Whether a line belongs in the "taken off earlier" group rather than the table. */
export function isHistory(draft: LineDraft): boolean {
  return draft.state === "removed" && !draft.keep;
}

// ── what is needed, what is wrong, what was changed ──────────────────────────

/** The form's own row, built from the cells, so the required answers are the
 *  schedule form's and not a second list. An advance answers its price with a
 *  factor rate; the percent field is the form's only rate field, so the factor
 *  stands in for it. */
export function formRow(draft: LineDraft): DebtRowFields {
  const advance = isAdvanceDraft(draft);
  const monthly = monthlyOf(draft);
  return {
    lender: draft.lender,
    debt_type: draft.debtType,
    original_amount: draft.originalAmount,
    balance: draft.balance,
    rate: advance ? (blank(draft.factorRate) ? draft.rate : draft.factorRate) : draft.rate,
    monthly_payment: monthly == null ? "" : String(monthly),
    payment_status: draft.paymentStatus,
    originated_on: draft.originatedOn,
    maturity_on: draft.maturityOn,
    secured: draft.secured,
    collateral: draft.collateral,
    mca_modified: draft.mcaModified,
    mca_modification_note: draft.mcaNote,
    notes: draft.note,
  };
}

/** The cells a kept line has not answered, asked of the schedule form's own
 *  required-answers check. A line with nothing on it is not an obligation and
 *  needs nothing. */
export function neededFields(draft: LineDraft): FieldKey[] {
  if (!draft.keep) return [];
  const missing = debtRowProblems([formRow(draft)])[0]?.missing ?? [];
  const advance = isAdvanceDraft(draft);
  const needed: FieldKey[] = [];
  for (const answer of missing) {
    if (answer === "lender") needed.push("lender");
    else if (answer === "debt_type") needed.push("debtType");
    else if (answer === "original_amount") needed.push("originalAmount");
    else if (answer === "balance") needed.push("balance");
    else if (answer === "rate") needed.push(advance ? "factorRate" : "rate");
    else if (answer === "payment_status") needed.push("paymentStatus");
    else if (answer === "mca_modified") needed.push("mcaModified");
    else if (answer === "monthly_payment") {
      // A payment is an amount and how often: ask for whichever half is missing.
      if (blank(draft.paymentAmount)) needed.push("paymentAmount");
      if (blank(draft.paymentCadence)) needed.push("paymentCadence");
    }
  }
  return needed;
}

/** A payment amount typed or read with no "how often" beside it. It cannot be
 *  saved as it stands (the cockpit would read it as a month and understate a daily
 *  advance twenty-fold), so it waits: the line is saved without it, and the file
 *  still carries the amount, so it comes back the next time the table opens. */
export function unsavedPayment(draft: LineDraft): boolean {
  if (!draft.keep) return false;
  return !blank(draft.paymentAmount) && figure(draft.paymentAmount) != null && blank(draft.paymentCadence);
}

export type CellErrors = Partial<Record<FieldKey, string>>;

/** What stops a kept line from being saved. Blank answers never do: "not all
 *  mandatory" is the rule, and a blank stays unknown rather than becoming 0. */
export function draftErrors(draft: LineDraft): CellErrors {
  const errors: CellErrors = {};
  if (!draft.keep) return errors;
  if (blank(draft.lender)) errors.lender = "Name the lender.";
  const moneyError = (value: string): string | null => {
    if (blank(value)) return null;
    const parsed = figure(value);
    if (parsed == null) return "Enter a number.";
    if (parsed < 0) return "Cannot be negative.";
    if (parsed > 1_000_000_000) return "That is more than a schedule can hold.";
    return null;
  };
  for (const field of ["originalAmount", "balance", "paymentAmount"] as const) {
    const error = moneyError(draft[field]);
    if (error) errors[field] = error;
  }
  if (isAdvanceDraft(draft)) {
    if (!blank(draft.factorRate)) {
      const parsed = figure(draft.factorRate);
      if (parsed == null) errors.factorRate = "Enter a number such as 1.35.";
      else if (parsed < 1 || parsed > 5) errors.factorRate = "A factor rate is between 1 and 5, such as 1.35.";
    }
  } else if (!blank(draft.rate)) {
    const parsed = figure(draft.rate);
    if (parsed == null) errors.rate = "Enter a percent such as 7.25.";
    else if (parsed < 0 || parsed > 999.999) errors.rate = "A rate is between 0 and 999.999.";
  }
  for (const field of ["originatedOn", "maturityOn"] as const) {
    if (!blank(draft[field]) && displayToIso(draft[field]) == null) errors[field] = "Enter a date such as 03/01/2021.";
  }
  for (const column of COLUMNS) {
    const field = column.key as FieldKey;
    if (column.max && FIELD_KEYS.includes(field) && draft[field].length > column.max) errors[field] = `At most ${column.max} characters.`;
  }
  return errors;
}

export function hasErrors(draft: LineDraft): boolean {
  return Object.keys(draftErrors(draft)).length > 0;
}

/** Whether a cell holds the same thing the file said. Figures compare as
 *  numbers (13,665.71 is 13665.71) and words ignore case and spacing. */
function sameAsFile(field: FieldKey, current: string, filed: string): boolean {
  if (field === "originalAmount" || field === "balance" || field === "paymentAmount" || field === "rate" || field === "factorRate") {
    const a = blank(current) ? null : figure(current);
    const b = blank(filed) ? null : figure(filed);
    return a != null && b != null && Math.abs(a - b) < 0.0000001;
  }
  if (field === "originatedOn" || field === "maturityOn") return displayToIso(current) === displayToIso(filed);
  return current.trim().replace(/\s+/g, " ").toLowerCase() === filed.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The cells the person changed from what the file said. A cell the file left
 *  empty is not "edited" when it is filled: that is the point of the table. */
export function editedFields(draft: LineDraft): Set<FieldKey> {
  const edited = new Set<FieldKey>();
  if (!draft.file) return edited;
  for (const field of FIELD_KEYS) {
    const filed = draft.file.values[field];
    if (filed == null) continue;
    if (!sameAsFile(field, draft[field], filed)) edited.add(field);
  }
  return edited;
}

/** What the file gave for a line, for the cells it did, put back. A cell the
 *  file did not give goes back to empty. */
export function resetRow(draft: LineDraft): LineDraft {
  if (!draft.file) return draft;
  const values = emptyValues();
  for (const field of FIELD_KEYS) values[field] = draft.file.values[field] ?? "";
  return { ...draft, ...values, keep: true };
}

/** Whether a row has anything to reset: the file said something and the row differs. */
export function canResetRow(draft: LineDraft): boolean {
  const said = draft.file;
  if (!said) return false;
  if (editedFields(draft).size > 0) return true;
  // A cell the file did not give but the person filled in.
  return FIELD_KEYS.some((field) => said.values[field] == null && !blank(draft[field]));
}

export type CellMood = "needed" | "invalid" | "edited" | "filled" | "file" | "empty";

/** How a cell looks: needed (the file did not give it), invalid, edited from
 *  the file, filled in by the person, as the file gave it, or just empty. */
export function cellMood(draft: LineDraft, field: FieldKey, edited: Set<FieldKey>, needed: FieldKey[], errors: CellErrors): CellMood {
  if (errors[field]) return "invalid";
  if (needed.includes(field)) return "needed";
  if (edited.has(field)) return "edited";
  if (blank(draft[field])) return "empty";
  if (!draft.file) return "file";
  return draft.file.values[field] != null ? "file" : "filled";
}

function labelOfValue(field: FieldKey, value: string): string {
  if (field === "debtType") return debtTypeLabel(value) || value;
  if (field === "paymentCadence") return CADENCES.find((option) => option.value === value)?.label ?? value;
  if (field === "originalAmount" || field === "balance" || field === "paymentAmount") return `$${value}`;
  if (field === "rate") return `${value}%`;
  if (field === "factorRate") return `${value}×`;
  return value;
}

/** The file's own account of a cell, for hover: its words, what we read them
 *  as, and its caveat. Null when the file said nothing about the cell. */
export function fileSaying(draft: LineDraft, field: FieldKey): string | null {
  const said = draft.file;
  if (!said) return null;
  const value = said.values[field];
  const wording = said.wording[field];
  const note = said.notes[field];
  if (value == null && !wording && !note) return null;
  const parts: string[] = [];
  if (value != null) {
    const read = labelOfValue(field, value);
    parts.push(wording && wording.toLowerCase() !== read.toLowerCase() ? `The file said “${wording}” (read as ${read}).` : `The file said ${read}.`);
  } else if (wording) {
    parts.push(`The file said “${wording}”, which does not give a usable figure.`);
  } else {
    parts.push("The file did not give this.");
  }
  if (note) parts.push(`Its note: ${note}`);
  return parts.join(" ");
}

/** The cell's hover: why it is amber, what was changed, or what the file said. */
export function cellTitle(draft: LineDraft, field: FieldKey, mood: CellMood, errors: CellErrors): string {
  const filed = fileSaying(draft, field);
  if (mood === "invalid") return errors[field] ?? "Check this cell.";
  if (mood === "needed") {
    if (field === "paymentCadence" && unsavedPayment(draft)) {
      return `Needed. Say how often ${draft.lender.trim() || "it"} is paid. Until then the payment is not saved; the file still has it.${filed ? ` ${filed}` : ""}`;
    }
    return filed ? `Needed. ${filed}` : "Needed. The file did not give this: type it in.";
  }
  if (mood === "edited") return `Edited. ${filed ?? ""}`.trim();
  if (mood === "filled") return "Filled in by you. The file did not give this.";
  // As the file gave it: only worth a hover when the file said more than the value.
  const said = draft.file;
  return said && (said.wording[field] || said.notes[field]) ? filed ?? "" : "";
}

// ── totals, the next cell to fill, the summary ──────────────────────────────

export type Totals = {
  rows: number;
  /** Null when no line that stays has the figure, so the foot shows a dash and never a 0. */
  original: number | null;
  balance: number | null;
  monthly: number | null;
  /** Counted rows that have no monthly figure yet, so the total is a floor. */
  withoutMonthly: number;
  needed: number;
};

/** Whether the line's payment goes into the monthly debt service: a card does
 *  not by default, and a row on the schedule keeps its own setting. */
export function isCounted(draft: LineDraft): boolean {
  return draft.state === "read" ? draft.debtType !== "credit_card" : draft.countInDscr;
}

export function totals(drafts: LineDraft[]): Totals {
  let rows = 0;
  let needed = 0;
  let withoutMonthly = 0;
  const figures = { original: [] as number[], balance: [] as number[], monthly: [] as number[] };
  for (const draft of drafts) {
    if (!draft.keep) continue;
    rows += 1;
    needed += neededFields(draft).length;
    const original = blank(draft.originalAmount) ? null : figure(draft.originalAmount);
    const balance = blank(draft.balance) ? null : figure(draft.balance);
    if (original != null) figures.original.push(original);
    if (balance != null) figures.balance.push(balance);
    if (isCounted(draft)) {
      const monthly = monthlyOf(draft);
      if (monthly == null) withoutMonthly += 1;
      else figures.monthly.push(monthly);
    }
  }
  const total = (values: number[]): number | null => (values.length ? Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100 : null);
  return { rows, original: total(figures.original), balance: total(figures.balance), monthly: total(figures.monthly), withoutMonthly, needed };
}

/** The columns on screen. The advance question is shown whenever a line that
 *  stays is an advance (the schedule form requires it of every one); the
 *  optional details wait for the person to ask. */
export function visibleColumns(drafts: LineDraft[], showDetails: boolean): ColumnKey[] {
  const anyAdvance = drafts.some((draft) => draft.keep && isAdvanceDraft(draft));
  return COLUMNS.filter((column) => (column.group === "details" ? showDetails : column.group === "advance" ? anyAdvance || showDetails : true)).map((column) => column.key);
}

export type CellRef = { row: string; col: ColumnKey };

/** Every needed cell, row by row, left to right, in the columns on screen. */
export function neededCells(drafts: LineDraft[], visible: readonly ColumnKey[]): CellRef[] {
  const cells: CellRef[] = [];
  for (const draft of drafts) {
    if (!draft.keep) continue;
    const needed = new Set(neededFields(draft).map(columnOf));
    for (const column of visible) if (needed.has(column)) cells.push({ row: draft.key, col: column });
  }
  return cells;
}

/** The needed cell after the one in hand, wrapping round to the first. */
export function nextNeeded(cells: readonly CellRef[], from?: CellRef | null): CellRef | null {
  if (!cells.length) return null;
  if (!from) return cells[0];
  const at = cells.findIndex((cell) => cell.row === from.row && cell.col === from.col);
  return at >= 0 ? cells[(at + 1) % cells.length] : cells[0];
}

export type ReviewSummary = {
  read: number;
  keeping: number;
  removing: number;
  missing: number;
  invalid: number;
  /** Kept lines with a payment amount that has no "how often" yet, so it is not saved. */
  unsavedPayments: number;
  changed: boolean;
};

export function summarize(drafts: LineDraft[]): ReviewSummary {
  const summary: ReviewSummary = { read: 0, keeping: 0, removing: 0, missing: 0, invalid: 0, unsavedPayments: 0, changed: false };
  for (const draft of drafts) {
    if (draft.state === "read") summary.read += 1;
    if (draft.keep) {
      summary.keeping += 1;
      summary.missing += neededFields(draft).length;
      if (hasErrors(draft)) summary.invalid += 1;
      if (unsavedPayment(draft)) summary.unsavedPayments += 1;
    } else if (draft.state !== "removed") {
      summary.removing += 1; // being taken off now; the earlier history is not counted
    }
    if (isChanged(draft)) summary.changed = true;
  }
  return summary;
}

// ── the payload ──────────────────────────────────────────────────────────────

/** The payload for one line. Blank boxes go as null (unknown, never 0). A loan
 *  sends its percent and an advance its factor, and never the other, so a
 *  factor cannot land in the percent column and a stored figure that is not
 *  being asked about is not erased. The advance answers go only for an advance. */
export function writeFromDraft(draft: LineDraft): ReviewLineWrite {
  const advance = isAdvanceDraft(draft);
  const amount = blank(draft.paymentAmount) ? null : figure(draft.paymentAmount);
  const write: ReviewLineWrite = {
    key: draft.key,
    row_id: draft.rowId,
    keep: draft.keep,
    file_id: draft.fileId,
    lender: draft.lender.trim(),
    debt_type: draft.debtType || null,
    original_amount: blank(draft.originalAmount) ? null : figure(draft.originalAmount),
    balance: blank(draft.balance) ? null : figure(draft.balance),
    // An amount with no "how often" is not sent: see `unsavedPayment`.
    payment_amount: amount != null && draft.paymentCadence ? amount : null,
    payment_frequency: amount != null && draft.paymentCadence ? (draft.paymentCadence as Cadence) : null,
    payment_status: (draft.paymentStatus as PaymentStatus) || null,
    originated_on: displayToIso(draft.originatedOn),
    maturity_on: displayToIso(draft.maturityOn),
    secured: (draft.secured as Secured) || null,
    collateral: draft.collateral.trim() || null,
    notes: draft.note.trim() || null,
  };
  if (advance) {
    write.factor_rate = blank(draft.factorRate) ? null : figure(draft.factorRate);
    write.mca_modified = draft.mcaModified === "yes" ? true : draft.mcaModified === "no" ? false : null;
    write.mca_modification_note = draft.mcaModified === "yes" ? draft.mcaNote.trim() || null : null;
  } else {
    write.rate = blank(draft.rate) ? null : figure(draft.rate);
  }
  if (!draft.keep) write.remove_reason = draft.reason;
  return write;
}

/** Only what saving would write: lines from the file, and lines that changed. */
export function reviewBody(drafts: LineDraft[], fileAsSchedule = false): ReviewBody {
  return { lines: drafts.filter(isChanged).map(writeFromDraft), file_as_schedule: fileAsSchedule };
}

/** Whether the schedule is complete enough to file as the document on the
 *  checklist: at least one line stays, every required answer is in, nothing is
 *  invalid and no payment is waiting for its "how often". */
export function canFile(summary: ReviewSummary): boolean {
  return summary.keeping >= 1 && summary.missing === 0 && summary.invalid === 0 && summary.unsavedPayments === 0;
}

/** The file's own caveat on a line ("Not confirmed"), worth a chip. */
export function looksUnconfirmed(notes: Array<string | null | undefined>): boolean {
  return notes.some((note) => /\b(not confirmed|unconfirmed|unverified|not (a )?verified|confirm (active|obligation|payoff))\b/i.test(note ?? ""));
}

/** How a payment reads: "$359.62 per business day ≈ $7,552.02 a month". */
export function paymentSentence(draft: LineDraft, format: (value: number) => string): string {
  const amount = blank(draft.paymentAmount) ? null : figure(draft.paymentAmount);
  if (amount == null) return "";
  if (!draft.paymentCadence) return "Say how often it is paid to see the month.";
  const unit = CADENCES.find((option) => option.value === draft.paymentCadence)?.label ?? "";
  const month = monthlyFrom(amount, draft.paymentCadence as Cadence);
  if (draft.paymentCadence === "monthly" || month == null) return "";
  return `${format(amount)} per ${unit} ≈ ${format(month)} a month`;
}

export function savedSentence(saved: ReviewSaved, missing: number, filed = false): string {
  const parts: string[] = [];
  if (saved.kept) parts.push(`${saved.kept} line${saved.kept === 1 ? "" : "s"} on the schedule`);
  if (saved.removed) parts.push(`${saved.removed} taken off`);
  if (saved.restored) parts.push(`${saved.restored} put back`);
  if (filed) parts.push("filed as the debt schedule");
  const head = parts.length ? parts.join(", ") : "Nothing changed";
  return missing > 0 ? `${head}. ${missing} answer${missing === 1 ? "" : "s"} still missing.` : `${head}.`;
}

// ── a line the desk adds by hand ─────────────────────────────────────────────

/** A line the desk adds when the file gave none (or missed one). Its key says so. */
export const NEW_LINE_PREFIX = "new:";

export function isNewLine(draft: Pick<LineDraft, "key">): boolean {
  return draft.key.startsWith(NEW_LINE_PREFIX);
}

/** A blank line to type into. It is "read" in the sense that it is not on the
 *  schedule yet, so it is always saved once it has a lender. */
export function newLineDraft(n: number): LineDraft {
  return {
    ...emptyValues(),
    key: `${NEW_LINE_PREFIX}${n}`,
    rowId: null,
    fileId: null,
    fileName: null,
    state: "read",
    originLabel: "Added by you",
    hint: null,
    fileNotes: [],
    removedBy: null,
    removedAt: null,
    keep: true,
    reason: "not_a_loan",
    countInDscr: true,
    file: null,
    baseline: "",
  };
}

// ── the draft that survives the drawer closing ───────────────────────────────

/** A short fingerprint of what the server showed, so a stored draft is only put
 *  back over the same reading it was made on. */
export function readingSignature(review: DebtScheduleReview): string {
  const body = JSON.stringify({ s: review.sources.map((source) => source.file_id), l: review.lines, r: review.removed });
  let hash = 5381;
  for (let at = 0; at < body.length; at += 1) hash = ((hash << 5) + hash + body.charCodeAt(at)) | 0;
  return `${body.length}:${(hash >>> 0).toString(36)}`;
}

type StoredLine = { key: string; keep: boolean; reason: RemoveReason; values: FieldValues };
export type StoredReview = { signature: string; at: string; lines: StoredLine[] };

const storageKey = (profileId: string): string => `qc:debt-review:${profileId}`;

function stored(drafts: LineDraft[]): StoredLine[] {
  return drafts.map((draft) => ({
    key: draft.key,
    keep: draft.keep,
    reason: draft.reason,
    values: Object.fromEntries(FIELD_KEYS.map((field) => [field, draft[field]])) as FieldValues,
  }));
}

/** Whether the person has edited anything since the table opened. */
export function isDirty(drafts: LineDraft[], fresh: LineDraft[]): boolean {
  return JSON.stringify(stored(drafts)) !== JSON.stringify(stored(fresh));
}

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function saveStored(storage: StorageLike | null, profileId: string, readingKey: string, drafts: LineDraft[], now = new Date()): void {
  if (!storage) return;
  try {
    const payload: StoredReview = { signature: readingKey, at: now.toISOString(), lines: stored(drafts) };
    storage.setItem(storageKey(profileId), JSON.stringify(payload));
  } catch {
    // A full or blocked store only costs the safety net, never the work.
  }
}

export function clearStored(storage: StorageLike | null, profileId: string): void {
  try {
    storage?.removeItem(storageKey(profileId));
  } catch {
    // Nothing to clear.
  }
}

export function loadStored(storage: StorageLike | null, profileId: string, readingKey: string): StoredReview | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(storageKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReview;
    if (parsed.signature !== readingKey || !Array.isArray(parsed.lines)) {
      storage.removeItem(storageKey(profileId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** The fresh drafts with the person's stored edits laid over them. What the
 *  file and the schedule say (the file's reading, the baseline) is always the
 *  fresh server's. */
export function applyStored(fresh: LineDraft[], saved: StoredReview): LineDraft[] {
  const byKey = new Map(saved.lines.map((line) => [line.key, line]));
  const restored = fresh.map((draft) => {
    const edit = byKey.get(draft.key);
    return edit ? { ...draft, ...edit.values, keep: edit.keep, reason: edit.reason } : draft;
  });
  // The lines the person added by hand are not in the server's reading at all.
  const known = new Set(fresh.map((draft) => draft.key));
  for (const line of saved.lines) {
    if (!line.key.startsWith(NEW_LINE_PREFIX) || known.has(line.key)) continue;
    const n = Number(line.key.slice(NEW_LINE_PREFIX.length));
    restored.push({ ...newLineDraft(Number.isFinite(n) ? n : restored.length + 1), ...line.values, keep: line.keep, reason: line.reason });
  }
  return restored;
}
