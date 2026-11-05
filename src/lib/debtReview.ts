// The debt schedule line review: the lines a file's schedule could carry, the
// desk's answers to them, and the payload that saves it.
//
// A client's own schedule (an AI-built PDF, an Excel) comes in with lines that
// are not loans and almost never says what a lender asks first: the interest
// rate, the amount originally approved and what is still owed. The review lists
// every line, lets the desk take off what is not a debt, and asks those three
// questions of the rest. The server keeps what comes off as dismissed history.
//
// Everything here is pure: drafts in, a payload out, so it is testable without
// a browser and the drawer stays markup.

import { isAdvanceType, parseFigure } from "@/lib/debtTypes";

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
export type LineState = "read" | "on_schedule" | "removed";

export type ReviewHint = { kind: string; label: string; reason: string };

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
  /** What the file said about the balance ("Not confirmed"), kept beside the balance. */
  balance_note: string | null;
  /** What the file said about the payment ("Observed Oct 29"). */
  payment_note: string | null;
  notes_from_file: string[];
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
  monthly_payment?: number | null;
  payment_status: PaymentStatus | null;
};

export type ReviewSaved = { kept: number; added: number; updated: number; removed: number; restored: number };
export type ReviewResult = { review: DebtScheduleReview; saved: ReviewSaved };

/** One line as the person is editing it: every figure is the text in its box. */
export type LineDraft = {
  key: string;
  rowId: string | null;
  fileId: string | null;
  fileName: string | null;
  state: LineState;
  originLabel: string;
  hint: ReviewHint | null;
  notes: string[];
  balanceNote: string | null;
  paymentNote: string | null;
  /** Who took the line off and when, for a line that already was. */
  removedBy: string | null;
  removedAt: string | null;
  keep: boolean;
  reason: RemoveReason;
  lender: string;
  debtType: string;
  originalAmount: string;
  balance: string;
  rate: string;
  factorRate: string;
  paymentAmount: string;
  paymentCadence: Cadence | "";
  paymentStatus: PaymentStatus | "";
  /** The payload this line started as; a line is "changed" when it differs. */
  baseline: string;
};

export type AnswerKey = "rate" | "factorRate" | "originalAmount" | "balance";

const text = (value: number | null | undefined): string => (value == null ? "" : String(value));

/** The line as an editable draft. A line from the removed group starts removed. */
export function draftFromLine(line: ReviewLine, removedGroup = false): LineDraft {
  let paymentAmount = "";
  let paymentCadence: Cadence | "" = "";
  if (line.payment_amount != null) {
    // A per-payment figure whose cadence the file did not say keeps its amount
    // and leaves "how often" open: it is never guessed into a month.
    paymentAmount = text(line.payment_amount);
    paymentCadence = line.payment_frequency ?? "";
  } else if (line.monthly_payment != null) {
    paymentAmount = text(line.monthly_payment);
    paymentCadence = "monthly";
  }
  const draft: LineDraft = {
    key: line.key,
    rowId: line.row_id,
    fileId: line.file_id,
    fileName: line.file_name,
    state: line.state,
    originLabel: line.origin_label,
    hint: line.hint,
    notes: line.notes_from_file,
    balanceNote: line.balance_note,
    paymentNote: line.payment_note,
    removedBy: line.removed_by,
    removedAt: line.removed_at,
    keep: !removedGroup && line.state !== "removed",
    reason: line.removed_reason ?? "not_a_loan",
    lender: line.lender,
    debtType: line.debt_type,
    originalAmount: text(line.original_amount),
    balance: text(line.balance),
    rate: text(line.rate),
    factorRate: text(line.factor_rate),
    paymentAmount,
    paymentCadence,
    paymentStatus: line.payment_status ?? "",
    baseline: "",
  };
  // A line only in the file has nothing on the schedule to compare with, so it
  // is always saved; every other line is saved only once it differs from how
  // it started (a removed line that stays removed is not re-written, which
  // would overwrite who took it off and when).
  return { ...draft, baseline: line.state === "read" ? "" : signature(draft) };
}

/** Whether saving would write this line. */
export function isChanged(draft: LineDraft): boolean {
  return draft.state === "read" || draft.baseline !== signature(draft);
}

/** Whether a line belongs in the "taken off earlier" group rather than the list. */
export function isHistory(draft: LineDraft): boolean {
  return draft.state === "removed" && !draft.keep;
}

function signature(draft: LineDraft): string {
  return JSON.stringify(writeFromDraft(draft));
}

/** A payment as a month. Null when either half is missing. */
export function monthlyFrom(amount: number | null, cadence: Cadence | ""): number | null {
  if (amount == null || !cadence) return null;
  const perMonth = CADENCES.find((option) => option.value === cadence)?.perMonth;
  return perMonth == null ? null : Math.round(amount * perMonth * 100) / 100;
}

/** A box's figure: null when blank, NaN-free null when it is not a number. */
function figure(value: string): number | null {
  return parseFigure(value);
}

const blank = (value: string): boolean => value.trim() === "";

export function isAdvanceDraft(draft: LineDraft): boolean {
  return isAdvanceType(draft.debtType);
}

/** Which of the three questions a kept line has not answered. An advance is
 *  asked for its factor rate, never a percent. */
export function answersMissing(draft: LineDraft): AnswerKey[] {
  const missing: AnswerKey[] = [];
  if (isAdvanceDraft(draft)) {
    if (blank(draft.factorRate)) missing.push("factorRate");
  } else if (blank(draft.rate)) {
    missing.push("rate");
  }
  if (blank(draft.originalAmount)) missing.push("originalAmount");
  if (blank(draft.balance)) missing.push("balance");
  return missing;
}

export type DraftErrors = Partial<Record<"lender" | "originalAmount" | "balance" | "rate" | "factorRate" | "payment", string>>;

/** What stops a kept line from being saved. Blank answers never do: "not
 *  all mandatory" is the rule, and a blank stays unknown rather than 0. */
export function draftErrors(draft: LineDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.keep) return errors;
  if (blank(draft.lender)) errors.lender = "Name the lender.";
  const money = (value: string): string | null => {
    if (blank(value)) return null;
    const parsed = figure(value);
    if (parsed == null) return "Enter a number.";
    if (parsed < 0) return "Cannot be negative.";
    if (parsed > 1_000_000_000) return "That is more than a schedule can hold.";
    return null;
  };
  const original = money(draft.originalAmount);
  if (original) errors.originalAmount = original;
  const balance = money(draft.balance);
  if (balance) errors.balance = balance;
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
  if (!blank(draft.paymentAmount)) {
    const parsed = figure(draft.paymentAmount);
    if (parsed == null || parsed < 0) errors.payment = "Enter the payment as a number.";
    else if (!draft.paymentCadence) errors.payment = `Say how often ${draft.lender.trim() || "it"} is paid.`;
  }
  return errors;
}

export function hasErrors(draft: LineDraft): boolean {
  return Object.keys(draftErrors(draft)).length > 0;
}

/** The payload for one line. Blank boxes go as null (unknown, never 0). A loan
 *  sends its percent and an advance its factor, and never the other, so a
 *  factor cannot land in the percent column and a stored figure that is not
 *  being asked about is not erased. */
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
    original_amount: figure(draft.originalAmount),
    balance: figure(draft.balance),
    payment_amount: amount,
    payment_frequency: amount == null ? null : draft.paymentCadence || null,
    payment_status: draft.paymentStatus || null,
  };
  if (advance) write.factor_rate = figure(draft.factorRate);
  else write.rate = figure(draft.rate);
  if (!draft.keep) write.remove_reason = draft.reason;
  return write;
}

export type ReviewSummary = {
  read: number;
  keeping: number;
  removing: number;
  missing: number;
  invalid: number;
  changed: boolean;
};

export function summarize(drafts: LineDraft[]): ReviewSummary {
  const summary: ReviewSummary = { read: 0, keeping: 0, removing: 0, missing: 0, invalid: 0, changed: false };
  for (const draft of drafts) {
    if (draft.state === "read") summary.read += 1;
    if (draft.keep) {
      summary.keeping += 1;
      summary.missing += answersMissing(draft).length;
      if (hasErrors(draft)) summary.invalid += 1;
    } else if (draft.state !== "removed") {
      summary.removing += 1; // being taken off now; the earlier history is not counted
    }
    if (isChanged(draft)) summary.changed = true;
  }
  return summary;
}

/** Only what saving would write: lines from the file, and lines that changed. */
export function reviewBody(drafts: LineDraft[]): { lines: ReviewLineWrite[] } {
  return { lines: drafts.filter(isChanged).map(writeFromDraft) };
}

/** The file's own caveat on a line ("Not confirmed"), worth a chip. */
export function looksUnconfirmed(notes: Array<string | null | undefined>): boolean {
  return notes.some((note) => /\b(not confirmed|unconfirmed|unverified|not verified|confirm (active|obligation|payoff))\b/i.test(note ?? ""));
}

/** How a payment reads on the card: "$359.62 per business day ≈ $7,552.02 a month". */
export function paymentSentence(draft: LineDraft, money: (value: number) => string): string {
  const amount = blank(draft.paymentAmount) ? null : figure(draft.paymentAmount);
  if (amount == null) return "";
  if (!draft.paymentCadence) return "Say how often it is paid to see the month.";
  const unit = CADENCES.find((option) => option.value === draft.paymentCadence)?.label ?? "";
  const month = monthlyFrom(amount, draft.paymentCadence);
  if (draft.paymentCadence === "monthly" || month == null) return "";
  return `${money(amount)} per ${unit} ≈ ${money(month)} a month`;
}

export function savedSentence(saved: ReviewSaved, missing: number): string {
  const parts: string[] = [];
  if (saved.kept) parts.push(`${saved.kept} line${saved.kept === 1 ? "" : "s"} on the schedule`);
  if (saved.removed) parts.push(`${saved.removed} taken off`);
  if (saved.restored) parts.push(`${saved.restored} put back`);
  const head = parts.length ? parts.join(", ") : "Nothing changed";
  return missing > 0 ? `${head}. ${missing} answer${missing === 1 ? "" : "s"} still missing.` : `${head}.`;
}
