import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import { FIT_FIELDS, objectValue, readSimpleFit } from "./fundingProgramEditorModel";

export type ProgramLogicAction = { label: string; target: string; programKey?: string };
export type ProgramLogicWarning = { id: string; kind: "conflict" | "review" | "information"; title: string; message: string; actions: ProgramLogicAction[] };
type Bound = { value: number; inclusive: boolean };
type Interval = { minimum?: Bound; maximum?: Bound };

/** Only AND leaves are universal constraints. OR / NOT are intentionally not flattened. */
function universalConditions(node: unknown, depth = 0): Record<string, unknown>[] {
  if (depth > 8 || !objectValue(node)) return [];
  if (Array.isArray(node.all)) return node.all.flatMap((child) => universalConditions(child, depth + 1));
  if ("any" in node || "not" in node) return [];
  return typeof node.field === "string" && typeof node.value === "number" && Number.isFinite(node.value) ? [node] : [];
}

function intervals(node: unknown): Map<string, Interval> {
  const result = new Map<string, Interval>();
  for (const condition of universalConditions(node)) {
    const field = String(condition.field);
    const value = Number(condition.value);
    const range = result.get(field) || {};
    if (["gte", "gt", "eq"].includes(String(condition.op))) {
      const bound = { value, inclusive: condition.op !== "gt" };
      if (!range.minimum || value > range.minimum.value || (value === range.minimum.value && !bound.inclusive)) range.minimum = bound;
    }
    if (["lte", "lt", "eq"].includes(String(condition.op))) {
      const bound = { value, inclusive: condition.op !== "lt" };
      if (!range.maximum || value < range.maximum.value || (value === range.maximum.value && !bound.inclusive)) range.maximum = bound;
    }
    result.set(field, range);
  }
  return result;
}

/** Unlike a mere mention of requested_amount, every OR branch must contain a ceiling. */
function hasAmountCeiling(node: unknown, depth = 0): boolean {
  if (depth > 8 || !objectValue(node)) return false;
  if (Array.isArray(node.all)) return node.all.some((child) => hasAmountCeiling(child, depth + 1));
  if (Array.isArray(node.any)) return node.any.length > 0 && node.any.every((child) => hasAmountCeiling(child, depth + 1));
  if ("not" in node) return false;
  return node.field === "requested_amount" && ["lt", "lte", "eq"].includes(String(node.op)) && typeof node.value === "number" && Number.isFinite(node.value);
}

function containsField(node: unknown, field: string, depth = 0): boolean {
  if (depth > 8 || !objectValue(node)) return false;
  if (node.field === field) return true;
  return [node.not, ...(Array.isArray(node.all) ? node.all : []), ...(Array.isArray(node.any) ? node.any : [])].some((child) => containsField(child, field, depth + 1));
}

function hasNegatedAmountLogic(node: unknown, depth = 0): boolean {
  if (depth > 8 || !objectValue(node)) return false;
  if (node.not && containsField(node.not, "requested_amount")) return true;
  return [...(Array.isArray(node.all) ? node.all : []), ...(Array.isArray(node.any) ? node.any : [])].some((child) => hasNegatedAmountLogic(child, depth + 1));
}

function hasAssetSharePreference(rules: Record<string, unknown>): boolean {
  return Array.isArray(rules.recommendation_preferences) && rules.recommendation_preferences.some((preference) => objectValue(preference) && containsField(preference.when, "real_estate_equipment_pct"));
}

function documentKind(row: Record<string, unknown>): "bank" | "tax" | "financial" | "other" {
  const key = String(row.requirement_key || "").toLowerCase();
  if (/bank.*statement|statement.*bank/.test(key)) return "bank";
  if (/tax.*return|return.*tax/.test(key)) return "tax";
  if (/p_and_l|profit.*loss|ytd.*financial/.test(key)) return "financial";
  return "other";
}

function documentPeriods(row: Record<string, unknown>, kind: "bank" | "tax"): { key: number | null; label: number | null } {
  const unit = kind === "bank" ? "months?" : "years?";
  const read = (value: unknown) => {
    const match = new RegExp(`(?:^|[ _-])(\\d{1,2})[ _-]+${unit}(?:$|[ _-])`, "i").exec(String(value || ""));
    const count = match ? Number(match[1]) : 0;
    return count > 0 ? count : null;
  };
  return { key: read(row.requirement_key), label: read(row.label) };
}

const SBA_ROUTING_KEYS = new Set(["sba_7a", "sba_504", "sba_express"]);
const BANK_CHECKS = new Set(["no_mca_debits", "no_nsf", "positive_ending_balance"]);

/** Non-mutating policy lint: warnings inform review, never invent eligibility or block drafts. */
export function programLogicWarnings(input: {
  programKey: string; rulesText: string; requirementsText: string; scopes: FundingProgramScope[]; catalog: FundingProgramCatalogItem[];
}): ProgramLogicWarning[] {
  let rules: Record<string, unknown>;
  let requirements: Record<string, unknown>[];
  try {
    const r: unknown = JSON.parse(input.rulesText);
    const d: unknown = JSON.parse(input.requirementsText);
    if (!objectValue(r) || !Array.isArray(d) || !d.every(objectValue)) return [];
    rules = r; requirements = d;
  } catch { return []; } // Structural validation supplies actionable errors for malformed input.
  const warnings: ProgramLogicWarning[] = [];
  const bounds = intervals(rules.fit);
  const simple = readSimpleFit(rules);
  const metricTarget = (field: string) => {
    const index = simple?.mode === "all" ? simple.conditions.findIndex((condition) => condition.field === field) ?? -1 : -1;
    return index >= 0 ? `Check ${index + 1} threshold` : "Eligibility checks";
  };
  for (const [field, range] of bounds) {
    if (!range.minimum || !range.maximum) continue;
    if (range.minimum.value > range.maximum.value || (range.minimum.value === range.maximum.value && (!range.minimum.inclusive || !range.maximum.inclusive))) {
      const label = FIT_FIELDS.find((item) => item.key === field)?.label || field;
      warnings.push({ id: `range:${field}`, kind: "conflict", title: `${label}: the required limits cannot both pass`, message: `The mandatory minimum (${range.minimum.inclusive ? "at least" : "more than"} ${range.minimum.value}) conflicts with the mandatory maximum (${range.maximum.inclusive ? "at most" : "less than"} ${range.maximum.value}). This can prevent every file from matching.`, actions: [{ label: "Review eligibility limits", target: metricTarget(field) }] });
    }
  }
  const staff: number[] = [];
  requirements.forEach((row, index) => {
    const name = String(row.label || `Document ${index + 1}`);
    const kind = documentKind(row);
    const checks = Array.isArray(row.review_checks) ? row.review_checks : [];
    if (row.completion_mode === "requires_human_verify" || row.verification_required === true) staff.push(index);
    if (kind === "bank" || kind === "tax") {
      const periods = documentPeriods(row, kind);
      const amount = periods.key ?? periods.label;
      const metric = kind === "bank" ? "bank_statement_months" : "tax_return_years";
      const unit = kind === "bank" ? "bank months" : "tax years";
      if (periods.key !== null && periods.label !== null && periods.key !== periods.label) warnings.push({ id: `period-name:${index}`, kind: "conflict", title: `${name}: document name and type disagree`, message: `The saved document type requires ${periods.key} ${unit}, but its display name says ${periods.label}. Renaming does not change the underlying coverage requirement.`, actions: [{ label: "Review document type", target: `Requirement ${index + 1} document type` }, { label: "Review display name", target: `Requirement ${index + 1} name` }] });
      const minimum = bounds.get(metric)?.minimum;
      const requiredCount = minimum ? minimum.inclusive ? Math.ceil(minimum.value) : Math.floor(minimum.value) + 1 : null;
      // Conditional/optional requirements may intentionally apply to only some files.
      if (amount !== null && requiredCount !== null && amount !== requiredCount && !row.applies_when && (row.required_level === undefined || row.required_level === "required")) warnings.push({
        id: `coverage:${index}`, kind: "review", title: `Matching and the checklist use different ${unit}`,
        message: `Preliminary matching requires at least ${requiredCount} ${unit}; “${name}” requires ${amount}${row.blocks_stage ? ` before ${String(row.blocks_stage).replaceAll("_", " ")}` : ""}. This may be intentional for different stages. Confirm the difference or align both settings; matching alone does not complete the checklist.`,
        actions: [{ label: "Review matching threshold", target: metricTarget(metric) }, { label: "Review required document", target: `Requirement ${index + 1} document type` }],
      });
    }
    checks.forEach((check, checkIndex) => {
      if (!objectValue(check) || !BANK_CHECKS.has(String(check.key)) || !["tax", "financial"].includes(kind)) return;
      warnings.push({ id: `source:${index}:${checkIndex}`, kind: "conflict", title: `“${String(check.label || check.key)}” is attached to ${name}`, message: "This check needs bank-statement transactions or balances. Move it to the required bank statements, or revise it to match this document. AI must not infer a bank result from tax returns or a P&L.", actions: [{ label: "Review misplaced check", target: `Requirement ${index + 1} check ${checkIndex + 1} instructions` }, ...requirements.flatMap((candidate, bankIndex) => documentKind(candidate) === "bank" ? [{ label: "Open bank-statement requirement", target: `Requirement ${bankIndex + 1} document type` }] : []).slice(0, 1)] });
    });
  });
  if (staff.length) warnings.push({ id: "staff-verification", kind: "information", title: `${staff.length} of ${requirements.length} requirements still need staff verification`, message: "This is a completion permission, not a missing AI instruction. For evidence-backed document checks, choose “AI evidence review”; unclear, missing, or adverse findings still go to staff. Existing staff-only choices are not changed automatically.", actions: [{ label: "Review completion permission", target: `Requirement ${staff[0] + 1} completion permission` }] });
  if (SBA_ROUTING_KEYS.has(input.programKey) && !hasAmountCeiling(rules.fit) && !hasNegatedAmountLogic(rules.fit)) warnings.push({ id: "requested-amount-cap", kind: "review", title: "No universal requested-amount ceiling is configured", message: "Add the approved amount limit in eligibility checks if this program needs one. A description, website baseline, minimum amount, or limit inside only one alternative does not cap every matching file. This warning does not set a limit for you.", actions: [{ label: "Review amount limits", target: "Eligibility checks" }] });
  if (SBA_ROUTING_KEYS.has(input.programKey)) {
    const workspaces = new Set(input.scopes.filter((scope) => scope.is_active !== false).map((scope) => scope.vertical));
    const unavailable = input.catalog.filter((program) => program.program_key !== input.programKey && SBA_ROUTING_KEYS.has(program.program_key) && program.status === "active" && !program.published_version?.rules.fit && program.scopes.some((scope) => scope.is_active !== false && workspaces.has(scope.vertical)));
    if (unavailable.length) warnings.push({ id: "routing-targets", kind: "review", title: `${unavailable.map((program) => program.name).join(" and ")} cannot yet become eligible routing targets`, message: "These catalog programs do not have published eligibility checks. Saving or enabling this program will not enable them. Review and publish each target separately; it must then pass its own availability and eligibility rules. A categorized budget alone does not activate SBA 504 routing.", actions: unavailable.map((program) => ({ label: `Review ${program.name}`, target: "Eligibility checks", programKey: program.program_key })) });
    const related504 = input.catalog.find((program) => program.program_key === "sba_504" && program.status === "active" && program.published_version?.rules.fit && program.scopes.some((scope) => scope.is_active !== false && workspaces.has(scope.vertical)));
    const targetRules = input.programKey === "sba_504" ? rules : related504?.published_version?.rules;
    if (targetRules && !hasAssetSharePreference(targetRules)) warnings.push({ id: "504-share-preference", kind: "review", title: "SBA 504 has no real-estate / equipment percentage preference", message: "To use your 49/51% approach, review SBA 504’s eligibility criteria, add an approved real-estate / equipment share preference, then save and enable that version. A complete categorized budget supplies the percentage; it does not activate routing by itself. The 51% threshold is a QC ranking preference, not an SBA eligibility or property-occupancy rule. Other eligibility checks must still pass.", actions: [{ label: "Configure SBA 504 preference", target: "Recommendation preferences", ...(input.programKey !== "sba_504" ? { programKey: "sba_504" } : {}) }] });
  }
  return warnings;
}
