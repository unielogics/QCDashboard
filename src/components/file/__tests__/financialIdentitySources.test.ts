import { describe, expect, it } from "vitest";
import { financialIdentitySources } from "../cockpit/financialIdentitySources";
import type { FinancialMetricReview } from "@/lib/financialMetrics";

describe("excluded earnings evidence discovery", () => {
  it("keeps a conflicting original document reachable even when there is no EBITDA result", () => {
    const review = { excluded_income_sources: [{ file_id: "excluded", file_name: "Excluded return.pdf", reason: "Business name differs" }], document_associations: [{ file_id: "excluded", file_name: "Excluded return.pdf", content_hash: "a".repeat(64), analysis_id: "original-analysis", observed_entities: ["Original source corporation"], allows_financial_use: false, document_accepted: true }] } as unknown as FinancialMetricReview;
    expect(financialIdentitySources(review)).toEqual([{ file_id: "excluded", file_name: "Excluded return.pdf", content_hash: "a".repeat(64), analysis_id: "original-analysis", entity: "Original source corporation", entity_comparable: false, accepted: true }]);
  });
  it("preserves the excluded file link when exact-source provenance is not yet available", () => {
    const review = { excluded_income_sources: [{ file_id: "excluded", file_name: "Original file.pdf", reason: "Identity needs review" }] } as unknown as FinancialMetricReview;
    expect(financialIdentitySources(review)).toEqual([{ file_id: "excluded", file_name: "Original file.pdf", entity_comparable: false }]);
    expect(financialIdentitySources(undefined)).toEqual([]);
  });
});
