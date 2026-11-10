import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { StaffOperatingSources } from "../StaffOperatingSources";
import { OperatingPlanForm } from "../OperatingPlanForm";
import type { OperatingEvidence } from "../OperatingPlanEditor";

const evidence: OperatingEvidence = { files: [{ file_id: "tax", file_name: "Synthetic 2025 business return.pdf" }], guidance: { policy_version: "operating-guidance-v1", business: { name: "Synthetic studio" }, reporting: { source_file_id: "tax", source_label: "Business tax return", period_start: "2025-01-01", period_end: "2025-12-31", currency: "USD", basis: "cash" }, expense_groups: [{ key: "rent", category: "rent", label: "Rent", year: 2025, currency: "USD", basis: "cash", baseline_annual_amount: 24000, source_file_ids: ["tax"], source_label: "Business tax return", source_fact_keys: ["rent"], notes: [] }], essentials: [], action_templates: [], warnings: [] }, expense_candidates: [{ bank_vendor_key: "bank-rent", label: "Unconfirmed rent payment", current_amount: 2000 }] };
const callbacks = { onRetry: vi.fn(), onDraft: vi.fn(), onAddCandidate: vi.fn(), onPreviewSource: vi.fn() };
const render = (extra = {}) => renderToStaticMarkup(createElement(StaffOperatingSources, { evidence, files: [], value: {}, loading: false, error: "", ...callbacks, ...extra }));

describe("staff source entry point", () => {
  it("shows selected report metadata and an explicit drafting action without changing a draft on render", () => {
    const html = render();
    for (const text of ["Synthetic 2025 business return.pdf", "2025-01-01", "2025-12-31", "USD", "cash", "Draft from tax/P&amp;L", "View selected source", "Unconfirmed statement payments", "Review statement suggestions"]) expect(html).toContain(text);
    expect(callbacks.onDraft).not.toHaveBeenCalled();
    expect(callbacks.onAddCandidate).not.toHaveBeenCalled();
  });
  it("retains visible source failure and retry instead of presenting a successful empty list", () => {
    const html = render({ error: "Source request failed", evidence: null });
    expect(html).toContain("Source request failed");
    expect(html).toContain("Retry source suggestions");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Draft from tax\/P&amp;L<\/button>/);
    expect(html).not.toContain("No statement suggestions are available");
  });
  it("blocks drafting and source navigation while the workspace is busy", () => {
    const html = render({ disabled: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Draft from tax\/P&amp;L<\/button>/);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>View selected source<\/button>/);
  });
  it("keeps empty Advanced totals unknown while preserving entered zero and explicit no-expenses confirmation", () => {
    const form = (value: Record<string, unknown>) => renderToStaticMarkup(createElement(OperatingPlanForm, { value, staff: true, onChange: vi.fn(), onOpenSources: vi.fn() })).replace(/<[^>]+>/g, "");
    const empty = form({ expenses: [] });
    expect(empty).toContain("Go to source costs");
    expect(empty).toContain("Unknown / month");
    expect(empty).not.toContain("$0.00 / month");
    expect(form({ expenses: [{ id: "zero", label: "Confirmed zero", current_amount: 0, cadence: "monthly" }] })).toContain("$0.00 / month");
    expect(form({ expenses: [], no_operating_expenses_confirmed: true })).toContain("$0.00 / year");
  });
});
