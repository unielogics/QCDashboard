import type { FundingProgramReviewCheck, FundingProgramScope } from "@/lib/fundingPrograms";

export type FitCondition = { field: string; op: string; value?: unknown };
export type SimpleFit = { mode: "all" | "any"; conditions: FitCondition[] };

export const FIT_FIELDS: Array<{ key: string; label: string; type: "number" | "boolean" | "text"; hint?: string }> = [
  { key: "requested_amount", label: "Requested funding ($)", type: "number" },
  { key: "use_of_funds_total", label: "Total planned funding uses ($)", type: "number" },
  { key: "real_estate_equipment_amount", label: "Real estate and equipment uses ($)", type: "number" },
  { key: "real_estate_equipment_pct", label: "Real estate and equipment share (%)", type: "number" },
  { key: "use_of_funds_complete", label: "Funding-use breakdown complete", type: "boolean" },
  { key: "annual_revenue", label: "Annual revenue ($)", type: "number" },
  { key: "gross_margin_pct", label: "Gross margin (%)", type: "number", hint: "Latest confirmed source-period snapshot only." },
  { key: "net_margin_pct", label: "Net margin (%)", type: "number", hint: "Latest confirmed source-period snapshot only." },
  { key: "annualized_deposits", label: "Annualized bank deposits ($)", type: "number" },
  { key: "business_age_years", label: "Time in business (years)", type: "number" },
  { key: "credit_score", label: "Credit score", type: "number" },
  { key: "dscr", label: "Debt service coverage ratio", type: "number" },
  { key: "cash_flow", label: "Cash flow ($)", type: "number" },
  { key: "debt_burden", label: "Debt balance ($)", type: "number" },
  { key: "liquid_assets", label: "Liquid assets ($)", type: "number" },
  { key: "bank_statement_months", label: "Accepted bank statement months", type: "number" },
  { key: "tax_return_years", label: "Accepted tax return years", type: "number" },
  { key: "nsf_or_overdraft_count", label: "NSF / overdraft count", type: "number" },
  { key: "declared_collateral", label: "Real estate collateral declared", type: "boolean" },
  { key: "mca_obligations_present", label: "Existing merchant cash advances", type: "boolean" },
  { key: "floorplan_inventory_present", label: "Floorplan / inventory declared", type: "boolean" },
  { key: "equipment_financing_intent", label: "Equipment financing requested", type: "boolean" },
  { key: "tax_returns_available", label: "Accepted tax returns available", type: "boolean" },
  { key: "bank_statements_available", label: "Accepted bank statements available", type: "boolean" },
  { key: "vertical", label: "Workspace", type: "text" },
  { key: "entity_type", label: "Business entity type", type: "text" },
  { key: "loan_purpose", label: "Funding purpose", type: "text" },
  { key: "revenue", label: "Revenue ($)", type: "number" },
  { key: "deposits", label: "Bank deposits ($)", type: "number" },
  { key: "estimated_credit_score", label: "Estimated credit score", type: "number" },
];

export function objectValue(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** Only offer the simple builder when it can round-trip the complete fit tree. */
export function readSimpleFit(rules: Record<string, unknown>): SimpleFit | null {
  if (!("fit" in rules)) return { mode: "all", conditions: [] };
  const fit = rules.fit;
  if (!objectValue(fit)) return null;
  function condition(value: unknown): value is FitCondition {
    if (!objectValue(value) || Object.keys(value).some((key) => !["field", "op", "value"].includes(key))) return false;
    const field = FIT_FIELDS.find((row) => row.key === value.field);
    if (!field || !["present", "eq", "gte", "lte", "gt", "lt"].includes(String(value.op))) return false;
    if (value.op === "present") return !("value" in value);
    if (field.type === "number") return value.value === "" || (typeof value.value === "number" && Number.isFinite(value.value));
    return value.op === "eq" && typeof value.value === (field.type === "text" ? "string" : "boolean");
  }
  if (condition(fit)) return { mode: "all", conditions: [{ ...fit }] };
  const mode = "all" in fit ? "all" : "any" in fit ? "any" : null;
  if (!mode || Object.keys(fit).length !== 1 || !Array.isArray(fit[mode]) || !fit[mode].length || !fit[mode].every(condition)) return null;
  return { mode, conditions: (fit[mode] as FitCondition[]).map((row) => ({ ...row })) };
}

export function writeSimpleFit(rules: Record<string, unknown>, fit: SimpleFit): Record<string, unknown> {
  const next = { ...rules };
  if (fit.conditions.length) next.fit = { [fit.mode]: fit.conditions };
  else delete next.fit;
  return next;
}

export function jsonEquivalent(left: string, right: string): boolean {
  function stable(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(stable);
    if (objectValue(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
    return value;
  }
  try { return JSON.stringify(stable(JSON.parse(left))) === JSON.stringify(stable(JSON.parse(right))); }
  catch { return left === right; }
}

export const EVIDENCE_TEMPLATES = [
  { key: "business_bank_statements_6_months", label: "Last 6 months business bank statements", category: "financials" },
  { key: "business_tax_returns_2_years", label: "Last 2 years business tax returns", category: "financials" },
  { key: "ytd_p_and_l_balance_sheet", label: "Year-to-date P&L and balance sheet", category: "financials" },
  { key: "business_debt_schedule", label: "Business debt schedule", category: "financials" },
  { key: "owner_personal_financial_statement", label: "Personal financial statement", category: "financials" },
  { key: "business_license", label: "Business / dealer license", category: "compliance" },
  { key: "entity_or_vesting", label: "Business formation documents", category: "borrower_info" },
  { key: "equipment_quote", label: "Equipment quote or invoice", category: "financials" },
  { key: "real_estate_schedule", label: "Real estate schedule", category: "property_data" },
];

export function newRequirement(label: string, existing: Array<Record<string, unknown>>, key = "custom_requirement", category = "financials"): Record<string, unknown> {
  let unique = key;
  let number = 2;
  while (existing.some((row) => row.requirement_key === unique)) unique = `${key}_${number++}`;
  return { requirement_key: unique, label, category, required_level: "required", blocks_stage: "underwriting", visibility: ["agent", "borrower", "underwriter"], can_underwriter_waive: true, verification_required: false, completion_mode: "ai_can_complete", display_order: existing.length, objective_text: "", completion_criteria: "" };
}

export function setRequirementCompletionMode(requirement: Record<string, unknown>, mode: string): Record<string, unknown> {
  const effectiveMode = mode === "borrower_self_attest" && Array.isArray(requirement.review_checks) && requirement.review_checks.length ? "requires_human_verify" : mode;
  // Called only for an explicit completion-policy choice, not unrelated field edits.
  return { ...requirement, completion_mode: effectiveMode, verification_required: effectiveMode === "requires_human_verify" };
}

export const DOCUMENT_REVIEW_PRESETS: FundingProgramReviewCheck[] = [
  { key: "net_income_nonnegative", label: "No negative earnings", instructions: "Check that reported net income is zero or positive in each covered period. Record the figures and periods; flag missing or unclear amounts for staff review.", severity: "review" },
  { key: "net_income_not_declining", label: "Earnings are not declining", instructions: "Compare net income across consecutive, comparable periods. Identify any year-over-year decline and cite the figures. Missing or incomparable periods require staff review.", severity: "review" },
  { key: "revenue_not_declining", label: "Revenue is not declining", instructions: "Compare revenue across comparable covered periods. Flag a downward trend and cite the figures and periods. Do not infer a trend when data is missing.", severity: "review" },
  { key: "no_mca_debits", label: "No MCA debit patterns", instructions: "Review bank transactions for suspected merchant cash advance payments, including recurring daily or weekly debits. Flag possible matches and uncertainty for staff verification; do not treat an unclear debit as a confirmed MCA.", severity: "review" },
  { key: "no_nsf", label: "No NSF / overdraft activity", instructions: "Check all covered statements for NSF fees, returned payments, and overdraft activity. Identify dates, counts, and amounts for staff verification.", severity: "review" },
  { key: "positive_ending_balance", label: "Positive ending balances", instructions: "Check that each covered statement has an ending balance above zero. Record each period and balance; missing pages or balances require staff review.", severity: "review" },
];

export function withDocumentReviewChecks(requirement: Record<string, unknown>, checks: FundingProgramReviewCheck[]): Record<string, unknown> {
  const next = { ...requirement, review_checks: checks };
  return checks.length && requirement.completion_mode === "borrower_self_attest" ? setRequirementCompletionMode(next, "requires_human_verify") : next;
}

export function newCustomDocumentReviewCheck(existing: FundingProgramReviewCheck[]): FundingProgramReviewCheck {
  let suffix = 1;
  while (existing.some((row) => row.key === `custom_${suffix}`)) suffix++;
  return { key: `custom_${suffix}`, label: "", instructions: "", severity: "review" };
}

export function readDocumentReviewChecks(requirement: Record<string, unknown>): FundingProgramReviewCheck[] | null {
  if (requirement.review_checks == null) return [];
  if (!Array.isArray(requirement.review_checks)) return null;
  const keys = new Set<string>([...DOCUMENT_REVIEW_PRESETS.map((row) => row.key), "custom"]);
  if (!requirement.review_checks.every((row) => objectValue(row) && (keys.has(String(row.key)) || /^custom_[a-z0-9_]{1,64}$/.test(String(row.key))) && typeof row.label === "string" && typeof row.instructions === "string" && ["review", "block"].includes(String(row.severity)) && Object.keys(row).every((key) => ["key", "label", "instructions", "severity"].includes(key)))) return null;
  return requirement.review_checks as FundingProgramReviewCheck[];
}

export function industryPrefixes(code: string | null | undefined): string[] {
  if (!code) return [];
  if (/^\d{2,6}$/.test(code)) return [code];
  const range = /^(\d{2,6})-(\d{2,6})$/.exec(code);
  if (!range || range[1].length !== range[2].length || Number(range[2]) < Number(range[1]) || Number(range[2]) - Number(range[1]) > 20) return [];
  return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, index) => String(Number(range[1]) + index).padStart(range[1].length, "0"));
}

export function sharedIndustryExclusions(scopes: FundingProgramScope[]): { codes: string[]; differs: boolean } {
  const normalized = scopes.map((scope) => [...new Set(scope.excluded_naics_prefixes ?? [])].sort());
  return { codes: [...new Set(normalized.flat())].sort(), differs: normalized.some((codes) => JSON.stringify(codes) !== JSON.stringify(normalized[0])) };
}

export function applySharedIndustryExclusions(scopes: FundingProgramScope[], codes: string[]): FundingProgramScope[] {
  const excluded = [...new Set(codes)];
  return scopes.map((scope) => ({ ...scope, excluded_naics_prefixes: [...excluded] }));
}

export function baselineReferenceFromRules(rulesText: string): { version: string; source_urls: string[]; source_notes: string[] } | null {
  try {
    const rules: unknown = JSON.parse(rulesText);
    if (!objectValue(rules) || !objectValue(rules.baseline) || typeof rules.baseline.version !== "string" || !rules.baseline.version.trim()) return null;
    const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
    return { version: rules.baseline.version, source_urls: strings(rules.baseline.source_urls), source_notes: strings(rules.baseline.source_notes) };
  } catch { return null; }
}

export function baselineNoteGroups(notes: string[]): { website: string[]; proposed: string[]; review: string[] } {
  const groups = { website: [] as string[], proposed: [] as string[], review: [] as string[] };
  for (const note of notes) {
    if (/^website:/i.test(note)) groups.website.push(note.replace(/^website:\s*/i, ""));
    else if (/^proposed qc policy:/i.test(note)) groups.proposed.push(note.replace(/^proposed qc policy:\s*/i, ""));
    else groups.review.push(note.replace(/^review:\s*/i, ""));
  }
  return groups;
}

export function validateEditorContent(rulesText: string, requirementsText: string): string | null {
  try {
    const rules: unknown = JSON.parse(rulesText);
    const requirements: unknown = JSON.parse(requirementsText);
    if (!objectValue(rules)) return "Eligibility rules must be an object. Open advanced settings to repair the imported rules.";
    if ("fit" in rules && (rules.priority !== undefined && (!Number.isInteger(rules.priority) || Number(rules.priority) < -10000 || Number(rules.priority) > 10000))) return "Program priority must be a whole number from -10,000 to 10,000.";
    let count = 0;
    function validateNode(node: unknown, depth = 0): string | null {
      if (++count > 100 || depth > 8) return "The eligibility rules exceed the supported number or nesting depth of checks.";
      if (!objectValue(node) || !Object.keys(node).length) return "Each eligibility check must contain a condition.";
      const groups = ["all", "any", "not"].filter((key) => key in node);
      if (groups.length) {
        if (groups.length !== 1 || Object.keys(node).length !== 1) return "A group of eligibility checks must use one matching mode.";
        const key = groups[0];
        if (key === "not") return validateNode(node.not, depth + 1);
        if (!Array.isArray(node[key]) || !node[key].length) return "Add a check to each eligibility group, or remove the empty group.";
        for (const child of node[key]) { const error = validateNode(child, depth + 1); if (error) return error; }
        return null;
      }
      if (Object.keys(node).some((key) => !["field", "op", "value"].includes(key)) || typeof node.field !== "string" || !node.field || node.field.length > 120) return "An eligibility check contains an invalid field. Review advanced settings.";
      if (!["present", "eq", "in", "gte", "lte", "gt", "lt", "evidence_available"].includes(String(node.op))) return "An eligibility check uses an unsupported condition.";
      const supportedFields = new Set(["vertical", "intake_variant", "intent", "intent_kind", "funding_category", "entity_type", "industry", "subindustry", "industry_key", "naics_code", "loan_purpose", "requested_amount", "business_age_years", "revenue", "annual_revenue", "gross_margin_pct", "net_margin_pct", "annualized_deposits", "deposits", "bank_statement_months", "tax_return_years", "nsf_or_overdraft_count", "credit_score", "estimated_credit_score", "dscr", "cash_flow", "debt_burden", "liquid_assets", "tax_returns_available", "bank_statements_available", "evidence_count", "declared_collateral", "mca_obligations_present", "floorplan_inventory_present", "equipment_financing_intent"]);
      if (node.op !== "evidence_available" && !supportedFields.has(node.field) && !["use_of_funds_total", "real_estate_equipment_amount", "real_estate_equipment_pct", "use_of_funds_complete"].includes(node.field)) return `Unsupported eligibility field: ${node.field}. Review Advanced settings.`;
      if (node.op === "present" && "value" in node) return "A 'must be provided' check must not contain a value. Remove its value in Advanced settings.";
      if (node.op === "evidence_available" && node.value != null && (typeof node.value !== "string" || !node.value.trim())) return "An evidence availability check needs a nonblank document classification, or no value.";
      const field = FIT_FIELDS.find((row) => row.key === node.field);
      if (["gte", "lte", "gt", "lt"].includes(String(node.op)) || (node.op === "eq" && field?.type === "number")) {
        if (typeof node.value !== "number" || !Number.isFinite(node.value)) return `Enter a numeric threshold for ${field?.label || node.field}.`;
      }
      if (node.op === "in" && (!Array.isArray(node.value) || !node.value.length || node.value.length > 100)) return "A list condition requires between 1 and 100 values.";
      if (["eq", "in"].includes(String(node.op)) && (node.value == null || node.value === "")) return `Choose a value for ${field?.label || node.field}.`;
      return null;
    }
    if ("fit" in rules) { const error = validateNode(rules.fit); if (error) return error; }
    if (!Array.isArray(requirements) || !requirements.every(objectValue)) return "Document requirements must be a list of requirements.";
    const keys = new Set<string>();
    for (const row of requirements) {
      const key = String(row.requirement_key ?? "");
      if (!/^[a-z0-9_]{2,120}$/.test(key)) return "Each document requirement needs a valid unique reference.";
      if (keys.has(key)) return "Two document requirements use the same reference. Remove the duplicate or change its advanced reference.";
      keys.add(key);
      if (String(row.label ?? "").trim().length < 2) return "Give every document requirement a name before saving.";
      if (Array.isArray(row.visibility) && !row.visibility.length) return "Choose at least one audience for each document requirement.";
      if (row.review_checks != null) {
        const checks = readDocumentReviewChecks(row);
        if (!checks || checks.length > 20) return "Document checks need a supported type, instructions, and review level (up to 20 checks per document).";
        if (checks.length && row.completion_mode === "borrower_self_attest") return "Document review checks cannot be self-attested. Choose AI evidence review or staff verification.";
        const checkKeys = new Set<string>();
        for (const check of checks) {
          if (checkKeys.has(check.key)) return "Document check references must be unique. Each preset can be added once; add a separate custom check for other conditions.";
          checkKeys.add(check.key);
          if (check.label.trim().length < 2 || check.label.trim().length > 160) return "Give each document check a name between 2 and 160 characters.";
          if (!check.instructions.trim() || check.instructions.trim().length > 2000) return "Describe what to look for in each document check (up to 2,000 characters).";
        }
      }
    }
    return null;
  } catch { return "Advanced rules contain invalid JSON. Correct them before saving."; }
}
