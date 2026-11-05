import { describe, expect, it } from "vitest";
import { debtMonthlyEquivalent, updateDebtPaymentTerms } from "../debtPaymentTerms";
import { cellDisplay } from "@/components/sheet/SheetCellView";
import { debtTotals } from "@/components/sheet/compute";

describe("contract payment cadence", () => {
  it.each([
    ["100", "daily", "2100.00"], ["100", "weekly", "433.00"], ["100", "biweekly", "216.50"], ["100", "monthly", "100.00"],
    ["0.50", "weekly", "2.17"], ["1", "biweekly", "2.17"], ["0", "daily", "0.00"], ["$1,000.25", "daily", "21005.25"],
  ])("derives %s paid %s as approximately %s monthly", (amount, frequency, expected) => {
    expect(debtMonthlyEquivalent(amount, frequency)).toBe(expected);
  });
  it.each([["", "daily"], ["100", ""], ["100", "annual"], ["-1", "monthly"], ["invalid", "weekly"]])("leaves incomplete or invalid terms unknown", (amount, frequency) => {
    expect(debtMonthlyEquivalent(amount, frequency)).toBeNull();
  });
  it("updates monthly only after a native term changes and both inputs exist", () => {
    expect(updateDebtPaymentTerms({ monthly_payment: "2500", monthly_payment_source: "stated" as const, payment_amount: "", payment_frequency: "" }, { payment_amount: "100" })).toMatchObject({ monthly_payment: "2500", monthly_payment_source: "stated" });
    expect(updateDebtPaymentTerms({ monthly_payment: "2500", monthly_payment_source: "stated" as const, payment_amount: "100", payment_frequency: "weekly" }, { payment_amount: "150" })).toMatchObject({ monthly_payment: "649.50", monthly_payment_source: "native_terms" });
  });
  it("clears stale derived monthly on incomplete native terms but preserves a stated monthly", () => {
    expect(updateDebtPaymentTerms({ monthly_payment: "2100", monthly_payment_source: "native_terms" as const, payment_amount: "100", payment_frequency: "daily" }, { payment_frequency: "" })).toMatchObject({ monthly_payment: "", monthly_payment_source: null });
    expect(updateDebtPaymentTerms({ monthly_payment: "2500", monthly_payment_source: "stated" as const, payment_amount: "100", payment_frequency: "daily" }, { payment_frequency: "" })).toMatchObject({ monthly_payment: "2500", monthly_payment_source: "stated" });
  });
  it("marks explicitly edited monthly as stated and does not derive interest from a factor", () => {
    expect(updateDebtPaymentTerms({ monthly_payment: "2100", monthly_payment_source: "native_terms" as const }, { monthly_payment: "2000" })).toMatchObject({ monthly_payment_source: "stated" });
    const row = { factor_rate: "1.375", monthly_payment: "2000" };
    expect(updateDebtPaymentTerms(row, { factor_rate: "1.4" })).toEqual({ factor_rate: "1.4", monthly_payment: "2000" });
    expect(cellDisplay({ c: 13, type: "rate", key: "debt-a.factor_rate" }, "1.375", null).text).toBe("1.375");
    expect(cellDisplay({ c: 6, type: "money", key: "debt-a.monthly_payment", flags: ["approximate"] }, "433", null).text).toBe("≈ $433.00");
  });
  it("recomputes worksheet preview totals from native cadence", () => {
    expect(debtTotals({ "d1.payment_amount": "100", "d1.payment_frequency": "daily", "d1.monthly_payment": "", "d2.monthly_payment": "500" }).total_monthly_payment).toBe(2600);
  });
});
