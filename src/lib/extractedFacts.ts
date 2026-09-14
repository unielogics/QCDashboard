import type { ExtractedFact } from "@/lib/applicationProfile";

const FIELD_ALIASES: Record<string, string> = {
  business_activity_code: "naics_code",
  business_entity_type: "entity_type",
  business_name: "legal_entity_name",
  company_legal_name: "legal_entity_name",
  company_name: "legal_entity_name",
  entity_name: "legal_entity_name",
  entity_structure: "entity_type",
  industry_code: "naics_code",
  industry_name: "industry",
  legal_business_name: "legal_entity_name",
  loan_request_amount: "requested_amount",
  requested_loan_amount: "requested_amount",
  sub_industry: "subindustry",
};

const MULTI_VALUE_FIELDS = new Set([
  "borrower_email",
  "business_email",
  "business_phone",
  "contact_email",
  "contact_phone",
  "email",
  "filing_year",
  "owner_name",
  "phone",
  "primary_owner_name",
  "principal_name",
  "return_type",
  "return_year",
  "tax_form",
  "tax_form_type",
  "tax_year",
]);

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function canonicalExtractedFieldKey(
  factOrKey: ExtractedFact | string,
) {
  const supplied =
    typeof factOrKey === "string"
      ? factOrKey
      : factOrKey.canonical_field_key || factOrKey.field_key;
  const normalized = normalizeKey(supplied);
  return FIELD_ALIASES[normalized] ?? normalized;
}

function normalizedFactValue(fact: ExtractedFact) {
  const stored = String(fact.normalized_value ?? "").trim().toLowerCase();
  if (stored) return stored.replace(/\s+/g, " ");
  const value = fact.value?.value;
  if (value && typeof value === "object") {
    return JSON.stringify(value, Object.keys(value).sort()).toLowerCase();
  }
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function reviewGroupKey(fact: ExtractedFact) {
  const canonicalFieldKey = canonicalExtractedFieldKey(fact);
  return MULTI_VALUE_FIELDS.has(canonicalFieldKey)
    ? `${canonicalFieldKey}\u0000${normalizedFactValue(fact)}`
    : canonicalFieldKey;
}

function timestamp(fact: ExtractedFact) {
  const value = Date.parse(fact.created_at);
  return Number.isFinite(value) ? value : 0;
}

function compareFacts(left: ExtractedFact, right: ExtractedFact) {
  return (
    (right.confidence ?? -1) - (left.confidence ?? -1) ||
    timestamp(right) - timestamp(left) ||
    left.id.localeCompare(right.id)
  );
}

export type ExtractedFactSuggestionGroup = {
  reviewGroupKey: string;
  canonicalFieldKey: string;
  fact: ExtractedFact;
  suggestionCount: number;
  matchingValueCount: number;
  alternativeValueCount: number;
};

/**
 * Collapse raw per-file extraction rows into one actionable card per scalar
 * field, or per repeated value for facts that can legitimately have several
 * values. Corroboration wins, then confidence and recency break ties.
 */
export function groupSuggestedExtractedFacts(
  facts: ExtractedFact[],
): ExtractedFactSuggestionGroup[] {
  const acceptedGroups = new Set(
    facts
      .filter((fact) => fact.status === "accepted")
      .map(reviewGroupKey),
  );
  const byField = new Map<string, ExtractedFact[]>();
  for (const fact of facts) {
    const groupKey = reviewGroupKey(fact);
    if (fact.status !== "suggested" || acceptedGroups.has(groupKey)) {
      continue;
    }
    const rows = byField.get(groupKey) ?? [];
    rows.push(fact);
    byField.set(groupKey, rows);
  }

  return Array.from(byField, ([reviewGroupKey, rows]) => {
    const canonicalFieldKey = canonicalExtractedFieldKey(rows[0]);
    const byValue = new Map<string, ExtractedFact[]>();
    for (const row of rows) {
      const valueKey = normalizedFactValue(row);
      const matches = byValue.get(valueKey) ?? [];
      matches.push(row);
      byValue.set(valueKey, matches);
    }
    const rankedValues = Array.from(byValue.entries()).sort(
      ([leftKey, left], [rightKey, right]) =>
        right.length - left.length ||
        Math.max(...right.map((fact) => fact.confidence ?? -1)) -
          Math.max(...left.map((fact) => fact.confidence ?? -1)) ||
        Math.max(...right.map(timestamp)) - Math.max(...left.map(timestamp)) ||
        leftKey.localeCompare(rightKey),
    );
    const preferred = [...rankedValues[0][1]].sort(compareFacts)[0];
    return {
      reviewGroupKey,
      canonicalFieldKey,
      fact: preferred,
      suggestionCount: rows.length,
      matchingValueCount: rankedValues[0][1].length,
      alternativeValueCount: Math.max(0, rankedValues.length - 1),
    };
  }).sort((left, right) =>
    left.canonicalFieldKey.localeCompare(right.canonicalFieldKey),
  );
}
