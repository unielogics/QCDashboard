import { describe, expect, it } from "vitest";
import {
  DEBT_TYPES,
  REQUIRED_DEBT_FIELDS,
  debtFieldId,
  debtRowProblems,
  debtTypeLabel,
  describeDebtProblems,
  isAdvanceType,
  isBlankDebtRow,
  missingFieldKeys,
  parseFigure,
} from "../debtTypes";

const complete = {
  lender: "Newtek",
  debt_type: "term_loan",
  original_amount: "50,000",
  balance: "32,500",
  rate: "9.5",
  monthly_payment: "1,100",
  payment_status: "current",
};

describe("the type-of-debt list", () => {
  it("mirrors the backend's slugs and offers a merchant cash advance", () => {
    const values = DEBT_TYPES.map((t) => t.value);
    expect(values).toEqual([
      "term_loan", "line_of_credit", "sba_loan", "equipment", "vehicle", "real_estate", "mca",
      "revenue_based", "invoice_factoring", "credit_card", "floorplan", "lease", "personal_loan",
      "tax_payment_plan", "other",
    ]);
    expect(new Set(values).size).toBe(values.length);
    for (const value of values) expect(value.length).toBeLessThanOrEqual(24);
  });

  it("reads a slug for its label, keeps a typed value, and treats the old default as blank", () => {
    expect(debtTypeLabel("mca")).toBe("Merchant cash advance (MCA)");
    expect(debtTypeLabel("Bridge note")).toBe("Bridge note");
    expect(debtTypeLabel("loan")).toBe("");
    expect(debtTypeLabel("")).toBe("");
    expect(debtTypeLabel(undefined)).toBe("");
  });

  it("asks the advance question of an MCA or revenue-based advance, including one typed before the list existed", () => {
    expect(isAdvanceType("mca")).toBe(true);
    expect(isAdvanceType("Merchant Cash Advance")).toBe(true);
    expect(isAdvanceType("MCA - Fundbox")).toBe(true);
    expect(isAdvanceType("merchant_cash_advance")).toBe(true);
    expect(isAdvanceType("revenue_based")).toBe(true);
    expect(isAdvanceType("term_loan")).toBe(false);
    expect(isAdvanceType("")).toBe(false);
  });

  it("reads a figure the way the backend does: blank or not a number is unknown, never nought", () => {
    expect(parseFigure("1,250.50")).toBe(1250.5);
    expect(parseFigure("$5,000")).toBe(5000);
    expect(parseFigure("(500)")).toBe(-500);
    expect(parseFigure("0")).toBe(0);
    expect(parseFigure("TBD")).toBeNull();
    expect(parseFigure("12k")).toBeNull();
    expect(parseFigure("")).toBeNull();
  });
});

describe("the completeness check", () => {
  it("requires exactly the owner's seven answers", () => {
    expect(REQUIRED_DEBT_FIELDS).toEqual([
      "lender", "debt_type", "original_amount", "balance", "rate", "monthly_payment", "payment_status",
    ]);
  });

  it("passes a complete row and names what a partial one lacks", () => {
    expect(debtRowProblems([complete])).toEqual([]);
    const problems = debtRowProblems([
      { ...complete, debt_type: "", rate: " ", payment_status: "" },
      { ...complete, lender: "", original_amount: "" },
    ]);
    expect(problems).toEqual([
      { index: 1, lender: "Newtek", missing: ["debt_type", "rate", "payment_status"] },
      { index: 2, lender: null, missing: ["lender", "original_amount"] },
    ]);
    expect(describeDebtProblems(problems)).toBe(
      "Obligation 1 (Newtek) still needs: type of debt, interest rate, current or delinquent. " +
        "Obligation 2 still needs: lender name, original amount.",
    );
    expect(missingFieldKeys(problems)).toEqual(
      new Set(["0.debt_type", "0.rate", "0.payment_status", "1.lender", "1.original_amount"]),
    );
  });

  it("holds an advance to its question and nothing else to it", () => {
    expect(debtRowProblems([{ ...complete, debt_type: "mca" }])).toEqual([
      { index: 1, lender: "Newtek", missing: ["mca_modified"] },
    ]);
    expect(debtRowProblems([{ ...complete, debt_type: "mca", mca_modified: "no" }])).toEqual([]);
    expect(debtRowProblems([{ ...complete, mca_modified: "" }])).toEqual([]);
  });

  it("skips a row the saver cannot write and a line nobody typed on, but not a line someone started", () => {
    expect(debtRowProblems([{ ...complete, debt_type: "", editable: false }])).toEqual([]);
    expect(isBlankDebtRow({})).toBe(true);
    expect(isBlankDebtRow({ lender: " ", balance: "" })).toBe(true);
    expect(isBlankDebtRow({ notes: "x" })).toBe(false);
    expect(isBlankDebtRow({ debt_type: "mca", original_amount: "50,000" })).toBe(false);
    expect(debtRowProblems([{}, complete])).toEqual([]);
    expect(debtRowProblems([{ debt_type: "mca", original_amount: "50,000" }])[0]?.missing).toContain("lender");
  });

  it("treats a figure that is not a number and the old default type as unanswered", () => {
    expect(debtRowProblems([{ ...complete, monthly_payment: "TBD" }])).toEqual([
      { index: 1, lender: "Newtek", missing: ["monthly_payment"] },
    ]);
    expect(debtRowProblems([{ ...complete, debt_type: "Loan" }])).toEqual([
      { index: 1, lender: "Newtek", missing: ["debt_type"] },
    ]);
    expect(debtRowProblems([{ ...complete, rate: "0", original_amount: "0" }])).toEqual([]);
    expect(debtTypeLabel("Loan")).toBe("");
  });

  it("names the input a missing answer lives in", () => {
    expect(debtFieldId("rate", 1)).toBe("rate-1");
    expect(debtFieldId("payment_status", 0)).toBe("status-0");
    expect(debtFieldId("mca_modified", 2)).toBe("mca-2");
  });

  it("lets the dates, collateral and note stay blank", () => {
    expect(
      debtRowProblems([{ ...complete, originated_on: "", maturity_on: "", secured: "", collateral: "", notes: "" }]),
    ).toEqual([]);
  });
});
