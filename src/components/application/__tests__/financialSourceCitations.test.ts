import React, { Children, createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => null, useCurrentUser: () => ({ data: null }) }));
import { CapitalReadinessSnapshotView, FundingPathSummary, MetricCard, ProgramOpportunityCard } from "../CapitalReadinessPanel";
import { FinancialFactCitations } from "../FinancialFactCitations";
import { DocumentReviewChecks } from "../DocumentReviewChecks";
import { financialCitationReason, financialCitationStatus, isVerifiedFinancialCitation } from "@/lib/financialCitations";
import { pdfSourcePageReady, scrollToPdfSourcePage, validPdfSourcePage } from "@/lib/pdfSourceNavigation";
import { loadFinancialSourcePreview, restoreFinancialSourceFocus } from "@/lib/financialSourcePreview";
import { programRuleCitations } from "@/lib/programOpportunityPresentation";
import { ApiError } from "@/lib/api";
import type { ApplicationEvidenceWorkspace } from "@/lib/applicationProfile";
import type { ApplicationCapitalReadinessSnapshot, CapitalReadinessFundingPath, FinancialFactCitation } from "@/lib/capitalReadiness";

beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const citation: FinancialFactCitation = {
  file_id: "file-1", file_name: "2025 business return.pdf", page: 3,
  quote: "Ordinary business income (loss) 12345 <script>",
  line_label: "Ordinary business income (loss)", value: "12345", field: "ordinary_business_income",
  verified: true, content_hash: "a".repeat(64), analysis_id: "analysis-1", tax_form: "1120-S", tax_line: "22",
};

function sourceButtons(node: ReactNode): Array<{ onClick: () => void }> {
  const buttons: Array<{ onClick: () => void }> = [];
  Children.forEach(node, (child) => {
    if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
    if (child.type === "button" && child.props.onClick) buttons.push({ onClick: child.props.onClick });
    buttons.push(...sourceButtons(child.props.children));
  });
  return buttons;
}

describe("verified financial source references", () => {
  it("opens the exact verified file and page with readable tax labels and escaped source text", () => {
    const onPreviewSource = vi.fn();
    const props = { citations: [citation], status: "verified" as const, onPreviewSource };
    const html = renderToStaticMarkup(createElement(FinancialFactCitations, props));
    expect(html).toContain("2025 business return.pdf");
    expect(html).toContain("1120-S · line 22 · Ordinary business income");
    expect(html).toContain("Open source · page 3");
    expect(html).toContain("min-height:44px");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    const buttons = sourceButtons(FinancialFactCitations(props));
    expect(buttons).toHaveLength(1);
    buttons[0].onClick();
    expect(onPreviewSource).toHaveBeenCalledWith("file-1", 3, citation.content_hash);
  });

  it("shows detail without creating an unauthorized link when no preview callback exists", () => {
    const html = renderToStaticMarkup(createElement(FinancialFactCitations, { citations: [citation], status: "verified" }));
    expect(html).toContain("2025 business return.pdf");
    expect(html).not.toContain("Open source");
    expect(html).not.toContain("href=");
  });

  it("keeps valid references usable when other inputs have only partial grounding", () => {
    const props = { citations: [citation, { ...citation, verified: false }], status: "partial" as const, reason: "Revenue source line needs confirmation.", onPreviewSource: vi.fn() };
    const html = renderToStaticMarkup(createElement(FinancialFactCitations, props));
    expect(html).toContain("Source reference · partial");
    expect(html).toContain("Source reference needs review. The figures remain available.");
    expect(html).toContain("Revenue source line needs confirmation.");
    expect(sourceButtons(FinancialFactCitations(props))).toHaveLength(1);
  });

  it("handles absent legacy references without discarding numbers or claiming missing evidence", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, { metric: { key: "net_margin_pct", label: "Net margin", value: 5, status: "healthy", unit: "percent" }, locale: "en", sourcePeriodLabel: "Source period" }));
    expect(html).toContain("5.0%");
    expect(html).toContain("Source reference needs review");
    expect(html).not.toContain("rejected");
    expect(html).not.toContain("Missing document");
    expect(html).not.toContain("Open source");
  });

  it("fails closed for malformed, unverified, or incomplete source actions", () => {
    for (const patch of [{ verified: false }, { status: "unverified" }, { page: 0 }, { page: 1.5 }, { page: NaN }, { value: NaN }, { quote: "" }, { content_hash: "" }, { analysis_id: "" }, { file_id: "" }]) {
      const invalid = { ...citation, ...patch };
      expect(isVerifiedFinancialCitation(invalid)).toBe(false);
      expect(financialCitationStatus([invalid], "verified")).toBe("unverified");
      expect(sourceButtons(FinancialFactCitations({ citations: [invalid], status: "verified", onPreviewSource: vi.fn() }))).toHaveLength(0);
    }
    expect(financialCitationStatus([], "verified")).toBe("unverified");
    expect(financialCitationStatus([null, citation], "verified")).toBe("partial");
  });

  it("explains citation machine states in readable language without discarding the source amounts", () => {
    expect(financialCitationReason("legacy_analysis_requires_explicit_reanalysis")).toContain("Run the analysis again");
    expect(financialCitationReason("source_hash_mismatch; citation_not_provided")).toContain("The source file changed");
    expect(financialCitationReason("tax_line_not_found_with_label", "es")).toContain("línea de la declaración");
    expect(financialCitationReason("unknown_internal_code")).toBe("");
    expect(financialCitationReason(null)).toBe("");
  });

  it("hides internal quotes, tax lines, lineage, funding explanations, and actions on client views", () => {
    const snapshot: ApplicationCapitalReadinessSnapshot = {
      id: "s", profile_id: "p", snapshot_version: 1, policy_key: "qc", policy_version: 1, formula_version: "score_v2",
      evidence_fingerprint: "f", as_of: "2026-10-11T12:00:00Z", created_at: "2026-10-11T12:00:00Z", review_status: "provisional",
      score: 70, band: "three_to_six_months", evidence_coverage_pct: 80, confidence_pct: 80,
      metrics: [{ key: "net_margin_pct", label: "Net margin", value: 5, status: "healthy", unit: "percent", source: { fact_citations: [citation], citation_status: "verified" } }],
      pillars: [], strengths: [], blockers: [], phases: [], program_opportunities: [],
      source_manifest: [{ kind: "file", content_hash: "secret-hash", file_name: "Internal evidence filename" }],
      funding_path: { status: "potential_program_fit", eligible_programs: [{ program_key: "p1", name: "Internal program" }], reasons: ["Internal criterion"] },
    };
    const html = renderToStaticMarkup(createElement(CapitalReadinessSnapshotView, { snapshot, clientSafe: true, onPreviewSource: vi.fn() }));
    expect(html).toContain("5.0%");
    for (const internal of [citation.file_name!, citation.quote, "line 22", "secret-hash", "Internal evidence filename", "Internal program", "Internal criterion", "Open source"]) expect(html).not.toContain(internal);
  });
});

describe("document source-page navigation", () => {
  it("passes the quoted page through the existing document source action", () => {
    const onPreview = vi.fn();
    const props = { checks: [{ key: "net_income", label: "Income", instructions: "Check income", severity: "block" as const }], onPreview,
      assessment: { checks: [{ status: "pass", citations: [{ file_id: "file-2", page: 7, quote: "Supported exact income amount" }] }] } };
    const buttons = sourceButtons(DocumentReviewChecks(props));
    expect(buttons).toHaveLength(1);
    buttons[0].onClick();
    expect(onPreview).toHaveBeenCalledWith("file-2", 7, undefined);
    const versioned = { ...props, assessment: { checks: [{ status: "pass", citations: [{ file_id: "file-2", page: 7, quote: "Supported exact income amount", content_hash: citation.content_hash }] }] } };
    sourceButtons(DocumentReviewChecks(versioned))[0].onClick();
    expect(onPreview).toHaveBeenCalledWith("file-2", 7, citation.content_hash);
  });

  it("waits for all preceding PDF canvases to have stable heights before jumping", () => {
    expect(pdfSourcePageReady(3, 8, new Set([3]))).toBe(false);
    expect(pdfSourcePageReady(3, 8, new Set([1, 3]))).toBe(false);
    expect(pdfSourcePageReady(3, 8, new Set([1, 2, 3]))).toBe(true);
    expect(pdfSourcePageReady(3, 2, new Set([1, 2, 3]))).toBe(false);
    for (const invalid of [undefined, -1, 0, 1.5, "2", Infinity, NaN]) expect(validPdfSourcePage(invalid)).toBeNull();
    expect(validPdfSourcePage(2, 5)).toBe(2);
    const scrollIntoView = vi.fn();
    expect(scrollToPdfSourcePage(3, 8, new Set([1, 3]), { scrollIntoView })).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollToPdfSourcePage(3, 8, new Set([1, 2, 3]), { scrollIntoView })).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "center" });
  });
});

describe("existing program section funding explanations", () => {
  const states: Array<[NonNullable<CapitalReadinessFundingPath["status"]>, string]> = [
    ["potential_program_fit", "Potential program fit"], ["needs_evidence", "More evidence needed"],
    ["capital_readiness_recommended", "Capital readiness recommended"], ["needs_review", "Underwriter review needed"],
    ["criteria_unavailable", "Program criteria unavailable"],
  ];
  it.each(states)("explains %s with the actual reason and next action", (status, label) => {
    const html = renderToStaticMarkup(createElement(FundingPathSummary, { locale: "en", path: { status, advisory_only: true, reasons: ["Current criteria need confirmation."], next_actions: ["Confirm recurring earnings."], evidence_gaps: ["Business debt schedule"], eligible_programs: [{ program_key: "p", name: "Potential program" }] } }));
    expect(html).toContain(label);
    expect(html).toContain("Current criteria need confirmation.");
    expect(html).toContain("Next action: Confirm recurring earnings.");
    expect(html).toContain("Evidence gaps: Business debt schedule");
    expect(html).toContain("This assessment is preliminary");
    expect(html).not.toContain("Approved");
    expect(html).not.toContain("Guaranteed");
    expect(html.includes("Potential program</span>")).toBe(status === "potential_program_fit");
  });

  it("leaves legacy paths absent and localizes all five path labels", () => {
    expect(renderToStaticMarkup(createElement(FundingPathSummary, { locale: "en", path: {} }))).toBe("");
    for (const [status, english] of states) {
      const html = renderToStaticMarkup(createElement(FundingPathSummary, { locale: "es", path: { status } }));
      expect(html).not.toContain(english);
      expect(html).toContain("La evaluación es preliminar");
    }
  });

  it("shows actual pass/fail/unknown criteria and verified source details inside the current program card", () => {
    const rules = [
      { field: "gross_margin_pct", operator: "gte", required: 15, observed: 18, status: "pass", verification_status: "verified", source_refs: [{ fact_citations: [citation] }] },
      { field: "dscr", operator: "gte", required: 1.25, observed: 1.1, status: "fail", verification_status: "verified", source_refs: [{ source_file_id: "uncited-file" }] },
      { field: "credit_score", operator: "gte", required: 680, observed: null, status: "unknown", verification_status: "provisional" },
    ];
    const props = { locale: "en" as const, needsReview: "Needs review", onPreviewSource: vi.fn(), program: { program_name: "Business funding", status: "recommended", eligible: true, reasons: ["Published policy supports this screen.", "gross_margin_pct gte matched"], evidence_gaps: ["debt_schedule"], rule_results: rules } };
    const html = renderToStaticMarkup(createElement(ProgramOpportunityCard, props));
    expect(html).toContain("Potential fit");
    expect(html).toContain('class="cellchip c-ok"');
    expect(html).toContain("Published policy supports this screen.");
    expect(html).toContain("Evaluated criteria (3)");
    expect(html).toContain("Observed: 18% · Required: ≥ 15% · Verified evidence");
    expect(html).toContain("Observed: 1.1x · Required: ≥ 1.25x");
    expect(html).toContain("Credit score");
    expect(html).toContain("Unknown");
    expect(html).toContain("Next evidence: Business debt schedule");
    expect(html).toContain("Open source · page 3");
    expect(html).not.toContain("gross_margin_pct gte matched");
    expect(html).not.toContain("uncited-file");
    expect(programRuleCitations(rules[0])).toEqual([citation]);
    expect(programRuleCitations(rules[1])).toEqual([]);
    const spanish = renderToStaticMarkup(createElement(ProgramOpportunityCard, { ...props, locale: "es" }));
    expect(spanish).toContain("Criterios evaluados");
    expect(spanish).toContain("Margen bruto");
    expect(spanish).toContain("Observado: 18% · Requerido: ≥ 15%");
    expect(spanish).toContain("No cumple el criterio");
    expect(spanish).toContain("Por confirmar");
    expect(spanish).not.toContain("[object Object]");
  });

  it("never turns rejected or unverified references into program source actions and suppresses internal client criteria", () => {
    const program = { status: "recommended", eligible: false, reasons: ["Internal underwriting reason"], evidence_gaps: ["debt_schedule"], rule_results: [{ field: "dscr", operator: "gte", required: 1.25, observed: 1.1, status: "fail", source_refs: [{ fact_citations: [{ ...citation, verified: false }] }] }] };
    const props = { program, locale: "en" as const, needsReview: "Needs review", onPreviewSource: vi.fn() };
    const html = renderToStaticMarkup(createElement(ProgramOpportunityCard, props));
    expect(html).toContain('class="cellchip c-warn"');
    expect(html).not.toContain("Open source");
    expect(html).not.toContain("Potential fit");
    const client = renderToStaticMarkup(createElement(ProgramOpportunityCard, { ...props, clientSafe: true }));
    for (const internal of ["Internal underwriting reason", "Evaluated criteria", "Observed:", "Next evidence", citation.quote, "Open source"]) expect(client).not.toContain(internal);
  });
});

describe("current-profile financial source previews", () => {
  const evidence = { evidence: { files: [{ id: "file-1", file_name: "Current source.pdf", content_type: "application/pdf", size_bytes: 100 }] } } as ApplicationEvidenceWorkspace;
  it("uses the authorized inventory and signed URL endpoint with the exact expected file hash", async () => {
    const paths: string[] = [];
    const api = async <T,>(path: string): Promise<T> => { paths.push(path); return (paths.length === 1 ? evidence : { url: "https://signed.invalid/source" }) as T; };
    const result = await loadFinancialSourcePreview({ profileId: "profile-1", fileId: "file-1", expectedContentHash: citation.content_hash }, api, () => "profile-1");
    expect(paths).toEqual(["/application-profiles/profile-1/evidence-workspace", `/application-profiles/profile-1/evidence/files/file-1/url?expected_content_hash=${citation.content_hash}`]);
    expect(result.review.file.file_name).toBe("Current source.pdf");
    expect(result.review.preview_url).toBe("https://signed.invalid/source");
    expect(result.files).toHaveLength(1);
  });

  it("does not request a signed URL for a removed source or another active profile", async () => {
    const response = vi.fn(async () => evidence);
    const api = async <T,>(): Promise<T> => await response() as T;
    await expect(loadFinancialSourcePreview({ profileId: "profile-1", fileId: "removed" }, api, () => "profile-1")).rejects.toThrow("Source reference needs review");
    expect(response).toHaveBeenCalledTimes(1);
    response.mockClear();
    await expect(loadFinancialSourcePreview({ profileId: "profile-1", fileId: "file-1" }, api, () => "profile-2")).rejects.toThrow("Source reference needs review");
    expect(response).not.toHaveBeenCalled();
  });

  it("guards profile switches both before signing and before displaying a completed response", async () => {
    let activeProfile = "profile-1";
    const firstResponse = vi.fn(async () => { activeProfile = "profile-2"; return evidence; });
    const first = async <T,>(): Promise<T> => await firstResponse() as T;
    await expect(loadFinancialSourcePreview({ profileId: "profile-1", fileId: "file-1" }, first, () => activeProfile)).rejects.toThrow("Source reference needs review");
    expect(firstResponse).toHaveBeenCalledTimes(1);
    activeProfile = "profile-1";
    let calls = 0;
    const second = async <T,>(): Promise<T> => { calls += 1; if (calls === 2) activeProfile = "profile-2"; return (calls === 1 ? evidence : { url: "https://signed.invalid/source" }) as T; };
    await expect(loadFinancialSourcePreview({ profileId: "profile-1", fileId: "file-1" }, second, () => activeProfile)).rejects.toThrow("Source reference needs review");
  });

  it("shows local source-changed guidance for a 409 instead of displaying replacement bytes", async () => {
    let calls = 0;
    const api = async <T,>(): Promise<T> => { calls += 1; if (calls === 2) throw new ApiError(409, "Source content hash mismatch"); return evidence as T; };
    await expect(loadFinancialSourcePreview({ profileId: "profile-1", fileId: "file-1", expectedContentHash: citation.content_hash }, api, () => "profile-1")).rejects.toThrow("Source file changed. Review its current version");
  });

  it("restores source-button focus without changing the current scroll position", () => {
    const focus = vi.fn();
    restoreFinancialSourceFocus({ isConnected: true, focus });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    focus.mockClear();
    restoreFinancialSourceFocus({ isConnected: false, focus });
    restoreFinancialSourceFocus(null);
    expect(focus).not.toHaveBeenCalled();
  });
});
