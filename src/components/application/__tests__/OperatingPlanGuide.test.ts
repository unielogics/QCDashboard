import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingPlanGuide, OperatingGuidedComparison } from "../OperatingPlanGuide";
import type { OperatingEvaluation } from "@/lib/operatingPlan";
import type { OperatingGuidance } from "@/lib/operatingGuidance";

const evaluation = { draft_feedback: { basis: "before_implementation_costs_and_timing", actions: [], summary: { status: "calculated", complete: true, source_comparable: true, current_noi: -40000, noi_currency: "USD", currency: "USD", known_gross_annual_subtotal: 50000, gross_annual_delta: 50000, gross_monthly_run_rate_delta: null, draft_noi: 10000, draft_noi_delta: 50000, draft_gap: null, qualified_noi_delta: 50000, qualified_first_year_noi_delta: 30000, dscr_current_debt_before: -0.25, dscr_current_debt_after: 0.08, dscr_current_debt_delta: 0.33, qualified_dscr_current_debt_after: 0.06, qualified_dscr_current_debt_delta: 0.31, missing: [] } }, baseline: { noi: -40000, currency: "USD", dscr: -0.25 }, projection: { proposed: { noi: 10000, first_year_noi: -10000, first_year_dscr_current: 0.06, first_year_dscr_with_refinance: null, noi_status: "unreviewed_illustration" }, approved: { noi: -40000, first_year_noi: -40000, noi_status: "awaiting_review" } }, actions: [{ status: "proposed", included_in_approved_projection: false }], missing: [], risk_flags: [] } as unknown as OperatingEvaluation;

describe("guided operating plan presentation", () => {
  it("offers explicit source adoption and statement review without importing costs on render", () => {
    let changes = 0;
    const guidance = { business: { name: "Synthetic studio", industry: "Services" }, reporting: { source_label: "2025 business return", currency: "USD" }, expense_groups: [{ key: "rent", label: "Office rent", category: "rent", baseline_annual_amount: 24000, currency: "USD", year: 2025, source_file_ids: ["tax"], notes: [], source_fact_keys: [] }], essentials: [], action_templates: [], warnings: [] } as unknown as OperatingGuidance;
    const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: {}, onChange: () => { changes++; }, guidance, evidence: { expense_candidates: [{ source_candidate_key: "bank:rent", label: "Bank rent", current_amount: 2000, cadence: "monthly", source_file_ids: ["bank"] }] } }));
    expect(changes).toBe(0);
    for (const text of ["Confirm source", "Itemize current costs", "Plan changes", "Review and save", "Add Office rent for review", "Add statement suggestion", "Suggestions from supporting documents"]) expect(html).toContain(text);
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
