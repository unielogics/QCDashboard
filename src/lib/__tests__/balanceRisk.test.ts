import { describe, expect, it } from "vitest";
import { balanceRiskMonths, feeEvent, nextRiskDay, riskCountLabel, riskDayLabel, riskEventPage, riskMonthDays, riskMonthSignal, riskTotals, riskTrend, validRiskDate, type BalanceRiskInput, type BalanceRiskSource } from "../balanceRisk";

const month = (overrides: Partial<BalanceRiskInput> = {}): BalanceRiskInput => ({ month: "2026-10", label: "October 2026", accounts: ["Checking 1234"], file_ids: ["statement-a"], accepted: true, deposits: null, withdrawals: null, beginning_balance: null, ending_balance: null, average_balance: null, low_balance: null, deposit_count: null, nsf: null, returned_checks: null, negative_days: null, net: null, outflow_ratio: null, negative_dates: [], overdraft_items: [], fees: null, ...overrides });
const source = (overrides: Partial<BalanceRiskSource> = {}): BalanceRiskSource => ({ file_id: "statement-a", file_name: "Checking October.pdf", account: "Checking 1234", negative_dates: [], negative_days: null, nsf: null, returned_checks: null, low_balance: null, ...overrides });

describe("balance-risk evidence", () => {
  it("builds real leap-year calendar dates without timezone shifts", () => {
    expect(riskMonthDays("2024-02")).toEqual({ days: 29, offset: 3 });
    expect(riskMonthDays("2026-13")).toBeNull();
    expect(validRiskDate("2026-02-30")).toBeNull();
    expect(validRiskDate("2024-02-29")).toBe("2024-02-29");
    expect(balanceRiskMonths([month({ month: "2024-02" })])[0].days.at(-1)?.date).toBe("2024-02-29");
  });
  it("keeps missing counts unknown and preserves explicitly reported zero", () => {
    const unknown = balanceRiskMonths([month()]);
    expect(riskTotals(unknown).negative.value).toBeNull();
    expect(riskCountLabel(riskTotals(unknown).negative)).toBe("Not reported");
    expect(riskMonthSignal(unknown[0]).tone).toBe("mut");
    const zero = balanceRiskMonths([month({ negative_days: 0, nsf: 0, returned_checks: 0 })]);
    expect(riskCountLabel(riskTotals(zero).negative)).toBe("0");
    expect(riskMonthSignal(zero[0]).label).toBe("No negative days reported");
  });
  it("does not let a partial aggregate zero claim that every account is clear", () => {
    const models = balanceRiskMonths([month({ accounts: ["Checking 1234", "Savings 5678"], negative_days: 0, risk_sources: [source({ negative_days: 0 }), source({ file_id: "statement-b", account: "Savings 5678" })] })]);
    expect(riskTotals(models).negative.complete).toBe(false);
    expect(riskCountLabel(riskTotals(models).negative)).toBe("0 reported");
    expect(riskMonthSignal(models[0]).label).toBe("Daily evidence incomplete");
  });
  it("treats unknown source counts as partial, rather than contradicting known dated evidence", () => {
    const model = balanceRiskMonths([month({ accounts: ["A", "B"], negative_days: 0, risk_sources: [source({ account: "A", negative_days: 0 }), source({ account: "B", file_id: "b", negative_days: null, low_balance: -80 })] })])[0];
    expect(model.countConflict).toBe(false);
    expect(riskMonthSignal(model).label).toBe("Negative monthly low; dates not provided");
    expect(riskCountLabel(riskTotals([model]).negative)).toBe("0 reported");
  });
  it("separates two negative account-days from one calendar date and fee activity", () => {
    const models = balanceRiskMonths([month({ accounts: ["Checking 1234", "Savings 5678"], negative_days: 2, nsf: 3, returned_checks: 1, negative_dates: ["2026-10-03", "2026-10-03"], risk_sources: [source({ negative_days: 1, negative_dates: ["2026-10-03"] }), source({ file_id: "statement-b", account: "Savings 5678", negative_days: 1, negative_dates: ["2026-10-03"] })], overdraft_items: [{ date: "2026-10-03", amount: 35, type: "nsf_fee", description: "NSF charge" }, { date: "2026-10-03", amount: 900, type: "returned_item", description: "Returned check" }] })]);
    expect(riskTotals(models)).toMatchObject({ accountDays: true, locatedDates: 1, negative: { value: 2 }, fees: { value: 3 }, returned: { value: 1 } });
    expect(models[0].days.filter((day) => day.negative)).toHaveLength(1);
    expect(models[0].days[2].sources).toHaveLength(2);
    expect(models[0].events).toHaveLength(2);
    expect(models[0].events.filter(feeEvent)).toHaveLength(1);
    expect(models[0].unlocatedDays).toBe(0);
  });
  it("uses individual account minima, never a sum that implies a synchronized balance", () => {
    const combined = month({ accounts: ["A", "B"], low_balance: -5000, risk_sources: [source({ low_balance: -100 }), source({ file_id: "b", account: "B", low_balance: -200 })] });
    expect(riskTotals(balanceRiskMonths([combined])).lowest).toBe(-200);
    expect(riskTotals(balanceRiskMonths([{ ...combined, risk_sources: [] }])).lowest).toBeNull();
  });
  it.each([null, 0])("reports a negative monthly low without fabricating dates when the day count is %s", (negative_days) => {
    const model = balanceRiskMonths([month({ negative_days, low_balance: -300 })])[0];
    expect(riskMonthSignal(model).label).toContain("Negative monthly low");
    expect(riskMonthSignal(model).tone).toBe("warn");
    expect(model.days.some((day) => day.negative)).toBe(false);
    expect(riskMonthSignal(model).label).not.toBe("No negative days reported");
    if (negative_days === 0) expect(riskTotals([model]).negative.complete).toBe(false);
  });
  it("keeps undated, invalid and outside-month entries out of the calendar", () => {
    const model = balanceRiskMonths([month({ negative_dates: ["2026-10-05", "2026-10-05", "2026-02-30", "2026-11-01"], overdraft_items: [{ date: null, type: "nsf_fee", amount: null, description: "Date missing" }, { date: "2026-10-32", type: "overdraft_fee", amount: 35, description: "Invalid date" }, { date: "2026-09-30", type: "returned_item", amount: 700, description: "Outside month" }] })])[0];
    expect(model.locatedDates).toBe(1);
    expect(model.events.filter((event) => !event.inCalendar)).toHaveLength(3);
    expect(model.days.flatMap((day) => day.events)).toHaveLength(0);
    expect(model.events[2].date).toBe("2026-09-30");
  });
  it("does not infer closing-day dates or counts from fee or negative-balance entries", () => {
    const model = balanceRiskMonths([month({ overdraft_items: [{ date: "2026-10-05", type: "nsf_fee", amount: 35, description: "NSF" }, { date: "2026-10-05", type: "negative_balance", amount: -200, description: "Intraday entry" }] })])[0];
    expect(model.days[4].negative).toBe(false);
    expect(model.negativeDays).toBeNull();
    expect(riskDayLabel(model.days[4])).toContain("daily closing balance not provided; 1 fee event");
  });
  it("preserves transaction amount zero and exact source references", () => {
    const model = balanceRiskMonths([month({ overdraft_items: [{ date: "2026-10-05", type: "other", amount: 0, description: "No fee", file_id: "file-1", file_name: "Bank.pdf", page: 3, account: "Checking 1234" }] })])[0];
    expect(model.events[0]).toMatchObject({ amount: 0, fileId: "file-1", fileName: "Bank.pdf", page: 3, account: "Checking 1234" });
  });
  it("does not collapse two legitimate identical fee entries into one", () => {
    const fee = { date: "2026-10-05", type: "nsf_fee" as const, amount: 35, description: "NSF charge" };
    expect(balanceRiskMonths([month({ overdraft_items: [fee, fee] })])[0].events).toHaveLength(2);
  });
  it("never treats a returned principal amount or the legacy fee rollup as an NSF fee", () => {
    const returned = { date: "2026-10-05", type: "returned_item" as const, amount: 3500, description: "Returned payment" };
    const model = balanceRiskMonths([month({ fees: 9999, overdraft_items: [returned, { date: "2026-10-05", type: "nsf_fee", amount: 35, description: "NSF fee" }, { date: "2026-10-06", type: "overdraft_fee", amount: 25, description: "Overdraft fee" }] })])[0];
    expect(model.fees).toBe(60);
    expect(balanceRiskMonths([month({ fees: 3500, overdraft_items: [returned] })])[0].fees).toBeNull();
  });
  it("marks known partial counts as lower bounds and ignores unavailable totals", () => {
    const models = balanceRiskMonths([month({ negative_days: 3, risk_sources: [source({ negative_days: 3 }), source({ file_id: "other", account: "Other" })] }), month({ month: "2026-09" })]);
    expect(riskCountLabel(riskTotals(models).negative)).toBe("3+");
    expect(riskTotals(models).negative.reportedMonths).toBe(0);
  });
  it("compares reported months only for the same account cohort", () => {
    const models = balanceRiskMonths([month({ month: "2026-09", label: "September", negative_days: 5 }), month({ negative_days: 2 })]);
    expect(riskTrend(models)).toBe("3 fewer days than September");
    expect(riskTrend(balanceRiskMonths([month({ month: "2026-09", negative_days: null }), month({ negative_days: 2 })]))).toContain("needs two fully reported months");
    expect(riskTrend(balanceRiskMonths([month({ month: "2026-09", negative_days: 2 }), month({ accounts: ["Other account"], negative_days: 3 })]))).toContain("Account mix changed");
  });
  it("bounds keyboard focus inside the real month and paginates filtered event rows", () => {
    expect(nextRiskDay(1, "ArrowLeft", 28, 6)).toBe(1);
    expect(nextRiskDay(25, "ArrowDown", 28, 6)).toBe(28);
    expect(nextRiskDay(9, "Home", 28, 6)).toBe(9);
    expect(nextRiskDay(9, "End", 28, 6)).toBe(15);
    expect(nextRiskDay(9, "Enter", 28, 6)).toBeNull();
    const events = balanceRiskMonths([month({ overdraft_items: Array.from({ length: 11 }, (_, index) => ({ date: null, type: "nsf_fee", amount: index, description: "Fee" })) })])[0].events;
    expect(riskEventPage(events, 0, 4).items).toHaveLength(4);
    expect(riskEventPage(events, 99, 4)).toMatchObject({ page: 2, pages: 3, items: events.slice(8) });
    expect(riskEventPage([], 99, 4)).toMatchObject({ page: 0, pages: 1, items: [] });
  });
});
