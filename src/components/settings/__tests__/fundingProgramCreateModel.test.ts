import { describe, expect, it } from "vitest";
import {
  draftIssues,
  nextDisplayOrder,
  programKeyFrom,
  publicSlugFrom,
  type FundingProgramDraftInput,
} from "../fundingProgramCreateModel";

function draft(patch: Partial<FundingProgramDraftInput> = {}): FundingProgramDraftInput {
  return {
    name: "10-Year Term Loan",
    program_key: "ten_year_term",
    public_slug: "ten-year-term",
    short_description: "A long-dated term loan.",
    display_order: 110,
    verticals: ["main_street"],
    reason: "Onboarding the lender's published sheet",
    ...patch,
  };
}

describe("identifiers derived from the program name", () => {
  it("keys are snake_case and slugs are hyphenated", () => {
    expect(programKeyFrom("10-Year Term Loan")).toBe("10_year_term_loan");
    expect(publicSlugFrom("10-Year Term Loan")).toBe("10-year-term-loan");
  });

  it("punctuation and edge separators are dropped, not left dangling", () => {
    expect(programKeyFrom("  SBA 7(a)!  ")).toBe("sba_7_a");
    expect(publicSlugFrom("  SBA 7(a)!  ")).toBe("sba-7-a");
  });

  it("keys stay inside the column width", () => {
    expect(programKeyFrom("x".repeat(200))).toHaveLength(64);
    expect(publicSlugFrom("x".repeat(200))).toHaveLength(100);
  });
});

describe("what blocks creating a program", () => {
  it("a complete draft raises nothing", () => {
    expect(draftIssues(draft(), [], [])).toEqual([]);
  });

  it("a program with no workspace is refused, because it could never match a file", () => {
    expect(draftIssues(draft({ verticals: [] }), [], []).join(" ")).toContain("at least one workspace");
  });

  it("a taken key or slug is named before the request is sent", () => {
    expect(draftIssues(draft(), ["ten_year_term"], []).join(" ")).toContain('"ten_year_term" already belongs');
    expect(draftIssues(draft(), [], ["ten-year-term"]).join(" ")).toContain('"ten-year-term" already belongs');
  });

  it("a reason is required, so the audit trail says why", () => {
    expect(draftIssues(draft({ reason: "fix" }), [], []).join(" ")).toContain("Record why");
  });

  it("an unnamed program is refused", () => {
    expect(draftIssues(draft({ name: "" }), [], []).join(" ")).toContain("Give the program a name");
  });
});

describe("display order", () => {
  it("a new program sorts after everything already in the catalog", () => {
    expect(nextDisplayOrder([10, 31, 100, 503])).toBe(513);
  });

  it("an empty catalog still yields a usable order", () => {
    expect(nextDisplayOrder([])).toBe(10);
    expect(nextDisplayOrder([undefined, undefined])).toBe(10);
  });
});
