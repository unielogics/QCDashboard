import { describe, expect, it } from "vitest";
import { manualProgramDraftMatches, type FundingProgramVersion } from "@/lib/fundingPrograms";

function version(overrides: Partial<FundingProgramVersion> = {}): FundingProgramVersion {
  return {
    playbook_id: "draft-1",
    version: 1,
    status: "draft",
    rules: { priority: 0, fit: { field: "vertical", op: "eq", value: "real_estate" } },
    requirements: [{ label: "Rent roll" }, { label: "Trailing 12" }],
    published_at: null,
    ...overrides,
  };
}

describe("manualProgramDraftMatches", () => {
  it("resumes an exact manual-program draft", () => {
    expect(manualProgramDraftMatches(version(), "real_estate", ["Rent roll", "Trailing 12"])).toBe(true);
  });

  it("does not publish a draft for a different vertical or requirement set", () => {
    expect(manualProgramDraftMatches(version(), "dealer", ["Rent roll", "Trailing 12"])).toBe(false);
    expect(manualProgramDraftMatches(version(), "real_estate", ["Rent roll"])).toBe(false);
  });

  it("does not resume imported or more complex criteria drafts", () => {
    expect(manualProgramDraftMatches(version({
      rules: {
        fit: { field: "vertical", op: "eq", value: "real_estate" },
        unresolved_review_items: ["Confirm leverage"],
      },
    }), "real_estate", ["Rent roll", "Trailing 12"])).toBe(false);
    expect(manualProgramDraftMatches(version({
      rules: { fit: { all: [{ field: "vertical", op: "eq", value: "real_estate" }] } },
    }), "real_estate", ["Rent roll", "Trailing 12"])).toBe(false);
  });
});
