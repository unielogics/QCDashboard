"use client";

// FollowUpEditor — three-knob AI re-engagement cadence config.
//
// Reused in three places:
//   • /loans/[id] AI Secretary tab — per-loan override
//   • /clients/[id]/workspace      — per-client (agent side) override
//   • /admin/lending-ai/playbooks  — firm-default
//
// Each surface owns its own value + onChange + onSave plumbing; this
// component is the visual contract.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";

export interface FollowUpSettings {
  /** Wait this long after the last borrower message before AI nudges. */
  stall_threshold_minutes?: number | null;
  /** Skip if >= this many follow-ups fired in the last 24h. */
  max_attempts_per_day?: number | null;
  /** Stop trying entirely after this many days without a borrower reply. */
  max_days_without_reply?: number | null;
  /** 0-23 borrower-local. Both null = quiet-hours disabled. */
  quiet_hours_start?: number | null;
  quiet_hours_end?: number | null;
}

interface Props {
  value: FollowUpSettings | null;
  onChange: (next: FollowUpSettings) => void;
  onReset?: () => void;
  /** Defaults shown as placeholders + the source ("firm default" / "system floor"). */
  fallback: FollowUpSettings;
  fallbackLabel: string;
  /** Header context — what surface this is on. */
  title?: string;
  subtitle?: string;
  /** Set when the parent is mid-save. */
  saving?: boolean;
  /** When the parent has an override that's currently active, show
   *  Reset. */
  hasOverride?: boolean;
}

export function FollowUpEditor({
  value, onChange, onReset, fallback, fallbackLabel,
  title = "AI follow-up rhythm",
  subtitle = "Configurable per file. Falls back to the firm default when unset.",
  saving, hasOverride,
}: Props) {
  const { t } = useTheme();
  const [draft, setDraft] = useState<FollowUpSettings>(value ?? {});
  useEffect(() => { setDraft(value ?? {}); }, [value]);

  const stallDisplay = formatStall(draft.stall_threshold_minutes ?? fallback.stall_threshold_minutes ?? 1440);

  const update = (patch: Partial<FollowUpSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
  };

  return (
    <div style={{
      padding: 14,
      borderRadius: 11,
      border: `1px solid ${t.line}`,
      background: t.surface,
      display: "flex", flexDirection: "column", gap: 12,
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          display: "grid", placeItems: "center",
          background: t.brandSoft, color: t.brand, flex: "0 0 auto",
        }}>
          <Icon name="ai" size={14} stroke={2.2} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: t.ink, letterSpacing: 0.2 }}>
            {title}
          </div>
          <div style={{ marginTop: 2, fontSize: 11.5, color: t.ink3, lineHeight: 1.4 }}>
            {subtitle}
          </div>
        </div>
        {saving ? (
          <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 800 }}>saving…</span>
        ) : null}
        {hasOverride && onReset ? (
          <button
            type="button"
            onClick={onReset}
            style={{
              padding: "4px 10px", borderRadius: 7,
              background: "transparent", color: t.ink3,
              border: `1px solid ${t.line}`,
              fontSize: 11, fontWeight: 800,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Reset to default
          </button>
        ) : null}
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 10,
      }}>
        <KnobField
          label="Stall threshold"
          hint="Wait this long after the last borrower message before nudging again."
          unit="minutes"
          value={draft.stall_threshold_minutes ?? null}
          placeholder={String(fallback.stall_threshold_minutes ?? 1440)}
          onCommit={(v) => update({ stall_threshold_minutes: v })}
          fallbackLabel={fallbackLabel}
          previewValue={stallDisplay}
          t={t}
        />
        <KnobField
          label="Max attempts / day"
          hint="Skip when the AI has already nudged this many times in the last 24 h."
          unit="per day"
          value={draft.max_attempts_per_day ?? null}
          placeholder={String(fallback.max_attempts_per_day ?? 3)}
          onCommit={(v) => update({ max_attempts_per_day: v })}
          fallbackLabel={fallbackLabel}
          t={t}
        />
        <KnobField
          label="Max days no reply"
          hint="After this many days of silence, stop nudging entirely until a human re-arms."
          unit="days"
          value={draft.max_days_without_reply ?? null}
          placeholder={String(fallback.max_days_without_reply ?? 14)}
          onCommit={(v) => update({ max_days_without_reply: v })}
          fallbackLabel={fallbackLabel}
          t={t}
        />
      </div>

      {/* Quiet hours — optional. Both unset = no quiet-hours gate. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 0.7, textTransform: "uppercase" }}>
          Quiet hours (optional)
        </span>
        <HourInput
          label="Start"
          value={draft.quiet_hours_start ?? null}
          onCommit={(v) => update({ quiet_hours_start: v })}
          t={t}
        />
        <HourInput
          label="End"
          value={draft.quiet_hours_end ?? null}
          onCommit={(v) => update({ quiet_hours_end: v })}
          t={t}
        />
        <span style={{ fontSize: 11, color: t.ink3 }}>
          {draft.quiet_hours_start != null && draft.quiet_hours_end != null
            ? `AI won't nudge between ${pad(draft.quiet_hours_start)}:00 and ${pad(draft.quiet_hours_end)}:00`
            : "Disabled — no quiet-hours gate"}
        </span>
      </div>
    </div>
  );
}


function KnobField({
  label, hint, unit, value, placeholder, onCommit, fallbackLabel, previewValue, t,
}: {
  label: string;
  hint: string;
  unit: string;
  value: number | null;
  placeholder: string;
  onCommit: (next: number | null) => void;
  fallbackLabel: string;
  previewValue?: string;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const [draft, setDraft] = useState<string>(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    setDraft(value === null || value === undefined ? "" : String(value));
  }, [value]);
  const commit = () => {
    if (draft.trim() === "") { onCommit(null); return; }
    const n = parseInt(draft.trim(), 10);
    if (!Number.isFinite(n) || n <= 0) { onCommit(null); return; }
    onCommit(n);
  };
  return (
    <div style={{
      padding: "10px 11px",
      borderRadius: 9,
      background: t.surface2,
      border: `1px solid ${t.line}`,
      display: "flex", flexDirection: "column", gap: 5,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 0.7, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={placeholder}
          style={{
            width: 70, padding: "4px 7px", borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface, color: t.ink,
            fontFamily: "inherit", fontSize: 14, fontWeight: 800,
            outline: "none",
          }}
        />
        <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>{unit}</span>
      </div>
      {previewValue ? (
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>≈ {previewValue}</div>
      ) : null}
      <div style={{ fontSize: 10.5, color: t.ink3, lineHeight: 1.35 }}>
        {hint}
      </div>
      <div style={{ fontSize: 10, color: t.ink3, fontStyle: "italic", marginTop: 2 }}>
        Empty → {fallbackLabel} ({placeholder})
      </div>
    </div>
  );
}


function HourInput({
  label, value, onCommit, t,
}: {
  label: string;
  value: number | null;
  onCommit: (next: number | null) => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const [draft, setDraft] = useState<string>(value === null || value === undefined ? "" : String(value));
  useEffect(() => {
    setDraft(value === null || value === undefined ? "" : String(value));
  }, [value]);
  const commit = () => {
    if (draft.trim() === "") { onCommit(null); return; }
    const n = parseInt(draft.trim(), 10);
    if (!Number.isFinite(n) || n < 0 || n > 23) { onCommit(null); return; }
    onCommit(n);
  };
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: t.ink3, fontWeight: 700 }}>
      {label}
      <input
        type="number"
        min={0}
        max={23}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        style={{
          width: 44, padding: "4px 6px", borderRadius: 6,
          border: `1px solid ${t.line}`,
          background: t.surface, color: t.ink,
          fontFamily: "inherit", fontSize: 12, fontWeight: 800,
          outline: "none", textAlign: "center",
        }}
      />
    </label>
  );
}


function formatStall(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (m === 0 && h % 24 === 0) return `${h / 24}d`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
