"use client";

// Email drafts inbox — broker reviews and approves PII-scrubbed messages.
//
// Restyled onto `.panel`. The drafts are full-bleed rows separated by
// hairlines rather than nested cards, which is what the design system asks
// for: one flat container, not card-in-card.

import { useState } from "react";
import { Btn, CellChip, Input, Panel, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useEmailDrafts, useEmailDraftDecision } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { EmailDraft } from "@/lib/types";

export function EmailDraftsCard({ loanId }: { loanId: string }) {
  const profile = useActiveProfile();
  const { data: drafts = [] } = useEmailDrafts(loanId);
  const decide = useEmailDraftDecision();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bodyOverride, setBodyOverride] = useState("");
  const [subjectOverride, setSubjectOverride] = useState("");

  if (profile.role === Role.CLIENT) return null;

  const beginEdit = (d: EmailDraft) => {
    setEditingId(d.id);
    setBodyOverride(d.body);
    setSubjectOverride(d.subject);
  };

  const send = async (d: EmailDraft) => {
    await decide.mutateAsync({
      draftId: d.id,
      decision: "approved",
      body_override: editingId === d.id ? bodyOverride : undefined,
      subject_override: editingId === d.id ? subjectOverride : undefined,
    });
    setEditingId(null);
  };

  const dismiss = async (d: EmailDraft) => {
    await decide.mutateAsync({ draftId: d.id, decision: "dismissed" });
  };

  const pending = drafts.filter((d) => d.status === "pending" || d.status === "approved");
  const recent = drafts.filter((d) => d.status === "sent" || d.status === "dismissed").slice(0, 3);

  return (
    <Panel
      title="Pending email drafts"
      actions={
        <CellChip tone={pending.length ? "warn" : "mut"}>{pending.length} pending</CellChip>
      }
      noPad
    >
      {/* AI disclosure microcopy — Disclosure §2 ("AI can make mistakes")
          + Terms §5 require explicit human review of AI-drafted comms before
          they send. Full-bleed strip: the inset is this block's own. */}
      <div
        className="sub"
        style={{ padding: "8px 16px", borderBottom: "1px solid var(--line)", fontStyle: "italic" }}
      >
        AI-drafted. Human review required before sending — verify recipients,
        figures, and tone.
      </div>

      {pending.length === 0 && (
        <div className="panel-b">
          <Sub>
            No drafts. The orchestrator queues PII-scrubbed messages here whenever a lender pings the deal.
          </Sub>
        </div>
      )}

      {pending.map((d) => {
        const editing = editingId === d.id;
        return (
          <div key={d.id} className="panel-b grid g8" style={{ borderBottom: "1px solid var(--line)" }}>
            <div className="row">
              <CellChip tone="acc">To: {d.to_email}</CellChip>
              {d.cc_emails && d.cc_emails.length > 0 && (
                <CellChip title={d.cc_emails.join(", ")}>CC: {d.cc_emails.length}</CellChip>
              )}
              {d.bcc_emails && d.bcc_emails.length > 0 && (
                <CellChip tone="pet" title={d.bcc_emails.join(", ")}>
                  BCC: {d.bcc_emails.length} admin{d.bcc_emails.length > 1 ? "s" : ""}
                </CellChip>
              )}
              {d.triggered_by_kind && (
                <>
                  <span className="grow" />
                  <Sub>{d.triggered_by_kind}</Sub>
                </>
              )}
            </div>

            {editing ? (
              <div className="grid g8">
                <Input
                  value={subjectOverride}
                  onChange={(e) => setSubjectOverride(e.target.value)}
                />
                <Textarea
                  value={bodyOverride}
                  onChange={(e) => setBodyOverride(e.target.value)}
                  rows={6}
                  // `.mono` — a raw email body, where column alignment is part
                  // of what the reviewer is checking.
                  className="mono"
                />
              </div>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{d.subject}</div>
                {/* `.pretext` — the operator typed these line breaks; they are content. */}
                <div className="pretext">{d.body}</div>
              </>
            )}

            <div className="row end">
              <Btn onClick={() => dismiss(d)} disabled={decide.isPending}>
                Dismiss
              </Btn>
              {!editing ? (
                <Btn onClick={() => beginEdit(d)}>
                  <Icon name="gear" size={12} /> Edit
                </Btn>
              ) : (
                <Btn onClick={() => setEditingId(null)}>Cancel edit</Btn>
              )}
              <Btn variant="pri" onClick={() => send(d)} disabled={decide.isPending}>
                <Icon name="bolt" size={12} /> {decide.isPending ? "Sending…" : "Approve & send"}
              </Btn>
            </div>
          </div>
        );
      })}

      {recent.length > 0 && (
        <div className="panel-b grid g6">
          <div className="lbl">Recent</div>
          {recent.map((d) => (
            <div key={d.id} className="itemrow">
              <CellChip tone={d.status === "sent" ? "ok" : "mut"}>{d.status}</CellChip>
              <span className="grow trunc">{d.subject}</span>
              <Sub>→ {d.to_email}</Sub>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
