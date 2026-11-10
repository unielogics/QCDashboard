import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NoiReviewEditor, NoiReviewHistory } from "@/components/file/cockpit/NoiReviewEditor";
import { NoiBreakdownPanel } from "@/components/file/cockpit/NoiBreakdownPanel";
import type { FinancialNoi, NoiResult } from "@/lib/financialMetrics";
import type { NoiReviewRead, NoiReviewReceipt } from "@/lib/noiReview";

vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => vi.fn() }));

const review: NoiReviewRead = { revision: 0, source_stamp: "a".repeat(64), mode: "automatic", stale: false, sources: [], current: null, history: [] };
const props = { profileId: "profile", review, draft: null, onDraft: vi.fn(), canEdit: true, onPending: vi.fn(), onSaved: vi.fn(), onReload: vi.fn() };
const receipt: NoiReviewReceipt = { id: "review-1", revision: 1, at: "2026-11-10T10:00:00Z", mode: "source", selected_file_id: "tax-2025", annual_value: 340000, year: 2025, currency: "USD", reason: "Reviewed the 2025 business return and known interest", source_stamp: "a".repeat(64), source_refs: [], actor_name: "Reviewer" };

describe("direct annual NOI review", () => {
  it("shows the manual editor and explains disabled saving when no P&L exists", () => {
    const html = renderToStaticMarkup(createElement(NoiReviewEditor, props));
    expect(html).toContain("Calculate / override NOI");
    expect(html).toContain("Manual annual NOI");
    expect(html).toContain("No eligible source calculation is available");
    expect(html).toContain('aria-label="NOI review requirements"');
    expect(html).toContain("Enter the reviewed year");
    expect(html).toContain("Enter a finite annual NOI amount");
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Save current NOI<\/button>/);
  });

  it("retains last-year tax suggestions and their evidence warnings as an explicit review option", () => {
    const html = renderToStaticMarkup(createElement(NoiReviewEditor, { ...props, review: { ...review, sources: [{ file_id: "tax-2025", file_name: "Synthetic business tax.pdf", kind: "business_tax_return", year: 2025, currency: "USD", proposed_annual_value: 340000, eligible: true, reason: null, notes: ["No validated quotation is available; review the source document"], source_refs: [] }] } }));
    expect(html).toContain("Business tax return · 2025");
    expect(html).toContain("Tax-return NOI estimate");
    expect(html).toContain("Depreciation and amortization remain expenses");
    expect(html).toContain("No validated quotation is available");
    expect(html).toContain('value="340000"');
  });

  it("keeps read-only evidence visible without offering a financial write", () => {
    const html = renderToStaticMarkup(createElement(NoiReviewEditor, { ...props, canEdit: false }));
    expect(html).toContain("Calculate / override NOI");
    expect(html).toContain("This review is read only");
    expect(html).not.toContain("Save current NOI");
    expect(html).not.toContain('aria-label="NOI review requirements"');
  });

  it("labels reviewed tax NOI and keeps the automatic P&L basis and review history separate", () => {
    const headline: NoiResult = { key: "noi-review:review-1", label: "Reviewed tax-derived NOI", kind: "tax_derived_noi", year: 2025, currency: "USD", value: 340000, annualized_value: 340000, period: "Year 2025 (annual staff review)", months_covered: null, annualization_factor: 1, complete: true, provisional: false, formula: "Reviewed annual business operating income", input_keys: [], missing_inputs: [], notes: ["Tax estimate selected by staff"], source_refs: [], fundamentals: [], staff_reviewed: true, tax_derived_estimate: true, source_value: 335000 };
    const value: FinancialNoi = { definition: { key: "business_noi", label: "Business NOI", formula: "Revenue minus operating costs", includes_depreciation_and_amortization: true }, headline, candidates: [], years: [], source_headline: null, source_reason: "Automatic P&L inputs remain unavailable", review: { ...review, mode: "source", current: receipt, history: [receipt] } };
    const html = renderToStaticMarkup(createElement(NoiBreakdownPanel, { value }));
    expect(html).toContain("Reviewed business tax return estimate");
    expect(html).toContain("Year 2025 (annual staff review)");
    expect(html).toContain("Source annual calculation before review");
    expect(html).toContain("Review reason: Reviewed the 2025");
    expect(html).toContain("Automatic source basis retained on file");
    expect(html).toContain("Tax estimate selected by staff");
    const history = renderToStaticMarkup(createElement(NoiReviewHistory, { review: value.review }));
    expect(history).toContain("$340,000");
    expect(history).toContain("2025");
    expect(history).toContain(receipt.reason);
  });
});
