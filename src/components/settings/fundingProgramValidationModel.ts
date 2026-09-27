import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { FIT_FIELDS, industryPrefixes, objectValue, readDocumentReviewChecks, readSimpleFit, validateEditorContent } from "./fundingProgramEditorModel";

export type ProgramValidationIssue = { target: string; message: string; area: "criteria" | "catalog" | "review" | "publish"; routeIndex?: number; step?: boolean };
export type ProgramValidationAction = "catalog" | "draft" | "publish" | "status";
export const WORKSPACE_LABELS: Record<string, string> = { dealer: "Auto dealerships", main_street: "Main Street businesses", real_estate: "Real estate", mca: "MCA refinance" };

export function programLifecycleLabel(program: FundingProgramCatalogItem): string {
  if (program.status === "retired") return "Retired";
  const draft = program.draft_versions[0];
  if (draft) return `Draft v${draft.version} saved`;
  return program.published_version?.rules.fit ? `Published v${program.published_version.version}` : "Criteria not live";
}

export function programLifecycleDetail(program: FundingProgramCatalogItem): string | null {
  if (program.status === "retired" || !program.draft_versions.length) return null;
  return program.published_version?.rules.fit ? `Published v${program.published_version.version} remains live` : "Criteria not live";
}

/** Field-addressable feedback without changing saved rules or inventing eligibility. */
export function criteriaValidationIssues(rulesText: string, requirementsText: string): ProgramValidationIssue[] {
  const issues: ProgramValidationIssue[] = [];
  const add = (target: string, message: string) => issues.push({ target, message, area: "criteria" });
  let rules: unknown; let requirements: unknown;
  try { rules = JSON.parse(rulesText); } catch { add("Eligibility rules JSON", "Eligibility rules contain invalid JSON. Correct the highlighted editor before saving."); }
  if (rules !== undefined) {
    if (!objectValue(rules)) add("Eligibility rules JSON", "Eligibility rules must be an object.");
    else {
      const fit = readSimpleFit(rules);
      if (fit) fit.conditions.forEach((condition, index) => {
        const field = FIT_FIELDS.find((row) => row.key === condition.field)!;
        if (condition.op !== "present" && (condition.value == null || condition.value === "" || (field.type === "number" && !Number.isFinite(condition.value)))) {
          add(`Check ${index + 1} ${condition.field === "vertical" ? "workspace" : field.type === "boolean" ? "required answer" : "threshold"}`, `Check ${index + 1}: ${field.type === "number" ? "enter a numeric threshold" : "choose a value"} for ${field.label}.`);
        }
      });
      const error = validateEditorContent(rulesText, "[]");
      if (error && !issues.length) add("Eligibility rules JSON", error);
    }
  }
  try { requirements = JSON.parse(requirementsText); } catch { add("Document requirements JSON", "Document requirements contain invalid JSON. Correct the highlighted editor before saving."); }
  if (requirements !== undefined) {
    if (!Array.isArray(requirements) || !requirements.every(objectValue)) add("Document requirements JSON", "Document requirements must be a list of requirements.");
    else {
      const seen = new Set<string>();
      if (requirements.length > 100) add("Document requirements JSON", "Keep at most 100 document requirements per version.");
      requirements.forEach((row, index) => {
        const prefix = `Requirement ${index + 1}`;
        const key = typeof row.requirement_key === "string" ? row.requirement_key : "";
        if (!/^[a-z0-9_]{2,120}$/.test(key) || seen.has(key)) add("Document requirements JSON", `${prefix}: use a valid, unique document reference in Advanced settings.`);
        const bankPeriod = /^business_bank_statements_(\d+)_months$/.exec(key);
        const taxPeriod = /^business_tax_returns_(\d+)_years$/.exec(key);
        if (bankPeriod && (Number(bankPeriod[1]) < 1 || Number(bankPeriod[1]) > 60)) add("Document requirements JSON", `${prefix}: bank-statement references must specify 1 to 60 months.`);
        if (taxPeriod && (Number(taxPeriod[1]) < 1 || Number(taxPeriod[1]) > 10)) add("Document requirements JSON", `${prefix}: tax-return references must specify 1 to 10 years.`);
        seen.add(key);
        if (typeof row.label !== "string" || row.label.trim().length < 2 || row.label.length > 200) add(`${prefix} name`, `${prefix}: enter a document name between 2 and 200 characters.`);
        const categories = new Set(["borrower_info", "property_data", "financials", "credit", "agreements", "insurance", "title_and_escrow", "appraisal_and_inspection", "scheduling", "compliance", "communication", "ai_internal"]);
        const levels = new Set(["required", "recommended", "optional"]);
        const stages = new Set(["prequalification", "term_sheet", "underwriting", "closing", "showings", "listed"]);
        const audiences = new Set(["agent", "borrower", "underwriter"]);
        const completionModes = new Set(["ai_can_complete", "requires_human_verify", "borrower_self_attest"]);
        if (row.category !== undefined && !categories.has(String(row.category))) add(`${prefix} category`, `${prefix}: choose a supported document category.`);
        if (row.required_level !== undefined && !levels.has(String(row.required_level))) add(`${prefix} importance`, `${prefix}: choose Required, Recommended, or Optional.`);
        if (row.blocks_stage !== undefined && row.blocks_stage !== null && !stages.has(String(row.blocks_stage))) add(`${prefix} required stage`, `${prefix}: choose a supported stage or no stage restriction.`);
        if (row.visibility !== undefined && (!Array.isArray(row.visibility) || row.visibility.length < 1 || row.visibility.length > 3 || row.visibility.some((value) => !audiences.has(String(value))))) add(`${prefix} audience`, `${prefix}: choose one to three supported audiences.`);
        if (row.completion_mode !== undefined && !completionModes.has(String(row.completion_mode))) add(`${prefix} completion permission`, `${prefix}: choose who may complete this requirement.`);
        if (row.applies_when !== undefined && row.applies_when !== null && !objectValue(row.applies_when)) add("Document requirements JSON", `${prefix}: the conditional rule must be an object or blank.`);
        if (row.can_underwriter_waive !== undefined && typeof row.can_underwriter_waive !== "boolean") add("Document requirements JSON", `${prefix}: the underwriter-waiver setting must be true or false.`);
        if (row.verification_required !== undefined && typeof row.verification_required !== "boolean") add("Document requirements JSON", `${prefix}: the verification setting must be true or false.`);
        if (row.expiration_days != null && (!Number.isInteger(row.expiration_days) || Number(row.expiration_days) < 1 || Number(row.expiration_days) > 3650)) add(`${prefix} expiration days`, `${prefix}: expiration must be a whole number from 1 to 3,650 days, or blank.`);
        if (row.display_order !== undefined && (!Number.isInteger(row.display_order) || Number(row.display_order) < 0 || Number(row.display_order) > 10000)) add("Document requirements JSON", `${prefix}: display order must be a whole number from 0 to 10,000.`);
        if (row.objective_text !== undefined && (typeof row.objective_text !== "string" || row.objective_text.length > 2000)) add(`${prefix} review objective`, `${prefix}: keep the review objective within 2,000 characters.`);
        if (row.completion_criteria !== undefined && (typeof row.completion_criteria !== "string" || row.completion_criteria.length > 4000)) add(`${prefix} completion criteria`, `${prefix}: keep the document instructions within 4,000 characters.`);
        if (row.ai_request_message_template !== undefined && row.ai_request_message_template !== null && (typeof row.ai_request_message_template !== "string" || row.ai_request_message_template.length > 4000)) add(`${prefix} client request wording`, `${prefix}: keep the client request wording within 4,000 characters.`);
        const checks = readDocumentReviewChecks(row);
        if (!checks || checks.length > 20) add("Document requirements JSON", `${prefix}: use up to 20 supported document checks in Advanced settings.`);
        else {
          const checkKeys = new Set<string>();
          checks.forEach((check, checkIndex) => {
            const checkPrefix = `${prefix} check ${checkIndex + 1}`;
            if (checkKeys.has(check.key)) add("Document requirements JSON", `${checkPrefix}: each document check needs a unique reference.`);
            checkKeys.add(check.key);
            if (check.label.trim().length < 2 || check.label.trim().length > 160) add(`${checkPrefix} name`, `${checkPrefix}: enter a name between 2 and 160 characters.`);
            if (!check.instructions.trim() || check.instructions.trim().length > 2000) add(`${checkPrefix} instructions`, `${checkPrefix}: describe what staff should look for (up to 2,000 characters).`);
          });
        }
      });
      const error = validateEditorContent("{}", requirementsText);
      if (error && !issues.some((issue) => issue.target.startsWith("Requirement") || issue.target === "Document requirements JSON")) add("Document requirements JSON", error);
    }
  }
  return issues;
}

export function catalogValidationIssues(catalog: { name: string; description: string; order: string; scopes: FundingProgramScope[] }): ProgramValidationIssue[] {
  const issues: ProgramValidationIssue[] = [];
  const add = (target: string, message: string, routeIndex?: number) => issues.push({ target, message, area: "catalog" as const, ...(routeIndex === undefined ? {} : { routeIndex }) });
  if (catalog.name.trim().length < 2 || catalog.name.trim().length > 160) add("Program name", "Enter a program name between 2 and 160 characters.");
  if (catalog.description.length > 1000) add("Short description", "Keep the short description within 1,000 characters.");
  if (!catalog.order.trim() || !Number.isInteger(Number(catalog.order)) || Number(catalog.order) < 0 || Number(catalog.order) > 10000) add("Display order", "Enter a display order from 0 to 10,000 (whole numbers only).");
  if (!catalog.scopes.length) add("Program workspaces", "Choose at least one workspace where this program can appear.");
  const routeKeys = new Set<string>();
  catalog.scopes.forEach((scope, index) => {
    const label = WORKSPACE_LABELS[scope.vertical] || scope.vertical;
    const routeReference = scope.scope_key.trim();
    const route = `${scope.vertical}:${routeReference}`;
    if (!routeReference || routeReference.length > 80 || routeKeys.has(route)) add(`${label} route reference`, `${label}: enter a unique route reference between 1 and 80 characters.`, index);
    routeKeys.add(route);
    for (const [values, maximum, target, description] of [
      [scope.intake_variants, 20, `${label} intake variants`, "intake variants"],
      [scope.intent_keys, 30, `${label} funding intent references`, "funding intent references"],
      [scope.industry_keys, 30, `${label} allowed industry references`, "industry references"],
      [scope.required_fact_keys, 20, `${label} business circumstance references`, "business circumstance references"],
    ] as const) {
      if (values.length > maximum || values.some((value) => !String(value).trim())) add(target, `${label}: use at most ${maximum} nonblank ${description}.`, index);
    }
    for (const [codes, target] of [[scope.naics_prefixes, `${label} allowed NAICS prefixes`], [scope.excluded_naics_prefixes ?? [], "Prohibited industries"]] as const) {
      if (codes.length > 30 || codes.some((code) => !industryPrefixes(code).length) || new Set(codes.flatMap(industryPrefixes)).size > 100) add(target, `${label}: review the industry codes; use up to 30 valid codes with at most 100 expanded prefixes.`, index);
    }
  });
  return issues;
}

export function publishValidationIssues({ rules, savedDraft, criteriaDirty, catalogDirty }: { rules: string; savedDraft: boolean; criteriaDirty: boolean; catalogDirty: boolean }): ProgramValidationIssue[] {
  const issues: ProgramValidationIssue[] = [];
  try { if (!objectValue(JSON.parse(rules)) || !JSON.parse(rules).fit) issues.push({ target: "Eligibility checks", message: "Add at least one approved eligibility check before publishing. A document list alone cannot establish fit.", area: "publish" }); } catch { /* The precise JSON error is reported by criteria validation. */ }
  try {
    const parsed = JSON.parse(rules);
    const unresolved = parsed.unresolved_review_items;
    const hasUnresolved = Array.isArray(unresolved) ? unresolved.length > 0 : objectValue(unresolved) ? Object.keys(unresolved).length > 0 : Boolean(unresolved);
    if (hasUnresolved) {
      const count = Array.isArray(unresolved) ? unresolved.length : 1;
      issues.push({ target: Array.isArray(unresolved) ? "Imported items to resolve" : "Eligibility rules JSON", message: Array.isArray(unresolved) ? `Review and resolve ${count} imported ${count === 1 ? "item" : "items"} before publishing.` : "Imported review items must be a list and must be resolved before publishing.", area: "publish" });
    }
  } catch { /* Already reported by criteria validation. */ }
  if (catalogDirty) issues.push({ target: "Save details & availability", message: "Save the program details and availability before publishing.", area: "publish", step: true });
  if (criteriaDirty || !savedDraft) issues.push({ target: "Save criteria as draft", message: "Save the criteria as a draft before publishing.", area: "publish", step: true });
  return issues;
}
