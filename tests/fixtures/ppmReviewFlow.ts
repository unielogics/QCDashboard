// Fictional PPM review fixtures; no customer identities, documents or live actions.
import type { MarketplacePpm, PpmVersion } from "../../src/lib/marketplacePpm";
import { presetFields, presetState, presetVersion } from "./ppmPresetsMembership";
import { ppmListing } from "./marketplacePpm";
export const REVIEW_FINGERPRINT = "a".repeat(64);
export function reviewVersion(number = 2, fingerprint = REVIEW_FINGERPRINT): PpmVersion {
  const value = presetVersion(number, fingerprint);
  const jurisdiction = presetFields().find(field => field.key === "jurisdiction")!.options!.find(option => option.key === "us_state_NJ")!;
  value.legal_inputs.jurisdiction = jurisdiction.text; value.legal_presets = { ...value.legal_presets, jurisdiction: jurisdiction.key };
  value.document.issuer = value.legal_inputs.issuer_legal_name;
  return value;
}
export function reviewState(current: PpmVersion = reviewVersion(), history: PpmVersion[] = []): MarketplacePpm {
  return { ...presetState(current, history), draft_upgrade_available: false };
}
export function legacyBlankReviewState(): MarketplacePpm {
  const value = presetVersion(1, REVIEW_FINGERPRINT, { issuer_legal_name: "Existing Example Issuer LLC", jurisdiction: "" }, {});
  return { ...reviewState(value), draft_upgrade_available: true };
}
export function customBlankReviewState(): MarketplacePpm {
  const value = reviewVersion(); value.legal_inputs.issuer_legal_name = ""; value.legal_presets = { ...value.legal_presets, issuer_legal_name: "custom" };
  return reviewState(value);
}
export function publicationHistoryState(): MarketplacePpm {
  const historical = reviewVersion(1), active = reviewVersion(2), working = reviewVersion(3, "b".repeat(64));
  historical.narrative_sections = { overview: "Historical manual disclosure to retain." };
  active.status = "approved"; active.reviewed_at = "2026-11-11T18:00:00Z";
  historical.stale = true; active.stale = true;
  working.document.sections[0].facts[0].value = "225,000.00 USD";
  return { ...reviewState(working, [active, historical]), active_version: active, working_draft_document_id: working.document_id, latest_version: 3 };
}
/** Metadata for the previously generated, synthetic private PDF preview asset. */
export function generatedPdfPreviewState(): MarketplacePpm {
  const version = reviewVersion(1);
  version.document_id = "synthetic-generated-preview-v1";
  version.legal_inputs.jurisdiction = "Intended governing law: New York; subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.";
  version.legal_presets = { ...version.legal_presets, jurisdiction: "us_state_NY" };
  version.document.listing_ref = "SYNTHETIC-PPM";
  version.document.sections[0].facts = [
    { label: "Offering / business", value: "Synthetic Wellness Services LLC" },
    { label: "Loan principal", value: "120,000.00 USD" },
    { label: "Capital offered", value: "120,000.00 USD" },
    { label: "Minimum investor contribution", value: "120,000.00 USD" },
    { label: "Stated note rate", value: "12.00%" },
    { label: "Note term", value: "12 months" },
    { label: "Expected funding", value: "2026-12-01" },
    { label: "Maturity", value: "2027-12-01" },
  ];
  return { ...reviewState(version), active_version: null, working_draft_document_id: version.document_id, latest_version: 1 };
}
export function reviewListing(blocker: "ppm" | "budget" | "none" = "ppm") {
  const value = ppmListing();
  return { ...value, publish_blockers: blocker === "none" ? [] : blocker === "ppm" ? ["private placement memorandum not uploaded"] : ["deal budget is incomplete"],
    publish_issues: blocker === "none" ? [] : blocker === "ppm" ? [{ code: "ppm_required", message: "private placement memorandum not uploaded", section: "documents" as const, field: null, document_kind: "ppm" as const }] : [{ code: "budget_incomplete", message: "deal budget is incomplete", section: "budget" as const, field: null, document_kind: null }],
  };
}
