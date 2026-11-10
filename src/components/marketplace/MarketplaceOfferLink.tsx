"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, BtnLink, CellChip } from "@/components/ds";
import { marketplacePublicationLabel, marketplacePublicationState, type MarketplaceOfferReference } from "@/lib/marketplacePublication";

/** Authenticated member URL only. Copying a link does not publish or deliver an offer. */
export function MarketplaceOfferLink({ listing, compact = false, showStatus = true }: {
  listing: MarketplaceOfferReference;
  compact?: boolean;
  showStatus?: boolean;
}) {
  const publication = marketplacePublicationState(listing);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "failed">("idle");
  const generation = useRef(0);
  useEffect(() => { generation.current += 1; setCopyState("idle"); return () => { generation.current += 1; }; }, [publication.memberUrl]);
  const copy = async () => {
    if (!publication.memberUrl) return;
    const current = generation.current;
    setCopyState("copying");
    try {
      await navigator.clipboard.writeText(publication.memberUrl);
      if (generation.current === current) setCopyState("copied");
    } catch {
      if (generation.current === current) setCopyState("failed");
    }
  };
  const unavailable = listing.status === "withdrawn" ? "Withdrawn offers are unavailable to members." : "Publish the offer before sharing its investor link.";
  return (
    <div className="grid g4" data-testid="marketplace-offer-link">
      <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {showStatus ? <CellChip tone={publication.isPublished ? "ok" : "mut"}>{marketplacePublicationLabel(listing.status)}</CellChip> : null}
        <Btn size="sm" disabled={!publication.memberUrl || copyState === "copying"} title={publication.memberUrl ? "Investor sign-in, approval and waiting-period access still apply." : unavailable} onClick={() => void copy()}>
          {copyState === "copied" ? "Investor link copied" : copyState === "copying" ? "Copying…" : "Copy investor link"}
        </Btn>
        {publication.memberUrl && !compact ? <BtnLink size="sm" href={publication.memberUrl} target="_blank" rel="noopener noreferrer">Open investor view</BtnLink> : null}
      </div>
      {!compact ? <span className="sub">{publication.isPublished ? "Investor access requires sign-in and member approval. Client delivery and acceptance are tracked separately." : unavailable}</span> : null}
      {copyState === "copied" ? <span className="sub" role="status">Link copied. Share it with an approved capital partner.</span> : null}
      {copyState === "failed" && publication.memberUrl ? <label className="sub" role="status">Copy was unavailable. Select this investor link:<input aria-label="Investor link" readOnly value={publication.memberUrl} onFocus={(event) => event.currentTarget.select()} style={{ width: "100%" }} /></label> : null}
    </div>
  );
}
