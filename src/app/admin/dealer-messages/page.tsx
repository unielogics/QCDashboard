"use client";

// Internal team's global inbox for the per-AI-file conversation with dealer
// partners (super_admin / underwriter side). One row per lead that has a
// thread; read/reply inline and open the AI file. Never involves the client.
// Thin wrapper over the shared inbox view (admin scope).

import { DealerChannelInboxView } from "@/components/messages/DealerChannelInboxView";

export default function AdminDealerMessagesPage() {
  return (
    <DealerChannelInboxView
      scope="admin"
      apiPrefix="/admin/ai-underwriter-leads"
      fileHref={(id) => `/admin/ai-underwriter-leads?lead=${id}&notes=1`}
      selfRole="team"
      subtitle="Your conversations with dealer partners, one per AI file."
      panelSubtitle="Private channel with this lead's dealer partner — never visible to the client."
      panelEmptyLabel="No messages yet. Start the conversation with this lead's dealer partner."
    />
  );
}
