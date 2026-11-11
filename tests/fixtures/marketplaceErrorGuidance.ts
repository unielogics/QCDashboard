import { focusBudget, focusListing } from "./marketplaceInputFocus";
import type { CpListing } from "../../src/hooks/useCapitalPartners";
import type { MarketplacePublishIssue } from "../../src/lib/marketplaceIssues";

export const GUIDANCE_LISTING_ID = "99000000-0000-0000-0000-000000000001";
export const OTHER_GUIDANCE_LISTING_ID = "99000000-0000-0000-0000-000000000002";
export const GUIDANCE_INTAKE_ID = "99000000-0000-0000-0000-000000000003";
export const PPM_BLOCKER = "private placement memorandum not uploaded";
export const STALE_FILE_MESSAGE = "The file changed since this listing was prepared. Refresh its financial snapshot and review the current financing and collateral before publishing.";
export const PPM_ISSUE = { code: "ppm_required", message: PPM_BLOCKER, section: "documents" as const, document_kind: "ppm" as const };

export const BUDGET_ISSUES: MarketplacePublishIssue[] = [
  { code: "budget_incomplete", message: "Confirm the closing cost budget, funding mode and investor charges before publishing", section: "budget" },
  { code: "principal_not_applied", message: "Apply the solved gross principal to the shared loan before publishing", section: "budget" },
  { code: "minimum_exceeds_offered", message: "Smallest investor contribution exceeds the capital to raise from investors", section: "budget", field: "minimum_investment" },
];
export const COVERAGE_ISSUE: MarketplacePublishIssue = { code: "proposal_inactive", message: "Restore or synchronize the working financing proposal before publishing; issued terms are a historical reference", section: "coverage_plan" };

export function guidanceListing(options: { linked?: boolean; ready?: boolean; other?: boolean; issues?: MarketplacePublishIssue[] } = {}): CpListing & { publish_issues: MarketplacePublishIssue[] } {
  const listing = focusListing({ linked: options.linked });
  return { ...listing, id: options.other ? OTHER_GUIDANCE_LISTING_ID : GUIDANCE_LISTING_ID,
    ref: options.other ? "CP-OTHER-QA" : "CP-GUIDANCE-QA", name: options.other ? "Other synthetic listing" : "Example guidance listing",
    publish_blockers: options.issues?.map(issue => issue.message) ?? (options.ready ? [] : [PPM_BLOCKER]),
    publish_issues: options.issues ?? (options.ready ? [] : [PPM_ISSUE]),
    documents: options.ready ? [{ id: "synthetic-ppm", kind: "ppm" as const, kind_label: "Private placement memorandum", name: "Synthetic-PPM.pdf", content_type: "application/pdf", size_bytes: 64, version: 1, status: "ready" }] : [] };
}
export const guidanceBudget = focusBudget;
