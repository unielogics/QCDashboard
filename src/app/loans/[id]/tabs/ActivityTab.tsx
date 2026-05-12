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

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { fieldLabel, formatFieldValue } from "@/lib/activityFormat";
import type { Activity } from "@/lib/types";

type Family = "loan" | "document" | "credit" | "hud" | "calendar" | "ai" | "instruction" | "prequal" | "intake" | "other";

type FamilyMeta = {
  icon: string;
  label: string;
  // Colors are theme-keyed. Picked at render time off useTheme().
  tone: "petrol" | "profit" | "warn" | "brand" | "danger" | "default";
};

const FAMILY_META: Record<Family, FamilyMeta> = {
  loan:        { icon: "shieldChk", label: "Loan",         tone: "petrol" },
  document:    { icon: "doc",       label: "Document",     tone: "brand" },
  credit:      { icon: "cardCheck", label: "Credit",       tone: "warn" },
  hud:         { icon: "list",      label: "HUD",          tone: "default" },
  calendar:    { icon: "cal",       label: "Calendar",     tone: "petrol" },
  ai:          { icon: "spark",     label: "AI",           tone: "brand" },
  instruction: { icon: "edit",      label: "Instruction",  tone: "warn" },
  prequal:     { icon: "check",     label: "Prequal",      tone: "profit" },
  intake:      { icon: "clients",   label: "Intake",       tone: "profit" },
  other:       { icon: "bell",      label: "Event",        tone: "default" },
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
  const { t } = useTheme();

  if (isLoading) return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>Loading activity…</div></Card>;
  if (activity.length === 0) return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>No activity yet for this loan.</div></Card>;

  // Group by date so the feed reads as a timeline. The Activity API
  // already returns rows newest-first; we just inject a date header
  // every time the day changes.
  const groups = groupByDay(activity);

  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
        <SectionLabel>Full activity log · {activity.length} entries</SectionLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {groups.map((group) => (
          <div key={group.dayKey}>
            <div style={{
              padding: "10px 16px",
              background: t.surface2,
              fontSize: 11,
              fontWeight: 800,
              color: t.ink3,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              borderBottom: `1px solid ${t.line}`,
            }}>
              {group.dayLabel}
            </div>
            {group.entries.map((e, i) => (
              <ActivityRow
                key={e.id}
                entry={e}
                isLast={i === group.entries.length - 1}
                t={t}
              />
            ))}
          </div>
        ))}
      </div>
    </Card>
  );
}


function ActivityRow({
  entry, isLast, t,
}: {
  entry: Activity;
  isLast: boolean;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const family = familyForKind(entry.kind);
  const meta = FAMILY_META[family];
  const tone = resolveTone(meta.tone, t);
  const changes = extractChanges(entry.payload);

  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "36px 130px 1fr",
      gap: 14,
      padding: "12px 16px",
      borderBottom: isLast ? "none" : `1px solid ${t.line}`,
      alignItems: "flex-start",
    }}>
      <div style={{
        display: "grid", placeItems: "center",
        width: 32, height: 32, borderRadius: 8,
        background: tone.bg, color: tone.fg,
        marginTop: 2,
      }}>
        <Icon name={meta.icon} size={15} />
      </div>

      <div style={{ fontSize: 11.5, color: t.ink3, fontFamily: "ui-monospace, SF Mono, monospace" }}>
        {formatTime(entry.occurred_at)}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <Pill bg={tone.bg} color={tone.fg}>{meta.label}</Pill>
          <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{entry.summary}</span>
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
          <span style={{ fontFamily: "ui-monospace, SF Mono, monospace" }}>{entry.kind}</span>
          {entry.actor_label && <span style={{ marginLeft: 8 }}>· {entry.actor_label}</span>}
        </div>

        {changes && changes.length > 0 && (
          <DiffList changes={changes} t={t} />
        )}

        {entry.payload && hasNonChangePayload(entry.payload) && (
          <details style={{ marginTop: 6 }}>
            <summary style={{ fontSize: 11, color: t.ink3, cursor: "pointer" }}>raw payload</summary>
            <pre style={{
              background: t.surface2, padding: 10, borderRadius: 8,
              fontSize: 11, color: t.ink2, marginTop: 6, overflow: "auto",
            }}>
              {JSON.stringify(entry.payload, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </div>
  );
}


function DiffList({
  changes, t,
}: {
  changes: Array<{ field?: unknown; before?: unknown; after?: unknown }>;
  t: ReturnType<typeof useTheme>["t"];
}) {
  // Each change becomes "Base rate: 7.50% → 7.80%". Both the field
  // name and the values run through the shared activityFormat helpers
  // so column-name jargon never reaches the operator.
  return (
    <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
      {changes.map((c, idx) => {
        const field = String(c.field ?? "");
        const beforeText = formatFieldValue(field, c.before);
        const afterText = formatFieldValue(field, c.after);
        return (
          <div key={idx} style={{
            display: "grid", gridTemplateColumns: "180px 1fr",
            gap: 10, padding: "6px 10px",
            background: t.surface2, borderRadius: 8,
            fontSize: 12,
          }}>
            <span style={{ color: t.ink2, fontWeight: 700 }}>
              {fieldLabel(field)}
            </span>
            <span style={{ color: t.ink }}>
              <span style={{ color: t.ink3, textDecoration: "line-through" }}>
                {beforeText}
              </span>
              <span style={{ margin: "0 8px", color: t.ink3 }}>→</span>
              <span style={{ color: t.ink, fontWeight: 600 }}>
                {afterText}
              </span>
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


function resolveTone(tone: FamilyMeta["tone"], t: ReturnType<typeof useTheme>["t"]): { bg: string; fg: string } {
  switch (tone) {
    case "petrol": return { bg: t.petrolSoft, fg: t.petrol };
    case "profit": return { bg: t.profitBg, fg: t.profit };
    case "warn":   return { bg: t.warnBg, fg: t.warn };
    case "brand":  return { bg: t.brandSoft, fg: t.brand };
    case "danger": return { bg: "#fdecea", fg: "#b42318" };
    case "default":
    default:       return { bg: t.surface2, fg: t.ink2 };
  }
}
