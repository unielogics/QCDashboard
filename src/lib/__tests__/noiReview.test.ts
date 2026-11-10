import { describe, expect, it, vi } from "vitest";
import { draftForNoiSource, initialNoiReviewDraft, noiReviewDraftStale, noiReviewIssues, noiReviewPayload, saveNoiReview, type NoiReviewDraft, type NoiReviewRead, type NoiReviewSource } from "@/lib/noiReview";

const source: NoiReviewSource = { file_id: "tax-2025", file_name: "Synthetic business tax return.pdf", kind: "business_tax_return", year: 2025, currency: "USD", proposed_annual_value: 340000, eligible: true, reason: null, notes: ["Tax-derived estimate requires staff review"], source_refs: [] };
const review: NoiReviewRead = { revision: 7, source_stamp: "a".repeat(64), mode: "automatic", stale: false, sources: [source, { ...source, file_id: "pnl-2026", kind: "profit_and_loss", year: 2026, proposed_annual_value: 420000 }], current: null, history: [] };
const draft = (patch: Partial<NoiReviewDraft> = {}): NoiReviewDraft => ({ ...initialNoiReviewDraft(review, "request-1"), reason: "Reviewed evidence", ...patch });

describe("NOI annual review contract", () => {
  it("prefills an explicit last-year tax review even when a newer P&L is available, without inventing dates", () => {
    const value = draftForNoiSource(draft(), source);
    expect(value).toMatchObject({ mode: "source", selectedFileId: "tax-2025", annualValue: "340000", year: "2025", currency: "USD", periodStart: "", periodEnd: "" });
    expect(noiReviewIssues(value, review)).toEqual([]);
    expect(noiReviewPayload(value, review)).toMatchObject({ selected_file_id: "tax-2025", annual_value: 340000, year: 2025, period_start: null, period_end: null });
  });

  it.each(["0", "-1250.25"])("allows source-free manual annual NOI %s without requiring a P&L or an eight-character reason", (amount) => {
    const value = draft({ mode: "manual", selectedFileId: "", annualValue: amount, year: "2025", reason: "x" });
    expect(noiReviewIssues(value, { ...review, sources: [] })).toEqual([]);
    expect(noiReviewPayload(value, { ...review, sources: [] })).toMatchObject({ mode: "manual", selected_file_id: null, annual_value: Number(amount), year: 2025, reason: "x" });
  });

  it.each(["source", "manual"] as const)("prevents a linked %s review from relabeling the source year or currency", (mode) => {
    expect(noiReviewIssues(draft({ mode, year: "2026" }), review).join(" ")).toContain("year must match");
    expect(noiReviewIssues(draft({ mode, currency: "CAD" }), review).join(" ")).toContain("currency must match");
  });

  it("explains missing, unknown, stale and unavailable values without discarding the draft", () => {
    const value = draft({ annualValue: "", year: "", currency: "XXX", reason: "" });
    const before = structuredClone(value);
    expect(noiReviewIssues(value, review)).toHaveLength(4);
    expect(value).toEqual(before);
    expect(noiReviewIssues(draft({ annualValue: "Infinity" }), review).join(" ")).toContain("finite annual NOI");
    const fresh = { ...review, source_stamp: "b".repeat(64) };
    expect(noiReviewDraftStale(draft(), fresh)).toBe(true);
    expect(noiReviewIssues(draft(), fresh).join(" ")).toContain("latest evidence");
    expect(noiReviewIssues(draft(), { ...review, sources: [{ ...source, eligible: false }] }).join(" ")).toContain("eligible business tax return or P&L");
  });

  it.each([
    ["2025-01-01", ""], ["2025-06-01", "2025-01-01"], ["2024-01-01", "2025-12-31"], ["2025-01-01", "2026-01-01"], ["2025-02-30", "2025-12-31"],
  ])("rejects invalid optional source-period pair %s/%s", (periodStart, periodEnd) => {
    expect(noiReviewIssues(draft({ periodStart, periodEnd }), review).join(" ")).toContain("both period dates");
  });

  it("restores automatic NOI without leaking the prior manual amount or source into the request", () => {
    const value = draft({ mode: "automatic", annualValue: "999999", year: "2026", periodStart: "2026-01-01", periodEnd: "2026-12-31" });
    expect(noiReviewPayload(value, review)).toMatchObject({ mode: "automatic", selected_file_id: null, annual_value: null, year: null, currency: null, period_start: null, period_end: null, expected_revision: 7, source_stamp: review.source_stamp });
  });

  it("reuses exactly the same request identity for an unchanged retry", async () => {
    const api = vi.fn().mockResolvedValue({});
    const value = draft();
    await saveNoiReview(api, "profile-1", value, review);
    await saveNoiReview(api, "profile-1", value, review);
    expect(api.mock.calls[0]).toEqual(api.mock.calls[1]);
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile-1/financial-metrics/noi-review");
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ annual_value: 340000, year: 2025, idempotency_key: "request-1" });
  });
});
