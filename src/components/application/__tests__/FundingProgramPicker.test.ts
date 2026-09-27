import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FundingProgramPicker, filterProgramCandidates } from "@/components/application/FundingProgramPicker";
import type { ApplicationProgramSelection, ProgramFitCandidate } from "@/lib/applicationProfile";

(globalThis as unknown as { React: typeof React }).React = React;

const candidate = (overrides: Partial<ProgramFitCandidate> = {}): ProgramFitCandidate => ({
  program_key: "dealer_capital", program_name: "Dealer Working Capital", catalog_id: "catalog-1", public_slug: "dealer-capital",
  playbook_id: "criteria-1", playbook_version: 1, eligible: true, recommendation_status: "recommended",
  fit_score: 90, confidence: 90, priority: 0, reasons: ["Revenue meets the published minimum", "Business age verified"], ...overrides,
});

const props = {
  candidates: [candidate()], selections: [] as ApplicationProgramSelection[], selectedKeys: ["dealer_capital"], onSelectionChange: () => undefined,
  reason: "", onReasonChange: () => undefined, requiresOverride: false, changed: true, busy: false, error: null,
  onClose: () => undefined, onApply: () => undefined,
};

describe("funding program selection", () => {
  it("searches all words across names and fit reasons and filters selected programs", () => {
    const programs = [candidate(), candidate({ program_key: "equipment", program_name: "Equipment Financing", reasons: ["Equipment purchase"] })];
    expect(filterProgramCandidates(programs, "  DEALER verified  ", "all", ["equipment"]).map((item) => item.program_key)).toEqual(["dealer_capital"]);
    expect(filterProgramCandidates(programs, "", "selected", ["equipment"]).map((item) => item.program_key)).toEqual(["equipment"]);
  });

  it("shows criteria and every fit reason, with unavailable programs disabled", () => {
    const html = renderToStaticMarkup(createElement(FundingProgramPicker, {
      ...props, candidates: [candidate(), candidate({ program_key: "unpublished", program_name: "Unpublished program", playbook_id: null, playbook_version: null, eligible: false, recommendation_status: "criteria_unavailable" })],
    }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Choose funding programs");
    expect(html).toContain("Business age verified");
    expect(html).toContain("Publish criteria in Funding programs settings");
    expect(html).toMatch(/type="checkbox" disabled=""/);
  });

  it("prevents applying an override without a reviewed reason", () => {
    const html = renderToStaticMarkup(createElement(FundingProgramPicker, { ...props, requiresOverride: true }));
    expect(html).toContain("Required review reason");
    expect(html).toMatch(/<button[^>]+disabled=""[^>]*>Apply selection<\/button>/);
    const valid = renderToStaticMarkup(createElement(FundingProgramPicker, { ...props, requiresOverride: true, reason: "Reviewed exception with supporting evidence" }));
    expect(valid).not.toMatch(/<button[^>]+disabled=""[^>]*>Apply selection<\/button>/);
  });

  it("keeps historical selections available when they no longer appear in the candidate list", () => {
    const html = renderToStaticMarkup(createElement(FundingProgramPicker, {
      ...props, selectedKeys: ["retired_program"], selections: [{ id: "selection-1", program_key: "retired_program", program_name: "Existing pinned program", playbook_id: "criteria-0", playbook_version: 2, source: "operator", fit_score: null, fit_confidence: null, fit_reasons: [], selected_at: "2026-09-27T00:00:00Z", needs_scope_review: false }],
    }));
    expect(html).toContain("Existing pinned program");
    expect(html).toContain("Previously selected · criteria v2");
    expect(html).toContain('type="checkbox" checked=""');
  });
});
