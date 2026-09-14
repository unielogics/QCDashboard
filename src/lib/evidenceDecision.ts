import type { EvidenceDecisionStatus } from "@/lib/applicationProfile";

const REASON_LABELS: Record<string, string> = {
  validated: "Validated",
  wrong_entity: "Entity mismatch",
  entity_unconfirmed: "Entity not confirmed",
  wrong_document: "Wrong document type",
  wrong_period: "Period does not qualify",
  incomplete: "Incomplete document",
  unreadable: "Unreadable document",
  duplicate: "Duplicate document",
  analysis_pending: "Analysis pending",
  ai_override: "Staff accepted",
  manual_override: "Staff override",
  other: "Needs staff review",
  password_protected: "Password-protected PDF",
  zip_parent_archive: "ZIP archive expanded",
  zip_entry_encrypted: "Encrypted ZIP entry",
  zip_entry_limit: "ZIP entry limit reached",
  zip_parse_failed: "ZIP could not be opened",
  fetch_failed: "File retrieval failed",
};

const DECISION_SEVERITY: Record<EvidenceDecisionStatus, number> = {
  accepted: 1,
  processing: 2,
  needs_more: 3,
  rejected: 4,
  failed: 5,
};

export function aggregateEvidenceDecisions(decisions: EvidenceDecisionStatus[]): {
  decision: EvidenceDecisionStatus | null;
  mixed: boolean;
} {
  if (!decisions.length) return { decision: null, mixed: false };
  return {
    decision: [...decisions].sort((left, right) => DECISION_SEVERITY[right] - DECISION_SEVERITY[left])[0],
    mixed: new Set(decisions).size > 1,
  };
}

export function evidenceDecisionLabel(
  decision?: EvidenceDecisionStatus | string | null,
  actor?: string | null,
): string {
  const suffix = actor === "ai" ? " by AI" : actor === "staff" ? " by staff" : actor === "system" ? " by system" : "";
  if (decision === "accepted") return `Accepted${suffix}`;
  if (decision === "needs_more") return `Needs more${suffix}`;
  if (decision === "rejected") return `Rejected${suffix}`;
  if (decision === "failed") return "Analysis failed";
  if (decision === "processing") return "Processing";
  return "Unassigned evidence";
}

export function evidenceDecisionTone(
  decision?: EvidenceDecisionStatus | string | null,
): "ok" | "acc" | "warn" | "bad" | "mut" {
  if (decision === "accepted") return "ok";
  if (decision === "rejected" || decision === "failed") return "bad";
  if (decision === "needs_more") return "warn";
  if (decision === "processing") return "acc";
  return "mut";
}

export function evidenceReasonLabel(
  reasonCode?: string | null,
  decision?: EvidenceDecisionStatus | string | null,
): string {
  const normalized = reasonCode?.trim().toLocaleLowerCase();
  if (normalized && REASON_LABELS[normalized]) return REASON_LABELS[normalized];
  if (normalized) {
    return normalized
      .split("_")
      .filter(Boolean)
      .map((word) => `${word[0]?.toLocaleUpperCase() ?? ""}${word.slice(1)}`)
      .join(" ");
  }
  if (decision === "accepted") return "Validated";
  if (decision === "failed") return "Analysis failed";
  if (decision === "processing") return "Analysis pending";
  if (decision === "rejected" || decision === "needs_more") return "Reason not provided";
  return "Not assigned";
}

export function evidenceActorLabel(actor?: string | null): string {
  if (actor === "ai") return "AI decision";
  if (actor === "staff") return "Staff decision";
  if (actor === "system") return "System decision";
  return "Decision pending";
}

export function evidenceAnalysisLabel(status?: string | null, reasonCode?: string | null): string {
  if (status === "skipped") return reasonCode ? evidenceReasonLabel(reasonCode) : "AI analysis skipped";
  if (status === "failed") return "AI analysis failed";
  if (["pending", "queued", "processing", "running"].includes(status ?? "")) return "AI analysis in progress";
  if (status === "completed") return "AI analysis complete";
  return "AI analysis not started";
}

export function evidenceCoverageLabel(coverage?: Record<string, unknown> | null): string {
  if (!coverage) return "";
  const periods = [
    ...(Array.isArray(coverage.months) ? coverage.months : []),
    ...(Array.isArray(coverage.years) ? coverage.years : []),
  ].map(String).filter(Boolean);
  if (periods.length) return periods.join(", ");
  const supported = Array.isArray(coverage.classifications)
    ? coverage.classifications.map(String).filter(Boolean)
    : [];
  if (supported.length) return supported.map((value) => value.replaceAll("_", " ")).join(", ");
  return "";
}
