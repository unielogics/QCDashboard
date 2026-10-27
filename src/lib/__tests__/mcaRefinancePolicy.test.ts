import { describe, expect, it } from "vitest";
import { mcaRefinanceReviewMode, parseMcaRefinanceQualification, type McaRefinancePolicy } from "@/lib/mcaRefinancePolicy";

const policy = (patch: Partial<McaRefinancePolicy> = {}): McaRefinancePolicy => ({
  review_mode: "automated_review", auto_underwriting_allowed: true, reason_codes: [],
  active_mca_count: 2, requested_amount: 350_000,
  max_amount: 350_000, max_term_months: 120, max_active_mcas: 2, ...patch,
});

describe("MCA refinance intake routing", () => {
  it("allows the exact $350K/two-MCA program boundary only with server permission", () => {
    expect(mcaRefinanceReviewMode(policy())).toBe("automated_review");
    expect(mcaRefinanceReviewMode(policy({ auto_underwriting_allowed: false }))).toBe("information_required");
    expect(mcaRefinanceReviewMode(policy({ review_mode: "information_required" }))).toBe("information_required");
  });

  it.each([3, 5, 50])("accepts a declaration of %i active MCAs and requires manual review", (count) => {
    expect(parseMcaRefinanceQualification(String(count), "100,000")).toEqual({ active_mca_count: count, requested_amount: 100_000 });
    expect(mcaRefinanceReviewMode(policy({ active_mca_count: count }))).toBe("manual_review");
  });

  it("keeps above-limit applications in the manual route rather than truncating their amount", () => {
    expect(parseMcaRefinanceQualification("2", "350001")).toEqual({ active_mca_count: 2, requested_amount: 350_001 });
    expect(mcaRefinanceReviewMode(policy({ requested_amount: 350_001 }))).toBe("manual_review");
    expect(mcaRefinanceReviewMode(policy({ requested_term_months: 121 }))).toBe("manual_review");
  });

  it("cannot turn an explicit manual route into an automatic review", () => {
    expect(mcaRefinanceReviewMode(policy({ review_mode: "manual_review", active_mca_count: 1, requested_amount: 100_000 }))).toBe("manual_review");
  });

  it("blocks an older eligible session until a manual arrival is persisted", () => {
    expect(mcaRefinanceReviewMode(policy(), true)).toBe("information_required");
    expect(mcaRefinanceReviewMode(policy({ review_mode: "manual_review", auto_underwriting_allowed: false }), true)).toBe("manual_review");
  });

  it.each([undefined, policy({ active_mca_count: null }), policy({ active_mca_count: 0 }), policy({ requested_amount: null }), policy({ requested_amount: Number.NaN }), policy({ active_mca_count: 1.5 })])("fails closed for missing or invalid declarations", (value) => {
    expect(mcaRefinanceReviewMode(value)).toBe("information_required");
  });

  it.each([["", ""], ["3_plus", "100000"], ["2.5", "100000"], ["-1", "100000"], ["51", "100000"], ["2", ""], ["2", "0"], ["2", "Infinity"]])("requires complete, valid declarations: %s / %s", (count, amount) => {
    expect(parseMcaRefinanceQualification(count, amount)).toBeNull();
  });
});
