"use client";

// The client's view of what happened on their file, inside the PIN room.
//
// Rows come from the client tier of the file timeline
// (`POST /application-profiles/public/room/{token}/timeline`), so nothing
// here is something the desk keeps to itself. The list is read-only and
// grouped by day; it renders from the room's own CSS vocabulary
// (`.application-room-todo-list article`) with the modifiers under
// "File updates in the room" in app-extras.css, and never touches the
// console sheet. Like the rest of the room it holds no credential of its
// own — the page fetches, this component only draws.

import { useMemo } from "react";
import { Icon } from "@/components/design-system/Icon";

export type RoomTimelineEvent = {
  schema?: string;
  id: string;
  profile_id?: string;
  kind: string;
  visibility?: string;
  title: string;
  body?: string | null;
  actor_label?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  meta?: Record<string, unknown> | null;
  created_at: string;
};

type Tone = "warn" | "good" | "neutral";

// One icon and one tone per event kind. Anything the desk adds later that
// this list does not know falls through to the neutral note glyph.
const KIND_PRESENTATION: Record<string, { icon: string; tone: Tone }> = {
  "document.requested": { icon: "alert", tone: "warn" },
  "document.received": { icon: "docCheck", tone: "good" },
  "message.sent": { icon: "comment", tone: "neutral" },
  "status.changed": { icon: "flag", tone: "neutral" },
  "team.changed": { icon: "user", tone: "neutral" },
  "note.added": { icon: "note", tone: "neutral" },
  "review.completed": { icon: "shieldChk", tone: "good" },
  "offer.sent": { icon: "dollar", tone: "neutral" },
  "offer.answered": { icon: "check", tone: "good" },
  "forms.packet_sent": { icon: "link", tone: "neutral" },
};

function presentation(kind: string) {
  return KIND_PRESENTATION[kind] ?? { icon: "note", tone: "neutral" as Tone };
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(date: Date, now: Date): string {
  const today = dayKey(now);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const key = dayKey(date);
  if (key === today) return "Today";
  if (key === dayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

function timeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

type DayGroup = { key: string; label: string; events: Array<RoomTimelineEvent & { at: Date }> };

export function RoomTimeline({ events }: { events: RoomTimelineEvent[] }) {
  const groups = useMemo<DayGroup[]>(() => {
    const now = new Date();
    const stamped = events
      .map((event) => ({ ...event, at: new Date(event.created_at) }))
      .filter((event) => !Number.isNaN(event.at.getTime()))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const byDay = new Map<string, DayGroup>();
    for (const event of stamped) {
      const key = dayKey(event.at);
      const group = byDay.get(key);
      if (group) group.events.push(event);
      else byDay.set(key, { key, label: dayLabel(event.at, now), events: [event] });
    }
    return [...byDay.values()];
  }, [events]);

  if (!groups.length) {
    return <div className="application-room-empty">Nothing on your file yet. Updates appear here as your file moves.</div>;
  }

  return (
    <div className="application-room-updates">
      {groups.map((group) => (
        <section key={group.key} className="application-room-updates-day" aria-label={group.label}>
          <h3>{group.label}</h3>
          <div className="application-room-todo-list">
            {group.events.map((event) => {
              const look = presentation(event.kind);
              const detail = [event.body, event.actor_label].filter(Boolean).join(" · ");
              return (
                <article key={event.id} className={`is-${look.tone}`}>
                  <span className="application-room-task-icon"><Icon name={look.icon} size={15} /></span>
                  <div>
                    <b>{event.title}</b>
                    {detail ? <p>{detail}</p> : null}
                  </div>
                  <time className="application-room-task-state" dateTime={event.created_at}>{timeLabel(event.at)}</time>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
