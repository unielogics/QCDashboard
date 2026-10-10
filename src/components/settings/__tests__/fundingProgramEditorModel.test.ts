import { describe, expect, it } from "vitest";
import type { FundingProgramScope } from "@/lib/fundingPrograms";
import { applySharedIndustryExclusions, baselineNoteGroups, baselineReferenceFromRules, DOCUMENT_REVIEW_PRESETS, EVIDENCE_TEMPLATES, FIT_FIELDS, industryPrefixes, jsonEquivalent, newCustomDocumentReviewCheck, newRequirement, readDocumentReviewChecks, readSimpleFit, setRequirementCompletionMode, sharedIndustryExclusions, validateEditorContent, withDocumentReviewChecks, writeSimpleFit } from "../fundingProgramEditorModel";

describe("funding program guided editor", () => {
  it("offers confirmed-source gross and net margin fields without adding thresholds", () => {
    expect(FIT_FIELDS).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "gross_margin_pct", label: "Gross margin (%)", type: "number" }),
      expect.objectContaining({ key: "net_margin_pct", label: "Net margin (%)", type: "number" }),
    ]));
    expect(validateEditorContent(JSON.stringify({ fit: { field: "gross_margin_pct", op: "gte", value: 30 } }), "[]")).toBeNull();
  });
  it("round-trips workspace, numeric, and boolean checks while preserving unrelated metadata", () => {
    const rules = { priority: 17, provenance: { source: "reviewed" }, fit: { any: [{ field: "vertical", op: "eq", value: "dealer" }, { field: "annual_revenue", op: "gte", value: 125000 }, { field: "declared_collateral", op: "eq", value: true }] } };
    const fit = readSimpleFit(rules);
    expect(fit).not.toBeNull();
    expect(writeSimpleFit(rules, fit!)).toEqual(rules);
  });
  it("keeps nested rules, unknown fields and list conditions out of lossy simple editing", () => {
    for (const fit of [{ all: [{ any: [{ field: "vertical", op: "eq", value: "dealer" }] }] }, { field: "custom.fact", op: "gte", value: 4 }, { field: "entity_type", op: "in", value: ["llc", "corporation"] }, { field: "vertical", op: "eq", value: "dealer", unsupported: true }]) {
      expect(readSimpleFit({ fit })).toBeNull();
    }
  });
  it("allows an empty editable numeric input but prevents it from being saved", () => {
    const rules = { fit: { all: [{ field: "annual_revenue", op: "gte", value: "" }] } };
    expect(readSimpleFit(rules)?.conditions[0].value).toBe("");
    expect(validateEditorContent(JSON.stringify(rules), "[]")).toContain("numeric threshold");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "annual_revenue", op: "gte", value: 0 } }), "[]")).toBeNull();
  });
  it("never creates an invalid empty all group when the last check is removed", () => {
    expect(writeSimpleFit({ priority: 4, fit: { field: "vertical", op: "eq", value: "dealer" } }, { mode: "all", conditions: [] })).toEqual({ priority: 4 });
    expect(validateEditorContent('{"fit":{"all":[]}}', "[]")).toContain("empty group");
  });
  it("does not mark formatting-only JSON edits as unsaved, but recognizes actual changes", () => {
    expect(jsonEquivalent('{"priority":1,"fit":{"field":"vertical","op":"eq","value":"dealer"}}', '{ "fit": { "value": "dealer", "field": "vertical", "op": "eq" }, "priority": 1 }')).toBe(true);
    expect(jsonEquivalent('{"fit":{"field":"vertical","op":"eq","value":"dealer"}}', '{"fit":{"field":"vertical","op":"eq","value":"mca"}}')).toBe(false);
    expect(jsonEquivalent("{broken", "{}")).toBe(false);
  });
  it("uses canonical coverage keys and unique custom requirement references", () => {
    expect(EVIDENCE_TEMPLATES.find((row) => row.label.includes("6 months"))?.key).toBe("business_bank_statements_6_months");
    expect(EVIDENCE_TEMPLATES.find((row) => row.label.includes("2 years"))?.key).toBe("business_tax_returns_2_years");
    const first = newRequirement("Custom review", []);
    const second = newRequirement("Other review", [first]);
    expect(first.requirement_key).not.toEqual(second.requirement_key);
    expect(validateEditorContent("{}", JSON.stringify([first, second]))).toBeNull();
    expect(validateEditorContent("{}", JSON.stringify([first, first]))).toContain("same reference");
  });
  it("preserves requirements' verification, conditions and AI guidance on a label edit", () => {
    const existing = { ...newRequirement("Bank evidence", []), applies_when: { entity_type: "LLC" }, objective_text: "Confirm bank activity", completion_criteria: "Six complete months", ai_request_message_template: "Please send all pages.", expiration_days: 90, can_underwriter_waive: false };
    const edited = { ...existing, label: "Business bank evidence" };
    expect(edited.applies_when).toEqual(existing.applies_when);
    expect(edited.completion_criteria).toBe(existing.completion_criteria);
    expect(validateEditorContent("{}", JSON.stringify([edited]))).toBeNull();
  });
  it("blocks incomplete names, no visibility and invalid advanced JSON", () => {
    expect(validateEditorContent("{}", JSON.stringify([newRequirement("", [])]))).toContain("name");
    expect(validateEditorContent("{}", JSON.stringify([{ ...newRequirement("Bank statements", []), visibility: [] }]))).toContain("audience");
    expect(validateEditorContent("{", "[]")).toContain("invalid JSON");
    expect(validateEditorContent("{}", "{}")).toContain("list");
  });
  it("uses explicit completion choices to enable grounded AI review or require staff", () => {
    const requirement: Record<string, unknown> = { ...newRequirement("Bank statements", []), completion_criteria: "Confirm all pages" };
    const staffReview = setRequirementCompletionMode(requirement, "requires_human_verify");
    expect(staffReview.verification_required).toBe(true);
    expect(staffReview.completion_mode).toBe("requires_human_verify");
    expect(staffReview.completion_criteria).toBe("Confirm all pages");
    expect(requirement.verification_required).toBe(false);
    expect(setRequirementCompletionMode(staffReview, "ai_can_complete").verification_required).toBe(false);
    expect(setRequirementCompletionMode(staffReview, "borrower_self_attest").verification_required).toBe(false);
  });
  it("keeps document checks without forcing staff-only review or changing instructions", () => {
    const requirement = { ...newRequirement("Two years tax returns", []), completion_criteria: "All pages for both years", objective_text: "Confirm business results" };
    const checked = withDocumentReviewChecks(requirement, DOCUMENT_REVIEW_PRESETS.slice(0, 2));
    expect(checked.completion_mode).toBe("ai_can_complete");
    expect(checked.verification_required).toBe(false);
    expect(checked.completion_criteria).toBe(requirement.completion_criteria);
    expect(checked.objective_text).toBe(requirement.objective_text);
    expect(setRequirementCompletionMode(checked, "requires_human_verify").completion_mode).toBe("requires_human_verify");
    expect(withDocumentReviewChecks(checked, []).verification_required).toBe(false);
    expect(validateEditorContent("{}", JSON.stringify([checked]))).toBeNull();
  });
  it("preserves existing staff gates while preventing self-attestation of document checks", () => {
    const legacy = { ...newRequirement("Tax returns", []), verification_required: true, completion_mode: "ai_can_complete" };
    expect(withDocumentReviewChecks(legacy, [DOCUMENT_REVIEW_PRESETS[0]])).toMatchObject({ verification_required: true, completion_mode: "ai_can_complete" });
    const client = setRequirementCompletionMode(newRequirement("Tax returns", []), "borrower_self_attest");
    const checked = withDocumentReviewChecks(client, [DOCUMENT_REVIEW_PRESETS[0]]);
    expect(checked).toMatchObject({ verification_required: true, completion_mode: "requires_human_verify" });
    expect(setRequirementCompletionMode(checked, "borrower_self_attest").completion_mode).toBe("requires_human_verify");
    expect(validateEditorContent("{}", JSON.stringify([{ ...checked, completion_mode: "borrower_self_attest" }]))).toContain("cannot be self-attested");
  });
  it("allows multiple custom checks with stable unique references and validates incomplete instructions", () => {
    const first = { ...newCustomDocumentReviewCheck([]), label: "Owner transfers", instructions: "Explain material transfers to owners." };
    const second = { ...newCustomDocumentReviewCheck([first]), label: "Unusual activity", instructions: "Flag unusual transfers for staff review." };
    expect(first.key).not.toEqual(second.key);
    expect(newCustomDocumentReviewCheck([first, second]).key).toBe("custom_3");
    const requirement = withDocumentReviewChecks(newRequirement("Bank review", []), [first, second]);
    expect(readDocumentReviewChecks(requirement)).toEqual([first, second]);
    expect(validateEditorContent("{}", JSON.stringify([requirement]))).toBeNull();
    expect(validateEditorContent("{}", JSON.stringify([{ ...requirement, review_checks: [first, first] }]))).toContain("unique");
    expect(validateEditorContent("{}", JSON.stringify([{ ...requirement, review_checks: [{ ...first, instructions: " " }] }]))).toContain("Describe");
    expect(readDocumentReviewChecks({ review_checks: [{ ...first, unsupported: true }] })).toBeNull();
  });
  it("preserves specialization while applying shared industry exclusions only after an explicit edit", () => {
    const scopes: FundingProgramScope[] = [
      { vertical: "dealer", scope_key: "dealer", intake_variants: ["dealer_ai_intake"], intent_keys: [], naics_prefixes: ["441"], excluded_naics_prefixes: ["5221"], industry_keys: ["auto_dealer"], required_fact_keys: ["declared_collateral"] },
      { vertical: "main_street", scope_key: "main", intake_variants: [], intent_keys: ["equipment"], naics_prefixes: [], excluded_naics_prefixes: ["524"], industry_keys: [], required_fact_keys: [] },
    ];
    expect(sharedIndustryExclusions(scopes)).toEqual({ codes: ["5221", "524"], differs: true });
    expect(scopes[0].excluded_naics_prefixes).toEqual(["5221"]);
    const updated = applySharedIndustryExclusions(scopes, ["5221", "524", "522110-522115"]);
    expect(updated[0]).toEqual({ ...scopes[0], excluded_naics_prefixes: ["5221", "524", "522110-522115"] });
    expect(updated[1]).toEqual({ ...scopes[1], excluded_naics_prefixes: ["5221", "524", "522110-522115"] });
    expect(sharedIndustryExclusions(updated).differs).toBe(false);
    expect(applySharedIndustryExclusions(scopes, [])[0].naics_prefixes).toEqual(["441"]);
  });
  it("recognizes sector and bounded activity ranges without accepting malformed codes", () => {
    expect(industryPrefixes("31-33")).toEqual(["31", "32", "33"]);
    expect(industryPrefixes("522110-522112")).toEqual(["522110", "522111", "522112"]);
    expect(industryPrefixes("31-330")).toEqual([]);
    expect(industryPrefixes("33-31")).toEqual([]);
    expect(industryPrefixes("01-99")).toEqual([]);
    expect(industryPrefixes("auto dealers")).toEqual([]);
  });
  it("separates cited website facts from editable QC proposals and unresolved baseline notes", () => {
    expect(baselineNoteGroups(["Website: Advertised term range.", "Proposed QC policy: Consider a bank industry exclusion.", "Review: Confirm the underwriting minimum.", "Unclassified note."])).toEqual({ website: ["Advertised term range."], proposed: ["Consider a bank industry exclusion."], review: ["Confirm the underwriting minimum.", "Unclassified note."] });
  });
  it("reads saved baseline references without changing rules and tolerates invalid metadata", () => {
    const reference = { version: "2026-09-27", source_urls: ["https://qualifiedcommercial.com/programs"], source_notes: ["Website: Advertised term range."] };
    const rules = JSON.stringify({ baseline: reference, fit: { field: "mca_obligations_present", op: "eq", value: false } });
    expect(baselineReferenceFromRules(rules)).toEqual(reference);
    expect(JSON.parse(rules).fit.value).toBe(false);
    expect(baselineReferenceFromRules(JSON.stringify({ baseline: { version: "v1", source_urls: [null, "https://example.com"], source_notes: false } }))).toEqual({ version: "v1", source_urls: ["https://example.com"], source_notes: [] });
    for (const malformed of ["{broken", "[]", "{}", '{"baseline":null}', '{"baseline":{"version":5}}', '{"baseline":{"version":" "}}']) expect(baselineReferenceFromRules(malformed)).toBeNull();
  });
});
