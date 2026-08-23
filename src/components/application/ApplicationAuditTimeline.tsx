"use client";

import { useQuery } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Callout, CellChip } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationProfile, ApplicationSourceKind, UnifiedAuditEvent } from "@/lib/applicationProfile";

export function ApplicationAuditTimeline({ sourceKind, sourceId }: { sourceKind: ApplicationSourceKind; sourceId: string }) {
  const apiCall = useAuthedApi();
  const profile = useQuery({
    queryKey: ["application-profile", sourceKind, sourceId],
    queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }) }),
  });
  const events = useQuery({
    queryKey: ["application-profile-audit", profile.data?.id],
    queryFn: () => apiCall<UnifiedAuditEvent[]>(`/application-profiles/${profile.data?.id}/audit`),
    enabled: Boolean(profile.data?.id),
  });
  if (profile.isLoading || events.isLoading) return <div className="empty"><span className="spinner solo" />Loading the file audit...</div>;
  if (profile.isError || events.isError) return <Callout tone="bad" icon={<Icon name="alert" size={16} />}>The unified audit trail could not be loaded.</Callout>;
  if (!events.data?.length) return <div className="empty">No audited file activity yet.</div>;
  return (
    <div className="application-audit-timeline">
      {events.data.map((event) => (
        <article key={event.id}>
          <span className="application-audit-dot"><Icon name="check" size={11} /></span>
          <div><header><b>{event.summary}</b><CellChip tone="mut">{event.source.replaceAll("_", " ")}</CellChip></header><p>{event.actor_name || "System"}{event.actor_role ? ` · ${event.actor_role.replaceAll("_", " ")}` : ""}</p></div>
          <time>{new Date(event.occurred_at).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</time>
        </article>
      ))}
    </div>
  );
}
