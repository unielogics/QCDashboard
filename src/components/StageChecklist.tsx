"use client";

// StageChecklist — bucket lending requirements by stage, render as
// plain checkbox lists. Used by /admin/lending-ai/playbooks.
//
// Maps the underlying `blocks_stage` field onto four ordered buckets
// the underwriter actually thinks in:
//   Before Prequalification → Before Term Sheet → Before Underwriting → Before Closing
//
// Adding a row uses an inline form: label + Required/Recommended/Optional
// + an optional plain-English condition picker (renders applies_when as
// 1-2 toggles, never raw JSON).

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import type { PlaybookRequirement } from "@/hooks/useApi";

type Stage = "prequalification" | "term_sheet" | "underwriting" | "closing";

const STAGE_ORDER: { id: Stage; label: string }[] = [
  { id: "prequalification", label: "Before Prequalification" },
  { id: "term_sheet", label: "Before Term Sheet" },
  { id: "underwriting", label: "Before Underwriting" },
  { id: "closing", label: "Before Closing" },
];


interface Props {
  requirements: PlaybookRequirement[];
  onUpsert: (req: Partial<PlaybookRequirement> & { requirement_key: string; label: string; category: string; required_level: string }) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
  /** Disable editing (e.g. when viewing a published playbook before fork). */
  readOnly?: boolean;
}


export function StageChecklist({ requirements, onUpsert, onDelete, readOnly }: Props) {
  const buckets = useMemo(() => {
    const out: Record<Stage | "unscoped", PlaybookRequirement[]> = {
      prequalification: [],
      term_sheet: [],
      underwriting: [],
      closing: [],
      unscoped: [],
    };
    for (const r of requirements) {
      const s = (r.blocks_stage || "unscoped") as Stage | "unscoped";
      if (s in out) out[s].push(r);
      else out.unscoped.push(r);
    }
    return out;
  }, [requirements]);

  return (
    <div>
      {STAGE_ORDER.map(stage => (
        <StageBucket
          key={stage.id}
          stage={stage}
          requirements={buckets[stage.id]}
          onUpsert={onUpsert}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
      {buckets.unscoped.length > 0 ? (
        <StageBucket
          stage={{ id: "unscoped" as never, label: "Other (no stage gate)" }}
          requirements={buckets.unscoped}
          onUpsert={onUpsert}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}


function StageBucket({
  stage, requirements, onUpsert, onDelete, readOnly,
}: {
  stage: { id: Stage | "unscoped"; label: string };
  requirements: PlaybookRequirement[];
  onUpsert: Props["onUpsert"];
  onDelete: Props["onDelete"];
  readOnly?: boolean;
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState<Partial<PlaybookRequirement> | null>(null);

  async function save() {
    if (!draft || !draft.label) return;
    await onUpsert({
      ...draft,
      requirement_key: draft.requirement_key || draft.label.trim().toLowerCase().replace(/\s+/g, "_"),
      label: draft.label,
      category: draft.category || "fact",
      required_level: draft.required_level || "required",
      blocks_stage: stage.id === "unscoped" ? null : stage.id,
    });
    setDraft(null);
  }

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{
        fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 8,
      }}>
        {stage.label}:
      </div>

      {requirements.length === 0 && !draft ? (
        <div style={{ fontSize: 13, color: t.ink3, padding: "4px 0" }}>—</div>
      ) : null}

      {requirements.map(r => (
        <div key={r.id} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "8px 0", borderBottom: `1px solid ${t.line}`,
        }}>
          <input type="checkbox" checked readOnly disabled={readOnly} style={{ width: 18, height: 18 }} />
          <span style={{ flex: 1, fontSize: 13, color: t.ink }}>{r.label}</span>
          <ConditionChips applies_when={r.applies_when} t={t} />
          {!r.can_agent_override ? (
            <span style={{ fontSize: 10, fontWeight: 700, color: "#a06000" }} title="Agents cannot waive">
              🔒
            </span>
          ) : null}
          {!readOnly ? (
            <button
              onClick={() => onDelete(r.id)}
              style={{
                background: "transparent", border: `1px solid ${t.line}`,
                padding: "2px 8px", borderRadius: 4, color: "#c14444",
                cursor: "pointer", fontSize: 11,
              }}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      {draft ? (
        <InlineAddForm
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          t={t}
        />
      ) : !readOnly ? (
        <button
          onClick={() => setDraft({ required_level: "required", category: "fact", label: "" })}
          style={{
            marginTop: 8,
            padding: "6px 12px", fontSize: 12, fontWeight: 600,
            borderRadius: 6, border: `1px dashed ${t.line}`,
            background: "transparent", color: t.ink3, cursor: "pointer",
          }}
        >
          + Add
        </button>
      ) : null}
    </div>
  );
}


function ConditionChips({
  applies_when, t,
}: {
  applies_when: Record<string, unknown> | null;
  t: ReturnType<typeof useTheme>["t"];
}) {
  if (!applies_when || Object.keys(applies_when).length === 0) return null;
  const chips: string[] = [];
  if (applies_when.under_contract === true) chips.push("only if under contract");
  if (applies_when.borrower_type === "entity") chips.push("only if borrower is entity");
  if (applies_when.financing_needed === false) chips.push("only if cash buyer");
  if (chips.length === 0) {
    // Generic fallback for any conditions we haven't mapped.
    chips.push("conditional");
  }
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "2px 6px", borderRadius: 4,
      background: "#e0e8fd", color: "#3a55b8",
    }}>
      {chips.join(" · ")}
    </span>
  );
}


function InlineAddForm({
  draft, setDraft, onSave, onCancel, t,
}: {
  draft: Partial<PlaybookRequirement>;
  setDraft: (d: Partial<PlaybookRequirement>) => void;
  onSave: () => void;
  onCancel: () => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const aw = (draft.applies_when || {}) as Record<string, unknown>;
  function toggleCondition(key: string, value: unknown) {
    const next = { ...aw };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    setDraft({ ...draft, applies_when: Object.keys(next).length ? next : null });
  }

  return (
    <div style={{
      marginTop: 10, padding: 14,
      borderRadius: 8, border: `1px dashed ${t.line}`,
      background: t.surface2, display: "grid", gap: 8,
    }}>
      <input
        autoFocus
        placeholder="Item label (e.g. Bank statements last 2 months)"
        value={draft.label || ""}
        onChange={e => setDraft({ ...draft, label: e.target.value })}
        style={inputStyle(t)}
      />
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <label style={radio(t)}>
          <input type="radio" checked={draft.required_level === "required"} onChange={() => setDraft({ ...draft, required_level: "required" })} /> Required
        </label>
        <label style={radio(t)}>
          <input type="radio" checked={draft.required_level === "recommended"} onChange={() => setDraft({ ...draft, required_level: "recommended" })} /> Recommended
        </label>
        <label style={radio(t)}>
          <input type="radio" checked={draft.required_level === "optional"} onChange={() => setDraft({ ...draft, required_level: "optional" })} /> Optional
        </label>
        <select
          value={draft.category || "fact"}
          onChange={e => setDraft({ ...draft, category: e.target.value as PlaybookRequirement["category"] })}
          style={inputStyle(t)}
        >
          <option value="fact">fact</option>
          <option value="document">document</option>
          <option value="agreement">agreement</option>
          <option value="appointment">appointment</option>
          <option value="task">task</option>
        </select>
      </div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <label style={radio(t)}>
          <input type="checkbox" checked={aw.under_contract === true} onChange={() => toggleCondition("under_contract", true)} />
          Only if under contract
        </label>
        <label style={radio(t)}>
          <input type="checkbox" checked={aw.borrower_type === "entity"} onChange={() => toggleCondition("borrower_type", "entity")} />
          Only if borrower is an entity
        </label>
        <label style={radio(t)}>
          <input type="checkbox" checked={aw.financing_needed === false} onChange={() => toggleCondition("financing_needed", false)} />
          Only if cash buyer
        </label>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        <button onClick={onSave} style={btnPrimary(t)}>Save</button>
        <button onClick={onCancel} style={btnSecondary(t)}>Cancel</button>
      </div>
    </div>
  );
}


function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: 8, fontSize: 13, fontFamily: "inherit",
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink,
  } as const;
}


function radio(t: ReturnType<typeof useTheme>["t"]) {
  return {
    fontSize: 13, color: t.ink, display: "flex",
    alignItems: "center", gap: 6, cursor: "pointer",
  } as const;
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "6px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "6px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}
