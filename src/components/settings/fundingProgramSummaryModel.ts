import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { FIT_FIELDS, objectValue } from "./fundingProgramEditorModel";
import { currentProgramDraft, WORKSPACE_LABELS } from "./fundingProgramValidationModel";

export type ProgramStatusBadge = { label: string; tone: "ok" | "warn" | "mut" };

/** Published state is independent of unpublished work, including stale sibling drafts. */
export function fundingProgramStatusBadges(program: FundingProgramCatalogItem, unsaved = false): ProgramStatusBadge[] {
  const badges: ProgramStatusBadge[] = [];
  if (program.status === "retired") badges.push({ label: "Retired", tone: "mut" });
  else if (program.published_version?.rules.fit) badges.push({ label: `Published v${program.published_version.version}`, tone: "ok" });
  else badges.push({ label: "Criteria not live", tone: "warn" });
  const draft = currentProgramDraft(program);
  if (draft) badges.push({ label: `Draft v${draft.version} saved`, tone: "warn" });
  if (unsaved) badges.push({ label: "Unsaved changes", tone: "warn" });
  return badges;
}

export type SummaryRule = { text: string; children?: SummaryRule[] };
export type SummaryRoute = { label: string; restrictions: string[]; exclusions: string[] };
export type SummaryDocument = {
  name: string;
  importance: string;
  instructions: string;
  objective: string;
  checks: Array<{ label: string; instructions: string; policy: string }>;
  staffVerification: boolean;
  completion: string;
  details: string[];
  appliesWhen: SummaryRule | null;
};
export type ProgramEffectSummary = {
  routes: SummaryRoute[];
  fit: SummaryRule | null;
  checkCount: number;
  documents: SummaryDocument[];
  priority: number | null;
  requestedAmountMaximum: { amount: number; inclusive: boolean } | null;
  preferences: Array<{ label: string; score: number | null; condition: SummaryRule }>;
  warnings: string[];
};

const EXTRA_FIELDS: Record<string, string> = {
  intake_variant: "Intake type", intent: "Funding purpose", intent_kind: "Funding purpose type",
  funding_category: "Funding category", industry: "Industry", subindustry: "Business activity",
  industry_key: "Industry", naics_code: "NAICS industry code", evidence_count: "Evidence file count",
};
const VALUES: Record<string, string> = {
  ...WORKSPACE_LABELS,
  dealer_ai_intake: "Dealer AI Intake", real_estate_ai_intake: "Real estate AI Intake",
  working_capital: "Working capital", equipment: "Equipment or vehicle", refinance_debt: "Refinance debt",
  not_sure: "Needs guidance", merchant_services: "Card processing", business_systems: "Business systems",
  trucking_logistics: "Trucking and logistics", grocery_commodities: "Grocery and commodities",
  restaurant_food_service: "Restaurants and food service", manufacturing: "Manufacturing",
  automotive: "Automotive", auto_dealer: "Auto dealerships", car_dealer: "Auto dealerships",
};
const MONEY_FIELDS = new Set(["requested_amount", "use_of_funds_total", "real_estate_equipment_amount", "annual_revenue", "annualized_deposits", "cash_flow", "debt_burden", "liquid_assets", "revenue", "deposits"]);
const FACTS: Record<string, string> = {
  declared_collateral: "Real estate collateral", mca_obligations_present: "Existing merchant cash advances",
  floorplan_inventory_present: "Floorplan / inventory", equipment_financing_intent: "Equipment financing need",
};
const STAGES: Record<string, string> = { prequalification: "Prequalification", term_sheet: "Term sheet", underwriting: "Underwriting", closing: "Closing", showings: "Showings", listed: "Listed" };
const AUDIENCES: Record<string, string> = { agent: "Agent", borrower: "Client", underwriter: "Underwriter" };
function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function values(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : []; }
function fieldLabel(field: string): string { return FIT_FIELDS.find((item) => item.key === field)?.label.replace(/ \([$%]\)$/, "") || EXTRA_FIELDS[field] || field; }
function knownValue(value: string): string { return VALUES[value] || value; }
function valueLabel(value: unknown, field: string): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return `${MONEY_FIELDS.has(field) ? "$" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 20 })}${field === "real_estate_equipment_pct" ? "%" : ""}`;
  if (typeof value === "string") return value ? `“${knownValue(value)}”` : "[choose a value]";
  return value == null ? "[choose a value]" : "[unsupported value — review Advanced settings]";
}

/** Preserve AND / OR / NOT grouping; never flatten a nested rule into a stricter policy. */
export function summarizeFitRule(node: unknown, depth = 0): SummaryRule {
  if (depth > 8 || !objectValue(node)) return { text: "Incomplete eligibility check — review before enabling." };
  if (Array.isArray(node.all) || Array.isArray(node.any)) {
    const key = Array.isArray(node.all) ? "all" : "any";
    return { text: key === "all" ? "All of these must match" : "At least one of these must match", children: (node[key] as unknown[]).map((child) => summarizeFitRule(child, depth + 1)) };
  }
  if ("not" in node) return { text: "This must not match", children: [summarizeFitRule(node.not, depth + 1)] };
  const field = text(node.field);
  const label = fieldLabel(field);
  if (node.op === "present") return { text: `${label} must be provided` };
  if (node.op === "evidence_available") return { text: `Evidence classified as “${text(node.value) || field}” must be available` };
  if (node.op === "in" && Array.isArray(node.value)) return { text: `${label} must be one of: ${node.value.map((value) => valueLabel(value, field)).join(", ")}` };
  const operators: Record<string, string> = { eq: "must be", gte: "must be at least", lte: "must be at most", gt: "must be more than", lt: "must be less than" };
  return { text: operators[String(node.op)] && field ? `${label} ${operators[String(node.op)]} ${valueLabel(node.value, field)}` : "Unsupported eligibility check — review Advanced settings before enabling." };
}

function countChecks(rule: SummaryRule | null): number { return rule ? rule.children ? rule.children.reduce((total, child) => total + countChecks(child), 0) : 1 : 0; }

/** An OR / NOT branch is not a universal maximum and must never be presented as one. */
export function unconditionalRequestedMaximum(node: unknown, depth = 0): { amount: number; inclusive: boolean } | null {
  if (depth > 8 || !objectValue(node)) return null;
  if (Array.isArray(node.all)) return node.all.reduce<{ amount: number; inclusive: boolean } | null>((limit, child) => {
    const next = unconditionalRequestedMaximum(child, depth + 1);
    if (!next) return limit;
    if (!limit || next.amount < limit.amount || (next.amount === limit.amount && !next.inclusive)) return next;
    return limit;
  }, null);
  if ("any" in node || "not" in node) return null;
  return node.field === "requested_amount" && ["lt", "lte"].includes(String(node.op)) && typeof node.value === "number" && Number.isFinite(node.value)
    ? { amount: node.value, inclusive: node.op === "lte" } : null;
}

export function requestedAmountEffect(limit: { amount: number; inclusive: boolean }): string {
  const amount = valueLabel(limit.amount, "requested_amount");
  return `Requests ${limit.inclusive ? "above" : "of"} ${amount}${limit.inclusive ? "" : " or more"} do not meet this program’s configured amount limit. Another program is recommended only if its own published criteria pass; this is never automatic loan approval.`;
}
function summarizeCondition(value: unknown): SummaryRule | null {
  if (!objectValue(value) || !Object.keys(value).length) return null;
  if (["all", "any", "not", "field", "op"].some((key) => key in value)) return summarizeFitRule(value);
  return { text: "All of these must match", children: Object.entries(value).map(([field, expected]) => summarizeFitRule({ field, op: Array.isArray(expected) ? "in" : "eq", value: expected })) };
}

export function summarizeProgramEffects(scopes: FundingProgramScope[], rulesText: string, requirementsText: string): ProgramEffectSummary {
  const warnings: string[] = [];
  let rules: Record<string, unknown> = {};
  let requirements: Record<string, unknown>[] = [];
  try { const parsed: unknown = JSON.parse(rulesText); if (!objectValue(parsed)) throw new Error(); rules = parsed; } catch { warnings.push("Eligibility rules need correction before this summary can be complete."); }
  try { const parsed: unknown = JSON.parse(requirementsText); if (!Array.isArray(parsed) || !parsed.every(objectValue)) throw new Error(); requirements = parsed; } catch { warnings.push("Document requirements need correction before this summary can be complete."); }
  const activeScopes = scopes.filter((scope) => scope.is_active !== false);
  const routes = activeScopes.map((scope): SummaryRoute => {
    const restrictions: string[] = [];
    if (scope.intake_variants.length) restrictions.push(`Intake type: ${scope.intake_variants.map(knownValue).join(" or ")}`);
    if (scope.intent_keys.length) restrictions.push(`Funding purpose: ${scope.intent_keys.map(knownValue).join(" or ")}`);
    const industries = [...scope.naics_prefixes.map((code) => `NAICS ${code}`), ...scope.industry_keys.map(knownValue)];
    if (industries.length) restrictions.push(`Allowed industry match: ${industries.join(" or ")}`);
    if (scope.required_fact_keys.length) restrictions.push(`Must be present: ${scope.required_fact_keys.map((key) => FACTS[key] || fieldLabel(key)).join(" and ")}`);
    // Deny rules are shared across routes within one workspace by the matching service.
    const exclusions = [...new Set(activeScopes.filter((item) => item.vertical === scope.vertical).flatMap((item) => item.excluded_naics_prefixes || []))];
    return { label: `${WORKSPACE_LABELS[scope.vertical] || scope.vertical}${activeScopes.filter((item) => item.vertical === scope.vertical).length > 1 ? ` · ${scope.scope_key}` : ""}`, restrictions, exclusions };
  });
  const documents = requirements.map((row): SummaryDocument => {
    const checks = Array.isArray(row.review_checks) ? row.review_checks.filter(objectValue).map((check) => ({ label: text(check.label) || "Unnamed condition", instructions: text(check.instructions), policy: check.severity === "block" ? "Must resolve before staff approval" : "Flag for staff review" })) : [];
    const staffVerification = row.verification_required === true || row.completion_mode === "requires_human_verify";
    const details: string[] = [];
    if (row.required_level === "required" && row.blocks_stage) details.push(`Required before: ${STAGES[String(row.blocks_stage)] || row.blocks_stage}`);
    if (Array.isArray(row.visibility) && row.visibility.length) details.push(`Visible to: ${values(row.visibility).map((value) => AUDIENCES[value] || value).join(", ")}`);
    if (typeof row.expiration_days === "number") details.push(`Expires after ${row.expiration_days} days`);
    if (row.can_underwriter_waive === true) details.push("Underwriter may waive this requirement");
    return {
      name: text(row.label) || "Unnamed document", importance: row.required_level === "optional" ? "Optional" : row.required_level === "recommended" ? "Recommended" : "Required",
      instructions: text(row.completion_criteria), objective: text(row.objective_text), checks, staffVerification,
      completion: staffVerification ? "Staff verification required" : row.completion_mode === "borrower_self_attest" ? "Client may self-attest" : "AI may complete only evidence-backed passes; missing, uncertain, or adverse findings require staff review",
      details, appliesWhen: summarizeCondition(row.applies_when),
    };
  });
  const fit = rules.fit ? summarizeFitRule(rules.fit) : null;
  const preferences = Array.isArray(rules.recommendation_preferences) ? rules.recommendation_preferences.filter(objectValue).map((row) => ({ label: text(row.label) || "Unnamed preference", score: typeof row.score === "number" && Number.isFinite(row.score) ? row.score : null, condition: summarizeFitRule(row.when) })) : [];
  if (Array.isArray(rules.unresolved_review_items) && rules.unresolved_review_items.length) warnings.push(`${rules.unresolved_review_items.length} imported ${rules.unresolved_review_items.length === 1 ? "item still needs" : "items still need"} review before enabling.`);
  return { routes, fit, checkCount: countChecks(fit), documents, priority: typeof rules.priority === "number" && Number.isFinite(rules.priority) ? rules.priority : null, requestedAmountMaximum: unconditionalRequestedMaximum(rules.fit), preferences, warnings };
}

export const PROGRAM_EFFECT_SAFEGUARDS = "Fit is advisory—not a financing approval or guarantee. Authorized staff can override an ineligible recommendation with an audited reason.";
export const PROGRAM_VERSION_EFFECT = "Published criteria apply to new program selections. Existing files keep their selected criteria version.";

export function programSaveEffect(mode: "save" | "enable", retired: boolean): string {
  if (mode === "enable") return `Save & enable saves program details and availability, then publishes the eligibility checks and document instructions shown.${retired ? " It also restores this retired program to new selections." : ""}`;
  return `Save changes saves program details and availability${retired ? "; this program remains retired" : " immediately in the active catalog"}. Changed eligibility checks and document instructions are saved as a draft; the published criteria stay unchanged.`;
}
