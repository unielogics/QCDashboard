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
export function reviewListing(blocker: "ppm" | "budget" | "none" = "ppm") {
  const value = ppmListing();
  return { ...value, publish_blockers: blocker === "none" ? [] : blocker === "ppm" ? ["private placement memorandum not uploaded"] : ["deal budget is incomplete"],
    publish_issues: blocker === "none" ? [] : blocker === "ppm" ? [{ code: "ppm_required", message: "private placement memorandum not uploaded", section: "documents" as const, field: null, document_kind: "ppm" as const }] : [{ code: "budget_incomplete", message: "deal budget is incomplete", section: "budget" as const, field: null, document_kind: null }],
  };
}
