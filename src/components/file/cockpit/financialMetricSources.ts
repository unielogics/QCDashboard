import type { MetricSourceRef } from "@/lib/financialMetrics";

export const metricSourceDocumentIdentity = (source: MetricSourceRef) => JSON.stringify([source.file_id, source.version_id, source.analysis_id, source.content_hash, source.entity, source.period_start, source.period_end]);
const located = (source: MetricSourceRef) => !!source.pages?.length || !!source.citations?.some((citation) => citation.page || citation.quote);

/** Keep distinct citations, but do not list the same PDF again as a bare period input. */
export function compactMetricSources(sources: MetricSourceRef[]): MetricSourceRef[] {
  return sources.filter((source) => located(source) || !sources.some((candidate) => located(candidate) && metricSourceDocumentIdentity(candidate) === metricSourceDocumentIdentity(source)));
}
