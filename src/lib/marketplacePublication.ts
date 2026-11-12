import { CAPITAL_APP_ORIGIN } from "@/lib/appUrl";
import type { CpListingStatus } from "@/hooks/useCapitalPartners";
import { fileWorkspaceHref } from "@/lib/fileWorkspace";

export const marketplaceReviewHref = (listingId: string) => `/admin/marketplace/${encodeURIComponent(listingId)}`;
export function marketplaceEntryHref(listingId: string | null | undefined, intakeId?: string | null): string | undefined {
  return listingId ? marketplaceReviewHref(listingId) : intakeId ? fileWorkspaceHref(intakeId, { tool: "marketplace" }) : undefined;
}

export type MarketplaceOfferReference = {
  id: string;
  ref: string;
  status: CpListingStatus;
  published_at?: string | null;
};

/** Investor publication is the listing lifecycle, never a package-push timestamp. */
export type MarketplacePublicationState = {
  profileId: string | null;
  listingId: string | null;
  listingRef: string | null;
  status: CpListingStatus | null;
  memberUrl: string | null;
  isPublished: boolean;
  isOpenForInvestment: boolean;
  loading: boolean;
  error: boolean;
};

const MEMBER_VISIBLE = new Set<CpListingStatus>(["open", "closing", "fully_subscribed", "funded", "repaid", "workout"]);

export function marketplacePublicationState(
  listing: MarketplaceOfferReference | null | undefined,
  options: { profileId?: string | null; loading?: boolean; error?: boolean } = {},
): MarketplacePublicationState {
  const isPublished = Boolean(listing?.ref?.trim() && MEMBER_VISIBLE.has(listing.status) && !options.error);
  return {
    profileId: options.profileId ?? null,
    listingId: listing?.id ?? null,
    listingRef: listing?.ref ?? null,
    status: listing?.status ?? null,
    memberUrl: isPublished ? `${CAPITAL_APP_ORIGIN}/marketplace/${encodeURIComponent(listing!.ref.trim())}` : null,
    isPublished,
    isOpenForInvestment: isPublished && (listing?.status === "open" || listing?.status === "closing"),
    loading: options.loading ?? false,
    error: options.error ?? false,
  };
}

export function marketplacePublicationLabel(status: CpListingStatus | null): string {
  switch (status) {
    case "draft": return "Offer draft · not published";
    case "withdrawn": return "Offer withdrawn";
    case "open": return "Offer published";
    case "closing": return "Offer published · closing";
    case "fully_subscribed": return "Offer published · fully subscribed";
    case "funded": return "Offer published · funded";
    case "repaid": return "Offer published · repaid";
    case "workout": return "Offer published · workout";
    default: return "No marketplace offer";
  }
}
