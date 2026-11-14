import { describe, expect, it } from "vitest";
import { noiBasisLabel, noiGovernancePresentation } from "../noiGovernance";
import type { FinancialNoi } from "../financialMetrics";

describe("canonical NOI presentation", () => {
  it("uses the server status rather than the sign or amount of income", () => {
    for (const status of ["provisional", "stale", "unavailable"]) {
      expect(noiGovernancePresentation({ status, review_needed: true, status_reason: "Review the current source" })).toMatchObject({ tone: "warn", reason: "Review the current source", reviewNeeded: true });
    }
    for (const status of ["reviewed", "source_supported"]) expect(noiGovernancePresentation({ status, review_needed: false }).tone).toBe("ok");
    expect(noiGovernancePresentation({ status: "future_status" }).label).toBe("NOI review status unavailable");
  });
  it("distinguishes the filed return, reviewed tax and source-free manual NOI", () => {
    const value = { headline: { kind: "tax_derived_noi", staff_reviewed: false } } as FinancialNoi;
    expect(noiBasisLabel(value)).toBe("Filed business return");
    expect(noiGovernancePresentation({ status: "source_supported", review_needed: false }).label).toBe("Source supported");
    value.headline!.staff_reviewed = true;
    expect(noiBasisLabel(value)).toBe("Reviewed business tax return estimate");
    expect(noiBasisLabel({ headline: { kind: "staff_reviewed_noi", staff_reviewed: true }, review: { current: { mode: "manual" } } } as FinancialNoi)).toBe("Manual annual NOI review");
    expect(noiBasisLabel({ headline: null } as FinancialNoi)).toBe("No current annual NOI basis");
  });
});
