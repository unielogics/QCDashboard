// Helpers for the working-hours UI in /agent-settings/ai.
//
// Mirrors app/services/ai/working_hours.py defaults on the backend so
// the page can show a sensible summary before the agent saves anything.

export type WeekdayCode = "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun";

export type AfterHoursRule =
  | "do_not_initiate_reply_if_client_first"
  | "block_all"
  | "portal_replies_only";

export interface WorkingHours {
  timezone: string;
  start_time: string; // "HH:MM" 24h
  end_time: string;
  working_days: WeekdayCode[];
  after_hours_rule: AfterHoursRule;
}

export const WEEKDAYS_ORDER: WeekdayCode[] = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
];

export const DEFAULT_WORKING_HOURS: WorkingHours = {
  timezone: "America/New_York",
  start_time: "09:00",
  end_time: "18:00",
  working_days: ["Mon", "Tue", "Wed", "Thu", "Fri"],
  after_hours_rule: "do_not_initiate_reply_if_client_first",
};

export const AFTER_HOURS_LABEL: Record<AfterHoursRule, string> = {
  do_not_initiate_reply_if_client_first:
    "Do not initiate. Reply only if client messages first.",
  block_all: "Do not send or reply after hours.",
  portal_replies_only:
    "Allow portal replies after hours, but no email or SMS.",
};

// Curated short list — covers the bulk of US/EU agents without
// dumping the full IANA database into a <select>. If we need more,
// swap to Intl.supportedValuesOf("timeZone").
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern (New York)" },
  { value: "America/Chicago", label: "Central (Chicago)" },
  { value: "America/Denver", label: "Mountain (Denver)" },
  { value: "America/Phoenix", label: "Mountain — no DST (Phoenix)" },
  { value: "America/Los_Angeles", label: "Pacific (Los Angeles)" },
  { value: "America/Anchorage", label: "Alaska" },
  { value: "Pacific/Honolulu", label: "Hawaii" },
  { value: "Europe/London", label: "London" },
  { value: "Europe/Paris", label: "Paris" },
  { value: "Europe/Madrid", label: "Madrid" },
];

export function normalizeWorkingHours(
  raw: Partial<WorkingHours> | null | undefined,
): WorkingHours {
  const r = raw || {};
  return {
    timezone:
      typeof r.timezone === "string" && r.timezone
        ? r.timezone
        : DEFAULT_WORKING_HOURS.timezone,
    start_time: isHHMM(r.start_time)
      ? r.start_time!
      : DEFAULT_WORKING_HOURS.start_time,
    end_time: isHHMM(r.end_time)
      ? r.end_time!
      : DEFAULT_WORKING_HOURS.end_time,
    working_days:
      Array.isArray(r.working_days) && r.working_days.length > 0
        ? (r.working_days.filter((d) =>
            WEEKDAYS_ORDER.includes(d as WeekdayCode),
          ) as WeekdayCode[])
        : DEFAULT_WORKING_HOURS.working_days,
    after_hours_rule:
      r.after_hours_rule &&
      (r.after_hours_rule as string) in AFTER_HOURS_LABEL
        ? (r.after_hours_rule as AfterHoursRule)
        : DEFAULT_WORKING_HOURS.after_hours_rule,
  };
}

function isHHMM(v: unknown): v is string {
  return typeof v === "string" && /^\d{2}:\d{2}$/.test(v);
}

export function formatTime12h(hhmm: string): string {
  const [hRaw, mRaw] = hhmm.split(":");
  let h = parseInt(hRaw, 10);
  const m = mRaw || "00";
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

export function formatDaysRange(days: WeekdayCode[]): string {
  // Sort by week order, then collapse contiguous runs into ranges.
  const set = new Set(days);
  const ordered = WEEKDAYS_ORDER.filter((d) => set.has(d));
  if (ordered.length === 0) return "No working days";
  if (ordered.length === 7) return "Every day";
  const groups: WeekdayCode[][] = [];
  let cur: WeekdayCode[] = [ordered[0]];
  for (let i = 1; i < ordered.length; i++) {
    const prev = WEEKDAYS_ORDER.indexOf(ordered[i - 1]);
    const here = WEEKDAYS_ORDER.indexOf(ordered[i]);
    if (here === prev + 1) cur.push(ordered[i]);
    else {
      groups.push(cur);
      cur = [ordered[i]];
    }
  }
  groups.push(cur);
  return groups
    .map((g) => (g.length === 1 ? g[0] : `${g[0]}–${g[g.length - 1]}`))
    .join(", ");
}

export function formatScheduleSummary(wh: WorkingHours): string {
  const days = formatDaysRange(wh.working_days);
  const start = formatTime12h(wh.start_time);
  const end = formatTime12h(wh.end_time);
  return `${days}, ${start}–${end} in ${wh.timezone}.`;
}
