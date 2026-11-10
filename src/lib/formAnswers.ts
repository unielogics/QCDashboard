// A filled-in financial form read back in short (qcbackend
// GET /application-profiles/{id}/financial-forms/{kind}/answers): the headline
// figures, only the lines that were answered, and the files behind it.

import type { ApplicationRequirement } from "@/lib/applicationProfile";

export type FormKind = "pfs" | "debt_schedule" | "p_and_l" | "balance_sheet" | "real_estate_schedule" | "operating_plan";

export type FormAnswerLine = { label: string; value: string; amount: number | null; note: string | null };
export type FormAnswerSection = {
  key: string;
  title: string;
  rows: FormAnswerLine[];
  total: FormAnswerLine | null;
  left_blank: number;
  collapsed: boolean;
};
export type FormAnswerTable = { key: string; title: string; columns: string[]; rows: string[][]; total_row: string[] | null };
export type FormAnswerFile = { file_id: string; file_name: string; created_at: string; origin: "filled_form" | "uploaded" };

export type FormAnswers = {
  kind: FormKind;
  label: string;
  source: "filled" | "uploaded" | "none";
  figures_from: "form" | "document" | null;
  draft: boolean;
  who: string | null;
  as_of: string | null;
  filled_by: string | null;
  updated_at: string | null;
  headline: FormAnswerLine[];
  sections: FormAnswerSection[];
  tables: FormAnswerTable[];
  notes: string | null;
  files: FormAnswerFile[];
  empty_reason: string | null;
};

const BY_CLASSIFICATION: Record<string, FormKind> = {
  personal_financial_statement: "pfs",
  debt_schedule: "debt_schedule",
  current_p_and_l: "p_and_l",
  balance_sheet: "balance_sheet",
  real_estate_schedule: "real_estate_schedule",
  operating_plan: "operating_plan",
};

const FORM_LABELS: Record<FormKind, string> = {
  pfs: "personal financial statement",
  debt_schedule: "debt schedule",
  p_and_l: "profit and loss",
  balance_sheet: "balance sheet",
  real_estate_schedule: "real estate schedule",
  operating_plan: "operating expenses and earnings plan",
};

export function formLabel(kind: FormKind): string {
  return FORM_LABELS[kind];
}

/** Which of the four forms a requirement is about, from what it expects to
 *  receive and from any file on it that was filled in online. */
export function formKindsOf(requirement: Pick<ApplicationRequirement, "provenance" | "evidence_files">): FormKind[] {
  const found = new Set<FormKind>();
  const expected = requirement.provenance?.expected_classifications;
  if (Array.isArray(expected)) {
    for (const item of expected) {
      const kind = BY_CLASSIFICATION[String(item)];
      if (kind) found.add(kind);
    }
  }
  for (const file of requirement.evidence_files ?? []) {
    if (file.origin === "filled_form" && file.form_kind) found.add(file.form_kind);
  }
  return [...found];
}

/** "Filled in by the borrower · updated Nov 5, 2:14 PM" and its relatives. */
export function answersByline(answers: Pick<FormAnswers, "source" | "draft" | "filled_by" | "updated_at" | "figures_from">): string {
  const parts: string[] = [];
  if (answers.source === "filled") parts.push(answers.filled_by ? `Filled in by ${answers.filled_by}` : "Filled in online");
  else if (answers.source === "uploaded") parts.push("Uploaded; figures read by the AI");
  else if (answers.draft) parts.push("Draft, not submitted");
  if (answers.updated_at) {
    const date = new Date(answers.updated_at);
    if (!Number.isNaN(date.getTime())) {
      parts.push(`updated ${date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`);
    }
  }
  return parts.join(" · ");
}
