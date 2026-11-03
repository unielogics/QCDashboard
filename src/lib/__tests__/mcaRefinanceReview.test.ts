import { describe, expect, it } from "vitest";
import { mcaActiveAdvanceSummary, mcaRefinanceReviewState } from "../mcaRefinanceReview";
import { preferredIntakeReviewResult } from "../leadCockpitDocuments";
import type { McaRefinancePolicy } from "../mcaRefinancePolicy";

const eligible: McaRefinancePolicy = {
  review_mode: "automated_review", auto_underwriting_allowed: true, reason_codes: [],
  active_mca_count: 2, requested_amount: 350_000, requested_term_months: 120,
  max_amount: 350_000, max_term_months: 120, max_active_mcas: 2,
};

describe("MCA refinance desk presentation", () => {
  it("does not change an ordinary intake", () => {
    expect(mcaRefinanceReviewState({ intake: { variant: "main_street_v1" } })).toBeNull();
  });

  it("requires qualification details for an old MCA response without policy", () => {
    expect(mcaRefinanceReviewState({ intake: { variant: "mca_refi_v1" } })?.mode).toBe("information_required");
  });

  it("reads a server policy persisted in intake state", () => {
    expect(mcaRefinanceReviewState({ intake: { intake_state: { mca_refinance_policy: eligible } } })?.mode).toBe("automated_review");
  });

  it("keeps three-MCA applications on the manual route despite a stale auto flag", () => {
    const state = mcaRefinanceReviewState({ mca_refinance_policy: { ...eligible, active_mca_count: 3 } });
    expect(state?.mode).toBe("manual_review");
    expect(state?.description).toContain("application is accepted");
  });

  it("does not present an old positive AI result as the current manual decision", () => {
    const result = preferredIntakeReviewResult({
      mca_refinance_policy: { ...eligible, active_mca_count: 3 },
      intake: { result_snapshot: { executive_summary: "Old success" } },
      latest_review: { status: "completed", result: { probability_status: "Good probability - book call", executive_summary: "Old AI result" } },
    });
    expect(result?.probability_status).toBe("Manual MCA refinance review");
    expect(result?.executive_summary).toContain("Automatic underwriting is disabled");
  });

  it("preserves the completed-review preference for an eligible file", () => {
    const result = preferredIntakeReviewResult({
      mca_refinance_policy: eligible,
      intake: { result_snapshot: { summary: "Old snapshot" } },
      latest_review: { status: "completed", result: { summary: "Latest review" } },
    });
    expect(result?.summary).toBe("Latest review");
  });
});

describe("active advances as the desk reads them", () => {
  const base = { review_mode: "automated_review" as const, auto_underwriting_allowed: true, reason_codes: [], requested_amount: 70000, max_amount: 350000, max_term_months: 120, max_active_mcas: 2 };
  it("shows the declaration, and the documented count when it differs", () => {
    expect(mcaActiveAdvanceSummary({ ...base, active_mca_count: 8, declared_active_mca_count: 2, documented_active_mca_count: 8, two_or_more_active: true, active_mca_count_conflict: true }))
      .toEqual({ text: "2 declared · 8 on documents — mismatch", tone: "bad", twoOrMore: true });
    expect(mcaActiveAdvanceSummary({ ...base, active_mca_count: 2, declared_active_mca_count: 2, documented_active_mca_count: null, two_or_more_active: true, active_mca_count_conflict: false }))
      .toEqual({ text: "2 declared", tone: "ok", twoOrMore: true });
  });
  it("says so when nobody has declared anything yet", () => {
    expect(mcaActiveAdvanceSummary({ ...base, active_mca_count: null })).toEqual({ text: "not declared yet", tone: "warn", twoOrMore: null });
    expect(mcaActiveAdvanceSummary(null)).toBeNull();
  });
});
