import { describe, expect, it } from "vitest";
import { clientCoverageNeedsAnotherFile, clientRequirementProgress } from "../clientRoomDocuments";

describe("borrower requirement counts", () => {
  it("uses accepted statement periods and reports processing separately", () => {
    expect(clientRequirementProgress({ current: 1, required: 2, unit: "months" }, 1)).toBe("1 of 2 months accepted · 1 processing");
    expect(clientRequirementProgress({ current: 2, required: 2, unit: "years", complete: true })).toBe("2 of 2 years accepted");
  });
  it("keeps a partially fulfilled request actionable when uploads cannot cover the remainder", () => {
    expect(clientCoverageNeedsAnotherFile({ current: 1, required: 3, unit: "documents" }, 1)).toBe(true);
    expect(clientCoverageNeedsAnotherFile({ current: 1, required: 2, unit: "documents" }, 1)).toBe(false);
    expect(clientCoverageNeedsAnotherFile({ current: 1, required: 2, complete: true })).toBe(false);
  });
  it("does not invent counts for legacy requests without coverage", () => {
    expect(clientRequirementProgress(undefined)).toBeNull();
    expect(clientCoverageNeedsAnotherFile(undefined)).toBe(false);
  });
});
