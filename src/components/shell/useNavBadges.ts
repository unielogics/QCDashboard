"use client";
// Resolves the badge counts nav.config.ts refers to by key.
//
// The counts live here rather than in the config so the config stays static and
// serializable — you can read the whole information architecture without
// running the app, and the nav does not re-render because a number changed
// somewhere unrelated.
//
// Each source is gated on the role that can actually see it. A vendor should
// not be issuing admin inbox queries just because the hook exists.
import { useDealerChannelInbox, useProposedActionItems } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { BadgeKey } from "./nav.config";

export type NavBadges = Partial<Record<BadgeKey, number>>;

export function useNavBadges(role: string | undefined | null): NavBadges {
  const isDealerPartner = role === Role.DEALER_PARTNER;
  const isSuperAdmin = role === Role.SUPER_ADMIN;
  const isDesk = isSuperAdmin || role === Role.LOAN_EXEC;
  const { data: dealerInbox } = useDealerChannelInbox(isDealerPartner);
  const { data: adminDealerInbox } = useDealerChannelInbox(isSuperAdmin, "admin");
  // The Elara inbox badge counts AI suggestions still waiting for a decision.
  // It used to have no source at all, which left a badge key pointing at a
  // queue nobody computed.
  const { data: proposed } = useProposedActionItems(isDesk);
  return {
    dealerUnread: isDealerPartner ? dealerInbox?.total_unread ?? 0 : 0,
    adminDealerUnread: isSuperAdmin ? adminDealerInbox?.total_unread ?? 0 : 0,
    elaraTasks: isDesk ? proposed?.length ?? 0 : 0,
    // myPipeline / vendorBuckets / myLeads still have no count source wired.
    // Returning nothing renders no badge, which is the correct neutral state —
    // a badge showing a number nobody computed is worse than none.
  };
}
