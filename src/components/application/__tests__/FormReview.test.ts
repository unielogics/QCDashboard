import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { advanceAnswer, debtFieldText, FormReview } from "../FormReview";
import { formatLoanOriginationDate } from "@/lib/loanProgress";
import type { PfsSchema } from "../Pfs413Form";

describe("the review page's debt words", () => {
  it("prints the type's label, a choice capitalised and a recorded origination date without changing its calendar day", () => {
    expect(debtFieldText("debt_type", "line_of_credit")).toBe("Line of credit");
    expect(debtFieldText("debt_type", "Bridge note")).toBe("Bridge note");
    expect(debtFieldText("payment_status", "delinquent")).toBe("Delinquent");
    expect(debtFieldText("secured", "secured")).toBe("Secured");
    expect(debtFieldText("originated_on", "2025-03-01")).toBe(formatLoanOriginationDate("2025-03-01"));
    expect(debtFieldText("collateral", "Inventory")).toBe("Inventory");
  });

  it("states the advance answer with its note", () => {
    expect(advanceAnswer({ mca_modified: "yes", mca_modification_note: "pull cut" })).toBe("Yes — pull cut");
    expect(advanceAnswer({ mca_modified: "yes" })).toBe("Yes");
    expect(advanceAnswer({ mca_modified: "no" })).toBe("No");
    expect(advanceAnswer({})).toBe("Not answered");
  });
});


describe("loan progress in the pre-submit review", () => {
  it("displays each recorded loan date and derives progress from its own amounts", () => {
    const body = { debts: [
      { lender: "SBA one", original_amount: "10000", balance: "2500", originated_on: "2025-03-01" },
      { lender: "SBA two", original_amount: "10000", balance: "0" },
      { lender: "Unknown", original_amount: "", balance: "0" },
    ] };
    const before = JSON.stringify(body);
    const html = renderToStaticMarkup(createElement(FormReview, { kind: "debt_schedule", schema: {} as PfsSchema, body }));
    expect(html.match(/<span>Origination date<\/span>/g)).toHaveLength(3);
    expect(html).toContain(formatLoanOriginationDate("2025-03-01"));
    expect(html).toContain("Not provided");
    expect(html).toContain("75.0%");
    expect(html).toContain("100.0%");
    expect(html).toMatch(/<span>Paid down<\/span><strong[^>]*>—<\/strong>/);
    expect(html).not.toContain("<input");
    expect(JSON.stringify(body)).toBe(before);
  });
});
