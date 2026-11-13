export type MarketplaceRefreshJob = {
  listing_id: string; status: "idle" | "queued" | "running" | "succeeded" | "failed" | "blocked";
  job_id: string | null; source_fingerprint: string | null;
  requested_at: string | null; started_at: string | null; completed_at: string | null;
  error_code: string | null; message: string | null;
  figures_updated: boolean; documents_updated: boolean; ppm_updated: boolean;
  review_required: boolean; publication_required: boolean;
};
export const marketplaceRefreshPending = (job?: MarketplaceRefreshJob | null) => job?.status === "queued" || job?.status === "running";
export const marketplaceRefreshTerminal = (job?: MarketplaceRefreshJob | null) => Boolean(job?.job_id && ["succeeded", "failed", "blocked"].includes(job.status));
export function marketplaceRefreshCompletionKey(job?: MarketplaceRefreshJob | null) {
  return marketplaceRefreshTerminal(job) ? JSON.stringify([job!.listing_id, job!.job_id, job!.status, job!.completed_at]) : null;
}
/** A job is never a listing cache payload. Cross-listing replies are rejected before adoption. */
export function checkedMarketplaceRefresh(job: MarketplaceRefreshJob, listingId: string) {
  if (job.listing_id !== listingId || !["idle", "queued", "running", "succeeded", "failed", "blocked"].includes(job.status)) throw new Error("Refresh status belongs to another offer. Reload this listing and try again.");
  return job;
}
const linkedFields = ["loan_amount", "note_rate_pct", "term_months", "offered_amount", "minimum_investment"] as const;
type LinkedField = typeof linkedFields[number];
type LinkedSource = { profile_id: string | null } & Record<LinkedField, string | number | null>;
/** Keep unsaved wording while displaying/sending the current server-owned financing on linked offers. */
export function marketplaceLinkedTerms<T extends Record<LinkedField, string>>(draft: T, listing: LinkedSource): T {
  if (!listing.profile_id) return draft;
  let next = draft;
  for (const key of linkedFields) {
    const value = listing[key] == null ? "" : String(listing[key]);
    if (next[key] !== value) { if (next === draft) next = { ...draft }; next[key] = value; }
  }
  return next;
}
