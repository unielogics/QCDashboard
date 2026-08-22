"use client";

// Super Admin → Lending AI Settings → Borrower Follow-Up Cadence
// Same shape as the agent cadence editor but writes to funding-owned
// rules. Conditional + draft-first.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The rule payloads, the trigger/action catalogs and every mutation are
// unchanged; only the surface vocabulary moved:
//   local CadenceNote helper  → Note (`.note` is already the petrol-tinted
//                               explanatory block, icon tint included)
//   hand-rolled rule rows     → `.gridrow`, keeping the bespoke
//                               38px / 1fr / auto track inline (rule 3)
//   local RuleChip helper     → CellChip + `.caps`
//   local btn()/input()       → Btn / Input / Select / Textarea
//   icon plate                → `.botmark.pet`
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useState } from "react";
import { Btn, CellChip, Input, Note, Panel, Row, Select, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { AIPreviewPanel } from "@/components/AIPreviewPanel";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import {
  isAINotDeployed,
  useDeleteFundingCadenceRule,
  useFundingCadenceRules,
  useUpsertFundingCadenceRule,
  type AgentCadenceRule,
} from "@/hooks/useApi";

const TRIGGERS = [
  { value: "requirement_missing", label: "Requirement missing for N hours" },
  { value: "agreement_unsigned", label: "Agreement sent but unsigned" },
  { value: "borrower_unresponsive", label: "Borrower unresponsive for N days" },
  { value: "closing_date_near", label: "Closing date within N days" },
  { value: "document_uploaded", label: "Document uploaded" },
];

const ACTIONS = [
  { value: "draft_message", label: "Draft message (review in Elara Inbox)" },
  { value: "create_task", label: "Create task" },
  { value: "escalate", label: "Escalate to underwriter" },
  { value: "mark_stalled", label: "Mark stalled" },
  { value: "auto_send_reminder", label: "Auto-send reminder (rare — use carefully)" },
];

// The rule row's own track: a fixed icon plate, a growing description, and a
// shrink-to-fit action cluster. Bespoke, so it stays inline (rule 3) while
// `.gridrow` owns the padding, hairline and alignment.
const RULE_COLS = "38px minmax(0, 1fr) auto";

export default function FundingCadencePage() {
  const { data: rules = [], error: cadErr } = useFundingCadenceRules();
  const upsert = useUpsertFundingCadenceRule();
  const del = useDeleteFundingCadenceRule();
  const [draft, setDraft] = useState<Partial<AgentCadenceRule> | null>(null);

  return (
    <div className="grid">
      <LendingAIHeader
        title="Borrower Follow-Up Cadence"
        subtitle="Base execution policy for the Lending AI secretary. These rules decide when assigned loan tasks produce drafts, borrower outreach, underwriter tasks, or escalation."
      />

      {isAINotDeployed(cadErr) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <div className="grid cols-auto">
        <CadenceNote icon="doc" title="Assigned tasks only" body="Default rules fire only after a requirement is assigned to the Lending AI, so global settings do not chase every open item." />
        <CadenceNote icon="cal" title="Due-date aware" body="The cadence engine reads assignment due dates, next-run windows, and max attempts before drafting or sending." />
        <CadenceNote icon="shield" title="Human-safe by default" body="Draft-first stays the default. Auto-send still requires file-level outreach mode, consent, and a rule that explicitly allows it." />
      </div>

      <Panel
        title="Cadence rules"
        sub={`${rules.length} rule(s)`}
        noPad
        actions={
          <Btn
            variant="pri"
            size="sm"
            onClick={() => setDraft({ trigger_event: "requirement_missing", action_type: "draft_message", approval_required: true, wait_hours: 24, visibility: "borrower", is_active: true, requires_ai_owner: true })}
          >
            + Add rule
          </Btn>
        }
      >
        {rules.map(r => (
          <div key={r.id} className="gridrow" style={{ gridTemplateColumns: RULE_COLS }}>
            <span className="botmark pet">
              <Icon name={r.requires_ai_owner === false ? "bell" : "spark"} size={15} />
            </span>
            <div>
              <div>
                <b>{TRIGGERS.find(x => x.value === r.trigger_event)?.label || r.trigger_event}</b>
                {r.applies_to_requirement_key ? <Sub> · {r.applies_to_requirement_key}</Sub> : null}
              </div>
              <div className="sub">
                → {ACTIONS.find(x => x.value === r.action_type)?.label || r.action_type}
                {r.wait_hours > 0 ? `, after ${r.wait_hours}h` : ""}
                {r.approval_required ? " · awaits approval" : " · auto-sends"}
              </div>
            </div>
            <Row>
              <CellChip className="caps">{r.requires_ai_owner === false ? "Global" : "AI-owned only"}</CellChip>
              <CellChip className="caps">{r.visibility}</CellChip>
              <Btn size="sm" onClick={() => setDraft(r)}>Edit</Btn>
              <Btn size="sm" className="danger" onClick={() => del.mutate(r.id)}>Delete</Btn>
            </Row>
          </div>
        ))}

        {draft ? (
          <div className="panel-b">
            <div className="fldgrid two">
              <Select
                aria-label="Trigger event"
                value={draft.trigger_event}
                onChange={e => setDraft({ ...draft, trigger_event: e.target.value })}
              >
                {TRIGGERS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
              </Select>
              <Input
                aria-label="Requirement key"
                placeholder="Requirement key (optional)"
                value={draft.applies_to_requirement_key || ""}
                onChange={e => setDraft({ ...draft, applies_to_requirement_key: e.target.value || null })}
              />
              <Input
                type="number"
                aria-label="Wait hours"
                placeholder="Wait hours"
                value={draft.wait_hours ?? 0}
                onChange={e => setDraft({ ...draft, wait_hours: parseInt(e.target.value || "0", 10) })}
              />
              <Select
                aria-label="Action type"
                value={draft.action_type}
                onChange={e => setDraft({ ...draft, action_type: e.target.value })}
              >
                {ACTIONS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
              </Select>
              <Textarea
                placeholder="Message template"
                aria-label="Message template"
                value={draft.message_template || ""}
                onChange={e => setDraft({ ...draft, message_template: e.target.value || null })}
                rows={2}
                // Bespoke: this one field spans the two-column form row.
                style={{ gridColumn: "1 / -1" }}
              />
              <label className="row">
                <input type="checkbox" checked={!!draft.approval_required} onChange={e => setDraft({ ...draft, approval_required: e.target.checked })} />
                Require approval (draft-first)
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.requires_ai_owner !== false} onChange={e => setDraft({ ...draft, requires_ai_owner: e.target.checked })} />
                Only run after this requirement is assigned to AI
              </label>
              <label className="row">
                <input type="checkbox" checked={draft.is_active !== false} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
                Active
              </label>
            </div>
            <Row className="mt">
              <Btn
                variant="pri"
                onClick={async () => { await upsert.mutateAsync(draft as Parameters<typeof upsert.mutateAsync>[0]); setDraft(null); }}
              >
                Save rule
              </Btn>
              <Btn onClick={() => setDraft(null)}>Cancel</Btn>
            </Row>
          </div>
        ) : null}
      </Panel>

      <AIPreviewPanel mode="cadence" />
    </div>
  );
}

function CadenceNote({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Note>
      <Icon name={icon} size={16} />
      <div>
        <b>{title}</b>
        <div className="sub">{body}</div>
      </div>
    </Note>
  );
}
