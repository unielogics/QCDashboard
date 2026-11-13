import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingPlanGuide, OperatingGuidedComparison } from "../OperatingPlanGuide";
import type { OperatingEvaluation } from "@/lib/operatingPlan";
import type { OperatingGuidance } from "@/lib/operatingGuidance";

const evaluation = { draft_feedback: { basis: "before_implementation_costs_and_timing", actions: [], summary: { status: "calculated", complete: true, source_comparable: true, current_noi: -40000, noi_currency: "USD", currency: "USD", known_gross_annual_subtotal: 50000, gross_annual_delta: 50000, gross_monthly_run_rate_delta: null, draft_noi: 10000, draft_noi_delta: 50000, draft_gap: null, qualified_noi_delta: 50000, qualified_first_year_noi_delta: 30000, dscr_current_debt_before: -0.25, dscr_current_debt_after: 0.08, dscr_current_debt_delta: 0.33, qualified_dscr_current_debt_after: 0.06, qualified_dscr_current_debt_delta: 0.31, missing: [] } }, baseline: { noi: -40000, currency: "USD", dscr: -0.25 }, projection: { proposed: { noi: 10000, first_year_noi: -10000, first_year_dscr_current: 0.06, first_year_dscr_with_refinance: null, noi_status: "unreviewed_illustration" }, approved: { noi: -40000, first_year_noi: -40000, noi_status: "awaiting_review" } }, actions: [{ status: "proposed", included_in_approved_projection: false }], missing: [], risk_flags: [] } as unknown as OperatingEvaluation;

describe("guided operating plan presentation", () => {
  it("shows editable legacy category answers when the optional source-review sidecar has no selected source", () => {
    const e = { baseline: { noi: 0, noi_currency: "USD" }, source_review: { active: false, complete: false, stale: false, groups: [], missing: [] } } as unknown as OperatingEvaluation;
    const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: { expenses: [{ id: "cost", label: "Manual campaign", category: "marketing", current_amount: 0 }] }, evaluation: e, stepIndex: 1, onChange: () => {} }));
    expect(html).toContain('aria-label="Confirm Marketing"'); expect(html).toContain("Current costs confirmed"); expect(html).not.toContain('aria-label="Source cost confirmations"');
  });
  it("offers explicit source adoption and statement review without importing costs on render", () => {
    let changes = 0;
    const guidance = { business: { name: "Synthetic studio", industry: "Services" }, reporting: { source_label: "2025 business return", currency: "USD" }, expense_groups: [{ key: "rent", label: "Office rent", category: "rent", baseline_annual_amount: 24000, currency: "USD", year: 2025, source_file_ids: ["tax"], notes: [], source_fact_keys: [] }], essentials: [], action_templates: [], warnings: [] } as unknown as OperatingGuidance;
    const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: {}, onChange: () => { changes++; }, guidance, evidence: { expense_candidates: [{ source_candidate_key: "bank:rent", label: "Bank rent", current_amount: 2000, cadence: "monthly", source_file_ids: ["bank"] }] } }));
    expect(changes).toBe(0);
    for (const text of ["Confirm source", "Confirm current costs", "Plan changes", "Review and save", "Add Office rent for review", "Add statement suggestion", "Suggestions from supporting documents"]) expect(html).toContain(text);
  });
  it("keeps empty categories available through a compact explicit activity chooser without creating rows", () => {
    let changes = 0;
    const value = { expenses: [], adjustments: [] };
    const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value, stepIndex: 2, onChange: () => { changes++; } }));
    expect(changes).toBe(0);
    expect(value).toEqual({ expenses: [], adjustments: [] });
    expect(html).toContain("Add activity in another category");
    expect(html).toContain("No changes planned");
    expect(html).not.toContain("Annual effect before setup costs");
    expect(html).toContain('aria-label="New activity category"');
    expect(html).not.toContain("New planned activity name");
    expect(html).not.toContain('aria-label="Planned category');
  });
  it("keeps independent NOI visible while missing DSCR stays unknown and pending reviews stay distinct", () => {
    const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation }));
    expect(html).toContain("$10,000.00");
    expect(html).toContain("-$10,000.00");
    expect(html).toContain("Change (Δ)");
    expect(html).toContain("+$50,000.00");
    expect(html).toContain("+$30,000.00");
    expect(html).toContain("+0.31x");
    expect(html).not.toContain("0.33x");
    expect(html).toContain("Reviewed results, source and assumptions");
    expect(html).toContain("not a profit guarantee");
  });
  it("masks old proposed figures during refresh without erasing the current source loss", () => {
    const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation, evaluating: true }));
    expect(html).toContain("-$40,000.00");
    expect(html).not.toContain("$10,000.00");
    expect(html).not.toContain("0.06x");
    expect(html).toContain("Calculating…");
  });
});

describe("current debt ratio applicability", () => {
 const debtCase = (debt: number | null): OperatingEvaluation => { const e = structuredClone(evaluation); e.baseline.annual_debt_service = debt; e.draft_feedback!.summary.working = { basis: "after_setup_before_timing", noi: 10000, noi_delta: 50000, goal_gap: null, earnings: null, earnings_delta: null, cash_delta_annual: null, cash_delta_monthly: null, dscr_current_debt_before: null, dscr_current_debt_after: null, dscr_current_debt_delta: null, dscr_with_refinance_after: 0.5, dscr_with_refinance_delta: null, first_year_noi: null, first_year_noi_delta: null, first_year_earnings: null, first_year_earnings_delta: null, first_year_cash_delta: null, first_year_dscr_current_debt_after: null, first_year_dscr_current_debt_delta: null, loan_cash_change_monthly: null, loan_cash_change_annual: null, combined_cash_change_monthly: null, combined_cash_change_annual: null }; return e; };
 it("labels zero-current-debt applicability without inventing a ratio or hiding the saved refinance comparison", () => { const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation: debtCase(0) })); expect(html).toContain("DSCR · saved refinance"); expect(html).toContain("Not applicable · no current debt"); expect(html).toContain("0.5x"); expect(html).not.toContain("Unknown"); });
 it("keeps truly missing debt inputs distinct from no debt", () => { const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation: debtCase(null) })); expect(html).toContain("Confirm current debt inputs with your team"); expect(html).not.toContain("Not applicable · no current debt"); });
});

describe("source-only current cost review", () => {
 it("shows only imported source groups with read-only amounts and explicit decisions", () => {
  const guidance = { business: {}, reporting: {}, expense_groups: [{ key: "tax:rent", label: "Imported rent", category: "rent", baseline_annual_amount: 12000, currency: "USD", year: 2025, source_file_ids: [], notes: [], source_fact_keys: [] }], essentials: [{ category: "cogs", label: "Cost of goods", prompt: "Old question" }] } as unknown as OperatingGuidance;
  let writes = 0;
  const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: { expenses: [{ id: "legacy", label: "Manual cost", current_amount: 0 }] }, guidance, stepIndex: 1, onChange: () => writes++ }));
  expect(writes).toBe(0); expect(html).toContain("Imported rent"); expect(html).toContain("$12,000.00 / year"); expect(html).toContain('aria-label="Confirm Imported rent"'); expect(html).toContain('aria-label="Correct Imported rent"'); expect(html).toContain("retained item");
  expect(html).not.toContain("Add item"); expect(html).not.toContain("AI suggestion"); expect(html).not.toContain("Other categories"); expect(html).not.toContain("Business units and consultations"); expect(html).not.toContain('<select');
 });
 it("keeps the source confirmation requirement reachable in the persistent right repair list", () => {
  const guidance = { reporting: {}, expense_groups: [{ key: "tax:rent", label: "Imported rent", category: "rent", baseline_annual_amount: 12000, currency: "USD", source_file_ids: [] }] } as unknown as OperatingGuidance;
  const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: {}, guidance, stepIndex: 1, onChange: () => undefined }));
  expect(html).toContain('aria-label="To finish"'); expect(html).toContain("Confirm Imported rent"); expect(html).toContain('aria-label="To finish:');
 });
});
