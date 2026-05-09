"use client";

// AIInboxCard — the agent's command-center card.
//
// Every card answers three questions:
//   1. What is this?
//   2. Why does it matter?
//   3. What will happen if I approve?
//
// Used inside /ai-inbox for cadence drafts (Phase 5), document
// contradictions (Phase 6), and any other AITask with a
// `cadence_*` / `confirm_*` action shape. Falls back gracefully on
// older tasks that lack the new payload fields.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import type { AITask } from "@/lib/types";

interface Props {
  task: AITask;
  onApprove?: (task: AITask) => void | Promise<void>;
  onEdit?: (task: AITask) => void;
  onDismiss?: (task: AITask) => void | Promise<void>;
}


export function AIInboxCard({ task, onApprove, onEdit, onDismiss }: Props) {
  const { t } = useTheme();
  const dp = (task.draft_payload || {}) as Record<string, unknown>;

  const what = task.title || "(Untitled task)";
  const why = explainWhy(task, dp);
  const willHappen = explainOutcome(task, dp);
  const message = (dp.message as string) || task.summary || null;

  const severity = task.priority === "high" ? "high" : task.priority === "low" ? "low" : "medium";
  const accent =
    severity === "high" ? "#c14444"
    : severity === "low" ? "#888"
    : t.accent;

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 4, alignSelf: "stretch", borderRadius: 2,
          background: accent, marginTop: 2,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginBottom: 2 }}>
            {what}
          </div>
          {task.priority === "high" ? (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
              background: "#fde0e0", color: "#c14444", textTransform: "uppercase",
            }}>
              High priority
            </span>
          ) : null}
        </div>
      </div>

      {why ? (
        <Section label="Why" t={t}>
          {why}
        </Section>
      ) : null}

      {message ? (
        <Section label="Suggested message" t={t}>
          <div style={{
            padding: 10, borderRadius: 6, background: t.surface2,
            fontSize: 13, color: t.ink, lineHeight: 1.5,
            fontStyle: "italic", whiteSpace: "pre-wrap",
          }}>
            {message}
          </div>
        </Section>
      ) : null}

      {willHappen ? (
        <Section label="What happens if I approve" t={t}>
          {willHappen}
        </Section>
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {onApprove ? (
          <button onClick={() => onApprove(task)} style={btnPrimary(t)}>Approve</button>
        ) : null}
        {onEdit ? (
          <button onClick={() => onEdit(task)} style={btnSecondary(t)}>Edit</button>
        ) : null}
        {onDismiss ? (
          <button onClick={() => onDismiss(task)} style={{ ...btnSecondary(t), color: "#c14444" }}>
            Dismiss
          </button>
        ) : null}
      </div>
    </Card>
  );
}


/** Why does this card exist? Pull from the cadence rule's trigger
 * event when present, else fall back to the task summary. */
function explainWhy(task: AITask, dp: Record<string, unknown>): string | null {
  const trigger = dp.trigger_event as string | undefined;
  const reqLabel = (dp.requirement_label as string) || (dp.requirement_key as string) || null;
  const days = (dp.days_unresponsive as number) || null;

  if (trigger === "requirement_missing" && reqLabel) {
    return `Your AI asked for ${reqLabel} but hasn't received it yet. Your follow-up rules say to nudge after this long.`;
  }
  if (trigger === "agreement_unsigned" && reqLabel) {
    return `${reqLabel} was sent but hasn't been signed. Your follow-up rules say to remind at this point.`;
  }
  if (trigger === "borrower_unresponsive" && days) {
    return `No activity from this client for ${days} days.`;
  }
  if (trigger === "closing_date_near") {
    return `Closing is approaching and a critical item is still missing.`;
  }
  if (task.summary) {
    return task.summary;
  }
  return null;
}


/** What concrete thing will happen on approve? Maps the action_type
 * back into plain English. */
function explainOutcome(task: AITask, dp: Record<string, unknown>): string | null {
  const action = (task.action || "") as string;
  const visibility = (dp.visibility as string) || "agent";
  const autoSend = dp.auto_send === true;
  const recipient =
    visibility === "borrower" ? "the borrower"
    : visibility === "agent" ? "the agent (you)"
    : "your team";

  if (action === "cadence_draft_message") {
    return autoSend
      ? `The message above will be SENT to ${recipient}.`
      : `The draft above will be queued for you to send to ${recipient}. Nothing goes out automatically.`;
  }
  if (action === "cadence_task") {
    return `A new task will appear in your queue: "${task.title}".`;
  }
  if (action === "cadence_escalation") {
    return `This will escalate as high-priority and notify your team. ${recipient.charAt(0).toUpperCase() + recipient.slice(1)} won't be contacted directly.`;
  }
  if (action === "cadence_auto_send") {
    return `The message will be sent immediately to ${recipient}.`;
  }
  // Generic fallback
  return null;
}


function Section({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.muted,
        marginBottom: 4, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 13, color: t.ink, lineHeight: 1.5 }}>
        {children}
      </div>
    </div>
  );
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.border}`,
    background: t.accent, color: "#fff", cursor: "pointer",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.border}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}
