import type { ApplicationRequirementEvidence } from "./applicationProfile";
import { evidenceReasonLabel } from "./evidenceDecision";

type ReviewEvidence = Pick<ApplicationRequirementEvidence, "ai_decision" | "ai_reason_code" | "ai_explanation"> & Partial<Pick<ApplicationRequirementEvidence, "detected_classification" | "analysis_confidence" | "document_type_candidates" | "evidence_claims">>;
const LOAN_SUPPORT = new Set(["collateral_debt_evidence", "advance_agreement", "mca_agreement", "floorplan_mca_inventory", "payoff_letter", "payoff_or_mortgage_statement"]);
const TYPE_LABELS: Record<string, string> = {
  debt_schedule: "Business debt schedule", business_debt_schedule: "Business debt schedule",
  collateral_debt_evidence: "Loan / financing evidence", advance_agreement: "Advance agreement",
  mca_agreement: "MCA agreement", floorplan_mca_inventory: "Floorplan / MCA inventory evidence",
  payoff_letter: "Payoff letter", payoff_or_mortgage_statement: "Payoff / mortgage statement",
};

/** Document recognition and suitability for a checklist requirement are separate decisions. */
export function evidenceReviewPresentation(file: ReviewEvidence, requirementLabel: string, isDebtSchedule: boolean) {
  const detected = file.detected_classification || file.document_type_candidates?.[0]?.classification || null;
  const classification = detected ? TYPE_LABELS[detected] || detected.replaceAll("_", " ") : null;
  const support = isDebtSchedule && Boolean(detected && LOAN_SUPPORT.has(detected));
  const identity = ["wrong_entity", "entity_mismatch_warning", "entity_unconfirmed", "entity_unconfirmed_warning"].includes(file.ai_reason_code ?? "");
  const requiresReview = ["needs_more", "rejected", "failed"].includes(file.ai_decision);
  const fitUnconfirmed = requiresReview && ["low_confidence", "wrong_document", "document_review_pending"].includes(file.ai_reason_code ?? "");
  return {
    classification,
    confidence: file.analysis_confidence || file.document_type_candidates?.[0]?.confidence || null,
    role: support ? "Loan supporting document" : isDebtSchedule && ["debt_schedule", "business_debt_schedule"].includes(detected ?? "") ? "Debt schedule document" : "Attached evidence",
    headline: support && fitUnconfirmed ? "Supporting document; schedule fit needs review" : fitUnconfirmed ? `Fit for ${requirementLabel} needs review` : evidenceReasonLabel(file.ai_reason_code, file.ai_decision),
    explanation: support && fitUnconfirmed
      ? `This was recognized as ${classification?.toLowerCase()}. It is attached to ${requirementLabel}, but a supporting loan document is not the completed schedule of all business debts.`
      : file.ai_explanation || "A specific review explanation was not recorded. Preview the source before deciding whether it satisfies this requirement.",
    next: identity
      ? "Confirm which business this document belongs to before combining any figures. An accepted document can still have an unresolved business association."
      : support
        ? "Preview the file, confirm the business and obligation it supports, then link it under that obligation’s Loan files. Save the completed debt schedule separately."
        : fitUnconfirmed
          ? "Preview the file and compare it with this requirement. Confirm its business, document type and period; move it to the appropriate requirement if it supports something else."
          : requiresReview
            ? "Preview the source and resolve the recorded concern. Record a reviewed decision, reassign the file, or request a replacement as appropriate."
            : "Review the source and its business association if you need to confirm the recorded acceptance.",
    entities: [...new Set((file.evidence_claims ?? []).map((claim) => claim.entity).filter((entity): entity is string => Boolean(entity)))],
    requiresReview,
  };
}
