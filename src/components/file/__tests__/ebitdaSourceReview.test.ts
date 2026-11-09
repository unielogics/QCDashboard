import { describe, expect, it, vi } from "vitest";
import { ebitdaSourceDraft, ebitdaSourceDraftStale, ebitdaSourceStatus, ebitdaSourceWrite } from "../cockpit/ebitdaSourceReview";
import { saveEbitdaSources, type EbitdaSourceSelection } from "@/lib/financialMetrics";

const selection: EbitdaSourceSelection = { revision: 7, source_stamp: "current-source", mode: "automatic", selected_file_id: "2025", excluded_file_ids: [], stale: false, history: [], sources: [
  { file_id: "2024", file_name: "2024 business.pdf", kind: "tax_return", eligible: true, included: false, selected: false, period: "2024" },
  { file_id: "personal", file_name: "2025 personal.pdf", kind: "personal_tax_return", eligible: false, included: false, selected: false },
  { file_id: "2025", file_name: "2025 business.pdf", kind: "tax_return", eligible: true, included: true, selected: true, period: "2025", ebitda_value: -67525 },
] };
const draft = () => ({ ...ebitdaSourceDraft("profile", selection), mode: "manual" as const, selectedFileId: "2025", excludedFileIds: ["2024"], reason: "Use the reviewed 2025 business tax return." });

describe("EBITDA source review", () => {
  it("distinguishes current baseline, comparison and personal exclusions", () => {
    expect(ebitdaSourceStatus(selection.sources[0], selection)).toContain("not in current baseline");
    expect(ebitdaSourceStatus(selection.sources[1], selection)).toBe("Personal return · excluded automatically");
    expect(ebitdaSourceStatus(selection.sources[2], selection)).toBe("Current EBITDA baseline");
    expect(ebitdaSourceStatus(selection.sources[0], { ...selection, excluded_file_ids: ["2024"] })).toBe("Historical comparison only · not in current baseline");
  });
  it("selects one business period without deleting older source records or converting losses", () => {
    const payload = ebitdaSourceWrite("profile", selection, draft());
    expect(payload).toMatchObject({ mode: "manual", selected_file_id: "2025", excluded_file_ids: ["2024"], expected_revision: 7, source_stamp: "current-source", forecast_assumptions: null });
    expect(selection.sources).toHaveLength(3);
    expect(selection.sources[2].ebitda_value).toBe(-67525);
  });
  it("rejects personal, missing and excluded manual baselines", () => {
    for (const selectedFileId of ["personal", "missing", "2024"]) expect(() => ebitdaSourceWrite("profile", selection, { ...draft(), selectedFileId })).toThrow("eligible, included business source");
  });
  it("keeps the latest business period even when the older source is allowed and current is excluded", () => {
    expect(() => ebitdaSourceWrite("profile", selection, { ...draft(), selectedFileId: "2024", excludedFileIds: [] })).toThrow("latest reporting period");
    expect(ebitdaSourceDraft("profile", { ...selection, mode: "manual", selected_file_id: "2024" })).toMatchObject({ mode: "automatic", selectedFileId: "" });
    expect(ebitdaSourceStatus(selection.sources[0], { ...selection, excluded_file_ids: ["2025"] })).toContain("Historical comparison only");
  });
  it("binds the request to the current profile and exact evidence revision", () => {
    expect(() => ebitdaSourceWrite("another-profile", selection, draft())).toThrow("another file");
    expect(ebitdaSourceDraftStale(draft(), { ...selection, revision: 8 })).toBe(true);
    expect(() => ebitdaSourceWrite("profile", { ...selection, source_stamp: "replacement" }, draft())).toThrow("sources changed");
  });
  it("requires an explanation and keeps the idempotency key on unchanged retries", () => {
    expect(() => ebitdaSourceWrite("profile", selection, { ...draft(), reason: "short" })).toThrow("at least eight");
    const current = draft();
    expect(ebitdaSourceWrite("profile", selection, current).idempotency_key).toBe(ebitdaSourceWrite("profile", selection, current).idempotency_key);
  });
  it("does not enable forecasts by default or infer current growth from historical trend", () => {
    const initial = ebitdaSourceDraft("profile", selection);
    expect(initial.forecast).toBe(false);
    expect(initial.growth).toBe("");
    expect(initial.margin).toBe("");
  });
  it("preserves reviewed negative growth and margin assumptions separately", () => {
    expect(ebitdaSourceWrite("profile", selection, { ...draft(), forecast: true, growth: "-20", margin: "-15" }).forecast_assumptions).toEqual({ revenue_growth_pct: -20, ebitda_margin_pct: -15 });
    expect(ebitdaSourceWrite("profile", selection, { ...draft(), forecast: true, growth: "0", margin: "" }).forecast_assumptions).toEqual({ revenue_growth_pct: 0, ebitda_margin_pct: null });
  });
  it("validates forecast numbers and bounds", () => {
    for (const growth of ["", "Infinity", "NaN", "-101", "1001"]) expect(() => ebitdaSourceWrite("profile", selection, { ...draft(), forecast: true, growth })).toThrow("reviewed revenue growth");
    for (const margin of ["NaN", "101", "-1001"]) expect(() => ebitdaSourceWrite("profile", selection, { ...draft(), forecast: true, growth: "5", margin })).toThrow("EBITDA margin");
  });
  it("restores persisted assumptions when a source review is reopened", () => {
    expect(ebitdaSourceDraft("profile", { ...selection, forecast_assumptions: { revenue_growth_pct: 5, ebitda_margin_pct: -10 } })).toMatchObject({ forecast: true, growth: "5", margin: "-10" });
  });
  it("sends only the canonical audited source-selection payload", async () => {
    const api = vi.fn().mockResolvedValue({ ebitda: { headline: null } });
    const payload = ebitdaSourceWrite("profile", selection, draft());
    await saveEbitdaSources(api, "profile", payload);
    expect(api).toHaveBeenCalledWith("/application-profiles/profile/financial-metrics/ebitda-sources", { method: "POST", body: JSON.stringify(payload) });
  });
});
