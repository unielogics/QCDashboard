import { describe, expect, it } from "vitest";
import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { newRequirement, validateEditorContent } from "../fundingProgramEditorModel";
import { catalogValidationIssues, criteriaValidationIssues, currentProgramDraft, describeValidationIssue, programLifecycleDetail, programLifecycleLabel, publishValidationIssues, requirementsEquivalentForRecovery, serverValidationIssues } from "../fundingProgramValidationModel";

const scope: FundingProgramScope = { vertical: "dealer", scope_key: "default", intake_variants: [], intent_keys: [], naics_prefixes: [], industry_keys: [], required_fact_keys: [] };
const validRules = JSON.stringify({ fit: { field: "mca_obligations_present", op: "eq", value: false } });

describe("funding editor actionable validation", () => {
  it("keeps valid fields and optional blank review notes out of validation", () => {
    expect(criteriaValidationIssues(validRules, "[]")).toEqual([]);
    expect(criteriaValidationIssues("{}", "[]")).toEqual([]); // Drafts may intentionally be incomplete.
    expect(catalogValidationIssues({ name: "Dealer funding", description: "", order: "0", scopes: [scope] })).toEqual([]);
  });
  it("points each incomplete simple check to its exact input", () => {
    const rules = { fit: { all: [{ field: "annual_revenue", op: "gte", value: "" }, { field: "vertical", op: "eq", value: "" }] } };
    expect(criteriaValidationIssues(JSON.stringify(rules), "[]").map((issue) => issue.target)).toEqual(["Check 1 threshold", "Check 2 workspace"]);
  });
  it("addresses document names, audiences, expiration, and both custom-check fields", () => {
    const requirement = { ...newRequirement("", []), visibility: [], expiration_days: 0, review_checks: [{ key: "custom_1", label: "", instructions: "", severity: "review" }] };
    expect(criteriaValidationIssues("{}", JSON.stringify([requirement])).map((issue) => issue.target)).toEqual(["Requirement 1 name", "Requirement 1 audience", "Requirement 1 expiration days", "Requirement 1 check 1 name", "Requirement 1 check 1 instructions"]);
  });
  it("keeps advanced errors attached to the correct JSON editor", () => {
    expect(criteriaValidationIssues("{broken", "[]")[0].target).toBe("Eligibility rules JSON");
    expect(criteriaValidationIssues("{}", "{broken")[0].target).toBe("Document requirements JSON");
    expect(criteriaValidationIssues(JSON.stringify({ fit: { field: "unsupported_path", op: "eq", value: 1 } }), "[]")[0]).toMatchObject({ target: "Eligibility rules JSON", message: expect.stringContaining("Unsupported eligibility field") });
  });
  it("aligns priority, present, list and evidence operators with the backend contract", () => {
    const rule = { field: "vertical", op: "eq", value: "dealer" };
    for (const priority of [true, 1.5, 10001]) expect(validateEditorContent(JSON.stringify({ priority, fit: rule }), "[]")).toContain("priority");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "vertical", op: "present", value: null } }), "[]")).toContain("must not contain a value");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "vertical", op: "in", value: [] } }), "[]")).toContain("between 1 and 100");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "bank_statement", op: "evidence_available", value: true } }), "[]")).toContain("classification");
    expect(validateEditorContent(JSON.stringify({ fit: { field: "bank_statement", op: "evidence_available" } }), "[]")).toBeNull();
    expect(validateEditorContent(JSON.stringify({ fit: { field: "document", op: "evidence_available", value: "bank_statement" } }), "[]")).toBeNull();
  });
  it("never interprets a blank display order as zero and identifies missing workspaces", () => {
    expect(catalogValidationIssues({ name: "", description: "", order: "", scopes: [] }).map((issue) => issue.target)).toEqual(["Program name", "Display order", "Program workspaces"]);
  });
  it("identifies the exact workspace route while preserving legitimate legacy references", () => {
    const issues = catalogValidationIssues({ name: "Program", description: "", order: "1", scopes: [scope, { ...scope, vertical: "main_street", scope_key: "", naics_prefixes: ["invalid"] }] });
    expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({ target: "Main Street businesses route reference", routeIndex: 1 }), expect.objectContaining({ target: "Main Street businesses allowed NAICS prefixes", routeIndex: 1 })]));
    expect(catalogValidationIssues({ name: "Program", description: "", order: "1", scopes: [{ ...scope, scope_key: "legacy-route" }] })).toEqual([]);
  });
  it("matches backend routing normalization and technical-list limits", () => {
    const duplicate = catalogValidationIssues({ name: "Program", description: "", order: "1", scopes: [scope, { ...scope, scope_key: " default " }] });
    expect(duplicate).toEqual(expect.arrayContaining([expect.objectContaining({ target: "Auto dealerships route reference", routeIndex: 1 })]));
    const oversized = catalogValidationIssues({ name: "Program", description: "", order: "1", scopes: [{ ...scope, intake_variants: Array.from({ length: 21 }, (_, index) => `variant_${index}`), intent_keys: Array.from({ length: 31 }, (_, index) => `intent_${index}`), industry_keys: Array.from({ length: 31 }, (_, index) => `industry_${index}`), required_fact_keys: Array.from({ length: 21 }, (_, index) => `fact_${index}`) }] });
    expect(oversized.map((issue) => issue.target)).toEqual(["Auto dealerships intake variants", "Auto dealerships funding intent references", "Auto dealerships allowed industry references", "Auto dealerships business circumstance references"]);
  });
  it("links advanced requirement contract errors to exact fields or the JSON editor", () => {
    const requirement = { ...newRequirement("Tax returns", []), requirement_key: "business_tax_returns_11_years", category: "unknown", required_level: "mandatory", blocks_stage: "funded", visibility: ["staff"], completion_mode: "robot", can_underwriter_waive: "yes", verification_required: 1, display_order: -1, applies_when: [], objective_text: "x".repeat(2001), completion_criteria: "x".repeat(4001), ai_request_message_template: "x".repeat(4001) };
    const targets = criteriaValidationIssues("{}", JSON.stringify([requirement])).map((issue) => issue.target);
    expect(targets).toEqual(expect.arrayContaining(["Document requirements JSON", "Requirement 1 category", "Requirement 1 importance", "Requirement 1 required stage", "Requirement 1 audience", "Requirement 1 completion permission", "Requirement 1 review objective", "Requirement 1 completion criteria", "Requirement 1 client request wording"]));
  });
  it("distinguishes draft saving from publication prerequisites without inventing fit", () => {
    expect(criteriaValidationIssues("{}", "[]")).toEqual([]);
    expect(publishValidationIssues({ rules: "{}" }).map((issue) => issue.target)).toEqual(["Eligibility checks"]);
    expect(publishValidationIssues({ rules: validRules })).toEqual([]);
  });
  it("lets unresolved imported items be saved but blocks publication with a visible resolver target", () => {
    const rules = JSON.stringify({ ...JSON.parse(validRules), unresolved_review_items: ["Confirm income threshold"] });
    expect(criteriaValidationIssues(rules, "[]")).toEqual([]);
    expect(publishValidationIssues({ rules })).toEqual([expect.objectContaining({ target: "Imported items to resolve", area: "publish" })]);
    const malformed = JSON.stringify({ ...JSON.parse(validRules), unresolved_review_items: { note: "Confirm income threshold" } });
    expect(publishValidationIssues({ rules: malformed })).toEqual([expect.objectContaining({ target: "Eligibility rules JSON", area: "publish" })]);
  });
  it("describes document validation with the document name and visible field", () => {
    const requirements = JSON.stringify([{ ...newRequirement("Last 2 years business tax returns", []), review_checks: [
      { key: "net_income_nonnegative", label: "No negative earnings", instructions: "Check each year.", severity: "review" },
      { key: "custom_1", label: "", instructions: "", severity: "review" },
    ] }]);

    expect(describeValidationIssue({ target: "Requirement 1 name", message: "Enter a name.", area: "criteria" }, requirements)).toMatchObject({
      fieldLabel: "Last 2 years business tax returns · Document name",
      section: "criteria",
    });
    expect(describeValidationIssue({ target: "Requirement 1 check 2 instructions", message: "Describe the check.", area: "criteria" }, requirements)).toMatchObject({
      fieldLabel: "Last 2 years business tax returns · condition 2 · what to check",
      section: "criteria",
    });
  });
  it("maps server scope, document-check, and optional-note errors to on-screen controls", () => {
    const issues = serverValidationIssues({ detail: [
      { loc: ["body", "scopes", 0, "excluded_naics_prefixes"], msg: "Value error, Review the prohibited codes", input: ["bad"] },
      { loc: ["body", "requirements", 0, "review_checks", 1, "instructions"], msg: "Field required", input: "" },
      { loc: ["body", "reason"], msg: "String should have at most 2000 characters", input: "x" },
    ] }, [scope]);

    expect(issues).toEqual([
      expect.objectContaining({ target: "Prohibited industries", message: "Review the prohibited codes", area: "catalog", routeIndex: 0 }),
      expect.objectContaining({ target: "Requirement 1 check 2 instructions", message: "Field required", area: "criteria" }),
      expect.objectContaining({ target: "Program review note", message: "String should have at most 2000 characters", area: "review" }),
    ]);
  });
  it("names saved drafts and live published versions without implying that drafts are live", () => {
    const program = { status: "active", draft_versions: [], published_version: null } as unknown as FundingProgramCatalogItem;
    expect(programLifecycleLabel(program)).toBe("Criteria not live");
    const draft = { version: 2, status: "draft" } as FundingProgramCatalogItem["draft_versions"][number];
    expect(programLifecycleLabel({ ...program, draft_versions: [draft] })).toBe("Draft v2 saved");
    expect(programLifecycleDetail({ ...program, draft_versions: [draft] })).toBe("Criteria not live");
    const live = { version: 1, rules: JSON.parse(validRules) } as FundingProgramCatalogItem["published_version"];
    expect(programLifecycleLabel({ ...program, published_version: live })).toBe("Published v1");
    expect(programLifecycleDetail({ ...program, published_version: live, draft_versions: [draft] })).toBe("Published v1 remains live");
    expect(programLifecycleLabel({ ...program, status: "retired", draft_versions: [draft] })).toBe("Retired");
  });
  it("ignores stale drafts older than the live version and selects the newest advancing draft", () => {
    const program = { status: "active", draft_versions: [], published_version: null } as unknown as FundingProgramCatalogItem;
    const staleV1 = { version: 1, status: "draft" } as FundingProgramCatalogItem["draft_versions"][number];
    const liveV2 = { version: 2, rules: JSON.parse(validRules) } as FundingProgramCatalogItem["published_version"];
    const newV3 = { version: 3, status: "draft" } as FundingProgramCatalogItem["draft_versions"][number];

    const staleOnly = { ...program, published_version: liveV2, draft_versions: [staleV1] };
    expect(currentProgramDraft(staleOnly)).toBeNull();
    expect(programLifecycleLabel(staleOnly)).toBe("Published v2");
    expect(programLifecycleDetail(staleOnly)).toBeNull();

    const advancing = { ...staleOnly, draft_versions: [staleV1, newV3] };
    expect(currentProgramDraft(advancing)).toBe(newV3);
    expect(programLifecycleLabel(advancing)).toBe("Draft v3 saved");
    expect(programLifecycleDetail(advancing)).toBe("Published v2 remains live");
  });
  it("matches newly added requirements to the defaults materialized by the backend", () => {
    const first = newRequirement("Tax returns", []);
    const second = newRequirement("Bank statements", [first]);
    const hydrated = [second, first].map((row) => ({
      ...row,
      applies_when: null,
      expiration_days: null,
      ai_request_message_template: null,
      review_checks: [],
    }));
    expect(requirementsEquivalentForRecovery(JSON.stringify([first, second]), JSON.stringify(hydrated))).toBe(true);
  });
  it("matches backend-trimmed document checks and their forced staff-review gate", () => {
    const pending = [{
      ...newRequirement("  Tax returns  ", []),
      verification_required: false,
      completion_mode: "ai_can_complete",
      review_checks: [{ key: "custom_1", label: "  Stable earnings  ", instructions: "  Compare both years.  " }],
    }];
    const hydrated = [{
      ...newRequirement("Tax returns", []),
      applies_when: null,
      expiration_days: null,
      ai_request_message_template: null,
      verification_required: true,
      completion_mode: "requires_human_verify",
      review_checks: [{ key: "custom_1", label: "Stable earnings", instructions: "Compare both years.", severity: "review" }],
    }];
    expect(requirementsEquivalentForRecovery(JSON.stringify(pending), JSON.stringify(hydrated))).toBe(true);
    expect(requirementsEquivalentForRecovery("not json", "not json")).toBe(false);
    expect(requirementsEquivalentForRecovery(JSON.stringify([{ ...pending[0], category: null }]), JSON.stringify(hydrated))).toBe(false);
    expect(requirementsEquivalentForRecovery(JSON.stringify(pending), JSON.stringify([{ ...hydrated[0], label: "Different document" }]))).toBe(false);
  });
});
