import { describe, expect, it } from "vitest";
import { canDispatchSubmission, submissionSelection, type LenderOption } from "../submissionBatches";

describe("simultaneous lender selection", () => {
  it("includes nonrecommended lenders and keeps acknowledgements per recipient", () => {
    const lenders = [{ id: "a", offering_id: "one", fit: { status: "recommended" } }, { id: "b", offering_id: "two", fit: { status: "outside_published_criteria" } }] as LenderOption[];
    expect(submissionSelection(lenders, new Set(["a", "b"]), new Set(["b"]))).toEqual([
      { lender_id: "a", offering_id: "one", warning_acknowledged: false },
      { lender_id: "b", offering_id: "two", warning_acknowledged: true },
    ]);
  });

  it("never sends completed, stale, or blocked children", () => {
    const base = { status: "prepared", blockers: [], fit_status: "recommended", warning_acknowledged: false };
    expect(canDispatchSubmission(base)).toBe(true);
    for (const status of ["sent", "queued", "delivery_unknown", "package_stale", "revoked"]) expect(canDispatchSubmission({ ...base, status })).toBe(false);
    expect(canDispatchSubmission({ ...base, blockers: [{ code: "consent", message: "Consent required" }] })).toBe(false);
    expect(canDispatchSubmission({ ...base, fit_status: "outside_published_criteria" })).toBe(false);
    expect(canDispatchSubmission({ ...base, fit_status: "outside_published_criteria", warning_acknowledged: true })).toBe(true);
  });
});
