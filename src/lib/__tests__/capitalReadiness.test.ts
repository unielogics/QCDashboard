import { describe, expect, it } from "vitest";
import {
  capitalReadinessBandLabel,
  capitalReadinessMetricLabel,
  formatReadinessMetric,
  formatCapitalReadinessMoney,
  capitalReadinessWarningText,
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

  it("does not invent USD for an unknown document currency", () => {
    expect(formatCapitalReadinessMoney(150000, "XXX")).toBe("150,000 (currency unconfirmed)");
    expect(formatCapitalReadinessMoney(150000, null, "es")).toBe("150,000 (moneda por confirmar)");
    expect(formatReadinessMetric({ key: "revenue", label: "Revenue", value: 150000, unit: "currency", status: "healthy", source: { currency: "XXX" } })).not.toContain("$");
  });

  it("renders structured reconciliation warnings without stringifying objects", () => {
    expect(capitalReadinessWarningText({ code: "gross_profit_reconciliation", severity: "requires_review" })).toContain("Printed gross profit differs");
    expect(capitalReadinessWarningText({ code: "financial_entity_unidentified", detail: "Document name missing" }, "es")).toContain("no identifica al negocio");
    expect(capitalReadinessWarningText({ code: "financial_accounting_basis_unknown" }, "es")).toContain("base contable");
    expect(capitalReadinessWarningText({ code: "financial_currency_unknown" }, "es")).toContain("moneda");
    expect(capitalReadinessWarningText({ code: "financial_period_unknown" }, "es")).toContain("período financiero");
    expect(capitalReadinessWarningText("Legacy warning")).toBe("Legacy warning");
    expect(capitalReadinessWarningText({ code: "new_code" })).toBe("Source data requires review. Check the linked document.");
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
