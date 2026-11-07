import { describe, expect, it } from "vitest";
import type { ParsedReport, ParsedTradeAccount } from "@/lib/types";
import { creditAccountField, creditAccountLabel, creditAccountState, creditDisplayField, creditFieldGroups, creditMoney, creditMonthlyPayment, creditNumber, creditReportSummary, filterCreditAccounts } from "../creditReportCockpit";

const account = (fields: Record<string, string>): ParsedTradeAccount => ({ fields });
const report = (trade_accounts: ParsedTradeAccount[]): ParsedReport => ({ trade_accounts, scores: [], inquiries: [],
  personal_info: {}, addresses: [], employment: [], identity_risk: { ofac: {}, mla: {}, fraud_shield: {} },
  public_records: [], collections: [], fico_8: null, fico_2: null, vantage_4: null,
  best_score: null, best_score_model: null, raw_html_length: 0 });

describe("provider currency values", () => {
  it.each([["000001200", 1200], ["$ 001,200.50", 1200.5], ["USD 1,200", 1200], ["1200 USD", 1200],
    ["(USD $1,200.50)", -1200.5], ["-$1,200", -1200], ["$-12.50", -12.5], ["0", 0], ["000.00", 0], ["(0)", 0]])("reads %s without confusing zero and missing", (raw, expected) => {
    expect(creditNumber(raw)).toBe(expected);
  });
  it.each([undefined, "", "N/A", "unknown", "—", "1,20", "1,000 to 2,000", "$100-$200", "about $100",
    "Infinity", "NaN", "1e3", "2+2", "€1,200", "1,200 EUR", "(-$12)", "--12", "1 200", "9".repeat(400)])("leaves invalid or unreported %s unknown", (raw) => {
    expect(creditNumber(raw)).toBeNull();
  });
  it("formats known dollars and preserves the provider's unparsed words", () => {
    expect(creditMoney("00001234.50")).toBe("$1,234.5");
    expect(creditMoney("0")).toBe("$0");
    expect(creditMoney("Not reported")).toBe("Not reported");
    expect(creditMoney()).toBe("Not provided");
  });
});

describe("account status evidence", () => {
  it("never treats missing or unknown status as closed or adverse", () => {
    expect(creditAccountState(account({}))).toEqual({ isOpen: false, isClosed: false, isAdverse: false, hasPastDue: false });
    expect(creditAccountState(account({ account_status: "Unknown", past_due: "N/A" })).isClosed).toBe(false);
    expect(creditAccountState(account({ account_status: "Current", past_due: "0" })).isAdverse).toBe(false);
    expect(creditAccountState(account({ account_status: "Open, 0 days past due", account_rating: "Zero days past due", past_due: "0" }))).toEqual({ isOpen: true, isClosed: false, isAdverse: false, hasPastDue: false });
    expect(creditAccountState(account({ account_status: "Closed, paid in full" })).isClosed).toBe(true);
    expect(creditAccountState(account({ account_status: "Paid as agreed" })).isClosed).toBe(false);
  });
  it.each(["30 days past due", "60 days late", "90 days late", "120 days past due", "Charge-off", "Collection", "Default"])("recognizes adverse %s", (rating) => {
    expect(creditAccountState(account({ account_status: "Open", account_rating: rating })).isAdverse).toBe(true);
  });
  it("distinguishes historical late-payment evidence from current past-due amounts", () => {
    const historical = creditAccountState(account({ account_status: "Current", account_rating: "30 days late" }));
    expect(historical.isAdverse).toBe(true);
    expect(historical.hasPastDue).toBe(false);
    expect(creditAccountState(account({ account_status: "Unknown", past_due: "$25" })).hasPastDue).toBe(true);
    expect(creditAccountState(account({ account_status: "30 days late" })).hasPastDue).toBe(true);
    expect(creditAccountState(account({ account_rating: "No collections; not delinquent" })).isAdverse).toBe(false);
    expect(creditAccountState(account({ account_status: "Current", times_30_days_late: "1" }))).toMatchObject({ isAdverse: true, hasPastDue: false });
  });
});

describe("partial summaries and original row identity", () => {
  it("resolves provider label casing and aliases using the same reported numerical basis as the summary", () => {
    const item = account({ "Current Balance": "0001200.50", "Monthly Payment Amount": "0", "Monthly Payment": "999" });
    const balance = creditAccountField(item, ["balance", "current_balance", "outstanding_balance"]);
    const payment = creditAccountField(item, ["monthly_payment_amount", "monthly_payment"]);
    expect(balance).toBe("0001200.50");
    expect(payment).toBe("0");
    expect(creditReportSummary(report([item]))).toMatchObject({ balance: creditNumber(balance), monthly: creditNumber(payment) });
    expect(creditAccountField(item, ["account_status", "status"])).toBeUndefined();
    const unknown = account({ Balance: "Not reported", "Current Balance": "100" });
    expect(creditAccountField(unknown, ["balance", "current_balance"])).toBe("Not reported");
    expect(creditReportSummary(report([unknown])).balance).toBeNull();
  });
  it("sums only reported amounts, including genuine zeros, without inventing missing payments", () => {
    const data = report([account({ company: "A", account_status: "Open", balance: "$1,000", monthly_payment_amount: "0" }),
      account({ company: "B", balance: "0", monthly_payment_amount: "N/A" }), account({ company: "C", balance: "Unknown" })]);
    expect(creditReportSummary(data)).toMatchObject({ accounts: 3, open: 1, balance: 1000, balancesReported: 2, monthly: 0, paymentsReported: 1 });
    expect(creditReportSummary(report([account({})]))).toMatchObject({ balance: null, monthly: null, balancesReported: 0, paymentsReported: 0 });
  });
  it("includes explicit monthly amounts and only monthly-qualified generic payments", () => {
    const weekly = account({ payment_amount: "250", payment_frequency: "Weekly" });
    const unknown = account({ scheduled_payment: "125" });
    const monthly = account({ "Scheduled Payment Amount": "300", "Payment Frequency": "Per month" });
    const zero = account({ monthly_payment_amount: "0", payment_amount: "500", payment_frequency: "Weekly" });
    expect(creditMonthlyPayment(weekly)).toBeUndefined();
    expect(creditMonthlyPayment(unknown)).toBeUndefined();
    expect(creditMonthlyPayment(monthly)).toBe("300");
    expect(creditMonthlyPayment(zero)).toBe("0");
    expect(creditReportSummary(report([weekly, unknown, monthly, zero]))).toMatchObject({ monthly: 300, paymentsReported: 2 });
    expect(creditReportSummary(report([weekly, unknown]))).toMatchObject({ monthly: null, paymentsReported: 0 });
    expect(creditMonthlyPayment(account({ payment_amount: "100", payment_frequency: "Monthly or weekly" }))).toBeUndefined();
    expect(creditAccountField(weekly, ["payment_amount"])).toBe("250");
  });
  it("counts records and filters without merging distinct loans from the same creditor", () => {
    const accounts = [account({ company: "Same creditor", account_number: "11111111", account_status: "Open" }),
      account({ company: "Other", account_status: "Closed" }), account({ company: "Same creditor", account_number: "22222222", past_due: "12" })];
    expect(filterCreditAccounts(accounts, "all", "same creditor")).toEqual([{ account: accounts[0], index: 0 }, { account: accounts[2], index: 2 }]);
    expect(filterCreditAccounts(accounts, "past_due", "")).toEqual([{ account: accounts[2], index: 2 }]);
    expect(filterCreditAccounts(accounts, "open", "")).toEqual([{ account: accounts[0], index: 0 }]);
    expect(creditAccountLabel(accounts[0])).toBe("Same creditor");
    const data = { ...report(accounts), inquiries: [{ fields: {} }], collections: [{ type: "Collection" }], public_records: [{ type: "Public record" }] };
    expect(creditReportSummary(data)).toMatchObject({ accounts: 3, adverse: 1, pastDue: 1, inquiries: 1, collections: 1, publicRecords: 1 });
  });
});

describe("safe complete field inspection", () => {
  it("masks unredacted identifiers to their last four and retains provider redaction", () => {
    expect(creditDisplayField("Social Security Number", "123-45-6789")).toBe("••••6789");
    expect(creditDisplayField("tax_id", "12-3456789")).toBe("••••6789");
    expect(creditDisplayField("accountNumber", "000011112222")).toBe("••••2222");
    expect(creditDisplayField("Account #", "000011112222")).toBe("••••2222");
    expect(creditDisplayField("Employer Identification Number", "12-3456789")).toBe("••••6789");
    expect(creditDisplayField("account_number", "ABC12345678")).toBe("••••5678");
    for (const masked of ["XXX-XX-6789", "****2222", "••••2222", "REDACTED"]) expect(creditDisplayField("ssn", masked)).toBe(masked);
    expect(creditDisplayField("ssn", "N/A")).toBe("N/A");
    expect(creditDisplayField("ssn", "123.45.6789")).toBe("••••6789");
    expect(creditDisplayField("account_numbers", "1234/5678/9012")).toBe("••••9012");
    expect(creditDisplayField("tax_ids", "12.3456789")).toBe("••••6789");
    expect(creditDisplayField("ssns", "123.45.6789")).toBe("••••6789");
    expect(creditDisplayField("account_number", "ABCD/EFGH")).toBe("••••EFGH");
    expect(creditDisplayField("account_numbers", "****2222 / 1234/5678/9012")).toBe("****••••9012");
  });
  it("formats only amount fields and never interprets JSON, dates, or account IDs as money", () => {
    expect(creditDisplayField("Monthly Payment Amount", "0000100")).toBe("$100");
    expect(creditDisplayField("date_reported", "2026-10-31")).toBe("2026-10-31");
    expect(creditDisplayField("account_number", "0000100")).toBe("••••0100");
    expect(creditDisplayField("remarks", '<script>alert("test")</script>')).toBe('<script>alert("test")</script>');
    expect(creditDisplayField("payment_history", '{"month":"unknown"}')).toBe('{"month":"unknown"}');
    expect(creditDisplayField("arbitrary_code", "0000100")).toBe("0000100");
  });
  it("groups every original field exactly once without dropping unfamiliar provider details", () => {
    const fields = { Company: "Bank", "Account Number": "12345678", "Credit Limit": "1000", dateReported: "2026-10-31",
      "Payment History": "Provider text only", Remarks: "Disputed", "Unfamiliar provider detail": "Keep this", balance: "0" };
    const groups = creditFieldGroups(fields);
    expect(Object.fromEntries(groups.flatMap((group) => group.fields))).toEqual(fields);
    expect(groups.flatMap((group) => group.fields)).toHaveLength(Object.keys(fields).length);
    expect(groups.find((group) => group.title === "Dates")?.fields).toContainEqual(["dateReported", "2026-10-31"]);
    expect(groups.find((group) => group.title === "Other reported fields")?.fields).toEqual([["Unfamiliar provider detail", "Keep this"]]);
  });
});
