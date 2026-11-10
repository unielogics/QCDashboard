"use client";

// The file against the marketplace, in one line: is there a listing, what was
// pushed to it and when, and what changed on the file since (the figures, the
// plan, the proposed terms, the programs, the package PDFs). The two actions
// push: "Push the package" copies the current, in-sync executive brief and
// lender packet onto the listing as offering documents and re-reads the
// figures; "Refresh figures" re-reads the figures and the plan alone. A stale
// package cannot be pushed; the API says why in the desk's own words.

import Link from "next/link";
import { useState } from "react";
import { Btn, CellChip, StatusLine } from "@/components/ds";
import { errorMessage } from "@/components/marketplace/shared";
import { useCpListingAction, useCpSourceLookup, type CpListing, type CpSyncState } from "@/hooks/useCapitalPartners";

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function SyncChips({ sync }: { sync: CpSyncState | null | undefined }) {
  if (!sync) return <CellChip tone="mut">Not on the marketplace</CellChip>;
  if (!sync.published) return <CellChip tone="warn">Nothing pushed yet</CellChip>;
  if (sync.up_to_date) return <CellChip tone="ok">Marketplace up to date{sync.published_at ? ` · ${when(sync.published_at)}` : ""}</CellChip>;
  return (
    <>
      <CellChip tone="warn">Unpublished changes</CellChip>
      {sync.changed.map((c) => <CellChip key={c.key} tone="mut">{c.label}</CellChip>)}
    </>
  );
}

export function MarketplacePublishStrip({ profileId, listing, packageInSync, canPublish, compact = false, onStartListing }: {
  /** Lookup mode: the file page resolves the listing from the profile. */
  profileId?: string | null;
  /** Listing mode: the admin page already holds the listing and its sync state. */
  listing?: CpListing | null;
  /** Whether the file's two PDFs are current and in sync; a stale package is not pushed. */
  packageInSync: boolean;
  canPublish: boolean;
  compact?: boolean;
  onStartListing?: () => void;
}) {
  const lookup = useCpSourceLookup({ profile_id: profileId ?? null }, Boolean(profileId) && !listing && canPublish);
  const act = useCpListingAction();
  const [note, setNote] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const listingId = listing?.id ?? lookup.data?.listing?.id ?? null;
  const listingRef = listing?.ref ?? lookup.data?.listing?.name ?? null;
  const sync = listing?.sync ?? lookup.data?.sync ?? null;
  if (!canPublish) return null;
  const run = async (path: string, done: string) => {
    setNote(null);
    try {
      await act.mutateAsync({ listingId: listingId as string, path });
      await lookup.refetch();
      setNote({ tone: "ok", text: done });
    } catch (e) {
      setNote({ tone: "bad", text: errorMessage(e, "The marketplace could not be updated.") });
    }
  };
  return (
    <div className="grid g4" data-testid="marketplace-publish-strip">
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span className="lbl">Marketplace</span>
        {listingId ? <SyncChips sync={sync} /> : <CellChip tone="mut">No listing yet</CellChip>}
        {listingId ? (
          <>
            <Btn size="sm" variant="pri" disabled={act.isPending || !packageInSync} title={packageInSync ? undefined : "Refresh the package first: a stale pair is not pushed."} onClick={() => void run(`/capital/admin/listings/${listingId}/publish-package`, "The executive brief and the lender packet are on the listing, and the figures and the plan were re-read. Members see them once the listing is published.")}>
              {act.isPending ? "Pushing…" : "Push the package to the marketplace"}
            </Btn>
            <Btn size="sm" disabled={act.isPending} onClick={() => void run(`/capital/admin/listings/${listingId}/refresh-snapshot`, "The figures, the plan, the terms and the programs on the listing match the file now.")}>Refresh figures only</Btn>
            <Link className="btn btn-sm" href={`/admin/marketplace/${listingId}`}>Open the listing{listingRef && listing ? ` ${listingRef}` : ""}</Link>
          </>
        ) : onStartListing ? (
          <Btn size="sm" onClick={onStartListing} disabled={!packageInSync}>Prepare marketplace listing</Btn>
        ) : null}
      </div>
      {!compact && listingId && sync && !sync.up_to_date && sync.published ? (
        <span className="sub">Changed on the file since the last push: {sync.changed.map((c) => c.label.toLowerCase()).join(", ")}. Push the package to carry them over{packageInSync ? "" : " once the package is refreshed"}.</span>
      ) : null}
      {!compact && listingId && sync && !sync.published ? <span className="sub">The listing has never received the package. Push it so members get the executive brief and the lender packet with the figures and the plan.</span> : null}
      {!compact && !listingId ? <span className="sub">{packageInSync ? "Review offering terms below, then create a listing draft from this package." : "Generate a current investor package before creating its marketplace listing."}</span> : null}
      {note ? <StatusLine tone={note.tone}>{note.text}</StatusLine> : null}
    </div>
  );
}
