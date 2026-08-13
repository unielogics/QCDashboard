"use client";

// Dealer-partner global Messages inbox — their side of the per-lead channel
// with the underwriting team. Thin wrapper over the shared inbox view.

import { DealerChannelInboxView } from "@/components/messages/DealerChannelInboxView";

export default function BrokerMessagesPage() {
  return (
    <DealerChannelInboxView
      scope="broker"
      apiPrefix="/broker/ai-underwriter-leads"
      fileHref={(id) => `/broker/ai-underwriter-leads?lead=${id}&tab=messages`}
      selfRole="partner"
      subtitle="Your conversations with the underwriting team, one per lead."
      panelSubtitle="Private channel with the underwriting team — never visible to the client."
      panelEmptyLabel="No messages yet. Start the conversation with the underwriting team about this lead."
    />
  );
}
