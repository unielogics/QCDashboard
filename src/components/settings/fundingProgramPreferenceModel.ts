import { objectValue, validateEditorContent, type FitCondition } from "./fundingProgramEditorModel";

export type RecommendationPreference = { key: string; label: string; when: Record<string, unknown>; score: number | "" };
export type PreferenceIssue = { target: string; message: string; area: "criteria" };

/** Editable shape only; incomplete user entries remain editable and are validated separately. */
export function readRecommendationPreferences(rules: Record<string, unknown>): RecommendationPreference[] | null {
  if (rules.recommendation_preferences === undefined) return [];
  const rows = rules.recommendation_preferences;
  if (!Array.isArray(rows) || !rows.every((row) => objectValue(row) && typeof row.key === "string" && typeof row.label === "string" && objectValue(row.when) && (typeof row.score === "number" || row.score === "") && Object.keys(row).every((key) => ["key", "label", "when", "score"].includes(key)))) return null;
  return rows as RecommendationPreference[];
}

export function newRecommendationPreference(rows: RecommendationPreference[], preset = false): RecommendationPreference {
  const base = preset ? "real_estate_equipment_majority" : "preference";
  let key = base; let suffix = 2;
  while (rows.some((row) => row.key === key)) key = `${base}_${suffix++}`;
  return { key, label: preset ? "Prefer when real estate and equipment are the majority of funding" : "", when: preset ? { field: "real_estate_equipment_pct", op: "gte", value: 51 } : { field: "requested_amount", op: "gte", value: "" }, score: 10 };
}

export function preferenceCondition(row: RecommendationPreference): FitCondition | null {
  const node = row.when;
  if (!Object.keys(node).every((key) => ["field", "op", "value"].includes(key)) || typeof node.field !== "string" || typeof node.op !== "string") return null;
  return node as FitCondition;
}

function ruleCount(node: unknown, depth = 0): number {
  if (depth > 8 || !objectValue(node)) return 101;
  if (Array.isArray(node.all)) return 1 + node.all.reduce((sum, child) => sum + ruleCount(child, depth + 1), 0);
  if (Array.isArray(node.any)) return 1 + node.any.reduce((sum, child) => sum + ruleCount(child, depth + 1), 0);
  if ("not" in node) return 1 + ruleCount(node.not, depth + 1);
  return 1;
}

export function recommendationPreferenceIssues(rules: Record<string, unknown>): PreferenceIssue[] {
  const issues: PreferenceIssue[] = [];
  const add = (target: string, message: string) => issues.push({ target, message, area: "criteria" });
  const rows = readRecommendationPreferences(rules);
  if (!rows) return [{ target: "Eligibility rules JSON", message: "Recommendation preferences need supported key, label, condition, and score fields. Review Advanced settings.", area: "criteria" }];
  if (rows.length > 10) add("Recommendation preferences", "Keep at most 10 recommendation preferences.");
  const seen = new Set<string>();
  let count = 0;
  rows.forEach((row, index) => {
    const prefix = `Preference ${index + 1}`;
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(row.key) || seen.has(row.key)) add("Eligibility rules JSON", `${prefix}: use a valid, unique preference reference in Advanced settings.`);
    seen.add(row.key);
    if (!row.label.trim() || row.label.trim().length > 200) add(`${prefix} name`, `${prefix}: enter a clear name within 200 characters.`);
    if (!Number.isInteger(row.score) || Number(row.score) < 1 || Number(row.score) > 100) add(`${prefix} ranking points`, `${prefix}: ranking points must be a whole number from 1 to 100.`);
    const error = validateEditorContent(JSON.stringify({ fit: row.when }), "[]");
    if (error) {
      const condition = preferenceCondition(row);
      const target = condition && ["eq", "gte", "lte", "gt", "lt"].includes(condition.op) && (condition.value === "" || condition.value == null) ? `${prefix} threshold` : `${prefix} condition`;
      add(target, `${prefix}: ${error}`);
    }
    count += ruleCount(row.when);
  });
  if (count > 100) add("Recommendation preferences", "Keep at most 100 conditions across all recommendation preferences.");
  return issues;
}
