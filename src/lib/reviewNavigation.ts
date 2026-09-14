type RequirementCandidate = {
  requirement_key: string;
  label: string;
  category: string;
  complete?: boolean;
};

export type ReviewMissingItem = {
  title: string;
  detail: string;
  priority: string;
  query: string;
};

export type ReviewDestination =
  | { kind: "profile" }
  | { kind: "owners" }
  | { kind: "credit" }
  | { kind: "banking" }
  | { kind: "requirement"; query: string };

const SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "are", "for", "from", "in", "is", "item", "items",
  "missing", "need", "needed", "needs", "of", "or", "please", "required",
  "the", "to", "upload", "with",
]);

function normalizedWords(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((word) => word && !SEARCH_STOP_WORDS.has(word));
}

function comparableText(value: string): string {
  return normalizedWords(value).join(" ");
}

function itemTitle(row: Record<string, unknown>): string {
  return String(row.title || row.label || row.name || row.requirement || "Missing item").trim();
}

function itemDetail(row: Record<string, unknown>): string {
  return String(row.detail || row.description || row.instructions || row.reason || "").trim();
}

function itemsOverlap(left: ReviewMissingItem, right: ReviewMissingItem): boolean {
  const leftWords = new Set(normalizedWords(left.title));
  const rightWords = new Set(normalizedWords(right.title));
  if (!leftWords.size || !rightWords.size) return false;
  const shared = [...leftWords].filter((word) => rightWords.has(word));
  const shorter = Math.min(leftWords.size, rightWords.size);
  return shared.length >= 2 && shared.length === shorter;
}

/** Collapse AI wording variants such as "Debt schedule" and
 * "Business debt schedule" into one operator action. */
export function compactMissingItems(rows: Record<string, unknown>[]): ReviewMissingItem[] {
  const result: ReviewMissingItem[] = [];
  for (const row of rows) {
    const title = itemTitle(row);
    const detail = itemDetail(row);
    const next: ReviewMissingItem = {
      title,
      detail,
      priority: String(row.priority || "open"),
      query: [String(row.requirement_key || ""), title, detail].filter(Boolean).join(" "),
    };
    const existingIndex = result.findIndex((item) => comparableText(item.title) === comparableText(title) || itemsOverlap(item, next));
    if (existingIndex < 0) {
      result.push(next);
      continue;
    }
    const existing = result[existingIndex];
    const preferred = normalizedWords(title).length > normalizedWords(existing.title).length ? next : existing;
    result[existingIndex] = {
      ...preferred,
      detail: preferred.detail || (preferred === next ? existing.detail : next.detail),
      query: `${existing.query} ${next.query}`.trim(),
    };
  }
  return result;
}

export function reviewDestination(query: string): ReviewDestination {
  const text = comparableText(query);
  if (/\b(requested amount|loan amount|use funds|loan purpose|contact|business name)\b/.test(text)) return { kind: "profile" };
  if (/\b(ownership|owner allocation|beneficial owner)\b/.test(text)) return { kind: "owners" };
  if (/\b(credit|soft pull|isoftpull)\b/.test(text)) return { kind: "credit" };
  if (/\b(plaid|bank connection|connect bank|bank verification)\b/.test(text) && !/\b(statement|tax)\b/.test(text)) return { kind: "banking" };
  return { kind: "requirement", query };
}

export function intelligenceActionDestination(action: string): ReviewDestination {
  if (action === "edit_profile") return { kind: "profile" };
  if (action === "request_debt_schedule") return { kind: "requirement", query: "business debt schedule debt payments" };
  if (action === "request_bank_or_tax_evidence") return { kind: "requirement", query: "business bank statements business tax returns revenue" };
  if (action === "request_property_evidence") return { kind: "requirement", query: "property value appraisal rent lease evidence" };
  return reviewDestination(action.replaceAll("_", " "));
}

/** Resolve AI prose to the closest canonical, incomplete requirement. */
export function findRequirementKey(query: string, requirements: RequirementCandidate[]): string | null {
  const queryText = comparableText(query);
  const queryWords = new Set(normalizedWords(query));
  if (!queryWords.size) return null;

  const candidates = requirements.some((item) => !item.complete)
    ? requirements.filter((item) => !item.complete)
    : requirements;
  let best: { key: string; score: number } | null = null;
  for (const requirement of candidates) {
    if (requirement.requirement_key === query.trim()) return requirement.requirement_key;
    const candidateText = comparableText(`${requirement.requirement_key} ${requirement.label} ${requirement.category}`);
    const candidateWords = new Set(normalizedWords(candidateText));
    const shared = [...candidateWords].filter((word) => queryWords.has(word)).length;
    if (!shared) continue;
    const containment = queryText.includes(comparableText(requirement.label))
      || comparableText(requirement.label).includes(queryText);
    const score = shared * 10
      + (containment ? 40 : 0)
      + shared / Math.max(candidateWords.size, queryWords.size)
      - (requirement.complete ? 5 : 0);
    if (!best || score > best.score) best = { key: requirement.requirement_key, score };
  }
  return best?.key ?? null;
}
