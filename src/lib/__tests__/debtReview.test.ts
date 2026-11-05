import { describe, expect, it } from "vitest";

import {
  applyStored,
  canFile,
  canResetRow,
  cellMood,
  cellTitle,
  clearStored,
  displayToIso,
  draftErrors,
  draftFromLine,
  droppedPayment,
  editedFields,
  fileSaying,
  formatMoneyText,
  formatRateText,
  isChanged,
  isDirty,
  isHistory,
  isNewLine,
  isoToDisplay,
  loadStored,
  looksUnconfirmed,
  monthlyFrom,
  neededCells,
  neededFields,
  newLineDraft,
  nextNeeded,
  paymentSentence,
  rateHeader,
  readingSignature,
  resetRow,
  reviewBody,
  saveStored,
  savedSentence,
  scrollToClear,
  summarize,
  tidyCell,
  totals,
  unsavedPayment,
  visibleColumns,
  writeFromDraft,
  type DebtScheduleReview,
  type FileCell,
  type LineDraft,
  type ReviewLine,
  type StorageLike,
} from "@/lib/debtReview";

function cell(value: FileCell["value"], over: Partial<FileCell> = {}): FileCell {
  return { value, wording: null, note: null, derived: false, ...over };
}

/** The shape of the real upload: a payment per business day, no rate, no original amount. */
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
    originated_on: null,
    maturity_on: null,
    secured: null,
    collateral: null,
    mca_modified: null,
    mca_modification_note: null,
    notes: null,
    balance_note: "Oct 22 letter; not a verified payoff",
    payment_note: null,
    notes_from_file: [],
    from_file: {
      lender: cell("Alpha Funding"),
      debt_type: cell("mca"),
      balance: cell(13665.71, { note: "Oct 22 letter; not a verified payoff" }),
      payment_amount: cell(359.62),
      payment_frequency: cell("daily", { wording: "weekday" }),
      monthly_payment: cell(7552.02, { derived: true }),
      payment_status: cell("current"),
    },
    hint: null,
    missing: ["factor_rate", "original_amount", "mca_modified"],
    removed_reason: null,
    removed_by: null,
    removed_at: null,
    ...over,
  };
}

const usd = (value: number) => `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function loan(over: Partial<ReviewLine> = {}): ReviewLine {
  return line({ key: "bank", lender: "Bank of Main", debt_type: "term_loan", advance: false, from_file: null, ...over });
}

describe("draftFromLine", () => {
  it("places what the file gave in its box, tidied", () => {
    const draft = draftFromLine(line());
    expect([draft.lender, draft.debtType, draft.balance, draft.paymentAmount, draft.paymentCadence, draft.paymentStatus]).toEqual([
      "Alpha Funding", "mca", "13,665.71", "359.62", "daily", "current",
    ]);
    expect([draft.originalAmount, draft.rate, draft.factorRate, draft.mcaModified]).toEqual(["", "", "", ""]);
    expect(draft.keep).toBe(true);
  });

  it("keeps an amount whose cadence the file did not say and leaves how-often open", () => {
    const draft = draftFromLine(line({ payment_frequency: null, monthly_payment: null }));
    expect([draft.paymentAmount, draft.paymentCadence]).toEqual(["359.62", ""]);
    expect(neededFields(draft)).toContain("paymentCadence");
    expect(draftErrors(draft).paymentCadence).toBeUndefined(); // not a typing mistake: nothing blocks the save
    expect(unsavedPayment(draft)).toBe(true);
  });

  it("does not send an amount that has no how-often; the file still carries it", () => {
    const draft = draftFromLine(line({ payment_frequency: null, monthly_payment: null }));
    const write = writeFromDraft(draft);
    expect([write.payment_amount, write.payment_frequency]).toEqual([null, null]);
    expect(unsavedPayment({ ...draft, paymentCadence: "weekly" })).toBe(false);
    expect(unsavedPayment({ ...draft, paymentAmount: "" })).toBe(false);
    expect(unsavedPayment({ ...draft, keep: false })).toBe(false);
  });

  it("starts a row that only has a monthly figure as that month", () => {
    const draft = draftFromLine(line({ state: "on_schedule", payment_amount: null, payment_frequency: null, monthly_payment: 950 }));
    expect([draft.paymentAmount, draft.paymentCadence]).toEqual(["950", "monthly"]);
  });

  it("never turns an unknown figure into a nought", () => {
    const draft = draftFromLine(line({ balance: null, payment_amount: null, payment_frequency: null, monthly_payment: null }));
    expect([draft.originalAmount, draft.balance, draft.rate, draft.factorRate, draft.paymentAmount]).toEqual(["", "", "", "", ""]);
    const write = writeFromDraft(draft);
    expect([write.original_amount, write.balance, write.payment_amount, write.payment_frequency]).toEqual([null, null, null, null]);
  });

  it("starts a line from the removed group removed, with its reason", () => {
    const draft = draftFromLine(line({ state: "removed", removed_reason: "paid_off" }), true);
    expect([draft.keep, draft.reason, isHistory(draft)]).toEqual([false, "paid_off", true]);
  });

  it("carries the rest of the twelve-field row as the text in its box", () => {
    const draft = draftFromLine(loan({ originated_on: "2021-03-01", maturity_on: "2030-09-03", secured: "secured", collateral: "2025 RAM 1500", notes: "Called the lender" }));
    expect([draft.originatedOn, draft.maturityOn, draft.secured, draft.collateral, draft.note]).toEqual(["03/01/2021", "09/03/2030", "secured", "2025 RAM 1500", "Called the lender"]);
    const advance = draftFromLine(line({ mca_modified: true, mca_modification_note: "Cut in May" }));
    expect([advance.mcaModified, advance.mcaNote]).toEqual(["yes", "Cut in May"]);
    expect(draftFromLine(line({ mca_modified: false })).mcaModified).toBe("no");
  });

  it("keeps what the file said, in its own words, with its caveat", () => {
    const said = draftFromLine(line()).file!;
    expect(said.values.paymentCadence).toBe("daily");
    expect(said.wording.paymentCadence).toBe("weekday");
    expect(said.notes.balance).toBe("Oct 22 letter; not a verified payoff");
    expect(said.monthly).toBe(7552.02);
    expect(said.monthlyDerived).toBe(true);
    expect(said.values.originalAmount).toBeUndefined();
    expect(draftFromLine(loan()).file).toBeNull();
  });

  it("reads a file that gave only a month as that amount per month", () => {
    const draft = draftFromLine(
      loan({ from_file: { payment_frequency: cell("monthly"), monthly_payment: cell(800, { wording: "$800" }) } }),
    );
    expect([draft.file!.values.paymentAmount, draft.file!.values.paymentCadence, draft.file!.wording.paymentAmount]).toEqual(["800", "monthly", "$800"]);
  });
});

describe("what is needed", () => {
  it("asks the schedule form's own required answers: an advance needs a factor and whether it was modified", () => {
    expect(neededFields(draftFromLine(line()))).toEqual(["originalAmount", "factorRate", "mcaModified"]);
  });

  it("asks a loan for a percent and not a factor", () => {
    expect(neededFields(draftFromLine(loan({ balance: 1000, payment_amount: null, monthly_payment: 500, payment_frequency: null, payment_status: null })))).toEqual(["originalAmount", "rate", "paymentStatus"]);
  });

  it("asks for whichever half of the payment is missing", () => {
    const base = draftFromLine(loan({ original_amount: 1, rate: 1, balance: 1, payment_status: "current" }));
    expect(neededFields({ ...base, paymentAmount: "", paymentCadence: "" })).toEqual(["paymentAmount", "paymentCadence"]);
    expect(neededFields({ ...base, paymentAmount: "100", paymentCadence: "" })).toEqual(["paymentCadence"]);
    expect(neededFields({ ...base, paymentAmount: "", paymentCadence: "weekly" })).toEqual(["paymentAmount"]);
    expect(neededFields({ ...base, paymentAmount: "100", paymentCadence: "weekly" })).toEqual([]);
  });

  it("counts an answered advance as nothing needed, and a typed 0 as an answer", () => {
    const draft = { ...draftFromLine(line()), factorRate: "1.35", originalAmount: "30,000", mcaModified: "no" };
    expect(neededFields(draft)).toEqual([]);
    const free = { ...draftFromLine(loan({ original_amount: 5, balance: 5, monthly_payment: 5, payment_frequency: null, payment_amount: null, payment_status: "current" })), rate: "0" };
    expect(neededFields(free)).toEqual([]);
  });

  it("asks for the type when nobody stated one and not at all of a line being taken off", () => {
    expect(neededFields(draftFromLine(line({ debt_type: "" })))).toContain("debtType");
    expect(neededFields({ ...draftFromLine(line()), keep: false })).toEqual([]);
  });

  it("follows the type when the person changes it", () => {
    const draft = { ...draftFromLine(line()), debtType: "term_loan" };
    expect(neededFields(draft)).toEqual(["originalAmount", "rate"]);
  });
});

describe("what blocks a save", () => {
  it("blocks bad numbers, an unbounded factor and bad dates but never blanks", () => {
    const base = draftFromLine(line({ balance: null, payment_amount: null, payment_frequency: null, monthly_payment: null }));
    expect(draftErrors(base)).toEqual({});
    expect(draftErrors({ ...base, balance: "lots" }).balance).toMatch(/number/);
    expect(draftErrors({ ...base, originalAmount: "-5" }).originalAmount).toBeTruthy();
    expect(draftErrors({ ...base, factorRate: "35" }).factorRate).toMatch(/between 1 and 5/);
    const loanDraft = { ...base, debtType: "term_loan" };
    expect(draftErrors({ ...loanDraft, rate: "1000" }).rate).toBeTruthy();
    expect(draftErrors({ ...loanDraft, rate: "abc" }).rate).toBeTruthy();
    expect(draftErrors({ ...loanDraft, lender: "  " }).lender).toBeTruthy();
    expect(draftErrors({ ...loanDraft, maturityOn: "13/45/2030" }).maturityOn).toMatch(/date/);
    expect(draftErrors({ ...loanDraft, collateral: "x".repeat(501) }).collateral).toMatch(/500/);
  });

  it("does not check a line that is being taken off", () => {
    expect(draftErrors({ ...draftFromLine(line()), keep: false, balance: "lots", lender: "" })).toEqual({});
  });
});

describe("edited, filled and reset", () => {
  it("marks a cell the person changed from what the file said, and not one they filled in", () => {
    const base = draftFromLine(line());
    expect(editedFields(base).size).toBe(0);
    const changed = { ...base, balance: "9,000", originalAmount: "30000", paymentCadence: "weekly" };
    expect([...editedFields(changed)].sort()).toEqual(["balance", "paymentCadence"]); // the original amount was never in the file
  });

  it("compares figures as numbers and words without case", () => {
    const base = draftFromLine(line());
    expect(editedFields({ ...base, balance: "13665.710" }).size).toBe(0);
    expect(editedFields({ ...base, debtType: "MCA" }).size).toBe(0);
  });

  it("puts the row back to what the file said, and blanks what the file never gave", () => {
    const base = draftFromLine(line());
    const worked = { ...base, balance: "1", factorRate: "1.3", originalAmount: "5", keep: false };
    expect(canResetRow(worked)).toBe(true);
    const back = resetRow(worked);
    expect([back.balance, back.factorRate, back.originalAmount, back.paymentCadence, back.keep]).toEqual(["13,665.71", "", "", "daily", true]);
    expect(canResetRow(back)).toBe(false);
    expect(canResetRow(draftFromLine(loan()))).toBe(false); // a row the file never named has nothing to go back to
    expect(resetRow(draftFromLine(loan()))).toEqual(draftFromLine(loan()));
  });

  it("gives each cell a mood", () => {
    const draft = { ...draftFromLine(line()), balance: "9,000", originalAmount: "30000" };
    const needed = neededFields(draft);
    const edited = editedFields(draft);
    const errors = draftErrors(draft);
    expect(cellMood(draft, "balance", edited, needed, errors)).toBe("edited");
    expect(cellMood(draft, "originalAmount", edited, needed, errors)).toBe("filled");
    expect(cellMood(draft, "factorRate", edited, needed, errors)).toBe("needed");
    expect(cellMood(draft, "paymentCadence", edited, needed, errors)).toBe("file");
    expect(cellMood(draft, "note", edited, needed, errors)).toBe("empty");
    expect(cellMood({ ...draft, balance: "lots" }, "balance", edited, needed, draftErrors({ ...draft, balance: "lots" }))).toBe("invalid");
  });

  it("explains a cell in the file's own words", () => {
    const draft = draftFromLine(line());
    expect(fileSaying(draft, "paymentCadence")).toBe("The file said “weekday” (read as business day).");
    expect(fileSaying(draft, "balance")).toBe("The file said $13,665.71. Its note: Oct 22 letter; not a verified payoff");
    expect(fileSaying(draft, "originalAmount")).toBeNull();
    expect(fileSaying(draftFromLine(loan()), "balance")).toBeNull();
    const unclear = draftFromLine(line({ payment_frequency: null, from_file: { payment_frequency: cell(null, { wording: "recurring" }), balance: cell(null, { note: "Not confirmed" }) } }));
    expect(fileSaying(unclear, "paymentCadence")).toBe("The file said “recurring”, which does not give a usable figure.");
    expect(fileSaying(unclear, "balance")).toBe("The file did not give this. Its note: Not confirmed");
  });

  it("titles a cell for hover by its mood", () => {
    const draft = draftFromLine(line());
    const errors = {};
    expect(cellTitle(draft, "factorRate", "needed", errors)).toBe("Needed. The file did not give this: type it in.");
    const unsaid = draftFromLine(line({ payment_frequency: null, monthly_payment: null, from_file: { payment_amount: cell(359.62), payment_frequency: cell(null, { wording: "recurring" }) } }));
    expect(cellTitle(unsaid, "paymentCadence", "needed", errors)).toMatch(/^Needed\. Say how often Alpha Funding is paid\. Until then the payment is not saved; the file still has it\. The file said “recurring”/);
    expect(cellTitle(draft, "lender", "file", errors)).toBe(""); // as the file gave it, with nothing more to say
    expect(cellTitle(draft, "paymentCadence", "file", errors)).toMatch(/weekday/); // its own words are worth a hover
    expect(cellTitle(draft, "paymentCadence", "edited", errors)).toMatch(/^Edited\. The file said “weekday”/);
    expect(cellTitle(draft, "originalAmount", "filled", errors)).toMatch(/Filled in by you/);
    expect(cellTitle(draft, "balance", "invalid", { balance: "Enter a number." })).toBe("Enter a number.");
  });
});

describe("tidying a cell when the person leaves it", () => {
  it("formats money, rates and dates and leaves a mistake as typed", () => {
    expect(tidyCell("balance", "13665.7")).toBe("13,665.70");
    expect(tidyCell("originalAmount", "$50000")).toBe("50,000");
    expect(tidyCell("paymentAmount", "359.62")).toBe("359.62");
    expect(tidyCell("rate", "7.250")).toBe("7.25");
    expect(tidyCell("factorRate", "1.350")).toBe("1.35");
    expect(tidyCell("maturityOn", "3/1/2030")).toBe("03/01/2030");
    expect(tidyCell("balance", "TBD")).toBe("TBD");
    expect(tidyCell("maturityOn", "soon")).toBe("soon");
    expect(tidyCell("lender", " Acme ")).toBe(" Acme ");
    expect([formatMoneyText("1200.5"), formatRateText("0")]).toEqual(["1,200.50", "0"]);
  });

  it("reads and writes dates both ways and refuses impossible ones", () => {
    expect([displayToIso("03/01/2021"), displayToIso("3-1-2021"), displayToIso("2021-3-1")]).toEqual(["2021-03-01", "2021-03-01", "2021-03-01"]);
    expect([displayToIso("02/30/2021"), displayToIso("13/01/2021"), displayToIso("3/1/21"), displayToIso("")]).toEqual([null, null, null, null]);
    expect([isoToDisplay("2021-03-01"), isoToDisplay(null), isoToDisplay("nonsense")]).toEqual(["03/01/2021", "", ""]);
  });
});

describe("what is sent", () => {
  it("sends a percent for a loan and never a factor", () => {
    const write = writeFromDraft({ ...draftFromLine(loan()), rate: "7.25%", factorRate: "1.35" });
    expect(write.rate).toBe(7.25);
    expect("factor_rate" in write).toBe(false);
    expect("mca_modified" in write).toBe(false);
  });

  it("sends a factor and the advance answers for an advance, and never a percent", () => {
    const write = writeFromDraft({ ...draftFromLine(line()), factorRate: "1.35", rate: "35", mcaModified: "yes", mcaNote: " Cut in May " });
    expect([write.factor_rate, write.mca_modified, write.mca_modification_note]).toEqual([1.35, true, "Cut in May"]);
    expect("rate" in write).toBe(false);
    const no = writeFromDraft({ ...draftFromLine(line()), mcaModified: "no", mcaNote: "stale text" });
    expect([no.mca_modified, no.mca_modification_note]).toEqual([false, null]);
    expect(writeFromDraft(draftFromLine(line())).mca_modified).toBeNull();
  });

  it("sends the payment as typed with its cadence and leaves the month to the server", () => {
    const write = writeFromDraft(draftFromLine(line()));
    expect([write.payment_amount, write.payment_frequency]).toEqual([359.62, "daily"]);
    expect("monthly_payment" in write).toBe(false);
  });

  it("sends dates as ISO, text trimmed, and blanks as null", () => {
    const write = writeFromDraft({ ...draftFromLine(loan()), originatedOn: "3/1/2021", collateral: " Truck ", note: "", secured: "unsecured" });
    expect([write.originated_on, write.maturity_on, write.collateral, write.notes, write.secured]).toEqual(["2021-03-01", null, "Truck", null, "unsecured"]);
  });

  it("sends a removed line with its reason and its figures", () => {
    const write = writeFromDraft({ ...draftFromLine(line()), keep: false, reason: "not_a_loan" });
    expect([write.keep, write.remove_reason, write.balance]).toEqual([false, "not_a_loan", 13665.71]);
  });

  it("sends the key, the row and the file so the server can match it", () => {
    const write = writeFromDraft(draftFromLine(line({ row_id: "row-1" })));
    expect([write.key, write.row_id, write.file_id, write.lender, write.debt_type]).toEqual(["alpha-funding", "row-1", "file-1", "Alpha Funding", "mca"]);
  });

  it("saves only the lines from the file and the lines that changed", () => {
    const settled = draftFromLine(loan({ key: "s", state: "on_schedule", row_id: "r1", original_amount: 5, rate: 5 }));
    const edited = { ...draftFromLine(loan({ key: "e", state: "on_schedule", row_id: "r2" })), balance: "1" };
    const fresh = draftFromLine(line({ key: "f" }));
    const history = draftFromLine(line({ key: "h", state: "removed", row_id: "r3" }), true);
    expect(isChanged(settled)).toBe(false);
    expect(reviewBody([settled, edited, fresh, history]).lines.map((l) => l.key)).toEqual(["e", "f"]);
  });

  it("does not call a tidied number a change", () => {
    const settled = draftFromLine(loan({ state: "on_schedule", row_id: "r", balance: 13665.7 }));
    expect(isChanged({ ...settled, balance: "13,665.70" })).toBe(false);
    expect(isChanged({ ...settled, balance: "13,665.71" })).toBe(true);
  });

  it("puts a removed line back by keeping it, and then it is saved", () => {
    const history = draftFromLine(line({ key: "h", state: "removed", row_id: "r3" }), true);
    const back = { ...history, keep: true };
    expect(isHistory(back)).toBe(false);
    expect(reviewBody([back]).lines).toHaveLength(1);
  });
});

describe("the totals and the next cell", () => {
  const drafts = (): LineDraft[] => [
    draftFromLine(line()),
    draftFromLine(line({ key: "two", lender: "Credibly", balance: 37388.38, payment_amount: 1133.18, payment_frequency: null, monthly_payment: null })),
    draftFromLine(line({ key: "card", lender: "Card", debt_type: "credit_card", advance: false, balance: 500, payment_amount: null, payment_frequency: null, monthly_payment: 100 })),
    { ...draftFromLine(line({ key: "gone", lender: "Gone", balance: 99999 })), keep: false },
  ];

  it("totals the kept lines: month, balance, original, and what is still needed", () => {
    const sum = totals(drafts());
    expect(sum.rows).toBe(3);
    expect(sum.balance).toBe(13665.71 + 37388.38 + 500);
    expect(sum.monthly).toBe(7552.02); // the card is not debt service by default, Credibly has no month yet
    expect(sum.withoutMonthly).toBe(1);
    expect(sum.original).toBeNull(); // nobody gave one: a dash, never a 0
    expect(sum.needed).toBeGreaterThan(5);
  });

  it("totals nothing as nothing and a typed 0 as a figure", () => {
    const none = totals([draftFromLine(line({ balance: null, payment_amount: null, payment_frequency: null, monthly_payment: null }))]);
    expect([none.balance, none.monthly, none.original]).toEqual([null, null, null]);
    const zero = totals([{ ...draftFromLine(line()), balance: "0", originalAmount: "0" }]);
    expect([zero.balance, zero.original]).toEqual([0, 0]);
  });

  it("walks the needed cells in reading order, in the columns on screen, and wraps", () => {
    const visible = ["lender", "debtType", "originalAmount", "balance", "rate", "paymentAmount", "paymentCadence", "monthly", "paymentStatus", "mcaModified"] as const;
    const cells = neededCells(drafts().slice(0, 1), visible);
    expect(cells).toEqual([
      { row: "alpha-funding", col: "originalAmount" },
      { row: "alpha-funding", col: "rate" },
      { row: "alpha-funding", col: "mcaModified" },
    ]);
    expect(nextNeeded(cells)).toEqual(cells[0]);
    expect(nextNeeded(cells, cells[0])).toEqual(cells[1]);
    expect(nextNeeded(cells, cells[2])).toEqual(cells[0]);
    expect(nextNeeded([], null)).toBeNull();
    expect(neededCells(drafts().slice(0, 1), ["lender"])).toEqual([]);
  });
});

describe("filing the schedule on the checklist", () => {
  const complete = () => draftFromLine(loan({ original_amount: 50000, balance: 40000, rate: 7.25, monthly_payment: 800, payment_amount: null, payment_frequency: null, payment_status: "current" }));

  it("is offered once every answer is in and something stays, and not before", () => {
    expect(canFile(summarize([complete()]))).toBe(true);
    expect(canFile(summarize([draftFromLine(line())]))).toBe(false); // answers still missing
    expect(canFile(summarize([]))).toBe(false); // nothing stays
    expect(canFile(summarize([{ ...complete(), keep: false }]))).toBe(false);
    expect(canFile(summarize([{ ...complete(), balance: "lots" }]))).toBe(false); // something invalid
    expect(canFile(summarize([{ ...complete(), paymentAmount: "800", paymentCadence: "" }]))).toBe(false); // a payment waits for how often
  });

  it("rides along on the save only when asked", () => {
    expect(reviewBody([complete()]).file_as_schedule).toBe(false);
    expect(reviewBody([complete()], true).file_as_schedule).toBe(true);
  });
});

describe("a line the desk adds by hand", () => {
  it("starts blank, not on the schedule, and says who added it", () => {
    const draft = newLineDraft(3);
    expect([draft.key, draft.state, draft.keep, draft.lender, draft.originLabel, draft.file, draft.fileId, draft.rowId]).toEqual(["new:3", "read", true, "", "Added by you", null, null, null]);
    expect(isNewLine(draft)).toBe(true);
    expect(isNewLine(draftFromLine(line()))).toBe(false);
  });

  it("needs a lender before it can be saved, and nothing else", () => {
    const blank = newLineDraft(1);
    expect(draftErrors(blank).lender).toBeTruthy();
    expect(neededFields(blank)).toEqual([]); // a line with nothing on it is not an obligation yet
    const named = { ...blank, lender: "Local Bank" };
    expect(draftErrors(named)).toEqual({});
    expect(neededFields(named)).toEqual(expect.arrayContaining(["debtType", "originalAmount", "balance", "rate", "paymentAmount", "paymentCadence", "paymentStatus"]));
    expect(isChanged(named)).toBe(true); // always saved
    expect(writeFromDraft(named)).toMatchObject({ key: "new:1", row_id: null, file_id: null, keep: true, lender: "Local Bank" });
  });

  it("comes back with the draft the person left on this browser", () => {
    const fresh = [draftFromLine(line())];
    const worked = [...fresh, { ...newLineDraft(2), lender: "Local Bank", balance: "5,000" }];
    expect(isDirty(worked, fresh)).toBe(true);
    const storage: Record<string, string> = {};
    const memory: StorageLike = { getItem: (k) => storage[k] ?? null, setItem: (k, v) => { storage[k] = v; }, removeItem: (k) => { delete storage[k]; } };
    saveStored(memory, "p1", "reading", worked);
    const restored = applyStored(fresh, loadStored(memory, "p1", "reading")!);
    expect(restored).toHaveLength(2);
    expect(restored[1]).toMatchObject({ key: "new:2", lender: "Local Bank", balance: "5,000", state: "read", keep: true });
  });
});

describe("the columns on screen", () => {
  it("shows the advance question when a kept line is an advance, and the details only on request", () => {
    const advance = [draftFromLine(line())];
    expect(visibleColumns(advance, false)).toContain("mcaModified");
    expect(visibleColumns(advance, false)).not.toContain("collateral");
    expect(visibleColumns(advance, true)).toContain("collateral");
    const loans = [draftFromLine(loan())];
    expect(visibleColumns(loans, false)).not.toContain("mcaModified");
    expect(visibleColumns(loans, true)).toContain("mcaModified");
    expect(visibleColumns([{ ...draftFromLine(line()), keep: false }], false)).not.toContain("mcaModified");
    // The three questions come straight after the Lender, so they are on screen beside a narrow panel.
    expect(visibleColumns(loans, false).slice(0, 4)).toEqual(["lender", "originalAmount", "balance", "rate"]);
    const order = visibleColumns(advance, false);
    expect(order.indexOf("rate")).toBeLessThan(order.indexOf("paymentAmount"));
    expect(order.indexOf("monthly")).toBeLessThan(order.indexOf("debtType")); // the type, which the file gives, waits behind the payment
    expect(visibleColumns(loans, false).at(-1)).toBe("fromFile");
  });

  it("asks the rate column for what the lines that stay are asked", () => {
    const advance = draftFromLine(line());
    const loanLine = draftFromLine(loan());
    expect(rateHeader([advance])).toBe("Factor rate");
    expect(rateHeader([loanLine])).toBe("Interest rate (%)");
    expect(rateHeader([advance, loanLine])).toBe("Interest rate (%) or factor");
    expect(rateHeader([{ ...advance, keep: false }, loanLine])).toBe("Interest rate (%)"); // a line taken off is not asked
    expect(rateHeader([])).toBe("Interest rate (%)");
  });
});

describe("scrolling a cell clear of the sticky parts", () => {
  const band = { left: 220, right: 600, top: 50, bottom: 400 };
  const box = (left: number, right: number, top = 100, bottom = 140) => ({ left, right, top, bottom });

  it("does nothing for a cell that is inside the band", () => {
    expect(scrollToClear(box(300, 420), band)).toEqual({ dx: 0, dy: 0 });
  });

  it("moves left for a cell under the Lender column and right for one under the actions", () => {
    expect(scrollToClear(box(150, 270), band).dx).toBe(150 - (220 + 6));
    expect(scrollToClear(box(520, 660), band).dx).toBe(660 - (600 - 6));
  });

  it("moves up for a row under the header and down for one under the totals", () => {
    expect(scrollToClear(box(300, 420, 20, 60), band).dy).toBe(20 - (50 + 6));
    expect(scrollToClear(box(300, 420, 380, 440), band).dy).toBe(440 - (400 - 6));
  });

  it("lines up the start of a cell wider than the band", () => {
    expect(scrollToClear(box(100, 900), band).dx).toBe(100 - (220 + 6));
  });
});

describe("the summary", () => {
  it("counts the lines read, kept, taken off and every required answer still missing", () => {
    const rows = [
      draftFromLine(line()),
      { ...draftFromLine(line({ key: "b", lender: "Bravo" })), keep: false },
      draftFromLine(line({ key: "c", lender: "Charlie", original_amount: 1, factor_rate: 1.3, mca_modified: false })),
    ];
    expect(summarize(rows)).toMatchObject({ read: 3, keeping: 2, removing: 1, missing: 3, invalid: 0, unsavedPayments: 0, changed: true });
    const unsaid = [draftFromLine(line({ payment_frequency: null, monthly_payment: null })), draftFromLine(line({ key: "x" }))];
    expect(summarize(unsaid).unsavedPayments).toBe(1);
  });

  it("warns about a payment only when saving would drop one the person typed", () => {
    // The file gave 359.62 with no how-often: it waits, and the file still has it, so nothing is at risk.
    const fromFile = draftFromLine(line({ payment_frequency: null, monthly_payment: null }));
    expect(unsavedPayment(fromFile)).toBe(true);
    expect(droppedPayment(fromFile)).toBe(false);
    expect(summarize([fromFile])).toMatchObject({ unsavedPayments: 1, droppedPayments: 0 });
    // The person changed the amount (or typed one the file did not give): saving would leave it out.
    const typedOver = { ...fromFile, paymentAmount: "400" };
    expect(droppedPayment(typedOver)).toBe(true);
    const typedNew = { ...newLineDraft(1), lender: "Local Bank", paymentAmount: "250" };
    expect(summarize([typedNew])).toMatchObject({ unsavedPayments: 1, droppedPayments: 1 });
    // Once it says how often, nothing waits; a line taken off is never counted.
    expect(droppedPayment({ ...typedOver, paymentCadence: "weekly" })).toBe(false);
    expect(droppedPayment({ ...typedOver, keep: false })).toBe(false);
  });

  it("does not count history as being taken off now", () => {
    const history = draftFromLine(line({ key: "old", state: "removed", removed_reason: "duplicate" }), true);
    expect(summarize([history])).toMatchObject({ removing: 0, keeping: 0, changed: false });
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
    expect(paymentSentence(draftFromLine(line()), usd)).toBe("$359.62 per business day ≈ $7,552.02 a month");
    expect(paymentSentence({ ...draftFromLine(line()), paymentCadence: "" }, usd)).toMatch(/how often/);
    expect(paymentSentence({ ...draftFromLine(line()), paymentCadence: "monthly" }, usd)).toBe("");
    expect(paymentSentence({ ...draftFromLine(line()), paymentAmount: "" }, usd)).toBe("");
  });

  it("flags the file's own caveats about a line", () => {
    expect(looksUnconfirmed(["Not confirmed; confirm active obligation and payoff"])).toBe(true);
    expect(looksUnconfirmed(["Oct 22 letter; not a verified payoff"])).toBe(true);
    expect(looksUnconfirmed(["Reported Sept 30; not a current payoff"])).toBe(false);
    expect(looksUnconfirmed([null, undefined])).toBe(false);
    expect(looksUnconfirmed([])).toBe(false);
  });

  it("says when the save also filed the schedule on the checklist", () => {
    expect(savedSentence({ kept: 7, added: 7, updated: 0, removed: 2, restored: 0 }, 0, true)).toBe("7 lines on the schedule, 2 taken off, filed as the debt schedule.");
    expect(savedSentence({ kept: 1, added: 1, updated: 0, removed: 0, restored: 0 }, 0, false)).toBe("1 line on the schedule.");
  });

  it("says what was saved and what is still open", () => {
    expect(savedSentence({ kept: 4, added: 4, updated: 0, removed: 2, restored: 0 }, 11)).toBe("4 lines on the schedule, 2 taken off. 11 answers still missing.");
    expect(savedSentence({ kept: 1, added: 0, updated: 1, removed: 0, restored: 1 }, 1)).toBe("1 line on the schedule, 1 put back. 1 answer still missing.");
    expect(savedSentence({ kept: 0, added: 0, updated: 0, removed: 0, restored: 0 }, 0)).toBe("Nothing changed.");
  });
});

describe("the draft that survives the drawer closing", () => {
  function review(over: Partial<DebtScheduleReview> = {}): DebtScheduleReview {
    return { profile_id: "p1", sources: [{ file_id: "file-1" } as never], lines: [line(), line({ key: "credibly", lender: "Credibly" })], removed: [], counts: {}, filed: false, ...over };
  }

  function memory(): StorageLike & { data: Record<string, string> } {
    const data: Record<string, string> = {};
    return {
      data,
      getItem: (key) => data[key] ?? null,
      setItem: (key, value) => { data[key] = value; },
      removeItem: (key) => { delete data[key]; },
    };
  }

  it("fingerprints a reading, and a different reading has a different fingerprint", () => {
    expect(readingSignature(review())).toBe(readingSignature(review()));
    expect(readingSignature(review())).not.toBe(readingSignature(review({ lines: [line()] })));
    expect(readingSignature(review())).not.toBe(readingSignature(review({ sources: [{ file_id: "file-2" } as never] })));
  });

  it("keeps the person's cells and puts them back over the same reading", () => {
    const storage = memory();
    const key = readingSignature(review());
    const fresh = review().lines.map((l) => draftFromLine(l));
    const worked = fresh.map((d) => (d.key === "credibly" ? { ...d, originalAmount: "30,000", keep: true } : { ...d, keep: false, reason: "paid_off" as const }));
    expect(isDirty(worked, fresh)).toBe(true);
    expect(isDirty(fresh, fresh)).toBe(false);
    saveStored(storage, "p1", key, worked, new Date("2026-11-05T15:00:00Z"));
    const saved = loadStored(storage, "p1", key)!;
    expect(saved.at).toBe("2026-11-05T15:00:00.000Z");
    const restored = applyStored(fresh, saved);
    expect(restored.find((d) => d.key === "credibly")!.originalAmount).toBe("30,000");
    expect(restored.find((d) => d.key === "alpha-funding")).toMatchObject({ keep: false, reason: "paid_off" });
    // What the server said stays the server's.
    expect(restored[0].baseline).toBe(fresh[0].baseline);
    expect(restored[0].file).toEqual(fresh[0].file);
  });

  it("drops a stored draft made over a different reading", () => {
    const storage = memory();
    const fresh = review().lines.map((l) => draftFromLine(l));
    saveStored(storage, "p1", "old-reading", fresh);
    expect(loadStored(storage, "p1", readingSignature(review()))).toBeNull();
    expect(Object.keys(storage.data)).toHaveLength(0);
  });

  it("clears on save and never throws when storage is missing or broken", () => {
    const storage = memory();
    const fresh = review().lines.map((l) => draftFromLine(l));
    saveStored(storage, "p1", "k", fresh);
    clearStored(storage, "p1");
    expect(loadStored(storage, "p1", "k")).toBeNull();
    expect(() => saveStored(null, "p1", "k", fresh)).not.toThrow();
    expect(loadStored(null, "p1", "k")).toBeNull();
    const broken: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("full"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => saveStored(broken, "p1", "k", fresh)).not.toThrow();
    expect(loadStored(broken, "p1", "k")).toBeNull();
    expect(() => clearStored(broken, "p1")).not.toThrow();
    const garbage = memory();
    garbage.setItem("qc:debt-review:p1", "{not json");
    expect(loadStored(garbage, "p1", "k")).toBeNull();
  });
});
