import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DebtScheduleReviewTable } from "@/components/application/DebtScheduleReviewTable";
import { draftFromLine, newLineDraft, visibleColumns, type FileCell, type LineDraft, type ReviewLine } from "@/lib/debtReview";

function cell(value: FileCell["value"], over: Partial<FileCell> = {}): FileCell {
  return { value, wording: null, note: null, derived: false, ...over };
}

function line(over: Partial<ReviewLine> = {}): ReviewLine {
  return {
    key: "alpha-funding", row_id: null, state: "read", origin: null, origin_label: "Read from the uploaded schedule", file_id: "file-1", file_name: "Schedule.pdf",
    lender: "Alpha Funding", debt_type: "mca", advance: true, original_amount: null, balance: 13665.71, rate: null, factor_rate: null,
    payment_amount: 359.62, payment_frequency: "daily", monthly_payment: 7552.02, payment_status: "current", count_in_dscr: true,
    originated_on: null, maturity_on: null, secured: null, collateral: null, mca_modified: null, mca_modification_note: null, notes: null,
    balance_note: "Oct 22 letter; not a verified payoff", payment_note: null, notes_from_file: [],
    from_file: {
      lender: cell("Alpha Funding"), debt_type: cell("mca"), balance: cell(13665.71, { note: "Oct 22 letter; not a verified payoff" }),
      payment_amount: cell(359.62), payment_frequency: cell("daily", { wording: "weekday" }), monthly_payment: cell(7552.02, { derived: true }), payment_status: cell("current"),
    },
    hint: null, missing: [], removed_reason: null, removed_by: null, removed_at: null, ...over,
  };
}

function render(drafts: LineDraft[], extra: { visibleKeys?: Set<string> | null; showDetails?: boolean } = {}): string {
  return renderToStaticMarkup(
    createElement(DebtScheduleReviewTable, {
      drafts,
      columns: visibleColumns(drafts, extra.showDetails ?? false),
      onChange: () => undefined,
      onReplace: () => undefined,
      onDelete: () => undefined,
      focusRequest: null,
      visibleKeys: extra.visibleKeys ?? null,
    }),
  );
}

describe("the review table markup", () => {
  const drafts = [
    draftFromLine(line()),
    draftFromLine(line({
      key: "credibly", lender: "Credibly", balance: null, payment_amount: 1133.18, payment_frequency: null, monthly_payment: null,
      from_file: { lender: cell("Credibly"), debt_type: cell("mca"), payment_amount: cell(1133.18), payment_frequency: cell(null, { wording: "recurring" }), payment_status: cell("current") },
    })),
  ];

  it("is one table with a header cell per visible column and one for the row actions", () => {
    const html = render(drafts);
    expect(html.match(/<table /g)).toHaveLength(1);
    expect(html).toContain('aria-label="Debt schedule lines"');
    for (const label of ["Lender", "Type of debt", "Original amount approved", "Current balance", "Payment", "Per", "≈ Monthly", "Current or delinquent", "Modified for lower sales?", "From the file", "This line"]) {
      expect(html).toContain(label);
    }
    expect(html.match(/<th /g)).toHaveLength(visibleColumns(drafts, false).length + 1);
    expect(html).not.toContain("Type of collateral"); // the details wait for the person to ask
  });

  it("shows the details columns on request", () => {
    expect(render(drafts, { showDetails: true })).toContain("Type of collateral");
  });

  it("puts what the file gave in its cell, formatted", () => {
    const html = render(drafts);
    expect(html).toContain('value="13,665.71"');
    expect(html).toContain('value="359.62"');
    expect(html).toContain('<option value="daily" selected="">business day</option>');
    expect(html).toContain("$7,552.02"); // the month, worked out from the payment and how often
  });

  it("marks every cell the file did not give as needed, in a word and not only a colour", () => {
    const html = render(drafts);
    expect(html).toContain('data-mood="needed"');
    expect(html).toContain('placeholder="needed"');
    expect(html).toContain('aria-label="Original amount approved for Alpha Funding, needed"');
    expect(html).toContain('aria-label="Factor rate for Alpha Funding, needed"');
    expect(html).toContain('aria-label="Per for Credibly, needed"');
    expect(html).toContain("Until then the payment is not saved");
  });

  it("asks an advance for a factor rate with a times sign and a loan for a percent", () => {
    const html = render([...drafts, draftFromLine(line({ key: "bank", lender: "Bank of Main", debt_type: "term_loan", advance: false, from_file: null }))]);
    expect(html).toContain('data-unit="×"');
    expect(html).toContain('data-unit="%"');
    expect(html).toContain('aria-label="Interest rate for Bank of Main, needed"');
    expect(html).toContain("Asked of an advance only."); // the loan has no advance question
  });

  it("gives every cell a label for the phone, where a row stacks as a card", () => {
    const html = render(drafts);
    expect(html).toContain('data-label="Current balance"');
    expect(html).toContain('data-label="Factor rate"');
    expect(html).toContain('data-label="This line"');
  });

  it("tags every control with its row and column so the keyboard can find its neighbour", () => {
    const html = render(drafts);
    expect(html).toContain('data-rk="alpha-funding"');
    expect(html).toContain('data-ck="balance"');
    expect(html).toContain('data-ck="paymentCadence"');
    expect(html).toContain('data-rk="credibly"');
  });

  it("carries the file's own caveats in the last column and says so when a line was not in the file", () => {
    const html = render([...drafts, draftFromLine(line({ key: "row", lender: "Typed Bank", state: "on_schedule", row_id: "r1", origin_label: "Typed by the client", from_file: null }))]);
    expect(html).toContain("Oct 22 letter; not a verified payoff");
    expect(html).toContain("Not confirmed in the file");
    expect(html).toContain("Not named in the file. Typed by the client.");
  });

  it("offers Not a loan on every kept line and Reset to the file only where the row differs from it", () => {
    const edited = { ...drafts[0], balance: "1" };
    const html = render([edited, drafts[1]]);
    expect(html.match(/Not a loan/g)!.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Reset to the file/g)).toHaveLength(1);
  });

  it("offers Remove line, not Not a loan, on a line the desk added by hand", () => {
    const html = render([{ ...newLineDraft(1), lender: "Local Bank" }]);
    expect(html).toContain("Remove line");
    expect(html).not.toContain("Not a loan");
    expect(html).toContain('data-rk="new:1"');
    expect(html).toContain("Added by you"); // said in the From the file column
  });

  it("collapses a line taken off into one strip with its reason and a way back", () => {
    const html = render([drafts[0], { ...drafts[1], keep: false, reason: "paid_off" }]);
    expect(html).toContain("taken off:");
    expect(html).toContain("Put back");
    expect(html).toContain('<option value="paid_off" selected="">Already paid off or closed</option>');
    expect(html).toMatch(new RegExp(`colspan="${visibleColumns(drafts, false).length + 1}"`, "i"));
  });

  it("totals the lines that stay: balance, month, and what is still missing", () => {
    const html = render(drafts);
    expect(html).toContain("<tfoot>");
    expect(html).toContain("$13,665.71");
    expect(html).toContain("$7,552.02");
    expect(html).toMatch(/data-label="Original amount approved">—<\/td>/); // nobody gave one: a dash, never $0.00
    expect(html).toContain("1 not priced yet"); // Credibly has no month yet
    expect(html).toMatch(/2 lines · \d+ answers still missing/);
  });

  it("can show only a frozen set of lines", () => {
    const html = render(drafts, { visibleKeys: new Set(["credibly"]) });
    expect(html).toContain('data-rk="credibly"');
    expect(html).not.toContain('data-rk="alpha-funding"');
    expect(render(drafts, { visibleKeys: new Set() })).toContain("Nothing needs an answer");
  });

  it("marks a cell the person changed from what the file said", () => {
    const html = render([{ ...drafts[0], balance: "9,000" }]);
    expect(html).toContain('data-mood="edited"');
    expect(html).toContain("Edited. The file said $13,665.71.");
  });
});
