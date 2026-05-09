"use client";

// ClientAuditTrail — per-client audit feed (Phase 7).
// Sits on /clients/[id] under the existing tabs (or as an inline card).
// Shows the agent-visible subset: requirement waivers + custom-instruction
// edits + handoff events for THIS client.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useAuditEvents } from "@/hooks/useApi";

interface Props {
  clientId: string;
  limit?: number;
}

export function ClientAuditTrail({ clientId, limit = 25 }: Props) {
  const { t } = useTheme();
  const { data: events = [], isLoading } = useAuditEvents({
    client_id: clientId,
    limit,
  });

  if (isLoading) {
    return (
      <Card pad={16}>
        <SectionLabel>Activity log</SectionLabel>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 8 }}>Loading…</div>
      </Card>
    );
  }
  if (events.length === 0) {
    return (
      <Card pad={16}>
        <SectionLabel>Activity log</SectionLabel>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 8 }}>No audit events yet.</div>
      </Card>
    );
  }

  return (
    <Card pad={16}>
      <SectionLabel>Activity log</SectionLabel>
      <div style={{ marginTop: 8 }}>
        {events.map(e => (
          <div key={e.id} style={{
            padding: "8px 0", borderBottom: `1px solid ${t.line}`, fontSize: 12,
          }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: t.surface2, color: t.ink, fontFamily: "monospace",
              }}>
                {e.event_type}
              </span>
              <span style={{ color: t.ink3, fontSize: 11 }}>{e.actor_type}</span>
              <span style={{ marginLeft: "auto", color: t.ink3, fontSize: 11 }}>
                {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
            {e.requirement_key ? (
              <div style={{ marginTop: 2, color: t.ink, fontFamily: "monospace", fontSize: 11 }}>
                {e.requirement_key}
              </div>
            ) : null}
            {e.new_value ? (
              <div style={{ color: t.ink3, marginTop: 2 }}>
                {JSON.stringify(e.new_value)}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </Card>
  );
}
