export type FitCondition = { field: string; op: string; value?: unknown };
export type SimpleFit = { mode: "all" | "any"; conditions: FitCondition[] };

export const FIT_FIELDS: Array<{ key: string; label: string; type: "number" | "boolean" | "text"; hint?: string }> = [
  { key: "requested_amount", label: "Requested funding ($)", type: "number" },
  { key: "annual_revenue", label: "Annual revenue ($)", type: "number" },
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
  return { ...requirement, completion_mode: mode, ...(mode === "requires_human_verify" ? { verification_required: true } : {}) };
}

export function validateEditorContent(rulesText: string, requirementsText: string): string | null {
  try {
    const rules: unknown = JSON.parse(rulesText);
    const requirements: unknown = JSON.parse(requirementsText);
    if (!objectValue(rules)) return "Eligibility rules must be an object. Open advanced settings to repair the imported rules.";
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
      const field = FIT_FIELDS.find((row) => row.key === node.field);
      if (["gte", "lte", "gt", "lt"].includes(String(node.op)) || (node.op === "eq" && field?.type === "number")) {
        if (typeof node.value !== "number" || !Number.isFinite(node.value)) return `Enter a numeric threshold for ${field?.label || node.field}.`;
      }
      if (node.op === "in" && (!Array.isArray(node.value) || node.value.length > 100)) return "A list condition requires a list of up to 100 values.";
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
    }
    return null;
  } catch { return "Advanced rules contain invalid JSON. Correct them before saving."; }
}
