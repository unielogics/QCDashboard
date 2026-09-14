import { describe, expect, it } from "vitest";
import type { ExtractedFact } from "@/lib/applicationProfile";
import {
  canonicalExtractedFieldKey,
  groupSuggestedExtractedFacts,
} from "@/lib/extractedFacts";

function fact(
  id: string,
  fieldKey: string,
  value: string,
  overrides: Partial<ExtractedFact> = {},
): ExtractedFact {
  return {
    id,
    field_key: fieldKey,
    value: { value },
    normalized_value: value.toLowerCase(),
    confidence: 0.9,
    source_file_id: `${id}-file`,
    status: "suggested",
    extraction_method: "document_ai",
    created_at: "2026-09-15T12:00:00Z",
    ...overrides,
  };
}

describe("extracted fact groups", () => {
  it("uses server canonical identity and a legacy alias fallback", () => {
    expect(canonicalExtractedFieldKey("Business Name")).toBe(
      "legal_entity_name",
    );
    expect(
      canonicalExtractedFieldKey(
        fact("1", "unknown_name", "Grace", {
          canonical_field_key: "legal_entity_name",
        }),
      ),
    ).toBe("legal_entity_name");
  });

  it("hides pending aliases after the logical field is accepted", () => {
    const groups = groupSuggestedExtractedFacts([
      fact("accepted", "business_name", "Grace Auto Sales", {
        status: "accepted",
      }),
      fact(
        "pending",
        "legal_entity_name",
        "Grace Auto Sales and Service, Inc.",
      ),
      fact("entity", "entity_type", "Corporation"),
    ]);

    expect(groups.map((group) => group.canonicalFieldKey)).toEqual([
      "entity_type",
    ]);
  });

  it("shows one card per field and prefers a corroborated value", () => {
    const groups = groupSuggestedExtractedFacts([
      fact("new-name", "legal_entity_name", "Grace Auto Sales", {
        confidence: 0.99,
      }),
      fact(
        "legal-1",
        "business_name",
        "Grace Auto Sales and Service, Inc.",
        { confidence: 0.92 },
      ),
      fact(
        "legal-2",
        "company_name",
        "Grace Auto Sales and Service, Inc.",
        { confidence: 0.93 },
      ),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      canonicalFieldKey: "legal_entity_name",
      suggestionCount: 3,
      matchingValueCount: 2,
      alternativeValueCount: 1,
    });
    expect(groups[0].fact.id).toBe("legal-2");
  });

  it("deduplicates repeated multi-value facts without hiding distinct values", () => {
    const groups = groupSuggestedExtractedFacts([
      fact("year-2025-a", "tax_year", "2025"),
      fact("year-2025-b", "tax_year", "2025"),
      fact("year-2024", "tax_year", "2024"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.fact.value.value).sort()).toEqual([
      "2024",
      "2025",
    ]);
    expect(
      groups.find((group) => group.fact.value.value === "2025"),
    ).toMatchObject({ suggestionCount: 2, matchingValueCount: 2 });
  });

  it("hides only the accepted value of a multi-value field", () => {
    const groups = groupSuggestedExtractedFacts([
      fact("accepted-2025", "tax_year", "2025", { status: "accepted" }),
      fact("pending-2025", "tax_year", "2025"),
      fact("pending-2024", "tax_year", "2024"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].fact.value.value).toBe("2024");
  });

  it("keeps business and contact channels as distinct fields", () => {
    const groups = groupSuggestedExtractedFacts([
      fact("business", "business_email", "billing@example.com"),
      fact("contact", "contact_email", "owner@example.com"),
    ]);

    expect(groups.map((group) => group.canonicalFieldKey).sort()).toEqual([
      "business_email",
      "contact_email",
    ]);
  });
});
