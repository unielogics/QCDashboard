export const ROOT = "/admin/email-marketing";
export const fields = [
  { key: "program", options: "programs", label: "Lending program", all: "All programs" },
  { key: "outcome", options: "outcomes", label: "Outcome", all: "All outcomes" },
  { key: "source", options: "sources", label: "Enrollment form", all: "All forms" },
  { key: "locale", options: "locales", label: "Language", all: "All languages" },
] as const;
export type Filters = Partial<Record<(typeof fields)[number]["key"], string>>;
export type Options = Record<(typeof fields)[number]["options"], { value: string; label: string; }[]> & {
  delivery_enabled: boolean;
  delivery_status: string;
  sequence?: { day: number; subject: string; }[];
};
export type Eligibility = "all" | "eligible" | "ineligible" | "requestable" | "blocked";
export type Selection = {
  mode: "explicit" | "all";
  included_emails: string[];
  excluded_emails: string[];
  included_ids: string[];
  excluded_ids: string[];
  eligibility: Eligibility;
  search: string;
};
export const none: Selection = {
  mode: "explicit", included_emails: [], excluded_emails: [], included_ids: [], excluded_ids: [], eligibility: "all", search: "",
};
export type Contact = {
  id: string | null; email: string; name: string | null; source: string; eligible: boolean;
  selected: boolean; can_record_consent: boolean; reason: string | null; status: "eligible" | "requestable" | "blocked";
  permission_status: string | null; task_event_id: string | null;
};
export type Directory = {
  rows: Contact[]; total_count: number; eligible_count: number; requestable_count: number; blocked_count: number;
  selected_count: number; selected_eligible_count: number; selected_requestable_count: number; selected_blocked_count: number;
  page: number; page_size: number;
};
export type Draft = { name: string; subject: string; body: string; body_html: string; format: "text" | "html"; };
export const blank: Draft = { name: "", subject: "", body: "", body_html: "", format: "text" };
export function content(draft: Draft) {
  return {
    subject: draft.subject.trim(), body: draft.format === "html" ? "" : draft.body.trim(),
    ...(draft.format === "html" ? { body_html: draft.body_html.trim() } : {})
  };
}
export type Preview = { subject: string; body_text: string; body_html: string; eligible_count: number; sample_id: string | null; sample_email: string | null; };
export type Campaign = {
  id: string; name: string; subject: string; body: string; body_html?: string | null; filters: Filters; selection?: Selection | null; created_at: string;
  scheduled_at?: string | null; recipient_count: number; queued: number; sent: number; failed: number; blocked: number; uncertain: number; sending: number;
};
export function describe(filters: Filters, options?: Options) {
  return fields.flatMap(field => {
    const value = filters[field.key];
    return value ? [options?.[field.options].find(o => o.value === value)?.label ?? value] : [];
  }).join(" · ") || "All programs and outcomes";
}
export function recipients(count: number) {
  return count.toLocaleString() + (count === 1 ? " recipient" : " recipients");
}
export function timeZones() {
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone")
    : ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
  return Array.from(new Set([local, "UTC", ...zones]));
}

// A wall clock time can map to zero or two instants during daylight-saving transitions.
export function deliveryTimes(date: string, time: string, zone: string): Date[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return [];
  const target = Date.parse(date + "T" + time + ":00Z");
  if (!Number.isFinite(target)) return [];
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  function localEpoch(instant: number) {
    const parts = Object.fromEntries(fmt.formatToParts(instant).map(p => [p.type, p.value]));
    return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00Z`);
  }
  const day = 86400000;
  const offsets = new Set([target - day, target, target + day].map(t => localEpoch(t) - t));
  return Array.from(offsets).map(offset => target - offset).filter(t => localEpoch(t) === target).sort((a, b) => a - b).map(t => new Date(t));
}
