import { describe, expect, it } from "vitest";
import { compactMetricSources } from "../cockpit/financialMetricSources";

describe("metric source list clarity", () => {
  it("suppresses a bare reporting-period reference when that same source version has a citation", () => {
    const base = { file_id: "file", file_name: "Profit.pdf", analysis_id: "analysis", content_hash: "a".repeat(64), period_start: "2026-01-01", period_end: "2026-12-31" };
    const located = { ...base, pages: [2], citations: [{ page: 2, quote: "Net income $40,000" }] };
    expect(compactMetricSources([base, located])).toEqual([located]);
    expect(compactMetricSources([{ ...base, content_hash: "b".repeat(64) }, located])).toHaveLength(2);
    expect(compactMetricSources([{ ...located, pages: [3] }, located])).toHaveLength(2);
  });
});
