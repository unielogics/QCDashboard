"use client";

// Super Admin → Lending AI Settings → Audit log (Phase 7)
// Searchable feed of every AI-behavior-changing event.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { useAuditEvents } from "@/hooks/useApi";

const EVENT_TYPES = [
  "",
  "playbook_edited", "playbook_published",
  "requirement_added", "requirement_waived", "requirement_removed",
  "ai_action_suggested", "ai_action_approved", "ai_action_dismissed",
  "document_conflict_detected", "document_conflict_resolved",
  "handoff_created", "handoff_accepted",
  "client_override_added", "client_custom_instructions_updated",
  "cadence_action_fired:draft_message", "cadence_action_fired:create_task",
  "cadence_action_fired:escalate", "cadence_action_fired:mark_stalled",
  "requirement_status_updated",
];

export default function AuditFeedPage() {
  const { t } = useTheme();
  const [eventType, setEventType] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const { data: events = [], isLoading } = useAuditEvents({
    event_type: eventType || undefined,
    client_id: clientId || undefined,
    limit: 200,
  });

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <LendingAIHeader
        title="Audit Log"
        subtitle="Every AI-behavior-changing event is appended here. Filter by type, client, or playbook."
      />

      <Card pad={20}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value)}
            style={{
              flex: 1, padding: 8, fontSize: 13,
              borderRadius: 6, border: `1px solid ${t.line}`,
              background: t.surface, color: t.ink,
            }}
          >
            {EVENT_TYPES.map(et => (
              <option key={et} value={et}>{et || "All event types"}</option>
            ))}
          </select>
          <input
            placeholder="Client ID (UUID, optional)"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            style={{
              flex: 1, padding: 8, fontSize: 13,
              borderRadius: 6, border: `1px solid ${t.line}`,
              background: t.surface, color: t.ink,
            }}
          />
        </div>

        {isLoading ? (
          <div style={{ color: t.ink3 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ color: t.ink3, fontSize: 13 }}>No events match those filters.</div>
        ) : events.map(e => (
          <div key={e.id} style={{
            padding: "8px 0", borderBottom: `1px solid ${t.line}`,
            fontSize: 12,
          }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                background: t.surface2, color: t.ink, fontFamily: "monospace",
              }}>
                {e.event_type}
              </span>
              <span style={{ color: t.ink3 }}>{e.actor_type}</span>
              <span style={{ flex: 1, color: t.ink3, fontFamily: "monospace", fontSize: 11 }}>
                {e.requirement_key || ""}
              </span>
              <span style={{ color: t.ink3, fontSize: 11 }}>
                {new Date(e.created_at).toLocaleString()}
              </span>
            </div>
            {(e.old_value || e.new_value || e.payload) ? (
              <div style={{ marginTop: 4 }}>
                {e.old_value ? <span style={{ color: t.ink3, marginRight: 12 }}>old: {JSON.stringify(e.old_value)}</span> : null}
                {e.new_value ? <span style={{ color: t.ink }}>new: {JSON.stringify(e.new_value)}</span> : null}
                {!e.old_value && !e.new_value && e.payload ? <span style={{ color: t.ink3 }}>{JSON.stringify(e.payload)}</span> : null}
              </div>
            ) : null}
          </div>
        ))}
      </Card>
    </div>
  );
}
