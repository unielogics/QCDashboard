"use client";

// Super Admin → Lending AI Settings → Borrower Follow-Up Cadence
// Same shape as the agent cadence editor but writes to funding-owned
// rules. Conditional + draft-first.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
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
  { value: "draft_message", label: "Draft message (review in AI Inbox)" },
  { value: "create_task", label: "Create task" },
  { value: "escalate", label: "Escalate to underwriter" },
  { value: "mark_stalled", label: "Mark stalled" },
  { value: "auto_send_reminder", label: "Auto-send reminder (rare — use carefully)" },
];

export default function FundingCadencePage() {
  const { t } = useTheme();
  const { data: rules = [], error: cadErr } = useFundingCadenceRules();
  const upsert = useUpsertFundingCadenceRule();
  const del = useDeleteFundingCadenceRule();
  const [draft, setDraft] = useState<Partial<AgentCadenceRule> | null>(null);

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: "0 auto" }}>
      <LendingAIHeader
        title="Borrower Follow-Up Cadence"
        subtitle="Conditional follow-up rules for borrowers in the lending phase. Draft-first by default — auto-send is opt-in per rule."
      />

      {isAINotDeployed(cadErr) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
        gap: 10,
        marginBottom: 18,
      }}>
        <CadenceNote icon="doc" title="Requirement missing" body="Targets open lending requirements and can draft a borrower reminder after the wait period." />
        <CadenceNote icon="cal" title="Create task" body="Creates an approval-track AI task; approval can schedule or route the work depending on the action." />
        <CadenceNote icon="shield" title="Auto-send is explicit" body="Rules stay draft-first unless the action is set to auto-send and approval is disabled." />
      </div>

      <Card pad={20}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 13, color: t.ink3 }}>{rules.length} rule(s)</div>
          <button
            onClick={() => setDraft({ trigger_event: "requirement_missing", action_type: "draft_message", approval_required: true, wait_hours: 24, visibility: "borrower", is_active: true })}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${t.line}`, background: t.petrol, color: "#fff", cursor: "pointer" }}
          >
            + Add rule
          </button>
        </div>
        {rules.map(r => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${t.line}` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>
                {TRIGGERS.find(x => x.value === r.trigger_event)?.label || r.trigger_event}
                {r.applies_to_requirement_key ? <span style={{ color: t.ink3, fontWeight: 400 }}> · {r.applies_to_requirement_key}</span> : null}
              </div>
              <div style={{ fontSize: 12, color: t.ink3 }}>
                → {ACTIONS.find(x => x.value === r.action_type)?.label || r.action_type}
                {r.wait_hours > 0 ? `, after ${r.wait_hours}h` : ""}
                {r.approval_required ? " · awaits approval" : " · auto-sends"}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: t.surface2, color: t.ink3, textTransform: "uppercase" }}>
              {r.visibility}
            </span>
            <button onClick={() => setDraft(r)} style={btn(t)}>Edit</button>
            <button onClick={() => del.mutate(r.id)} style={{ ...btn(t), color: "#c14444" }}>Delete</button>
          </div>
        ))}
        {draft ? (
          <div style={{ padding: 14, marginTop: 12, border: `1px solid ${t.line}`, borderRadius: 8, background: t.surface2, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <select value={draft.trigger_event} onChange={e => setDraft({ ...draft, trigger_event: e.target.value })} style={input(t)}>
              {TRIGGERS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <input placeholder="Requirement key (optional)" value={draft.applies_to_requirement_key || ""} onChange={e => setDraft({ ...draft, applies_to_requirement_key: e.target.value || null })} style={input(t)} />
            <input type="number" placeholder="Wait hours" value={draft.wait_hours ?? 0} onChange={e => setDraft({ ...draft, wait_hours: parseInt(e.target.value || "0", 10) })} style={input(t)} />
            <select value={draft.action_type} onChange={e => setDraft({ ...draft, action_type: e.target.value })} style={input(t)}>
              {ACTIONS.map(x => <option key={x.value} value={x.value}>{x.label}</option>)}
            </select>
            <textarea placeholder="Message template" value={draft.message_template || ""} onChange={e => setDraft({ ...draft, message_template: e.target.value || null })} rows={2} style={{ ...input(t), gridColumn: "1 / -1", resize: "vertical" }} />
            <label style={{ fontSize: 12, color: t.ink, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={!!draft.approval_required} onChange={e => setDraft({ ...draft, approval_required: e.target.checked })} />
              Require approval (draft-first)
            </label>
            <label style={{ fontSize: 12, color: t.ink, display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={draft.is_active !== false} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
              Active
            </label>
            <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8 }}>
              <button
                onClick={async () => { await upsert.mutateAsync(draft as Parameters<typeof upsert.mutateAsync>[0]); setDraft(null); }}
                style={{ ...btn(t), background: t.petrol, color: "#fff" }}
              >
                Save rule
              </button>
              <button onClick={() => setDraft(null)} style={btn(t)}>Cancel</button>
            </div>
          </div>
        ) : null}
      </Card>

      <div style={{ marginTop: 20 }}>
        <AIPreviewPanel mode="cadence" />
      </div>
    </div>
  );
}

function CadenceNote({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex",
      gap: 10,
      padding: 12,
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      background: t.surface2,
    }}>
      <span style={{ color: t.petrol, display: "inline-flex", paddingTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}

function btn(t: ReturnType<typeof useTheme>["t"]) {
  return { padding: "4px 8px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, cursor: "pointer" } as const;
}
function input(t: ReturnType<typeof useTheme>["t"]) {
  return { padding: 8, fontSize: 13, fontFamily: "inherit", borderRadius: 6, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, width: "100%" } as const;
}
