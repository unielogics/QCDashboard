import { describe, expect, it } from "vitest";
import { fundingPackageEvidenceGaps } from "@/lib/fundingPackageCompletion";
import type { FinancialCockpit } from "@/lib/financialCockpit";

type Inputs = Pick<FinancialCockpit, "requested_amount" | "noi" | "ebitda">;

describe("report completion evidence gaps", () => {
  it("never fills a missing application request from a financing proposal", () => {
    expect(fundingPackageEvidenceGaps({ requested_amount: null }).map(gap => gap.key)).toEqual(["request", "noi", "ebitda"]);
    expect(fundingPackageEvidenceGaps({ requested_amount: 100_000 }).map(gap => gap.key)).not.toContain("request");
  });
  it("keeps the actual latest-source NOI blocker visible", () => {
    const input = { requested_amount: 100_000, noi: { headline: null, reason: "The latest P&L is excluded; restore or replace it." } } as Inputs;
    expect(fundingPackageEvidenceGaps(input).find(gap => gap.key === "noi")?.detail).toContain("latest P&L is excluded");
    expect(fundingPackageEvidenceGaps(input).find(gap => gap.key === "noi")?.detail).toContain("Calculate / override NOI");
  });
  it("does not call provisional or short-period earnings complete", () => {
    const input = { requested_amount: 100_000, noi: { headline: { value: -1200, annualized_value: null } }, ebitda: { headline: { kind: "tax_earnings_estimate", value: 20_000 } } } as unknown as Inputs;
    expect(fundingPackageEvidenceGaps(input).map(gap => gap.key)).toEqual(["noi", "ebitda"]);
  });
  it("accepts zero and negative supported figures rather than treating them as missing", () => {
    const input = { requested_amount: 100_000, noi: { headline: { annualized_value: -12_000, complete: true, provisional: false } }, ebitda: { headline: { kind: "computed_ebitda", annualized_value: 0, complete: true, provisional: false } } } as Inputs;
    expect(fundingPackageEvidenceGaps(input)).toEqual([]);
    input.noi!.headline!.provisional = true;
    expect(fundingPackageEvidenceGaps(input).map(gap => gap.key)).toEqual(["noi"]);
  });
  it("recognizes a saved tax or manual NOI review while retaining the separate EBITDA gap", () => {
    for (const kind of ["tax_derived_noi", "staff_reviewed_noi"] as const) {
      const input = { requested_amount: 100_000, noi: { headline: { kind, staff_reviewed: true, annualized_value: 0, complete: true, provisional: false } } } as Inputs;
      expect(fundingPackageEvidenceGaps(input).map(gap => gap.key)).toEqual(["ebitda"]);
    }
  });
  it("uses canonical review status without repeatedly reopening an explicit reviewed basis", () => {
    const input = { requested_amount: 100_000, noi: { status: "reviewed", review_needed: false, headline: { annualized_value: 0, complete: false, provisional: true } } } as unknown as Inputs;
    expect(fundingPackageEvidenceGaps(input).map(gap => gap.key)).toEqual(["ebitda"]);
    input.noi!.status = "stale";
    input.noi!.review_needed = true;
    input.noi!.status_reason = "The selected tax return version changed.";
    input.noi!.headline = null;
    expect(fundingPackageEvidenceGaps(input).find(gap => gap.key === "noi")).toMatchObject({ label: "NOI needs re-review", detail: expect.stringContaining("selected tax return version changed") });
  });
});
