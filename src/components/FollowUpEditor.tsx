"use client";

// FollowUpEditor — three-knob AI re-engagement cadence config.
//
// Reused in three places:
//   • /loans/[id] Elara tab — per-loan override
//   • /clients/[id]/workspace      — per-client (agent side) override
//   • /admin/lending-ai/playbooks  — firm-default
//
// Each surface owns its own value + onChange + onSave plumbing; this
// component is the visual contract.
//
// Styling is the shared class system: the block is a `.panel` (its header row
// carries the title, the "saving…" note and Reset), the three knobs are a
// `.fldgrid.three`, and every control is a `.field`. No palette tokens live in
// this file — which is why the `t` prop the two sub-components used to take is
// gone: it carried nothing but colours.

import { useEffect, useId, useState } from "react";
import { Btn, Input, Panel } from "@/components/ds";
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
  const [draft, setDraft] = useState<FollowUpSettings>(value ?? {});
  useEffect(() => { setDraft(value ?? {}); }, [value]);

  const stallDisplay = formatStall(draft.stall_threshold_minutes ?? fallback.stall_threshold_minutes ?? 1440);

  const update = (patch: Partial<FollowUpSettings>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(next);
  };

  return (
    <Panel
      // `.row` inside the heading, not a bare svg: Preflight makes svg a
      // block element, so an icon dropped straight into the h3 would sit on
      // its own line above the title.
      title={<span className="row"><Icon name="ai" size={14} stroke={2.2} />{title}</span>}
      sub={subtitle}
      actions={
        <>
          {saving ? <span className="sub">saving…</span> : null}
          {hasOverride && onReset ? (
            <Btn size="sm" onClick={onReset}>
              Reset to default
            </Btn>
          ) : null}
        </>
      }
      bodyClass="grid g10"
    >
      <div className="fldgrid three">
        <KnobField
          label="Stall threshold"
          hint="Wait this long after the last borrower message before nudging again."
          unit="minutes"
          value={draft.stall_threshold_minutes ?? null}
          placeholder={String(fallback.stall_threshold_minutes ?? 1440)}
          onCommit={(v) => update({ stall_threshold_minutes: v })}
          fallbackLabel={fallbackLabel}
          previewValue={stallDisplay}
        />
        <KnobField
          label="Max attempts / day"
          hint="Skip when the AI has already nudged this many times in the last 24 h."
          unit="per day"
          value={draft.max_attempts_per_day ?? null}
          placeholder={String(fallback.max_attempts_per_day ?? 3)}
          onCommit={(v) => update({ max_attempts_per_day: v })}
          fallbackLabel={fallbackLabel}
        />
        <KnobField
          label="Max days no reply"
          hint="After this many days of silence, stop nudging entirely until a human re-arms."
          unit="days"
          value={draft.max_days_without_reply ?? null}
          placeholder={String(fallback.max_days_without_reply ?? 14)}
          onCommit={(v) => update({ max_days_without_reply: v })}
          fallbackLabel={fallbackLabel}
        />
      </div>

      {/* Quiet hours — optional. Both unset = no quiet-hours gate. */}
      <div className="row">
        <span className="lbl">Quiet hours (optional)</span>
        <HourInput
          label="Start"
          value={draft.quiet_hours_start ?? null}
          onCommit={(v) => update({ quiet_hours_start: v })}
        />
        <HourInput
          label="End"
          value={draft.quiet_hours_end ?? null}
          onCommit={(v) => update({ quiet_hours_end: v })}
        />
        <span className="sub">
          {draft.quiet_hours_start != null && draft.quiet_hours_end != null
            ? `AI won't nudge between ${pad(draft.quiet_hours_start)}:00 and ${pad(draft.quiet_hours_end)}:00`
            : "Disabled — no quiet-hours gate"}
        </span>
      </div>
    </Panel>
  );
}


function KnobField({
  label, hint, unit, value, placeholder, onCommit, fallbackLabel, previewValue,
}: {
  label: string;
  hint: string;
  unit: string;
  value: number | null;
  placeholder: string;
  onCommit: (next: number | null) => void;
  fallbackLabel: string;
  previewValue?: string;
}) {
  const inputId = useId();
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
    <div className="grid g4">
      <label className="lbl" htmlFor={inputId}>{label}</label>
      <div className="row">
        <Input
          id={inputId}
          type="number"
          inputMode="numeric"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={placeholder}
          // Bespoke control width — a three-digit cadence number next to its
          // unit, not a full-width text field. `.field` owns everything else.
          style={{ width: 78 }}
        />
        <span className="sub">{unit}</span>
      </div>
      {previewValue ? <span className="sub">≈ {previewValue}</span> : null}
      <span className="sub">{hint}</span>
      {/* <em>, not an inline font-style: the fallback line is an aside about
          the field, and the element already italicises it. */}
      <em className="sub">Empty → {fallbackLabel} ({placeholder})</em>
    </div>
  );
}


function HourInput({
  label, value, onCommit,
}: {
  label: string;
  value: number | null;
  onCommit: (next: number | null) => void;
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
    <label className="row">
      <span className="sub">{label}</span>
      <Input
        type="number"
        min={0}
        max={23}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        placeholder="—"
        // Bespoke control width — a two-digit hour.
        style={{ width: 62 }}
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
