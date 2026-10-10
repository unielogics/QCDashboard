import type { ChipTone } from "@/components/ds";

export type CapitalReadinessReviewStatus = "provisional" | "awaiting_review" | "confirmed" | "revised";
export type CapitalReadinessBand =
  | "ready_soon"
  | "three_to_six_months"
  | "six_to_twelve_months"
  | "one_plus_year"
  | "insufficient_evidence";
export type CapitalReadinessMetricStatus = "concerning" | "acceptable" | "healthy" | "very_strong" | "unavailable";

export type CapitalReadinessPillar = {
  key: string;
  label: string;
  weight: number;
  score: number | null;
  coverage_pct: number;
  status: string;
};

export type CapitalReadinessMetric = {
  key: string;
  label: string;
  value: number | string | null;
  numerator?: number | null;
  denominator?: number | null;
  unit?: string | null;
  status: CapitalReadinessMetricStatus;
  source_period_id?: string | null;
  confidence_pct?: number | null;
  target_value?: number | null;
  source?: {
    trend_percentage_points?: number | null;
    not_applicable?: boolean;
    property_policy?: string | null;
    entity_name?: string | null;
    accounting_basis?: string | null;
    currency?: string | null;
    period_start?: string | null;
    period_end?: string | null;
    [key: string]: unknown;
  } | null;
};

export type CapitalReadinessNarrativeItem = string | {
  key?: string;
  title?: string;
  label?: string;
  detail?: string;
  severity?: string;
  impact?: string | number;
  metric_key?: string;
};

export type CapitalReadinessAction = {
  id?: string;
  action_key?: string;
  profile_id?: string;
  version?: number;
  key?: string;
  title?: string;
  label?: string;
  detail?: string;
  phase?: number | string;
  phase_key?: string;
  status?: string;
  owner_user_id?: string | null;
  due_date?: string | null;
  baseline?: Record<string, unknown> | null;
  target?: Record<string, unknown> | null;
  dependencies?: string[];
  required_evidence?: string[];
  expected_impact?: string | number | null;
  created_at?: string;
  updated_at?: string;
};

export type CapitalReadinessPhase = {
  key: string;
  label: string;
  status: "not_started" | "in_progress" | "ready" | "completed";
  description?: string | null;
  actions: CapitalReadinessAction[];
};

export type CapitalReadinessProgramOpportunity = {
  key?: string;
  program_key?: string;
  title?: string;
  label?: string;
  program_name?: string;
  status?: string;
  detail?: string;
  note?: string | null;
  gaps?: string[];
};

export type CapitalReadinessSource = {
  kind: string;
  content_hash: string;
  label?: string;
  file_name?: string;
  period?: string;
  review_status?: string;
};

export type CapitalReadinessMetricChange = {
  key: string;
  previous_value: number | string | null;
  current_value: number | string | null;
  value_delta: number | null;
  previous_status: string | null;
  current_status: string | null;
};

export type CapitalReadinessMaterialChange = {
  previous_snapshot_id?: string;
  previous_snapshot_version: number;
  score_delta: number | null;
  band_changed: boolean;
  previous_band: string;
  current_band: string;
  evidence_coverage_delta: number;
  changed_metrics: CapitalReadinessMetricChange[];
  is_material: boolean;
};

export type ApplicationCapitalReadinessSnapshot = {
  id: string;
  profile_id: string;
  snapshot_version: number;
  policy_key: string;
  policy_version: number;
  formula_version: "score_v2" | string;
  evidence_fingerprint: string;
  as_of: string;
  communication_locale?: "en" | "es";
  display_locale?: "en" | "es";
  review_status: CapitalReadinessReviewStatus;
  score: number | null;
  band: CapitalReadinessBand;
  evidence_coverage_pct: number;
  confidence_pct: number;
  pillars: CapitalReadinessPillar[];
  metrics: CapitalReadinessMetric[];
  strengths: CapitalReadinessNarrativeItem[];
  blockers: CapitalReadinessNarrativeItem[];
  phases: CapitalReadinessPhase[];
  program_opportunities: CapitalReadinessProgramOpportunity[];
  source_manifest: CapitalReadinessSource[];
  material_change?: CapitalReadinessMaterialChange | null;
  created_at: string;
  reviewed_at?: string | null;
  reviewed_by_user_id?: string | null;
};

export type CapitalReadinessFinancialPeriod = {
  id: string;
  profile_id: string;
  entity_name: string;
  accounting_basis: "cash" | "accrual" | "tax" | "unknown";
  currency: string;
  period_start: string;
  period_end: string;
  months_covered: number;
  source_kind: "stated" | "derived" | "self_reported" | "ai_extracted";
  review_status: "pending" | "confirmed" | "rejected" | "superseded" | string;
  cogs_applicability: "applicable" | "not_applicable" | "unknown";
  revenue: number | null;
  cogs: number | null;
  gross_profit: number | null;
  derived_gross_profit: number | null;
  operating_expenses: number | null;
  operating_income: number | null;
  net_income: number | null;
  ebitda: number | null;
  adjusted_ebitda: number | null;
  confidence: number | null;
  source_file_id: string | null;
  source_analysis_id: string | null;
  extractor_version: string | null;
  content_hash: string | null;
  reconciliation_warnings: string[];
  created_at: string;
  reviewed_at: string | null;
  reviewed_by_user_id: string | null;
};

export type CapitalReadinessListSummary = {
  score: number | null;
  band: CapitalReadinessBand;
  review_status?: CapitalReadinessReviewStatus | null;
  evidence_coverage_pct?: number | null;
  confidence_pct?: number | null;
  top_blocker?: string | null;
  critical_blocker_count?: number;
  overdue_milestone_count?: number;
  as_of?: string | null;
};

export const CAPITAL_READINESS_PHASES = [
  { key: "baseline_health_check", number: 1, label: "Baseline health check", detail: "Verify the starting financial and banking metrics." },
  { key: "financial_restructuring", number: 2, label: "Financial restructuring", detail: "Document legitimate adjustments and clean up financial presentation." },
  { key: "system_tracking", number: 3, label: "System tracking", detail: "Monitor behavior, targets, and monthly progress." },
  { key: "pre_underwriting", number: 4, label: "Pre-underwriting", detail: "Verify milestones and build the lender-ready package." },
  { key: "prime_capital", number: 5, label: "Preparing for prime capital", detail: "Align a verified file with an appropriate capital path." },
] as const;

const BAND_LABELS: Record<CapitalReadinessBand, string> = {
  ready_soon: "Ready soon",
  three_to_six_months: "3–6 months",
  six_to_twelve_months: "6–12 months",
  one_plus_year: "1+ year",
  insufficient_evidence: "Insufficient evidence",
};

const BAND_LABELS_ES: Record<CapitalReadinessBand, string> = {
  ready_soon: "Listo pronto",
  three_to_six_months: "3 a 6 meses",
  six_to_twelve_months: "6 a 12 meses",
  one_plus_year: "Más de 1 año",
  insufficient_evidence: "Evidencia insuficiente",
};

const REVIEW_LABELS: Record<CapitalReadinessReviewStatus, string> = {
  provisional: "Provisional",
  awaiting_review: "Awaiting QC review",
  confirmed: "QC reviewed",
  revised: "QC revised",
};

const METRIC_LABELS: Record<CapitalReadinessMetricStatus, string> = {
  concerning: "Concerning",
  acceptable: "Acceptable",
  healthy: "Healthy",
  very_strong: "Very strong",
  unavailable: "Unavailable",
};

export function capitalReadinessBandLabel(band: CapitalReadinessBand, locale: "en" | "es" = "en"): string {
  return (locale === "es" ? BAND_LABELS_ES : BAND_LABELS)[band] ?? String(band).replaceAll("_", " ");
}

export function capitalReadinessReviewLabel(status: CapitalReadinessReviewStatus): string {
  return REVIEW_LABELS[status] ?? String(status).replaceAll("_", " ");
}

export function capitalReadinessMetricLabel(status: CapitalReadinessMetricStatus): string {
  return METRIC_LABELS[status] ?? String(status).replaceAll("_", " ");
}

export function capitalReadinessBandTone(band: CapitalReadinessBand): ChipTone {
  if (band === "ready_soon") return "ok";
  if (band === "three_to_six_months") return "acc";
  if (band === "six_to_twelve_months") return "warn";
  if (band === "one_plus_year") return "bad";
  return "mut";
}

export function capitalReadinessMetricTone(status: CapitalReadinessMetricStatus): ChipTone {
  if (status === "very_strong" || status === "healthy") return "ok";
  if (status === "acceptable") return "warn";
  if (status === "concerning") return "bad";
  return "mut";
}

export function capitalReadinessReviewTone(status: CapitalReadinessReviewStatus): ChipTone {
  if (status === "confirmed") return "ok";
  if (status === "revised") return "acc";
  if (status === "awaiting_review") return "warn";
  return "mut";
}

export function capitalReadinessItemTitle(item: CapitalReadinessNarrativeItem): string {
  if (typeof item === "string") return item;
  return item.title || item.label || item.detail || item.key?.replaceAll("_", " ") || "Readiness item";
}

export function capitalReadinessItemDetail(item: CapitalReadinessNarrativeItem): string | null {
  if (typeof item === "string") return null;
  const title = capitalReadinessItemTitle(item);
  return item.detail && item.detail !== title ? item.detail : null;
}

export function formatReadinessMetric(metric: CapitalReadinessMetric): string {
  if (metric.value == null || metric.status === "unavailable") return "—";
  if (typeof metric.value === "string") return metric.value;
  if (metric.unit === "percent" || metric.unit === "%" || metric.key.endsWith("_pct")) return `${metric.value.toFixed(1)}%`;
  if (metric.unit === "currency" || metric.unit === "usd") {
    return metric.value.toLocaleString("en-US", { style: "currency", currency: safeCurrency(metric.source?.currency), maximumFractionDigits: 0 });
  }
  if (metric.unit === "ratio" || metric.key.includes("dscr")) return `${metric.value.toFixed(2)}x`;
  return metric.value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function safeCurrency(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) return "USD";
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: value }).format(0);
    return value;
  } catch {
    return "USD";
  }
}

export function listReadinessSummary(value: unknown): CapitalReadinessListSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const nested = row.capital_readiness && typeof row.capital_readiness === "object"
    ? row.capital_readiness as Record<string, unknown>
    : null;
  const source = nested ?? row;
  const band = source.band ?? row.capital_readiness_band;
  if (typeof band !== "string" || !(band in BAND_LABELS)) return null;
  const score = source.score ?? row.capital_readiness_score;
  const reviewStatus = source.review_status ?? row.capital_readiness_review_status;
  const coverage = source.evidence_coverage_pct ?? row.capital_readiness_evidence_coverage_pct;
  const confidence = source.confidence_pct ?? row.capital_readiness_confidence_pct;
  const blocker = source.top_blocker ?? row.capital_readiness_top_blocker;
  const criticalBlockerCount = source.critical_blocker_count ?? row.capital_readiness_critical_blocker_count;
  const overdueMilestoneCount = source.overdue_milestone_count ?? row.capital_readiness_overdue_milestone_count;
  const asOf = source.as_of ?? row.capital_readiness_as_of;
  return {
    // Fail closed at the policy's evidence threshold, including when a legacy
    // list endpoint accidentally includes a score that should still be hidden.
    score: typeof score === "number" && (typeof coverage !== "number" || coverage >= 60) ? score : null,
    band: band as CapitalReadinessBand,
    review_status: typeof reviewStatus === "string" && reviewStatus in REVIEW_LABELS ? reviewStatus as CapitalReadinessReviewStatus : null,
    evidence_coverage_pct: typeof coverage === "number" ? coverage : null,
    confidence_pct: typeof confidence === "number" ? confidence : null,
    top_blocker: typeof blocker === "string" ? blocker : null,
    critical_blocker_count: typeof criticalBlockerCount === "number" ? criticalBlockerCount : 0,
    overdue_milestone_count: typeof overdueMilestoneCount === "number" ? overdueMilestoneCount : 0,
    as_of: typeof asOf === "string" ? asOf : null,
  };
}
