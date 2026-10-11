import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useApi", () => ({ useAuthedApi: () => null, useCurrentUser: () => ({ data: null }) }));
import { CapitalReadinessSnapshotView, CapitalReadinessWarnings, MarginTierGuide, MetricCard } from "../CapitalReadinessPanel";
import { EvidenceIdentityWarning } from "../EvidenceIdentityWarning";
import { CellChip } from "@/components/ds";
import { evidenceDecisionLabel, evidenceDecisionTone } from "@/lib/evidenceDecision";
import type { ApplicationCapitalReadinessSnapshot, CapitalReadinessMetric } from "@/lib/capitalReadiness";

// This repository's Vitest transform uses classic JSX; Next uses automatic
// JSX in production. Supply the test-only runtime without changing components.
beforeAll(() => vi.stubGlobal("React", React));
afterAll(() => vi.unstubAllGlobals());

const metric: CapitalReadinessMetric = {
  key: "gross_margin_pct", label: "Gross margin", value: 12.999,
  numerator: 129990, denominator: 1000000, unit: "percent", status: "acceptable",
  source: {
    entity_name: "Uploaded Business", currency: "USD", accounting_basis: "accrual",
    period_start: "2025-01-01", period_end: "2025-12-31",
    source_period_ids: ["period-a", "period-b"], aggregation: "ratio_of_sums",
    identity_warning: true, provisional: true,
    context_warnings: [{ code: "entity_mismatch_warning", severity: "warning", detail: "Document name differs; figures are retained." }],
  },
};

describe("numbers-first readiness presentation", () => {
  it("does not hide a server score or useful margins because identity has a warning", () => {
    const snapshot: ApplicationCapitalReadinessSnapshot = {
      id: "snapshot-1", profile_id: "profile-1", snapshot_version: 2,
      policy_key: "qc_lending_margin_v1", policy_version: 1, formula_version: "score_v2",
      evidence_fingerprint: "fingerprint", as_of: "2026-10-11T12:00:00Z", created_at: "2026-10-11T12:00:00Z",
      review_status: "provisional", score: 85, band: "ready_soon", evidence_coverage_pct: 80, confidence_pct: 75,
      metrics: [metric], pillars: [], strengths: [], blockers: [], phases: [], program_opportunities: [], source_manifest: [],
    };
    const html = renderToStaticMarkup(createElement(CapitalReadinessSnapshotView, { snapshot, locale: "en" }));
    expect(html).toContain("<strong>85</strong>");
    expect(html).toContain("13.0%");
    expect(html).toContain("Identity needs review");
    expect(html).toContain("Ready soon");
    expect(html).not.toContain("Insufficient evidence");
  });

  it("keeps the backend unrounded tier despite the rounded displayed margin", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, { metric, locale: "en", sourcePeriodLabel: "Source period" }));
    expect(html).toContain("13.0%");
    expect(html).toContain("Acceptable");
    expect(html).not.toContain(">Healthy<");
    expect(html).toContain("$129,990 ÷ $1,000,000 × 100");
    expect(html).toContain("Provisional figures");
    expect(html).toContain("Identity needs review");
    expect(html).toContain("figures are retained");
  });

  it("shows source dates and ratio-of-sums lineage for aggregate metrics without a singular period ID", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, { metric, locale: "en", sourcePeriodLabel: "Source period" }));
    expect(html).toContain("Uploaded Business");
    expect(html).toContain("Jan 1, 2025 – Dec 31, 2025");
    expect(html).toContain("2 compatible periods · ratio of sums");
    expect(html).not.toContain("Dec 31, 2024");
  });

  it("localizes provisional/context warnings and unknown currencies", () => {
    const html = renderToStaticMarkup(createElement(MetricCard, { metric: { ...metric, source: { ...metric.source, currency: "XXX" } }, locale: "es", sourcePeriodLabel: "Período de origen" }));
    expect(html).toContain("Cifras provisionales");
    expect(html).toContain("Identidad por revisar");
    expect(html).toContain("moneda por confirmar");
    expect(html).toContain("Las cifras siguen utilizables");
    expect(html).not.toContain("Document name differs");
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("$");
  });

  it("renders structured source warnings safely and does not call identity review a rejection", () => {
    const html = renderToStaticMarkup(createElement(CapitalReadinessWarnings, { warnings: [{ code: "entity_mismatch_warning", severity: "warning", detail: "Different name <script>" }, { code: "gross_profit_reconciliation", severity: "requires_review" }], locale: "en" }));
    expect(html).toContain("Different name &lt;script&gt;");
    expect(html).toContain("Printed gross profit differs");
    expect(html).toContain('class="requires-review"');
    expect(html).not.toContain("[object Object]");
    expect(html).not.toContain("<script>");
    expect(renderToStaticMarkup(createElement(CapitalReadinessWarnings, { warnings: [] }))).toBe("");
  });

  it("exposes all four exact diagnostic tiers with approval caveat in both languages", () => {
    for (const locale of ["en", "es"] as const) {
      const html = renderToStaticMarkup(createElement(MarginTierGuide, { locale }));
      for (const tier of ["&lt; 10%", "10% – &lt; 13%", "13% – &lt; 18%", "≥ 18%", "&lt; 2%", "2% – &lt; 3%", "3% – &lt; 5%", "≥ 5%", "× 100"]) expect(html).toContain(tier);
      expect(html).toContain(locale === "es" ? "no decisiones de aprobación" : "not approval decisions");
      expect(html).toContain("qc_lending_margin_v1");
      expect(html).toContain(locale === "es" ? "política sectorial publicada puede sustituir" : "published industry policy may override");
    }
  });

  it("keeps green acceptance alongside an independent amber warning", () => {
    const accepted = renderToStaticMarkup(createElement(CellChip, { tone: evidenceDecisionTone("accepted"), children: evidenceDecisionLabel("accepted", "ai") }));
    const warning = renderToStaticMarkup(createElement(EvidenceIdentityWarning, { reasonCode: "entity_mismatch_warning", decision: "accepted" }));
    expect(accepted).toContain("Accepted by AI");
    expect(accepted).toContain("ok");
    expect(warning).toContain("warn");
    expect(warning).toContain("Entity name needs review");
    const detail = renderToStaticMarkup(createElement(EvidenceIdentityWarning, { reasonCode: "entity_mismatch_warning", decision: "accepted", detail: true, locale: "es" }));
    expect(detail).toContain("documento fue aceptado");
    expect(detail).toContain("no combine resultados");
    expect(renderToStaticMarkup(createElement(EvidenceIdentityWarning, { reasonCode: "entity_mismatch_warning", decision: "rejected" }))).toBe("");
    expect(renderToStaticMarkup(createElement(EvidenceIdentityWarning, { reasonCode: "wrong_entity", decision: "rejected" }))).toBe("");
  });
});
