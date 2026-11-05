import { describe, expect, it } from "vitest";

import {
  answersMissing,
  draftErrors,
  draftFromLine,
  isChanged,
  isHistory,
  looksUnconfirmed,
  monthlyFrom,
  paymentSentence,
  reviewBody,
  savedSentence,
  summarize,
  writeFromDraft,
  type ReviewLine,
} from "@/lib/debtReview";

function line(over: Partial<ReviewLine> = {}): ReviewLine {
  return {
    key: "alpha-funding",
    row_id: null,
    state: "read",
    origin: null,
    origin_label: "Read from the uploaded schedule",
    file_id: "file-1",
    file_name: "Schedule.pdf",
    lender: "Alpha Funding",
    debt_type: "mca",
    advance: true,
    original_amount: null,
    balance: 13665.71,
    rate: null,
    factor_rate: null,
    payment_amount: 359.62,
    payment_frequency: "daily",
    monthly_payment: 7552.02,
    payment_status: "current",
    count_in_dscr: true,
    balance_note: "Oct 22 letter; not a verified payoff",
    payment_note: null,
    notes_from_file: [],
    hint: null,
    missing: ["factor_rate", "original_amount"],
    removed_reason: null,
    removed_by: null,
    removed_at: null,
    ...over,
  };
}

const money = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

describe("draftFromLine", () => {
  it("starts a per-business-day payment as the amount and its cadence, not as a month", () => {
    const draft = draftFromLine(line());
    expect([draft.paymentAmount, draft.paymentCadence]).toEqual(["359.62", "daily"]);
    expect(draft.balance).toBe("13665.71");
    expect(draft.keep).toBe(true);
  });

  it("keeps an amount whose cadence the file did not say and leaves how-often open", () => {
    const draft = draftFromLine(line({ payment_frequency: null, monthly_payment: null }));
    expect([draft.paymentAmount, draft.paymentCadence]).toEqual(["359.62", ""]);
    expect(draftErrors(draft).payment).toMatch(/how often/);
  });

  it("starts a row that only has a monthly figure as that month", () => {
    const draft = draftFromLine(line({ state: "on_schedule", payment_amount: null, payment_frequency: null, monthly_payment: 950 }));
    expect([draft.paymentAmount, draft.paymentCadence]).toEqual(["950", "monthly"]);
  });

  it("starts a line from the removed group removed, with its reason", () => {
    const draft = draftFromLine(line({ state: "removed", removed_reason: "paid_off" }), true);
    expect([draft.keep, draft.reason, isHistory(draft)]).toEqual([false, "paid_off", true]);
  });

  it("never turns an unknown figure into a nought", () => {
    const draft = draftFromLine(line({ balance: null, payment_amount: null, payment_frequency: null, monthly_payment: null }));
    expect([draft.originalAmount, draft.balance, draft.rate, draft.factorRate, draft.paymentAmount]).toEqual(["", "", "", "", ""]);
    const write = writeFromDraft(draft);
    expect([write.original_amount, write.balance, write.payment_amount, write.payment_frequency]).toEqual([null, null, null, null]);
  });
});

describe("the three questions", () => {
  it("asks an advance for a factor rate and a loan for a percent", () => {
    expect(answersMissing(draftFromLine(line()))).toEqual(["factorRate", "originalAmount"]);
    expect(answersMissing(draftFromLine(line({ debt_type: "term_loan", advance: false })))).toEqual(["rate", "originalAmount"]);
  });

  it("follows the type when the person changes it", () => {
    const draft = { ...draftFromLine(line()), debtType: "term_loan" };
    expect(answersMissing(draft)).toEqual(["rate", "originalAmount"]);
  });

  it("counts nothing missing once the three are answered, and a typed 0 is an answer", () => {
    const draft = { ...draftFromLine(line({ debt_type: "term_loan", advance: false })), rate: "0", originalAmount: "50,000", balance: "40000" };
    expect(answersMissing(draft)).toEqual([]);
  });
});

describe("what is sent", () => {
  it("sends a percent for a loan and never a factor", () => {
    const draft = { ...draftFromLine(line({ debt_type: "term_loan", advance: false })), rate: "7.25%", factorRate: "1.35" };
    const write = writeFromDraft(draft);
    expect(write.rate).toBe(7.25);
    expect("factor_rate" in write).toBe(false);
  });

  it("sends a factor for an advance and never a percent, so a stored rate is not erased", () => {
    const write = writeFromDraft({ ...draftFromLine(line()), factorRate: "1.35", rate: "35" });
    expect(write.factor_rate).toBe(1.35);
    expect("rate" in write).toBe(false);
  });

  it("sends the payment as typed with its cadence and leaves the month to the server", () => {
    const write = writeFromDraft(draftFromLine(line()));
    expect([write.payment_amount, write.payment_frequency]).toEqual([359.62, "daily"]);
    expect("monthly_payment" in write).toBe(false);
  });

  it("sends a removed line with its reason and its figures", () => {
    const write = writeFromDraft({ ...draftFromLine(line()), keep: false, reason: "not_a_loan" });
    expect([write.keep, write.remove_reason, write.balance]).toEqual([false, "not_a_loan", 13665.71]);
  });

  it("sends the key, the row and the file so the server can match it", () => {
    const write = writeFromDraft({ ...draftFromLine(line({ row_id: "row-1" })) });
    expect([write.key, write.row_id, write.file_id, write.lender, write.debt_type]).toEqual(["alpha-funding", "row-1", "file-1", "Alpha Funding", "mca"]);
  });
});

describe("what blocks a save", () => {
  it("blocks bad numbers and an unbounded factor but never blanks", () => {
    const base = draftFromLine(line({ balance: null, payment_amount: null, payment_frequency: null, monthly_payment: null }));
    expect(draftErrors(base)).toEqual({});
    expect(draftErrors({ ...base, balance: "lots" }).balance).toMatch(/number/);
    expect(draftErrors({ ...base, originalAmount: "-5" }).originalAmount).toBeTruthy();
    expect(draftErrors({ ...base, factorRate: "35" }).factorRate).toMatch(/between 1 and 5/);
    const loan = { ...base, debtType: "term_loan" };
    expect(draftErrors({ ...loan, rate: "1000" }).rate).toBeTruthy();
    expect(draftErrors({ ...loan, rate: "abc" }).rate).toBeTruthy();
    expect(draftErrors({ ...loan, lender: "  " }).lender).toBeTruthy();
  });

  it("does not check a line that is being taken off", () => {
    expect(draftErrors({ ...draftFromLine(line()), keep: false, balance: "lots", lender: "" })).toEqual({});
  });
});

describe("the summary and what gets saved", () => {
  it("counts the lines read, kept, taken off and the answers still missing", () => {
    const drafts = [
      draftFromLine(line()),
      { ...draftFromLine(line({ key: "b", lender: "Bravo" })), keep: false },
      draftFromLine(line({ key: "c", lender: "Charlie", original_amount: 1, factor_rate: 1.3 })),
    ];
    expect(summarize(drafts)).toMatchObject({ read: 3, keeping: 2, removing: 1, missing: 2, invalid: 0, changed: true });
  });

  it("does not count history as being taken off now", () => {
    const history = draftFromLine(line({ key: "old", state: "removed", removed_reason: "duplicate" }), true);
    expect(summarize([history])).toMatchObject({ removing: 0, keeping: 0, changed: false });
  });

  it("saves only the lines from the file and the lines that changed", () => {
    const settled = draftFromLine(line({ key: "s", state: "on_schedule", row_id: "r1", original_amount: 5, factor_rate: 1.2 }));
    const edited = { ...draftFromLine(line({ key: "e", state: "on_schedule", row_id: "r2" })), balance: "1" };
    const fresh = draftFromLine(line({ key: "f" }));
    const history = draftFromLine(line({ key: "h", state: "removed", row_id: "r3" }), true);
    expect(isChanged(settled)).toBe(false);
    expect(reviewBody([settled, edited, fresh, history]).lines.map((l) => l.key)).toEqual(["e", "f"]);
  });

  it("puts a removed line back by keeping it, and then it is saved", () => {
    const history = draftFromLine(line({ key: "h", state: "removed", row_id: "r3" }), true);
    const back = { ...history, keep: true };
    expect(isHistory(back)).toBe(false);
    expect(reviewBody([back]).lines).toHaveLength(1);
  });
});

describe("the words", () => {
  it("prices a payment per business day by the month the cockpit uses", () => {
    expect(monthlyFrom(359.62, "daily")).toBe(7552.02);
    expect(monthlyFrom(1000, "weekly")).toBe(4330);
    expect(monthlyFrom(1000, "biweekly")).toBe(2170);
    expect(monthlyFrom(800, "monthly")).toBe(800);
    expect(monthlyFrom(800, "")).toBeNull();
    expect(monthlyFrom(null, "daily")).toBeNull();
  });

  it("says a payment as the person reads it", () => {
    expect(paymentSentence(draftFromLine(line()), money)).toBe("$359.62 per business day ≈ $7,552.02 a month");
    expect(paymentSentence({ ...draftFromLine(line()), paymentCadence: "" }, money)).toMatch(/how often/);
    expect(paymentSentence({ ...draftFromLine(line()), paymentCadence: "monthly" }, money)).toBe("");
    expect(paymentSentence({ ...draftFromLine(line()), paymentAmount: "" }, money)).toBe("");
  });

  it("flags the files own caveats about a line", () => {
    expect(looksUnconfirmed(["Not confirmed; confirm active obligation and payoff"])).toBe(true);
    expect(looksUnconfirmed(["Reported Sept 30; not a current payoff"])).toBe(false);
    expect(looksUnconfirmed([null, undefined])).toBe(false);
    expect(looksUnconfirmed([])).toBe(false);
  });

  it("keeps the files notes about the balance and the payment beside their boxes", () => {
    const draft = draftFromLine(line({ payment_note: "Observed Oct 29" }));
    expect([draft.balanceNote, draft.paymentNote]).toEqual(["Oct 22 letter; not a verified payoff", "Observed Oct 29"]);
  });

  it("says what was saved and what is still open", () => {
    expect(savedSentence({ kept: 4, added: 4, updated: 0, removed: 2, restored: 0 }, 11)).toBe("4 lines on the schedule, 2 taken off. 11 answers still missing.");
    expect(savedSentence({ kept: 1, added: 0, updated: 1, removed: 0, restored: 1 }, 1)).toBe("1 line on the schedule, 1 put back. 1 answer still missing.");
    expect(savedSentence({ kept: 0, added: 0, updated: 0, removed: 0, restored: 0 }, 0)).toBe("Nothing changed.");
  });
});
