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
import { Icon } from "@/components/design-system/Icon";
import type { PlaybookRequirement } from "@/hooks/useApi";

type Stage = "prequalification" | "term_sheet" | "underwriting" | "closing";

const STAGE_ORDER: { id: Stage; label: string }[] = [
  { id: "prequalification", label: "Before Prequalification" },
  { id: "term_sheet", label: "Before Term Sheet" },
  { id: "underwriting", label: "Before Underwriting" },
  { id: "closing", label: "Before Closing" },
];

const CATEGORY_OPTIONS = [
  { value: "borrower_info", label: "Borrower info" },
  { value: "property_data", label: "Property data" },
  { value: "financials", label: "Financials" },
  { value: "credit", label: "Credit" },
  { value: "agreements", label: "Agreements" },
  { value: "insurance", label: "Insurance" },
  { value: "title_and_escrow", label: "Title / escrow" },
  { value: "appraisal_and_inspection", label: "Appraisal / inspection" },
  { value: "scheduling", label: "Scheduling" },
  { value: "compliance", label: "Compliance" },
  { value: "communication", label: "Communication" },
  { value: "ai_internal", label: "AI internal" },
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
          allRequirements={requirements}
          onUpsert={onUpsert}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
      {buckets.unscoped.length > 0 ? (
        <StageBucket
          stage={{ id: "unscoped" as never, label: "Other (no stage gate)" }}
          requirements={buckets.unscoped}
          allRequirements={requirements}
          onUpsert={onUpsert}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}


function StageBucket({
  stage, requirements, allRequirements, onUpsert, onDelete, readOnly,
}: {
  stage: { id: Stage | "unscoped"; label: string };
  requirements: PlaybookRequirement[];
  allRequirements: PlaybookRequirement[];
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
      category: normalizeCategory(draft.category),
      required_level: draft.required_level || "required",
      blocks_stage: stage.id === "unscoped" ? null : stage.id,
      can_agent_override: draft.can_agent_override ?? true,
      can_underwriter_waive: draft.can_underwriter_waive ?? true,
      default_owner_type: draft.default_owner_type || "human",
      default_channels: draft.default_channels || ["portal"],
      default_cadence_hours: draft.default_cadence_hours ?? 48,
      completion_mode: draft.completion_mode || "ai_can_complete",
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
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, color: t.ink, fontWeight: 700 }}>{r.label}</span>
            <span style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
              <SmallChip t={t}>{categoryLabel(r.category)}</SmallChip>
              <SmallChip t={t}>{ownerLabel(r.default_owner_type)}</SmallChip>
              <SmallChip t={t}>{r.default_cadence_hours ?? 48}h cadence</SmallChip>
              {r.objective_text || r.completion_criteria ? <SmallChip t={t}>AI brief set</SmallChip> : null}
              {r.parent_key ? (
                <SmallChip t={t}>↳ under {labelFor(r.parent_key, allRequirements)}</SmallChip>
              ) : null}
              {(r.depends_on || []).length > 0 ? (
                <SmallChip t={t}>after {(r.depends_on || []).map(k => labelFor(k, allRequirements)).join(", ")}</SmallChip>
              ) : null}
              {(r.inferred_depends_on || []).length > 0 && !r.deps_confirmed ? (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  background: "#fff5cc", color: "#85661a",
                }}>
                  AI suggested: after {(r.inferred_depends_on || []).map(k => labelFor(k, allRequirements)).join(", ")}
                </span>
              ) : null}
            </span>
          </span>
          <ConditionChips applies_when={r.applies_when} t={t} />
          {!r.can_agent_override ? (
            <span style={{ color: "#a06000", display: "inline-flex" }} title="Agents cannot waive">
              <Icon name="lock" size={12} stroke={2.5} />
            </span>
          ) : null}
          {!readOnly ? (
            <>
              <button
                onClick={() => setDraft({ ...r })}
                style={rowBtn(t)}
              >
                Configure
              </button>
              <button
                onClick={() => onDelete(r.id)}
                style={{ ...rowBtn(t), color: "#c14444" }}
              >
                Remove
              </button>
            </>
          ) : null}
        </div>
      ))}

      {draft ? (
        <InlineAddForm
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={() => setDraft(null)}
          allRequirements={allRequirements}
          t={t}
        />
      ) : !readOnly ? (
        <button
          onClick={() => setDraft({ required_level: "required", category: "borrower_info", label: "", default_owner_type: "human", default_channels: ["portal"], default_cadence_hours: 48 })}
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


function SmallChip({ children, t }: { children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <span style={{
      fontSize: 10,
      fontWeight: 700,
      padding: "2px 6px",
      borderRadius: 4,
      background: t.surface2,
      color: t.ink3,
      whiteSpace: "nowrap",
    }}>
      {children}
    </span>
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
  draft, setDraft, onSave, onCancel, allRequirements, t,
}: {
  draft: Partial<PlaybookRequirement>;
  setDraft: (d: Partial<PlaybookRequirement>) => void;
  onSave: () => void;
  onCancel: () => void;
  allRequirements: PlaybookRequirement[];
  t: ReturnType<typeof useTheme>["t"];
}) {
  const aw = (draft.applies_when || {}) as Record<string, unknown>;
  function toggleCondition(key: string, value: unknown) {
    const next = { ...aw };
    if (next[key] === value) delete next[key];
    else next[key] = value;
    setDraft({ ...draft, applies_when: Object.keys(next).length ? next : null });
  }
  const channels = draft.default_channels || ["portal"];
  function toggleChannel(value: string) {
    const next = new Set(channels);
    next.has(value) ? next.delete(value) : next.add(value);
    setDraft({ ...draft, default_channels: Array.from(next) });
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
          value={normalizeCategory(draft.category)}
          onChange={e => setDraft({ ...draft, category: e.target.value as PlaybookRequirement["category"] })}
          style={inputStyle(t)}
        >
          {CATEGORY_OPTIONS.map(x => (
            <option key={x.value} value={x.value}>{x.label}</option>
          ))}
        </select>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 8,
        paddingTop: 6,
      }}>
        <FieldBlock label="Default owner" t={t}>
          <select
            value={draft.default_owner_type || "human"}
            onChange={e => setDraft({ ...draft, default_owner_type: e.target.value })}
            style={inputStyle(t)}
          >
            <option value="human">Human</option>
            <option value="ai">AI secretary</option>
            <option value="shared">Shared</option>
            <option value="funding_locked">Funding locked</option>
          </select>
        </FieldBlock>
        <FieldBlock label="Cadence" t={t}>
          <input
            type="number"
            min={1}
            value={draft.default_cadence_hours ?? 48}
            onChange={e => setDraft({ ...draft, default_cadence_hours: parseInt(e.target.value || "48", 10) })}
            style={inputStyle(t)}
          />
        </FieldBlock>
        <FieldBlock label="Completion" t={t}>
          <select
            value={draft.completion_mode || "ai_can_complete"}
            onChange={e => setDraft({ ...draft, completion_mode: e.target.value })}
            style={inputStyle(t)}
          >
            <option value="ai_can_complete">AI can complete</option>
            <option value="requires_human_verify">Human verifies</option>
            <option value="borrower_self_attest">Borrower attests</option>
          </select>
        </FieldBlock>
      </div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {["portal", "email", "sms"].map(ch => (
          <label key={ch} style={radio(t)}>
            <input type="checkbox" checked={channels.includes(ch)} onChange={() => toggleChannel(ch)} />
            {ch.toUpperCase()}
          </label>
        ))}
        <label style={{ ...radio(t), marginLeft: "auto" }}>
          <input
            type="checkbox"
            checked={draft.can_agent_override !== false}
            onChange={e => setDraft({ ...draft, can_agent_override: e.target.checked })}
          />
          Agent can adjust
        </label>
      </div>

      <FieldBlock label="AI objective" t={t}>
        <textarea
          placeholder="What the AI is trying to collect or resolve."
          value={draft.objective_text || ""}
          onChange={e => setDraft({ ...draft, objective_text: e.target.value })}
          rows={2}
          style={{ ...inputStyle(t), resize: "vertical", width: "100%" }}
        />
      </FieldBlock>
      <FieldBlock label="Completion criteria" t={t}>
        <textarea
          placeholder="How the AI knows this item is complete enough for underwriting."
          value={draft.completion_criteria || ""}
          onChange={e => setDraft({ ...draft, completion_criteria: e.target.value })}
          rows={2}
          style={{ ...inputStyle(t), resize: "vertical", width: "100%" }}
        />
      </FieldBlock>

      <div style={{ display: "grid", gridTemplateColumns: "160px minmax(0, 1fr)", gap: 8 }}>
        <input
          placeholder="Link label"
          value={draft.link_label || ""}
          onChange={e => setDraft({ ...draft, link_label: e.target.value || null })}
          style={inputStyle(t)}
        />
        <input
          placeholder="Link URL"
          value={draft.link_url || ""}
          onChange={e => setDraft({ ...draft, link_url: e.target.value || null })}
          style={inputStyle(t)}
        />
      </div>

      <FieldBlock label="Group under (parent task)" t={t}>
        <select
          value={draft.parent_key || ""}
          onChange={e => setDraft({ ...draft, parent_key: e.target.value || null })}
          style={{ ...inputStyle(t), width: "100%" }}
        >
          <option value="">— No parent (top-level) —</option>
          {allRequirements
            .filter(r => r.requirement_key !== draft.requirement_key && !r.parent_key)
            .map(r => (
              <option key={r.id} value={r.requirement_key}>{r.label}</option>
            ))}
        </select>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
          Sub-tasks roll up under their parent in the timeline (e.g. all entity docs under "Entity formation").
        </div>
      </FieldBlock>

      <FieldBlock label="Depends on (do these first)" t={t}>
        <DependsOnChipPicker
          value={draft.depends_on || []}
          onChange={(next) => setDraft({ ...draft, depends_on: next })}
          options={allRequirements.filter(r => r.requirement_key !== draft.requirement_key)}
          t={t}
        />
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
          Timeline shows this task as "Upcoming" until every dependency is verified. Empty = "Next up" immediately.
        </div>
      </FieldBlock>

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


function DependsOnChipPicker({
  value, onChange, options, t,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: PlaybookRequirement[];
  t: ReturnType<typeof useTheme>["t"];
}) {
  const selected = new Set(value);
  const remaining = options.filter(r => !selected.has(r.requirement_key));
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
      {value.map(key => {
        const lbl = options.find(r => r.requirement_key === key)?.label || key;
        return (
          <span
            key={key}
            style={{
              fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12,
              background: t.surface, border: `1px solid ${t.line}`, color: t.ink,
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            {lbl}
            <button
              onClick={() => onChange(value.filter(v => v !== key))}
              style={{
                border: 0, background: "transparent", cursor: "pointer",
                color: t.ink3, fontSize: 14, lineHeight: 1, padding: 0,
              }}
              aria-label={`Remove ${lbl}`}
            >×</button>
          </span>
        );
      })}
      <select
        value=""
        onChange={e => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
        style={{ ...inputStyle(t), fontSize: 12, padding: "4px 6px" }}
      >
        <option value="">+ Add dependency</option>
        {remaining.map(r => (
          <option key={r.id} value={r.requirement_key}>{r.label}</option>
        ))}
      </select>
    </div>
  );
}


function labelFor(key: string, requirements: PlaybookRequirement[]): string {
  return requirements.find(r => r.requirement_key === key)?.label || key;
}


function FieldBlock({
  label,
  children,
  t,
}: {
  label: string;
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.ink3, textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </div>
      {children}
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

function rowBtn(t: ReturnType<typeof useTheme>["t"]) {
  return {
    background: "transparent",
    border: `1px solid ${t.line}`,
    padding: "4px 8px",
    borderRadius: 4,
    color: t.ink3,
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 700,
  } as const;
}

function categoryLabel(value?: string) {
  return CATEGORY_OPTIONS.find(x => x.value === normalizeCategory(value))?.label || "Borrower info";
}

function normalizeCategory(value?: string) {
  if (CATEGORY_OPTIONS.some(x => x.value === value)) return value || "borrower_info";
  if (value === "agreement") return "agreements";
  if (value === "appointment") return "scheduling";
  if (value === "task") return "ai_internal";
  return "borrower_info";
}

function ownerLabel(value?: string) {
  if (value === "ai") return "AI";
  if (value === "shared") return "Shared";
  if (value === "funding_locked") return "Funding locked";
  return "Human";
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
