"use client";

// Activity tab — chronological audit feed for this deal's client.
// Reuses the existing ClientAuditTrail component the workspace and
// loan pages already share.

import { ClientAuditTrail } from "@/components/ClientAuditTrail";

export function ActivityTab({ clientId }: { clientId: string }) {
  return <ClientAuditTrail clientId={clientId} limit={100} />;
}
