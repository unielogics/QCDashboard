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
//
// Styling is the design system in globals.css / app-extras.css: each stage is
// a `.panel`, each requirement a `.filerow` (which already owns the checkbox
// sizing), and the metadata chips are `.cellchip`. No palette tokens here.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Chip,
  Field,
  Input,
  Linky,
  Panel,
  Row,
  Seg,
  Select,
  Textarea,
} from "@/components/ds";
import type { PlaybookRequirement } from "@/hooks/useApi";

type Stage = "prequalification" | "term_sheet" | "underwriting" | "closing";
type Level = PlaybookRequirement["required_level"];

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

const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: "required", label: "Required" },
  { value: "recommended", label: "Recommended" },
  { value: "optional", label: "Optional" },
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
    <div className="cg">
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
    <Panel className="s12" title={stage.label}>
      {requirements.length === 0 && !draft ? (
        <div className="sub">—</div>
      ) : null}

      {requirements.map(r => (
        <div key={r.id} className="filerow">
          <input type="checkbox" checked readOnly disabled={readOnly} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>{r.label}</b>
            <div className="row" style={{ marginTop: 4 }}>
              <CellChip>{categoryLabel(r.category)}</CellChip>
              <CellChip>{ownerLabel(r.default_owner_type)}</CellChip>
              <CellChip>{r.default_cadence_hours ?? 48}h cadence</CellChip>
              {r.objective_text || r.completion_criteria ? <CellChip>AI brief set</CellChip> : null}
              {r.parent_key ? (
                <CellChip>↳ under {labelFor(r.parent_key, allRequirements)}</CellChip>
              ) : null}
              {(r.depends_on || []).length > 0 ? (
                <CellChip>after {(r.depends_on || []).map(k => labelFor(k, allRequirements)).join(", ")}</CellChip>
              ) : null}
              {(r.inferred_depends_on || []).length > 0 && !r.deps_confirmed ? (
                <CellChip tone="gold">
                  AI suggested: after {(r.inferred_depends_on || []).map(k => labelFor(k, allRequirements)).join(", ")}
                </CellChip>
              ) : null}
            </div>
          </div>
          <ConditionChips applies_when={r.applies_when} />
          {!r.can_agent_override ? (
            <span className="cellchip c-warn" title="Agents cannot waive">
              <Icon name="lock" size={12} stroke={2.5} />
            </span>
          ) : null}
          {!readOnly ? (
            <>
              <Btn size="sm" onClick={() => setDraft({ ...r })}>
                Configure
              </Btn>
              <Btn size="sm" onClick={() => onDelete(r.id)} style={{ color: "var(--danger)" }}>
                Remove
              </Btn>
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
        />
      ) : !readOnly ? (
        <Btn
          className="mt"
          size="sm"
          onClick={() => setDraft({ required_level: "required", category: "borrower_info", label: "", default_owner_type: "human", default_channels: ["portal"], default_cadence_hours: 48 })}
        >
          + Add
        </Btn>
      ) : null}
    </Panel>
  );
}


function ConditionChips({
  applies_when,
}: {
  applies_when: Record<string, unknown> | null;
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
  return <CellChip tone="acc">{chips.join(" · ")}</CellChip>;
}


function InlineAddForm({
  draft, setDraft, onSave, onCancel, allRequirements,
}: {
  draft: Partial<PlaybookRequirement>;
  setDraft: (d: Partial<PlaybookRequirement>) => void;
  onSave: () => void;
  onCancel: () => void;
  allRequirements: PlaybookRequirement[];
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
    <div className="card mt" style={{ display: "grid", gap: 10 }}>
      <Input
        autoFocus
        placeholder="Item label (e.g. Bank statements last 2 months)"
        value={draft.label || ""}
        onChange={e => setDraft({ ...draft, label: e.target.value })}
      />
      <div className="row">
        <Seg<Level>
          as="filter"
          ariaLabel="Requirement level"
          value={(draft.required_level || "required") as Level}
          onChange={v => setDraft({ ...draft, required_level: v })}
          options={LEVEL_OPTIONS}
        />
        <Select
          value={normalizeCategory(draft.category)}
          onChange={e => setDraft({ ...draft, category: e.target.value as PlaybookRequirement["category"] })}
        >
          {CATEGORY_OPTIONS.map(x => (
            <option key={x.value} value={x.value}>{x.label}</option>
          ))}
        </Select>
      </div>

      <div className="cg">
        <Field className="s4" label="Default owner">
          <Select
            value={draft.default_owner_type || "human"}
            onChange={e => setDraft({ ...draft, default_owner_type: e.target.value })}
          >
            <option value="human">Human</option>
            <option value="ai">AI secretary</option>
            <option value="shared">Shared</option>
            <option value="funding_locked">Funding locked</option>
          </Select>
        </Field>
        <Field className="s4" label="Cadence">
          <Input
            type="number"
            min={1}
            value={draft.default_cadence_hours ?? 48}
            onChange={e => setDraft({ ...draft, default_cadence_hours: parseInt(e.target.value || "48", 10) })}
          />
        </Field>
        <Field className="s4" label="Completion">
          <Select
            value={draft.completion_mode || "ai_can_complete"}
            onChange={e => setDraft({ ...draft, completion_mode: e.target.value })}
          >
            <option value="ai_can_complete">AI can complete</option>
            <option value="requires_human_verify">Human verifies</option>
            <option value="borrower_self_attest">Borrower attests</option>
          </Select>
        </Field>
      </div>

      <div className="row">
        {["portal", "email", "sms"].map(ch => (
          <label key={ch} className="row" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={channels.includes(ch)} onChange={() => toggleChannel(ch)} />
            {ch.toUpperCase()}
          </label>
        ))}
        <label className="row" style={{ marginLeft: "auto", cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={draft.can_agent_override !== false}
            onChange={e => setDraft({ ...draft, can_agent_override: e.target.checked })}
          />
          Agent can adjust
        </label>
      </div>

      <Field label="AI objective">
        <Textarea
          placeholder="What the AI is trying to collect or resolve."
          value={draft.objective_text || ""}
          onChange={e => setDraft({ ...draft, objective_text: e.target.value })}
          rows={2}
          style={{ resize: "vertical" }}
        />
      </Field>
      <Field label="Completion criteria">
        <Textarea
          placeholder="How the AI knows this item is complete enough for underwriting."
          value={draft.completion_criteria || ""}
          onChange={e => setDraft({ ...draft, completion_criteria: e.target.value })}
          rows={2}
          style={{ resize: "vertical" }}
        />
      </Field>

      <div className="row">
        <Input
          placeholder="Link label"
          value={draft.link_label || ""}
          onChange={e => setDraft({ ...draft, link_label: e.target.value || null })}
        />
        <Input
          grow
          placeholder="Link URL"
          value={draft.link_url || ""}
          onChange={e => setDraft({ ...draft, link_url: e.target.value || null })}
        />
      </div>

      <Field
        label="Group under (parent task)"
        hint={'Sub-tasks roll up under their parent in the timeline (e.g. all entity docs under "Entity formation").'}
      >
        <Select
          value={draft.parent_key || ""}
          onChange={e => setDraft({ ...draft, parent_key: e.target.value || null })}
        >
          <option value="">— No parent (top-level) —</option>
          {allRequirements
            .filter(r => r.requirement_key !== draft.requirement_key && !r.parent_key)
            .map(r => (
              <option key={r.id} value={r.requirement_key}>{r.label}</option>
            ))}
        </Select>
      </Field>

      <Field
        label="Depends on (do these first)"
        hint={'Timeline shows this task as "Upcoming" until every dependency is verified. Empty = "Next up" immediately.'}
      >
        <DependsOnChipPicker
          value={draft.depends_on || []}
          onChange={(next) => setDraft({ ...draft, depends_on: next })}
          options={allRequirements.filter(r => r.requirement_key !== draft.requirement_key)}
        />
      </Field>

      <div className="row">
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={aw.under_contract === true} onChange={() => toggleCondition("under_contract", true)} />
          Only if under contract
        </label>
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={aw.borrower_type === "entity"} onChange={() => toggleCondition("borrower_type", "entity")} />
          Only if borrower is an entity
        </label>
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={aw.financing_needed === false} onChange={() => toggleCondition("financing_needed", false)} />
          Only if cash buyer
        </label>
      </div>
      <Row>
        <Btn variant="pri" onClick={onSave}>Save</Btn>
        <Btn onClick={onCancel}>Cancel</Btn>
      </Row>
    </div>
  );
}


function DependsOnChipPicker({
  value, onChange, options,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options: PlaybookRequirement[];
}) {
  const selected = new Set(value);
  const remaining = options.filter(r => !selected.has(r.requirement_key));
  return (
    <div className="row">
      {value.map(key => {
        const lbl = options.find(r => r.requirement_key === key)?.label || key;
        return (
          <Chip key={key}>
            {lbl}
            <Linky
              onClick={() => onChange(value.filter(v => v !== key))}
              aria-label={`Remove ${lbl}`}
            >×</Linky>
          </Chip>
        );
      })}
      <Select
        value=""
        onChange={e => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">+ Add dependency</option>
        {remaining.map(r => (
          <option key={r.id} value={r.requirement_key}>{r.label}</option>
        ))}
      </Select>
    </div>
  );
}


function labelFor(key: string, requirements: PlaybookRequirement[]): string {
  return requirements.find(r => r.requirement_key === key)?.label || key;
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
