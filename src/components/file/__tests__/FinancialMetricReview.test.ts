import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FinancialKpiCard } from "../cockpit/FinancialKpiCard";
import { FinancialCalculationComposition, type CompositionDraft } from "../cockpit/FinancialCalculationComposition";
import { FinancialMetricStatementInputs } from "../cockpit/FinancialMetricStatementInputs";
import type { MetricCalculation } from "@/lib/financialMetrics";
import type { CockpitMonth } from "@/lib/financialCockpit";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => async () => ({}) }));

const calculation: MetricCalculation = { key: "dscr.tax_return", label: "Tax return DSCR", value: -1, formula: "Annual earnings / annual debt service", input_keys: ["tax.income", "tax.interest"], period: "2025", annualization_factor: 1, missing_inputs: [], notes: [], numerator_currency: "USD", source_refs: [{ file_id: "source", file_name: "Tax return.pdf", currency: "USD" }], recipe: { source_stamp: "a".repeat(64), revision: 3, kind: "dscr", can_edit: true, unit: "ratio", annualization_factor: 1, required_anchor: "tax.income", components: [{ input_key: "tax.income", label: "Net income", value: -1000, included: true, required: true }, { input_key: "tax.interest", label: "Interest", value: 0, included: true }], adjustments: [], base_value: -1, reviewed_value: -1, denominator: { input_key: "debt.annual", label: "Annual debt service", value: 1000, editable: false } } };
const draft: CompositionDraft = { calculationKey: calculation.key, revision: 3, sourceStamp: "a".repeat(64), action: "compose", components: [{ input_key: "tax.income", included: true }, { input_key: "tax.interest", included: true }], adjustments: [{ id: "review", label: "Documented add back", amount: "250" }], reason: "Reviewed source figures", idempotencyKey: "review-id" };
const renderComposition = (overrides: Partial<Parameters<typeof FinancialCalculationComposition>[0]> = {}) => renderToStaticMarkup(createElement(FinancialCalculationComposition, { profileId: "profile", calculation, revision: 3, canEdit: true, onDraft: () => {}, onPending: () => {}, onSaved: () => {}, onOpenDebt: () => {}, draft, ...overrides }));

describe("financial KPI evidence review", () => {
  it("makes the whole card an accessible native button with risk status and a separated scenario", () => {
    const html = renderToStaticMarkup(createElement(FinancialKpiCard, { label: "DSCR", value: "-1.00x", sub: "Below 1.00x", tone: "bad", projection: "Working plan -0.75x", onClick: () => {} }));
    expect(html).toContain('type="button"'); expect(html).toContain('aria-label="Review DSCR: calculation and source documents"'); expect(html).toContain("tone-bad"); expect(html).toContain("Below 1.00x"); expect(html).toContain("Working plan -0.75x"); expect(html.match(/<button/g)).toHaveLength(1);
  });
  it("shows negative DSCR as a ratio and signed source-period preview without allowing loss removal", () => {
    const html = renderComposition();
    expect(html).toContain("-1.00x"); expect(html).toContain("-0.75x"); expect(html).toContain("$750.00"); expect(html).toContain("Source income anchor"); expect(html).toMatch(/<input type="checkbox" disabled="" checked=""/);
    expect(html).not.toContain("1.00 (currency unknown)");
  });
  it("uses earnings source currency when the calculation does not carry currency", () => {
    const html = renderComposition({ calculation: { ...calculation, key: "profit_and_loss", numerator_currency: undefined, source_refs: [{ file_id: "source", file_name: "P&L.pdf", currency: "CAD" }], recipe: { ...calculation.recipe!, kind: "earnings", unit: "currency", denominator: null } }, draft: undefined });
    expect(html).toContain("CA$"); expect(html).not.toContain("currency unknown");
  });
  it("allows restoration even after invalid working components and blank adjustments", () => {
    const restored = { ...draft, action: "restore" as const, components: [...draft.components, { input_key: "tax.reported_ebitda", included: true }], adjustments: [{ id: "blank", label: "", amount: "" }] };
    const html = renderComposition({ draft: restored });
    const button = html.match(/<button[^>]*>Save original calculation restoration<\/button>/)?.[0];
    expect(button).toBeDefined(); expect(button).not.toContain("disabled"); expect(html).toContain("Its prior reviews remain in history");
  });
  it("blocks another editor's save while a shared financial review is in flight", () => {
    expect(renderComposition({ externallyBusy: true })).toMatch(/<button[^>]*disabled=""[^>]*>Save reviewed calculation<\/button>/);
  });
  it("shows selected-account operands with missing values and matching source links", () => {
    const month: CockpitMonth = { month: "2026-01", label: "January 2026", accounts: ["account-a"], file_ids: ["source-a"], accepted: true, deposits: 2500, withdrawals: null, net: null, beginning_balance: null, ending_balance: 50, average_balance: null, low_balance: null, nsf: null, returned_checks: null, negative_days: null, negative_dates: [], overdraft_items: [], deposit_count: null, outflow_ratio: null, fees: null };
    const html = renderToStaticMarkup(createElement(FinancialMetricStatementInputs, { metricKey: "cash_flow", months: [month], currency: "USD", sources: [{ file_id: "source-a", file_name: "Selected account January.pdf" }], onPreview: () => {}, inspection: true }));
    expect(html).toContain("$2,500.00"); expect(html).toContain("Unknown"); expect(html).toContain("Selected account January.pdf"); expect(html).toContain("Profile-wide reviewed corrections"); expect(html).not.toContain("Corrected calculation input"); expect(html).not.toContain("$0.00");
  });
});
