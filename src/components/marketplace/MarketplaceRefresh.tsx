"use client";

import { useEffect, useRef } from "react";
import { Btn } from "@/components/ds";
import { useMarketplaceRefresh } from "@/hooks/useMarketplaceRefresh";
import type { CpListing } from "@/hooks/useCapitalPartners";

export function MarketplaceRefresh({ listing, onReview }: { listing: CpListing; onReview?: () => void }) {
  const refresh = useMarketplaceRefresh(listing.id, Boolean(listing.profile_id));
  const previousListing = useRef({ id: listing.id, at: listing.updated_at });
  const readStatus = useRef(refresh.retryStatus); readStatus.current = refresh.retryStatus;
  useEffect(() => {
    const previous = previousListing.current; previousListing.current = { id: listing.id, at: listing.updated_at };
    if (refresh.allowed && previous.id === listing.id && previous.at !== listing.updated_at) void readStatus.current();
  }, [listing.id, listing.updated_at, refresh.allowed]);
  const job = refresh.job;
  const stamp = job?.completed_at && !Number.isNaN(Date.parse(job.completed_at)) ? new Date(job.completed_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : null;
  const failure = refresh.error || (job?.status === "failed" || job?.status === "blocked" ? job.message || "Saved figures need review before the refresh can finish." : "");
  const needsReview = Boolean(job?.review_required || job?.publication_required);
  return <span className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }} aria-label="Saved figures refresh">
    <Btn size="sm" disabled={!refresh.allowed || refresh.pending} title={!listing.profile_id ? "This offer has no linked financial file to refresh." : "Refresh saved figures and document drafts. Offer publication and PPM approval remain separate."} onClick={() => void refresh.refresh()}>{refresh.pending ? "Refreshing…" : failure ? "Retry refresh" : "Refresh"}</Btn>
    <span className="sub" role="status">{refresh.pending ? "Updating saved figures and PDFs…" : failure || (refresh.statusError ? "Refresh status unavailable." : stamp ? `Last updated ${stamp}${needsReview && !onReview ? " · Needs review" : ""}` : needsReview && !onReview ? "Needs review" : "")}</span>
    {needsReview && !refresh.pending && onReview ? <Btn size="sm" onClick={onReview}>Needs review</Btn> : null}
    {refresh.statusError && !refresh.pending ? <Btn size="sm" onClick={() => void refresh.retryStatus()}>Retry status</Btn> : null}
  </span>;
}
