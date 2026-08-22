"use client";

// Super Admin → Lending AI Settings → Audit log (Phase 7)
// Searchable feed of every AI-behavior-changing event.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// Nothing about the query, the filters or the rendered fields changed:
//   hand-rolled select + input   → Select / Input (`.field`)
//   hand-rolled feed rows        → `.gridrow.top`, which already owns the
//                                  hairline separator and drops it on the last
//                                  row (the old code never did)
//   monospace event-type badge   → CellChip + `.mono`
// The page no longer sets its own padding or max-width: the shell's `.content`
// owns both, and setting them again double-padded inside it.

import { useState } from "react";
import { CellChip, Empty, Input, Loading, Panel, Row, Select, Sub } from "@/components/ds";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import { isAINotDeployed, useAuditEvents } from "@/hooks/useApi";

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
  const [eventType, setEventType] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const { data: events = [], isLoading, error: auditErr } = useAuditEvents({
    event_type: eventType || undefined,
    client_id: clientId || undefined,
    limit: 200,
  });

  return (
    <div className="grid">
      <LendingAIHeader
        title="Audit Log"
        subtitle="Every AI-behavior-changing event is appended here. Filter by type, client, or playbook."
      />

      {isAINotDeployed(auditErr) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <Panel noPad>
        <div className="panel-h">
          <Select
            grow
            aria-label="Filter by event type"
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
          >
            {EVENT_TYPES.map((et) => (
              <option key={et} value={et}>{et || "All event types"}</option>
            ))}
          </Select>
          <Input
            grow
            aria-label="Filter by client id"
            placeholder="Client ID (UUID, optional)"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="panel-b"><Loading>Loading…</Loading></div>
        ) : events.length === 0 ? (
          <div className="panel-b"><Empty>No events match those filters.</Empty></div>
        ) : (
          events.map((e) => (
            // `.gridrow.top` is the feed row: hairline under, top-aligned
            // because the value line under the header wraps to two lines.
            <div key={e.id} className="gridrow top">
              <Row>
                <CellChip tone="mut" className="mono">{e.event_type}</CellChip>
                <Sub>{e.actor_type}</Sub>
                <span className="sub mono grow">{e.requirement_key || ""}</span>
                <Sub>{new Date(e.created_at).toLocaleString()}</Sub>
              </Row>
              {(e.old_value || e.new_value || e.payload) ? (
                <Row>
                  {e.old_value ? <Sub>old: {JSON.stringify(e.old_value)}</Sub> : null}
                  {e.new_value ? <span>new: {JSON.stringify(e.new_value)}</span> : null}
                  {!e.old_value && !e.new_value && e.payload ? (
                    <Sub>{JSON.stringify(e.payload)}</Sub>
                  ) : null}
                </Row>
              ) : null}
            </div>
          ))
        )}
      </Panel>
    </div>
  );
}
