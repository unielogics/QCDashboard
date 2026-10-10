import { describe, expect, it } from "vitest";
import {
  capitalReadinessBandLabel,
  capitalReadinessMetricLabel,
  formatReadinessMetric,
  listReadinessSummary,
  type CapitalReadinessMetric,
} from "@/lib/capitalReadiness";

describe("capital readiness presentation", () => {
  it("keeps readiness bands distinct from evidence completeness", () => {
    expect(capitalReadinessBandLabel("ready_soon")).toBe("Ready soon");
    expect(capitalReadinessBandLabel("insufficient_evidence")).toBe("Insufficient evidence");
  });

  it("uses the backend metric status without reclassifying rounded values", () => {
    const metric: CapitalReadinessMetric = {
      key: "gross_margin_pct",
      label: "Gross margin",
      value: 12.999,
      unit: "percent",
      status: "acceptable",
    };
    expect(formatReadinessMetric(metric)).toBe("13.0%");
    expect(capitalReadinessMetricLabel(metric.status)).toBe("Acceptable");
  });

  it("uses the source currency for monetary metrics", () => {
    expect(formatReadinessMetric({
      key: "property_noi",
      label: "Property NOI",
      value: 125000,
      unit: "currency",
      status: "healthy",
      source: { currency: "CAD" },
    })).toContain("CA$");
  });

  it("localizes known bands from their stable key", () => {
    expect(capitalReadinessBandLabel("six_to_twelve_months", "es")).toBe("6 a 12 meses");
  });

  it("reads both nested and transitional flattened list summaries", () => {
    expect(listReadinessSummary({
      capital_readiness: {
        score: 82,
        band: "ready_soon",
        review_status: "confirmed",
        evidence_coverage_pct: 91,
        critical_blocker_count: 2,
        overdue_milestone_count: 1,
      },
    })).toMatchObject({ score: 82, band: "ready_soon", review_status: "confirmed", evidence_coverage_pct: 91, critical_blocker_count: 2, overdue_milestone_count: 1 });

    expect(listReadinessSummary({
      capital_readiness_score: 67,
      capital_readiness_band: "three_to_six_months",
      capital_readiness_review_status: "provisional",
    })).toMatchObject({ score: 67, band: "three_to_six_months", review_status: "provisional" });
  });

  it("fails closed when a row has no recognized readiness band", () => {
    expect(listReadinessSummary({ score: 99, band: "approved" })).toBeNull();
    expect(listReadinessSummary(null)).toBeNull();
  });

  it("hides scores below the minimum evidence coverage", () => {
    expect(listReadinessSummary({
      capital_readiness_score: 81,
      capital_readiness_band: "insufficient_evidence",
      capital_readiness_evidence_coverage_pct: 59,
    })?.score).toBeNull();
  });
});
