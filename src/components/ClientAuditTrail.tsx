"use client";

// ClientAuditTrail — per-client audit feed (Phase 7).
// Sits on /clients/[id] under the existing tabs (or as an inline card).
// Shows the agent-visible subset: requirement waivers + custom-instruction
// edits + handoff events for THIS client.
//
// Styling is the shared class system (globals.css + app-extras.css): the feed
// is a `.panel` of `.itemrow` entries. The event key and the requirement key
// are `<code>` rather than a mono class — they are code identifiers, and the
// element already carries the monospace stack.

import { ItemRow, Panel, Tag } from "@/components/ds";
import { useAuditEvents } from "@/hooks/useApi";

interface Props {
  clientId: string;
  limit?: number;
}

export function ClientAuditTrail({ clientId, limit = 25 }: Props) {
  const { data: events = [], isLoading } = useAuditEvents({
    client_id: clientId,
    limit,
  });

  if (isLoading) {
    return (
      <Panel title="Activity log">
        <div className="sub">Loading…</div>
      </Panel>
    );
  }
  if (events.length === 0) {
    return (
      <Panel title="Activity log">
        <div className="sub">No audit events yet.</div>
      </Panel>
    );
  }

  return (
    <Panel title="Activity log">
      {/* Plain flow, not `.grid`: `.itemrow + .itemrow` already carries the
          6px rhythm, and a grid gap would stack on top of it. */}
      <div>
        {events.map(e => (
          <ItemRow
            key={e.id}
            right={<span className="sub num">{new Date(e.created_at).toLocaleString()}</span>}
          >
            <div className="grid g4">
              <div className="row">
                <Tag>
                  <code>{e.event_type}</code>
                </Tag>
                <span className="sub">{e.actor_type}</span>
              </div>
              {e.requirement_key ? (
                <div>
                  <code>{e.requirement_key}</code>
                </div>
              ) : null}
              {e.new_value ? <div className="sub">{JSON.stringify(e.new_value)}</div> : null}
            </div>
          </ItemRow>
        ))}
      </div>
    </Panel>
  );
}
