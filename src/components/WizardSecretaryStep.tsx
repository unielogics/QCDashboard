"use client";

// WizardSecretaryStep — the Step 4 surface used by AgentLeadModal +
// SmartIntakeModal. The deal/loan doesn't exist yet, so we can't
// query the canonical /deal-secretary endpoint — instead, we walk
// the agent's buyer/seller playbook and let them toggle items to AI.
//
// Captured intent posts to /clients/{id}/deal-secretary/wizard-intent
// AFTER the parent wizard's main create call succeeds. The post-loan
// path (prequal-accept → spawn-loan → materialize_pending_assignments)
// converts these into real AITaskAssignment rows.
//
// Full drag-drop power lives on the post-loan workbench tab. The
// wizard intentionally uses the simpler toggle surface so agents
// don't get bogged down mid-deal-creation.
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes. Nothing about what this
// step DOES changed: the same playbook merge, the same category grouping, the
// same five outreach modes, the same toggle/preset callbacks, the same counts
// and the same loading state. Public props are untouched.
//
// Two semantic upgrades came with the paint, both of which the old markup was
// missing rather than deliberately omitting:
//   · the outreach-mode tiles are `<button aria-pressed>` — they were plain
//     buttons, so a screen reader announced five identical actions with no way
//     to tell which one was in force;
//   · each requirement row is now a real `<label>` + `<input type="checkbox">`
//     instead of a `<button>` painting a ✓ glyph, so the checked state is
//     announced and Space toggles it the way a checkbox is expected to.

import { useMemo } from "react";
import { Btn, CellChip, Panel, cx } from "@/components/ds";
import { useAgentPlaybook, type PlaybookRequirement } from "@/hooks/useApi";
import {
  DS_CATEGORY_META,
  DS_OUTREACH_MODE_LABELS,
  type DSOutreachMode,
  type DSRequirementCategory,
} from "@/lib/types";

const OUTREACH_MODES: DSOutreachMode[] = [
  "off",
  "draft_first",
  "portal_auto",
  "portal_email",
  "portal_email_sms",
];

export interface WizardSecretaryStepProps {
  side: "buyer" | "seller";
  outreachMode: DSOutreachMode;
  onChangeOutreachMode: (mode: DSOutreachMode) => void;
  aiAssignedKeys: string[];
  onChangeAssignments: (keys: string[]) => void;
}

export function WizardSecretaryStep({
  side,
  outreachMode,
  onChangeOutreachMode,
  aiAssignedKeys,
  onChangeAssignments,
}: WizardSecretaryStepProps) {
  const { data: playbook } = useAgentPlaybook(side);

  // Merge platform + agent overlay rows. Dedup by requirement_key (agent
  // rows win — they may override platform defaults).
  const requirements = useMemo(() => {
    const map = new Map<string, PlaybookRequirement>();
    (playbook?.platform_requirements ?? []).forEach((r) => map.set(r.requirement_key, r));
    (playbook?.agent_requirements ?? []).forEach((r) => map.set(r.requirement_key, r));
    return Array.from(map.values()).sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
  }, [playbook]);

  // Group by category for the rendered list.
  const byCategory = useMemo(() => {
    const groups = new Map<string, PlaybookRequirement[]>();
    for (const r of requirements) {
      const arr = groups.get(r.category) ?? [];
      arr.push(r);
      groups.set(r.category, arr);
    }
    return Array.from(groups.entries());
  }, [requirements]);

  const toggle = (key: string) => {
    if (aiAssignedKeys.includes(key)) {
      onChangeAssignments(aiAssignedKeys.filter((k) => k !== key));
    } else {
      onChangeAssignments([...aiAssignedKeys, key]);
    }
  };

  const presetBorrowerFacing = () => {
    const keys = requirements
      .filter((r) => r.visibility?.includes("borrower"))
      .map((r) => r.requirement_key);
    onChangeAssignments(keys);
  };
  const presetCommonCollection = () => {
    const cats = new Set(["financials", "insurance", "scheduling", "communication"]);
    onChangeAssignments(requirements.filter((r) => cats.has(r.category)).map((r) => r.requirement_key));
  };
  const presetClear = () => onChangeAssignments([]);

  return (
    <div className="grid">
      {/* File-level Outreach Mode strip — the selected mode is echoed in the
          panel header so it is readable without scanning the five tiles. */}
      <Panel title="AI Outreach" sub={DS_OUTREACH_MODE_LABELS[outreachMode].title}>
        <p className="sub mb">
          AI can only work tasks you check below. Off = nothing sends, the AI just tracks.
        </p>
        <div className="fldgrid five">
          {OUTREACH_MODES.map((m) => {
            const active = m === outreachMode;
            const meta = DS_OUTREACH_MODE_LABELS[m];
            return (
              // Wrapped so `.pick + .pick` (a 7px stacking margin) cannot fire
              // between grid cells and knock the row out of alignment.
              <div key={m}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChangeOutreachMode(m)}
                  className={cx("pick", active && "on")}
                >
                  <div className="grow">
                    <b>{meta.title}</b>
                    <div className="sub">{meta.sub}</div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Presets */}
      <div className="row">
        <PresetButton onClick={presetCommonCollection}>Assign common collection</PresetButton>
        <PresetButton onClick={presetBorrowerFacing}>Assign all borrower-facing</PresetButton>
        <PresetButton onClick={presetClear} tone="danger">Clear</PresetButton>
        <span className="sp" />
        <span className="sub">
          {aiAssignedKeys.length} of {requirements.length} on AI
        </span>
      </div>

      {/* Category-grouped list with toggles */}
      <div className="grid g10">
        {byCategory.length === 0 ? (
          <div className="hintbox">
            <span className="sub">Loading your playbook…</span>
          </div>
        ) : null}
        {byCategory.map(([cat, items]) => {
          const meta = DS_CATEGORY_META[cat as DSRequirementCategory];
          return (
            <Panel key={cat} title={meta?.label ?? cat}>
              <div>
                {items.map((r) => {
                  const assigned = aiAssignedKeys.includes(r.requirement_key);
                  return (
                    <label key={r.requirement_key} className={cx("pick", assigned && "on")}>
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() => toggle(r.requirement_key)}
                      />
                      <div className="grow">
                        <b>{r.label}</b>
                        {r.objective_text ? <div className="sub">{r.objective_text}</div> : null}
                      </div>
                      <span className="row">
                        {r.required_level === "required" ? (
                          <CellChip tone="bad">REQ</CellChip>
                        ) : null}
                        {r.required_level === "recommended" ? (
                          <CellChip tone="warn">REC</CellChip>
                        ) : null}
                        {r.link_kind === "docusign" ? (
                          <CellChip tone="mut" title="DocuSign link configured">
                            ✍
                          </CellChip>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </Panel>
          );
        })}
      </div>

      <p className="sub">
        You can fine-tune each AI-handled task (instructions, channels, cadence) on the deal&apos;s
        AI Workbench tab after creation.
      </p>
    </div>
  );
}

function PresetButton({
  onClick,
  children,
  tone,
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "danger";
}) {
  // `.btn.danger` rather than a bare `.c-bad`: `.btn:hover` out-specifies a
  // tone chip class, so a bare tint vanishes exactly when you point at it.
  return (
    <Btn size="sm" className={tone === "danger" ? "danger" : undefined} onClick={onClick}>
      {children}
    </Btn>
  );
}
