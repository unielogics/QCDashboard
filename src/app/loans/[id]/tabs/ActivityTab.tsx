"use client";

// Activity tab — chronological audit feed for a loan file.
//
// Backend writes one row per state change (criteria edits, doc uploads,
// HUD edits, credit pulls, calendar events, AI tasks, etc.). When a
// row's payload carries a `changes` list, this tab renders a structured
// before → after diff inline ("base_rate: 7.5 → 7.8") instead of just
// the kind. Kinds are grouped into families (loan / document / credit /
// hud / calendar / ai / instruction / prequal / intake / other) so the
// feed gets a colored icon + chip rather than a wall of grey pills.
//
// Styling lives in globals.css / app-extras.css. Each entry is a `.gridrow`
// (a grid pretending to be a table — the three-column track is data about this
// screen and stays inline), the family plate is `.botmark` in the same tone
// vocabulary the chips use, and the last row's hairline is dropped by
// `.gridrow:last-child` rather than by an `isLast` prop threaded through.

import { Icon } from "@/components/design-system/Icon";
import { fieldLabel, formatFieldValue } from "@/lib/activityFormat";
import { CellChip, Panel, cx, type ChipTone } from "@/components/ds";
import type { Activity } from "@/lib/types";

type Family = "loan" | "document" | "credit" | "hud" | "calendar" | "ai" | "instruction" | "prequal" | "intake" | "other";

type FamilyMeta = {
  icon: string;
  label: string;
  // The tone is the sheet's chip vocabulary, so "AI" is the same blue on the
  // plate, on the chip and in a table cell. It used to be a private word list
  // resolved to a (bg, fg) pair off the theme.
  tone: ChipTone;
};

const FAMILY_META: Record<Family, FamilyMeta> = {
  loan:        { icon: "shieldChk", label: "Loan",         tone: "pet" },
  document:    { icon: "doc",       label: "Document",     tone: "acc" },
  credit:      { icon: "cardCheck", label: "Credit",       tone: "warn" },
  hud:         { icon: "list",      label: "HUD",          tone: "mut" },
  calendar:    { icon: "cal",       label: "Calendar",     tone: "pet" },
  ai:          { icon: "spark",     label: "AI",           tone: "acc" },
  instruction: { icon: "edit",      label: "Instruction",  tone: "warn" },
  prequal:     { icon: "check",     label: "Prequal",      tone: "ok" },
  intake:      { icon: "clients",   label: "Intake",       tone: "ok" },
  other:       { icon: "bell",      label: "Event",        tone: "mut" },
};

// `.botmark` carries the plate; the tone modifier on it is the short form of
// the chip tone (`.botmark.acc`, `.botmark.ok`, …), with `mut` meaning the
// bare sunken plate `.botmark` already is.
const PLATE_TONE: Partial<Record<ChipTone, string>> = {
  ok: "ok",
  warn: "warn",
  bad: "bad",
  acc: "acc",
  pet: "pet",
};

function familyForKind(kind: string): Family {
  const prefix = kind.split(".")[0];
  switch (prefix) {
    case "loan":         return "loan";
    case "document":     return "document";
    case "credit":       return "credit";
    case "hud":          return "hud";
    case "calendar":     return "calendar";
    case "ai":           return "ai";
    case "ai_task":      return "ai";
    case "ai_modify":    return "ai";
    case "instruction":  return "instruction";
    case "prequal":      return "prequal";
    case "intake":       return "intake";
    case "summary":      return "ai";
    case "email":        return "ai";
    default:             return "other";
  }
}


export function ActivityTab({ activity, isLoading }: { activity: Activity[]; isLoading: boolean }) {
  if (isLoading) return <Panel><span className="sub">Loading activity…</span></Panel>;
  if (activity.length === 0) return <Panel><span className="sub">No activity yet for this loan.</span></Panel>;

  // Group by date so the feed reads as a timeline. The Activity API
  // already returns rows newest-first; we just inject a date header
  // every time the day changes.
  const groups = groupByDay(activity);

  return (
    <Panel title={`Full activity log · ${activity.length} entries`} noPad>
      {groups.map((group) => (
        <div key={group.dayKey}>
          <div className="gridhd">
            <span className="lbl">{group.dayLabel}</span>
          </div>
          {group.entries.map((e) => (
            <ActivityRow key={e.id} entry={e} />
          ))}
        </div>
      ))}
    </Panel>
  );
}


function ActivityRow({ entry }: { entry: Activity }) {
  const family = familyForKind(entry.kind);
  const meta = FAMILY_META[family];
  const changes = extractChanges(entry.payload);

  return (
    <div
      className="gridrow top"
      // Bespoke track: plate, timestamp column, and everything else. This is
      // data about this screen, not a page grid.
      style={{ gridTemplateColumns: "38px 130px 1fr" }}
    >
      <span className={cx("botmark", PLATE_TONE[meta.tone])}>
        <Icon name={meta.icon} size={15} />
      </span>

      <div className="sub mono">{formatTime(entry.occurred_at)}</div>

      <div>
        <div className="row">
          <CellChip tone={meta.tone}>{meta.label}</CellChip>
          <strong>{entry.summary}</strong>
        </div>
        <div className="sub">
          <span className="mono">{entry.kind}</span>
          {entry.actor_label && <span> · {entry.actor_label}</span>}
        </div>

        {changes && changes.length > 0 && <DiffList changes={changes} />}

        {entry.payload && hasNonChangePayload(entry.payload) && (
          <details className="mt">
            <summary className="sub">raw payload</summary>
            {/* `.docwell` is the bounded, sunken scroller for text that is the
                record — right for a JSON blob nobody should have to squint at. */}
            <pre className="docwell mt">
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}


function DiffList({
  changes,
}: {
  changes: Array<{ field?: unknown; before?: unknown; after?: unknown }>;
}) {
  // Each change becomes "Base rate: 7.50% → 7.80%". Both the field
  // name and the values run through the shared activityFormat helpers
  // so column-name jargon never reaches the operator.
  return (
    <div className="mt">
      {changes.map((c, idx) => {
        const field = String(c.field ?? "");
        const beforeText = formatFieldValue(field, c.before);
        const afterText = formatFieldValue(field, c.after);
        return (
          <div key={idx} className="kv">
            <span>{fieldLabel(field)}</span>
            <span>
              <s className="sub">{beforeText}</s>
              <span className="sub"> → </span>
              <b>{afterText}</b>
            </span>
          </div>
        );
      })}
    </div>
  );
}


// ── helpers ──────────────────────────────────────────────────────────


function groupByDay(rows: Activity[]): { dayKey: string; dayLabel: string; entries: Activity[] }[] {
  const out: { dayKey: string; dayLabel: string; entries: Activity[] }[] = [];
  for (const r of rows) {
    const d = new Date(r.occurred_at);
    const dayKey = d.toDateString();
    const last = out[out.length - 1];
    if (last && last.dayKey === dayKey) {
      last.entries.push(r);
    } else {
      out.push({ dayKey, dayLabel: formatDay(d), entries: [r] });
    }
  }
  return out;
}


function formatDay(d: Date): string {
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}


function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric", minute: "2-digit",
  });
}


function extractChanges(payload: Record<string, unknown> | null | undefined): Array<{ field?: unknown; before?: unknown; after?: unknown }> | null {
  if (!payload || typeof payload !== "object") return null;
  const raw = (payload as { changes?: unknown }).changes;
  if (!Array.isArray(raw)) return null;
  return raw.filter((c): c is { field?: unknown; before?: unknown; after?: unknown } =>
    !!c && typeof c === "object"
  );
}


function hasNonChangePayload(payload: Record<string, unknown>): boolean {
  const keys = Object.keys(payload);
  if (keys.length === 0) return false;
  if (keys.length === 1 && keys[0] === "changes") return false;
  if (keys.length === 2 && keys.includes("changes") && keys.includes("source")) return false;
  return true;
}
