// File updates: who is on a file and what happened on it.
//
// Shapes mirror /application-profiles/{id}/team and /timeline exactly
// (qcbackend docs/file_updates_api.md), plus the small pure helpers the strip
// and the timeline share — a kind → icon/label map, the "from {derived_from}"
// wording and a relative-time formatter. Nothing here fetches.

export type FileEventKind =
  | "document.requested"
  | "document.received"
  | "message.sent"
  | "status.changed"
  | "team.changed"
  | "note.added"
  | "review.completed"
  | "offer.sent"
  | "offer.answered"
  | "forms.packet_sent";

export type FileEventVisibility = "client" | "team" | "desk";

export type FileEvent = {
  schema: string;
  id: string;
  profile_id: string;
  kind: FileEventKind | string;
  visibility: FileEventVisibility;
  title: string;
  body: string | null;
  actor_label: string | null;
  target_type: string | null;
  target_id: string | null;
  meta: Record<string, unknown>;
  created_at: string;
};

export type FileTimelineRead = {
  tier: FileEventVisibility;
  unread_count: number;
  events: FileEvent[];
};

export type FileTeamMember = {
  user_id: string;
  name: string;
  email: string;
  role: string;
};

/** A client login only receives `{name}`; everyone else gets the full seat. */
export type FileTeamAgent = Partial<FileTeamMember> & {
  name: string;
  derived_from?: string | null;
};

export type FileTeamCompany = {
  id: string;
  name: string;
  kind: string;
  derived: boolean;
};

export type FileTeam = {
  agent: FileTeamAgent | null;
  underwriters: FileTeamMember[];
  company: FileTeamCompany | null;
  can_edit?: boolean;
};

export type FileTeamCandidates = {
  underwriters: FileTeamMember[];
  companies: Array<{ id: string; name: string; kind: string }>;
};

/** Icon names come from design-system/Icon's path table. */
const EVENT_ICONS: Record<FileEventKind, string> = {
  "document.requested": "file",
  "document.received": "upload",
  "message.sent": "send",
  "status.changed": "flag",
  "team.changed": "user",
  "note.added": "note",
  "review.completed": "spark",
  "offer.sent": "dollar",
  "offer.answered": "check",
  "forms.packet_sent": "link",
};

const EVENT_LABELS: Record<FileEventKind, string> = {
  "document.requested": "Document requested",
  "document.received": "Document received",
  "message.sent": "Message sent",
  "status.changed": "Status changed",
  "team.changed": "Team changed",
  "note.added": "Note added",
  "review.completed": "Review completed",
  "offer.sent": "Offer sent",
  "offer.answered": "Offer answered",
  "forms.packet_sent": "Forms packet sent",
};

export function fileEventIcon(kind: string): string {
  return EVENT_ICONS[kind as FileEventKind] ?? "note";
}

export function fileEventLabel(kind: string): string {
  return EVENT_LABELS[kind as FileEventKind] ?? kind.replace(/[._]/g, " ");
}

/** Where the agent seat came from, in words the desk uses. */
export function agentDerivedFromLabel(source: string | null | undefined): string | null {
  switch (source) {
    case "intake.broker_id":
      return "the dealer partner on the lead";
    case "dealer.owner_user_id":
      return "the rep who opened the file";
    case "client.current_agent_id":
      return "the client's agent";
    case "loan.broker_id":
    case "client.broker_id":
      return "the loan's broker";
    case "intake.source_user_id":
      return "who created the intake";
    default:
      return source ? source.replace(/[._]/g, " ") : null;
  }
}

/** `dealer_partner` → `Dealer partner`. */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return "";
  const words = role.replace(/[._-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "just now", "5m ago", "3h ago", "2d ago", then a short date. */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(then).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** "Today", "Yesterday", else "Sep 8" (with the year once it is not this year). */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const key = localDayKey(date);
  if (key === localDayKey(now)) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (key === localDayKey(yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export type FileEventDay = { key: string; label: string; events: FileEvent[] };

/** Newest first, grouped by local calendar day in the order they arrive. */
export function groupEventsByDay(events: FileEvent[], now: Date = new Date()): FileEventDay[] {
  const days: FileEventDay[] = [];
  for (const event of events) {
    const date = new Date(event.created_at);
    const key = Number.isNaN(date.getTime()) ? "unknown" : localDayKey(date);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.events.push(event);
    } else {
      days.push({ key, label: dayLabel(event.created_at, now), events: [event] });
    }
  }
  return days;
}

/** Union by id, newest first — what a poll merges into what "Load more" fetched. */
export function mergeEvents(current: FileEvent[], incoming: FileEvent[]): FileEvent[] {
  const byId = new Map<string, FileEvent>();
  for (const event of current) byId.set(event.id, event);
  for (const event of incoming) byId.set(event.id, event);
  return Array.from(byId.values()).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}
