import { describe, expect, it } from "vitest";
import {
  compactMissingItems,
  findRequirementKey,
  intelligenceActionDestination,
  reviewDestination,
} from "@/lib/reviewNavigation";

describe("AI review navigation", () => {
  it("collapses repeated AI wording for the same missing item", () => {
    expect(compactMissingItems([
      { title: "Business debt schedule", detail: "Upload the current schedule." },
      { title: "Debt schedule", detail: "Needed to calculate DSCR." },
      { title: "Personal financial statement" },
    ]).map((item) => item.title)).toEqual(["Business debt schedule", "Personal financial statement"]);
  });

  it("matches AI prose to an incomplete canonical requirement", () => {
    expect(findRequirementKey("Current business debt schedule is missing", [
      { requirement_key: "business_bank_statements_6_months", label: "Last 6 months business bank statements", category: "bank_statement", complete: true },
      { requirement_key: "business_debt_schedule", label: "Business debt schedule", category: "business_debt_schedule", complete: false },
    ])).toBe("business_debt_schedule");
  });

  it("prefers an incomplete requirement for a broad evidence action", () => {
    expect(findRequirementKey("business bank statements business tax returns revenue", [
      { requirement_key: "business_bank_statements_6_months", label: "Business bank statements", category: "bank_statement", complete: true },
      { requirement_key: "business_tax_returns_2_years", label: "Last 2 years business tax returns", category: "tax_return", complete: false },
    ])).toBe("business_tax_returns_2_years");
  });

  it("routes known metrics to their exact action", () => {
    expect(intelligenceActionDestination("edit_profile")).toEqual({ kind: "profile" });
    expect(intelligenceActionDestination("request_debt_schedule")).toEqual({ kind: "requirement", query: "business debt schedule debt payments" });
  });

  it("routes credit and Plaid gaps outside document requirements", () => {
    expect(reviewDestination("Owner soft pull is missing")).toEqual({ kind: "credit" });
    expect(reviewDestination("Connect bank through Plaid")).toEqual({ kind: "banking" });
  });
});
