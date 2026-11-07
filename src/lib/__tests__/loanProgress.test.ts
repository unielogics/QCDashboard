import { describe, expect, it } from "vitest";
import { formatLoanOriginationDate, formatLoanPaidDown, loanPaidDownDescription, loanPaidDownPct } from "../loanProgress";

describe("loan balance reduction", () => {
  it("uses original amount and current balance, including zero and balances above original", () => {
    expect(loanPaidDownPct("$100,000", "75,000")).toBe(25);
    expect(formatLoanPaidDown(100, 0)).toBe("100.0%");
    expect(formatLoanPaidDown(100, 120)).toBe("-20.0%");
    expect(loanPaidDownDescription(100, 120)).toContain("above the original");
    expect(formatLoanPaidDown(180000, 177337.39)).toBe("1.5%");
  });
  it("preserves unknown figures and rejects invalid or negative financial inputs", () => {
    for (const [original, balance] of [[null, 0], [0, 0], [-1, 0], [100, ""], [100, null], [100, "-"], [100, "."], [100, "($5)"], [100, NaN], [Infinity, 10], [true, 0], [100, {}]]) {
      expect(loanPaidDownPct(original, balance)).toBeNull();
      expect(formatLoanPaidDown(original, balance)).toBe("—");
    }
  });
  it("rounds only for display and avoids negative zero", () => {
    expect(loanPaidDownPct(3, 2)).toBeCloseTo(100 / 3);
    expect(formatLoanPaidDown(3, 2)).toBe("33.3%");
    expect(formatLoanPaidDown(100000, 100001)).toBe("0.0%");
    expect(formatLoanPaidDown(100000, 99851)).toBe("0.1%");
    expect(formatLoanPaidDown(100000, 99850)).toBe("0.2%");
    expect(formatLoanPaidDown(100000, 100150)).toBe("-0.2%");
  });
});

describe("recorded origination dates", () => {
  it("keeps a date-only value and validates the calendar date", () => {
    expect(formatLoanOriginationDate("2023-07-03")).toContain("2023");
    expect(formatLoanOriginationDate("2023-07-03")).toContain("3");
    for (const value of [null, "", "unknown", "2023-02-29", "2024-13-01"]) expect(formatLoanOriginationDate(value)).toBe("Not provided");
    expect(formatLoanOriginationDate("2024-02-29")).not.toBe("Not provided");
  });
});
