import type { FinancialMetricReview, MetricSourceRef } from "@/lib/financialMetrics";

/** Excluded earnings still need a reachable source reader and identity review. */
export function financialIdentitySources(review: FinancialMetricReview | undefined): MetricSourceRef[] {
  if (!review) return [];
  const excluded = new Set((review.excluded_income_sources ?? []).map((item) => item.file_id).filter(Boolean));
  const records = (review.document_associations ?? []).filter((record) => excluded.has(record.file_id));
  return [...records.map((record) => ({ file_id: record.file_id, file_name: record.file_name, content_hash: record.content_hash, analysis_id: record.analysis_id, entity: record.observed_entities.join("; "), entity_comparable: record.allows_financial_use, accepted: record.document_accepted })), ...(review.excluded_income_sources ?? []).filter((source) => source.file_id && !records.some((record) => record.file_id === source.file_id)).map((source) => ({ file_id: source.file_id, file_name: source.file_name, entity_comparable: false }))];
}
