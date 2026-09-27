import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { FIT_FIELDS, industryPrefixes, jsonEquivalent, objectValue, readDocumentReviewChecks, readSimpleFit, validateEditorContent } from "./fundingProgramEditorModel";

export type ProgramValidationIssue = { target: string; message: string; area: "criteria" | "catalog" | "review" | "publish"; routeIndex?: number; section?: "details" | "availability" | "criteria" | "review"; fieldLabel?: string };
export type ProgramValidationAction = "save" | "publish" | "status";
export const WORKSPACE_LABELS: Record<string, string> = { dealer: "Auto dealerships", main_street: "Main Street businesses", real_estate: "Real estate", mca: "MCA refinance" };

/** Return only the newest unpublished work that advances the live criteria. */
export function currentProgramDraft(program: FundingProgramCatalogItem): FundingProgramCatalogItem["draft_versions"][number] | null {
  const publishedVersion = program.published_version?.version ?? 0;
  return program.draft_versions.reduce<FundingProgramCatalogItem["draft_versions"][number] | null>((latest, draft) => {
    if (draft.version <= publishedVersion) return latest;
    return !latest || draft.version > latest.version ? draft : latest;
  }, null);
}

const REQUIREMENT_CATEGORIES = new Set(["borrower_info", "property_data", "financials", "credit", "agreements", "insurance", "title_and_escrow", "appraisal_and_inspection", "scheduling", "compliance", "communication", "ai_internal"]);
const REQUIREMENT_LEVELS = new Set(["required", "recommended", "optional"]);
const REQUIREMENT_STAGES = new Set(["prequalification", "term_sheet", "underwriting", "closing", "showings", "listed"]);
const REQUIREMENT_AUDIENCES = new Set(["agent", "borrower", "underwriter"]);
const REQUIREMENT_COMPLETION_MODES = new Set(["ai_can_complete", "requires_human_verify", "borrower_self_attest"]);

/** Mirror the API's requirement defaults/materialization for interrupted-save recovery. */
function canonicalRequirementsForRecovery(text: string): Array<Record<string, unknown>> | null {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(parsed) || parsed.length > 100 || !parsed.every(objectValue)) return null;
  const keys = new Set<string>();
  const canonical: Array<Record<string, unknown>> = [];
  for (const row of parsed) {
    const key = row.requirement_key;
    const label = row.label;
    if (typeof key !== "string" || !/^[a-z0-9_]{2,120}$/.test(key) || keys.has(key) || typeof label !== "string") return null;
    keys.add(key);
    const trimmedLabel = label.trim();
    if (trimmedLabel.length < 2 || trimmedLabel.length > 200) return null;
    const category = row.category === undefined ? "financials" : row.category;
    const requiredLevel = row.required_level === undefined ? "required" : row.required_level;
    const blocksStage = row.blocks_stage === undefined ? "underwriting" : row.blocks_stage;
    const visibility = row.visibility === undefined ? ["borrower", "underwriter"] : row.visibility;
    const canWaive = row.can_underwriter_waive === undefined ? true : row.can_underwriter_waive;
    const verificationRequired = row.verification_required === undefined ? false : row.verification_required;
    const expirationDays = row.expiration_days === undefined ? null : row.expiration_days;
    const requestTemplate = row.ai_request_message_template === undefined ? null : row.ai_request_message_template;
    const displayOrder = row.display_order === undefined ? 0 : row.display_order;
    const objectiveText = row.objective_text === undefined ? "" : row.objective_text;
    const completionCriteria = row.completion_criteria === undefined ? "" : row.completion_criteria;
    const completionMode = row.completion_mode === undefined ? "ai_can_complete" : row.completion_mode;
    const appliesWhen = row.applies_when === undefined ? null : row.applies_when;
    if (!REQUIREMENT_CATEGORIES.has(String(category)) || !REQUIREMENT_LEVELS.has(String(requiredLevel))) return null;
    if (blocksStage !== null && !REQUIREMENT_STAGES.has(String(blocksStage))) return null;
    if (!Array.isArray(visibility) || visibility.length < 1 || visibility.length > 3 || visibility.some((value) => !REQUIREMENT_AUDIENCES.has(String(value)))) return null;
    if (typeof canWaive !== "boolean" || typeof verificationRequired !== "boolean" || !REQUIREMENT_COMPLETION_MODES.has(String(completionMode))) return null;
    if (expirationDays !== null && (!Number.isInteger(expirationDays) || Number(expirationDays) < 1 || Number(expirationDays) > 3650)) return null;
    if (requestTemplate !== null && (typeof requestTemplate !== "string" || requestTemplate.length > 4000)) return null;
    if (!Number.isInteger(displayOrder) || Number(displayOrder) < 0 || Number(displayOrder) > 10000) return null;
    if (typeof objectiveText !== "string" || objectiveText.length > 2000 || typeof completionCriteria !== "string" || completionCriteria.length > 4000) return null;
    if (appliesWhen !== null && !objectValue(appliesWhen)) return null;
    const rawChecks = row.review_checks === undefined ? [] : row.review_checks;
    if (!Array.isArray(rawChecks) || rawChecks.length > 20 || !rawChecks.every(objectValue)) return null;
    const checks = rawChecks.map((check) => ({
      key: check.key,
      label: typeof check.label === "string" ? check.label.trim() : check.label,
      instructions: typeof check.instructions === "string" ? check.instructions.trim() : check.instructions,
      severity: check.severity === undefined ? "review" : check.severity,
    }));
    if (!readDocumentReviewChecks({ review_checks: checks }) || new Set(checks.map((check) => check.key)).size !== checks.length) return null;
    if (checks.some((check) => typeof check.label !== "string" || check.label.length < 2 || check.label.length > 160 || typeof check.instructions !== "string" || !check.instructions.length || check.instructions.length > 2000)) return null;
    canonical.push({
      requirement_key: key,
      label: trimmedLabel,
      category,
      required_level: requiredLevel,
      applies_when: appliesWhen,
      blocks_stage: blocksStage,
      visibility,
      can_underwriter_waive: canWaive,
      verification_required: Boolean(verificationRequired || checks.length),
      expiration_days: expirationDays,
      ai_request_message_template: requestTemplate,
      display_order: displayOrder,
      objective_text: objectiveText,
      completion_criteria: completionCriteria,
      completion_mode: checks.length ? "requires_human_verify" : completionMode,
      review_checks: checks,
    });
  }
  return canonical.sort((left, right) => String(left.requirement_key).localeCompare(String(right.requirement_key)));
}

export function requirementsEquivalentForRecovery(leftText: string, rightText: string): boolean {
  const left = canonicalRequirementsForRecovery(leftText);
  const right = canonicalRequirementsForRecovery(rightText);
  return left !== null && right !== null && jsonEquivalent(JSON.stringify(left), JSON.stringify(right));
}

export function programLifecycleLabel(program: FundingProgramCatalogItem): string {
  if (program.status === "retired") return "Retired";
  const draft = currentProgramDraft(program);
  if (draft) return `Draft v${draft.version} saved`;
  return program.published_version?.rules.fit ? `Published v${program.published_version.version}` : "Criteria not live";
}

export function programLifecycleDetail(program: FundingProgramCatalogItem): string | null {
  if (program.status === "retired" || !currentProgramDraft(program)) return null;
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

/** Publication errors describe content to fix. Saving is handled by the action itself. */
export function publishValidationIssues({ rules }: { rules: string }): ProgramValidationIssue[] {
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
  return issues;
}

const REQUIREMENT_FIELD_LABELS: Record<string, string> = {
  name: "Document name", importance: "Required or optional", audience: "Who can see this document", category: "Document category",
  "completion criteria": "What the AI should look for", "completion permission": "Who can accept it", "expiration days": "Expiration",
  "review objective": "Review objective", "client request wording": "Client request", "required stage": "Required before",
};

/** Give each issue a visible section and the document's name instead of a row number alone. */
export function describeValidationIssue(issue: ProgramValidationIssue, requirementsText: string): ProgramValidationIssue {
  let requirements: Array<Record<string, unknown>> = [];
  try { const value = JSON.parse(requirementsText); if (Array.isArray(value)) requirements = value.filter(objectValue); } catch { /* The JSON editor has its own error. */ }
  const match = /^Requirement (\d+)(?: check (\d+))? (.+)$/.exec(issue.target);
  let fieldLabel = issue.target;
  if (match) {
    const row = requirements[Number(match[1]) - 1];
    const document = String(row?.label || `Document ${match[1]}`);
    fieldLabel = match[2]
      ? `${document} · condition ${match[2]} · ${match[3] === "instructions" ? "what to check" : match[3] === "name" ? "condition name" : match[3]}`
      : `${document} · ${REQUIREMENT_FIELD_LABELS[match[3]] || match[3]}`;
  }
  const section = issue.area === "review" ? "review" : issue.area === "catalog"
    ? ["Program name", "Display order", "Short description", "Program details"].includes(issue.target) ? "details" : "availability"
    : "criteria";
  return { ...issue, fieldLabel, section };
}

/** Connect FastAPI validation locations to the same on-screen controls as local checks. */
export function serverValidationIssues(body: unknown, scopes: FundingProgramScope[]): ProgramValidationIssue[] {
  if (!objectValue(body) || !Array.isArray(body.detail)) return [];
  return body.detail.filter(objectValue).flatMap((item): ProgramValidationIssue[] => {
    if (!Array.isArray(item.loc) || typeof item.msg !== "string") return [];
    const loc = item.loc.filter((value) => value !== "body");
    const message = item.msg.replace(/^Value error,\s*/, "");
    if (loc[0] === "reason") return [{ target: "Program review note", message, area: "review" }];
    if (loc[0] === "rules") return [{ target: loc[1] === "unresolved_review_items" && Array.isArray(item.input) ? "Imported items to resolve" : "Eligibility rules JSON", message, area: "criteria" }];
    if (loc[0] === "requirements") {
      const index = typeof loc[1] === "number" ? loc[1] : null;
      const suffix: Record<string, string> = { label: "name", category: "category", required_level: "importance", blocks_stage: "required stage", visibility: "audience", completion_mode: "completion permission", expiration_days: "expiration days", objective_text: "review objective", completion_criteria: "completion criteria", ai_request_message_template: "client request wording" };
      let target = index !== null && suffix[String(loc[2])] ? `Requirement ${index + 1} ${suffix[String(loc[2])]}` : "Document requirements JSON";
      if (index !== null && loc[2] === "review_checks" && typeof loc[3] === "number" && ["label", "instructions", "severity"].includes(String(loc[4]))) target = `Requirement ${index + 1} check ${loc[3] + 1} ${loc[4] === "label" ? "name" : loc[4]}`;
      return [{ target, message, area: "criteria" }];
    }
    if (loc[0] === "scopes") {
      const index = typeof loc[1] === "number" ? loc[1] : null;
      if (index !== null && scopes[index]) {
        const label = WORKSPACE_LABELS[scopes[index].vertical];
        const suffix: Record<string, string> = { scope_key: "route reference", intake_variants: "intake variants", intent_keys: "funding intent references", industry_keys: "allowed industry references", required_fact_keys: "business circumstance references", naics_prefixes: "allowed NAICS prefixes" };
        return [{ target: loc[2] === "excluded_naics_prefixes" ? "Prohibited industries" : suffix[String(loc[2])] ? `${label} ${suffix[String(loc[2])]}` : "Program workspaces", message, area: "catalog", routeIndex: index }];
      }
      return [{ target: "Program workspaces", message, area: "catalog" }];
    }
    const target = ({ name: "Program name", short_description: "Short description", display_order: "Display order" } as Record<string, string>)[String(loc[0])];
    return target ? [{ target, message, area: "catalog" }] : [];
  });
}
