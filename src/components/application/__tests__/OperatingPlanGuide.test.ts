import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingPlanGuide, OperatingGuidedComparison } from "../OperatingPlanGuide";
import { OperatingPlanComparison } from "../OperatingPlanComparison";
import type { OperatingEvaluation } from "@/lib/operatingPlan";
import type { OperatingGuidance } from "@/lib/operatingGuidance";

const evaluation = { draft_feedback: { basis: "before_implementation_costs_and_timing", actions: [], summary: { status: "calculated", complete: true, source_comparable: true, current_noi: -40000, noi_currency: "USD", currency: "USD", known_gross_annual_subtotal: 50000, gross_annual_delta: 50000, gross_monthly_run_rate_delta: null, draft_noi: 10000, draft_noi_delta: 50000, draft_gap: null, qualified_noi_delta: 50000, qualified_first_year_noi_delta: 30000, dscr_current_debt_before: -0.25, dscr_current_debt_after: 0.08, dscr_current_debt_delta: 0.33, qualified_dscr_current_debt_after: 0.06, qualified_dscr_current_debt_delta: 0.31, missing: [] } }, baseline: { noi: -40000, currency: "USD", dscr: -0.25 }, projection: { proposed: { noi: 10000, first_year_noi: -10000, first_year_dscr_current: 0.06, first_year_dscr_with_refinance: null, noi_status: "unreviewed_illustration" }, approved: { noi: -40000, first_year_noi: -40000, noi_status: "awaiting_review" } }, actions: [{ status: "proposed", included_in_approved_projection: false }], missing: [], risk_flags: [] } as unknown as OperatingEvaluation;

describe("guided operating plan presentation", () => {
  it("keeps saved report controls beside the Step4 comparison and out of earlier planning stages", () => {
    const props = { value: {}, onChange: () => {}, evaluation, reportControls: createElement("section", { "aria-label": "Saved report test" }, "Download saved report") };
    expect(renderToStaticMarkup(createElement(OperatingPlanGuide, { ...props, stepIndex: 3 }))).toContain("Download saved report");
    expect(renderToStaticMarkup(createElement(OperatingPlanGuide, { ...props, stepIndex: 2 }))).not.toContain("Download saved report");
  });
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
    expect(html).toContain("<th>Reviewed</th>");
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
    expect(html).toContain("Calculating.");
  });
});

describe("current debt ratio applicability", () => {
 const debtCase = (debt: number | null): OperatingEvaluation => { const e = structuredClone(evaluation); e.baseline.annual_debt_service = debt; e.draft_feedback!.summary.working = { basis: "after_setup_before_timing", noi: 10000, noi_delta: 50000, goal_gap: null, earnings: null, earnings_delta: null, cash_delta_annual: null, cash_delta_monthly: null, dscr_current_debt_before: null, dscr_current_debt_after: null, dscr_current_debt_delta: null, dscr_with_refinance_after: 0.5, dscr_with_refinance_delta: null, first_year_noi: null, first_year_noi_delta: null, first_year_earnings: null, first_year_earnings_delta: null, first_year_cash_delta: null, first_year_dscr_current_debt_after: null, first_year_dscr_current_debt_delta: null, loan_cash_change_monthly: null, loan_cash_change_annual: null, combined_cash_change_monthly: null, combined_cash_change_annual: null }; return e; };
 it("labels zero-current-debt applicability without inventing a ratio or hiding the saved refinance comparison", () => { const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation: debtCase(0) })); expect(html).toContain("DSCR · saved refinance"); expect(html).toContain("Not applicable · no current debt"); expect(html).toContain("0.5x"); expect(html).not.toContain("Unknown"); });
 it("keeps truly missing debt inputs distinct from no debt", () => { const html = renderToStaticMarkup(createElement(OperatingGuidedComparison, { evaluation: debtCase(null) })); expect(html).toContain("Confirm current debt inputs with your team"); expect(html).not.toContain("Not applicable · no current debt"); });
});

describe("source review and revenue step placement", () => {
 it("shows imported source groups in the first step with read-only amounts and explicit decisions", () => {
  const guidance = { business: {}, reporting: {}, expense_groups: [{ key: "tax:rent", label: "Imported rent", category: "rent", baseline_annual_amount: 12000, currency: "USD", year: 2025, source_file_ids: [], notes: [], source_fact_keys: [] }], essentials: [{ category: "cogs", label: "Cost of goods", prompt: "Old question" }] } as unknown as OperatingGuidance;
  let writes = 0;
  const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: { expenses: [{ id: "legacy", label: "Manual cost", current_amount: 0 }] }, guidance, stepIndex: 0, onChange: () => writes++ }));
  const table = html.match(/<table\b[^>]*aria-label="Source cost comparison"[\s\S]*?<\/table>/)?.[0];
  expect(writes).toBe(0);
  expect(html).toContain('aria-label="Source cost confirmations"');
  expect(html).toContain("retained item");
  expect(table).toBeDefined();
  for (const text of ["Cost group", "Selected source / year", "Disclosed / year", "Variance", "Status", "Imported rent", "$12,000.00 / year"]) expect(table).toContain(text);
  expect(table).toContain('aria-label="Confirm Imported rent"');
  expect(table).toContain('aria-label="Correct Imported rent"');
  expect(table).not.toContain("Manual cost");
  expect(table).not.toContain('<input');
  expect(table).not.toContain('<select');
 });
 it("keeps the source confirmation requirement reachable in the persistent right repair list", () => {
  const guidance = { business: {}, reporting: {}, expense_groups: [{ key: "tax:rent", label: "Imported rent", category: "rent", baseline_annual_amount: 12000, currency: "USD", source_file_ids: [], source_fact_keys: [], notes: [] }] } as unknown as OperatingGuidance;
  const html = renderToStaticMarkup(createElement(OperatingPlanGuide, { value: {}, guidance, stepIndex: 0, onChange: () => undefined }));
  expect(html).toContain('aria-label="To finish"'); expect(html).toContain("Confirm Imported rent"); expect(html).toContain('aria-label="To finish:');
 });
 it("places the revenue model and editable current costs together in the second step", () => {
  let writes = 0;
  const guidance = { business: {}, reporting: {}, expense_groups: [{ key: "tax:rent", label: "Imported rent", category: "rent", baseline_annual_amount: 12000, currency: "USD", source_file_ids: [], source_fact_keys: [], notes: [] }] } as unknown as OperatingGuidance;
  const html = renderToStaticMarkup(createElement(OperatingPlanGuide, {
   value: { expenses: [{ id: "rent-row", label: "Office rent", category: "rent", current_amount: 1000, cadence: "monthly", source_group_key: "tax:rent" }] },
   guidance, stepIndex: 1, onChange: () => writes++,
   unitControls: createElement("div", { "aria-label": "Revenue model controls" }, "Current units and selling price"),
  }));
  const model = html.match(/<section\b[^>]*aria-label="Revenue model"[\s\S]*?<\/section>/)?.[0];
  expect(writes).toBe(0);
  expect(model).toContain("Current units and selling price");
  expect(model).not.toContain("<details");
  expect(html).toContain('aria-label="Itemize current costs"');
  expect(html).toContain('aria-label="Current expense rent-row name"');
  expect(html).toContain("Review source costs");
  expect(html).not.toContain('aria-label="Source cost comparison"');
 });

});


describe("persistent planning canvas", () => {
  it("keeps today's source figures and the supplied outcome beside every planning stage without writing", () => {
    let writes = 0;
    for (const stepIndex of [0, 1, 2, 3]) {
      const html = renderToStaticMarkup(createElement(OperatingPlanGuide, {
        value: {}, onChange: () => { writes++; }, evaluation, stepIndex,
        comparisonContent: createElement("div", null, "Persistent financial outcome"),
      }));
      expect(html).toContain("Today&#x27;s financial baseline");
      expect(html).toContain("Persistent financial outcome");
      expect(html).toContain("Current drivers");
      expect(html).toContain("Assumptions");
      expect(html).toContain("Outcome");
    }
    expect(writes).toBe(0);
  });
  it("labels financing bank observations separately from working operating assumptions", () => {
    const e = structuredClone(evaluation);
    const values = { earnings: null, noi: null, dscr: null, cash_after_debt: null, operating_margin: null, debt_service: null };
    e.comparison = {
      loan_basis: "saved_terms", proposed_basis: "after_setup_before_timing",
      baseline: values, proposed: values, approved: values,
      bank_replay: { scope: "saved_financing_plan_only", replay_available: true, replay_reason: null,
        month_count: 3, currency: "USD", complete: false,
        before: { net_monthly: 2400, ending_balance: 8500, negative_months: 1,
          net_months_observed: 2, ending_months_observed: 3, low_balance_months_observed: 2 },
        after: { net_monthly: 2600, ending_balance: 9100, negative_months: 0,
          net_months_observed: 2, ending_months_observed: 3, low_balance_months_observed: 2 } },
    };
    const html = renderToStaticMarkup(createElement(OperatingPlanComparison, { evaluation: e }));
    expect(html).toContain("Saved financing plan · bank replay");
    expect(html).toContain("partial observations");
    expect(html).toContain("original 2 of 3, with financing 2 of 3");
    expect(html).toContain("$8,500.00");
    expect(html).toContain("$9,100.00");
    expect(html).toContain("operating changes appear in the comparison above");
    e.comparison.bank_replay!.before.low_balance_months_observed = 0;
    e.comparison.bank_replay!.before.negative_months = null;
    e.comparison.bank_replay!.replay_available = false;
    e.comparison.bank_replay!.replay_reason = "financing_inputs_incomplete";
    const incomplete = renderToStaticMarkup(createElement(OperatingPlanComparison, { evaluation: e }));
    expect(incomplete).not.toContain("$9,100.00");
    expect(incomplete).toContain("Complete the financing inputs");
    expect(incomplete).toContain("original 0 of 3");
  });
});
