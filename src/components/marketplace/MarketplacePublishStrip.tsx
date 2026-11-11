"use client";

// Investor publication and package freshness are different facts. A package
// push updates offering documents; only the listing's lifecycle publishes it.

import Link from "next/link";
import { useFileWorkspace, FileWorkspaceLink } from "@/components/file/FileWorkspaceContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, CellChip, StatusLine } from "@/components/ds";
import { MarketplaceOfferLink } from "@/components/marketplace/MarketplaceOfferLink";
import { useCpListingAction, useCpProfilePublication, useCpSourceLookup, type CpListing, type CpSyncState } from "@/hooks/useCapitalPartners";
import { marketplacePublicationState, type MarketplacePublicationState } from "@/lib/marketplacePublication";
import { dedupeMarketplaceIssues, marketplaceApiIssues, marketplacePublishIssues, type MarketplaceIssue } from "@/lib/marketplaceIssues";
import { MarketplaceIssues } from "./MarketplaceIssues";

export type { MarketplacePublicationState } from "@/lib/marketplacePublication";

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function SyncChips({ sync }: { sync: CpSyncState | null | undefined }) {
  if (!sync) return <CellChip tone="mut">Package sync unavailable</CellChip>;
  if (!sync.published) return <CellChip tone="warn">Package not pushed</CellChip>;
  if (sync.up_to_date) return <CellChip tone="ok">Listing package up to date{sync.published_at ? ` · ${when(sync.published_at)}` : ""}</CellChip>;
  return <><CellChip tone="warn">Package changes to push</CellChip>{sync.changed.map((c) => <CellChip key={c.key} tone="mut">{c.label}</CellChip>)}</>;
}

export function MarketplacePublishStrip({ profileId, listing, packageInSync, canPublish, compact = false, onStartListing, onPublicationState, onFixIssue, onActionError, onActionSuccess }: {
  /** Lookup mode is available to staff with underwriting access to this file. */
  profileId?: string | null;
  /** Admin listing mode already has the full listing and package sync state. */
  listing?: CpListing | null;
  packageInSync: boolean;
  /** Marketplace changes remain super-admin only; status and sharing are read-only. */
  canPublish: boolean;
  compact?: boolean;
  onStartListing?: () => void;
  onPublicationState?: (state: MarketplacePublicationState) => void;
  onFixIssue?: (issue: MarketplaceIssue) => void;
  onActionError?: (error: unknown) => void;
  onActionSuccess?: () => void;
}) {
  const fileWorkspace = useFileWorkspace();
  const publication = useCpProfilePublication(profileId, !listing);
  const lookup = useCpSourceLookup({ profile_id: profileId ?? null }, Boolean(profileId) && !listing && canPublish);
  const act = useCpListingAction();
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [actionIssues, setActionIssues] = useState<MarketplaceIssue[]>([]);
  const offer = listing ?? publication.data?.listing ?? null;
  const listingId = offer?.id ?? null;
  const sync = listing?.sync ?? (lookup.data?.listing?.id === listingId ? lookup.data?.sync : null) ?? null;
  const loading = Boolean(profileId && !listing && publication.isLoading);
  const failed = !listing && publication.isError;
  const offerId = offer?.id, offerRef = offer?.ref, offerStatus = offer?.status;
  const resolvedProfile = profileId ?? listing?.profile_id ?? null;
  const state = useMemo(() => marketplacePublicationState(offerId && offerStatus ? { id: offerId, ref: offerRef ?? "", status: offerStatus } : null, { profileId: resolvedProfile, loading, error: failed }), [offerId, offerRef, offerStatus, resolvedProfile, loading, failed]);
  const callback = useRef(onPublicationState);
  callback.current = onPublicationState;
  const scope = useRef("");
  scope.current = `${profileId ?? ""}:${listingId ?? ""}`;
  useEffect(() => { callback.current?.(state); }, [state]);
  useEffect(() => { setNote(null); setActionIssues([]); }, [profileId, listingId]);

  const run = async (path: string, done: string) => {
    const currentScope = scope.current;
    setNote(null);
    setActionIssues([]);
    try {
      await act.mutateAsync({ listingId: listingId as string, path });
      if (profileId && !listing) await Promise.all([lookup.refetch(), publication.refetch()]);
      if (scope.current === currentScope) { setNote({ tone: "ok", text: done }); onActionSuccess?.(); }
    } catch (e) {
      if (scope.current === currentScope) {
        if (onActionError) onActionError(e);
        else setActionIssues(marketplaceApiIssues(e, { linked: Boolean(resolvedProfile), action: "snapshot" }));
      }
    }
  };
  return (
    <div className="grid g8" data-testid="marketplace-publish-strip">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="lbl">Investor marketplace</span>
        {loading ? <span className="sub" role="status">Checking offer publication…</span> : failed ? <><StatusLine tone="bad">Offer publication could not be verified.</StatusLine><Btn size="sm" onClick={() => void publication.refetch()}>Retry publication status</Btn></> : offer ? <MarketplaceOfferLink listing={offer} compact={compact} /> : <CellChip tone="mut">No marketplace offer</CellChip>}
      </div>
      {canPublish && !loading && !failed ? <>
        {listingId ? <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <SyncChips sync={sync} />
          <Btn size="sm" variant="pri" disabled={act.isPending || !packageInSync} title={packageInSync ? undefined : "Refresh the investor package before updating its listing documents."} onClick={() => void run(`/capital/admin/listings/${listingId}/publish-package`, "The listing package and financial figures were updated. A draft still needs Publish offer in the listing editor before members can see it.")}>
            {act.isPending ? "Updating…" : "Update listing package"}
          </Btn>
          <Btn size="sm" disabled={act.isPending} onClick={() => void run(`/capital/admin/listings/${listingId}/refresh-snapshot`, "The listing figures now match the file. Its publication status has not changed.")}>Refresh figures only</Btn>
          <Link className="btn btn-sm" href={`/admin/marketplace/${listingId}`} target={fileWorkspace ? "_blank" : undefined} rel={fileWorkspace ? "noopener noreferrer" : undefined}>{offer?.status === "draft" ? "Review and publish offer" : "Manage listing"}{offer?.ref ? ` ${offer.ref}` : ""}</Link>
        </div> : onStartListing ? fileWorkspace && !fileWorkspace.pageMode ? <FileWorkspaceLink tool="marketplace">Prepare marketplace listing</FileWorkspaceLink> : <Btn size="sm" onClick={onStartListing} disabled={!packageInSync}>Prepare marketplace listing</Btn> : null}
        {!compact && listingId && sync?.published && !sync.up_to_date ? <span className="sub">Changed on the file since the last package update: {sync.changed.map(c => c.label.toLowerCase()).join(", ")}. Refresh the investor package, then update the listing package.</span> : null}
        {!compact && !listingId ? <span className="sub">{packageInSync ? "Review the investor terms, then prepare a listing draft. Publish offer makes it available to approved capital partners." : "Generate a current investor package before preparing its marketplace listing."}</span> : null}
      </> : null}
      {note ? <StatusLine tone={note.tone}>{note.text}</StatusLine> : null}
      {!onFixIssue ? <MarketplaceIssues listingId={listingId ?? undefined} issues={dedupeMarketplaceIssues([...actionIssues, ...(listing?.status === "draft" ? marketplacePublishIssues(listing.publish_blockers, listing.publish_issues, { linked: Boolean(resolvedProfile) }) : [])])} /> : null}
    </div>
  );
}
