"use client";

// Email drafts inbox — broker reviews and approves PII-scrubbed messages.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useEmailDrafts, useEmailDraftDecision } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { EmailDraft } from "@/lib/types";

export function EmailDraftsCard({ loanId }: { loanId: string }) {
  const { t } = useTheme();
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
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <SectionLabel>Pending email drafts</SectionLabel>
        <Pill bg={pending.length ? t.warnBg : t.chip} color={pending.length ? t.warn : t.ink3}>
          {pending.length} pending
        </Pill>
      </div>

      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        {pending.length === 0 && (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>
            No drafts. The orchestrator queues PII-scrubbed messages here whenever a lender pings the deal.
          </div>
        )}

        {pending.map((d) => {
          const editing = editingId === d.id;
          return (
            <div key={d.id} style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <Pill bg={t.brandSoft} color={t.brand}>To: {d.to_email}</Pill>
                {d.cc_emails && d.cc_emails.length > 0 && (
                  <span title={d.cc_emails.join(", ")} style={{ display: "inline-flex" }}>
                    <Pill bg={t.chip} color={t.ink2}>CC: {d.cc_emails.length}</Pill>
                  </span>
                )}
                {d.bcc_emails && d.bcc_emails.length > 0 && (
                  <span title={d.bcc_emails.join(", ")} style={{ display: "inline-flex" }}>
                    <Pill bg={t.petrolSoft} color={t.petrol}>
                      BCC: {d.bcc_emails.length} admin{d.bcc_emails.length > 1 ? "s" : ""}
                    </Pill>
                  </span>
                )}
                {d.triggered_by_kind && <span style={{ fontSize: 10.5, color: t.ink3, marginLeft: "auto" }}>{d.triggered_by_kind}</span>}
              </div>

              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <input
                    value={subjectOverride}
                    onChange={(e) => setSubjectOverride(e.target.value)}
                    style={inputStyle(t)}
                  />
                  <textarea
                    value={bodyOverride}
                    onChange={(e) => setBodyOverride(e.target.value)}
                    rows={6}
                    style={{ ...inputStyle(t), resize: "vertical", fontFamily: "ui-monospace, SF Mono, monospace" }}
                  />
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 4 }}>{d.subject}</div>
                  <div style={{ fontSize: 12.5, color: t.ink2, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{d.body}</div>
                </>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
                <button onClick={() => dismiss(d)} disabled={decide.isPending} style={{ ...qcBtn(t), color: t.ink3 }}>
                  Dismiss
                </button>
                {!editing ? (
                  <button onClick={() => beginEdit(d)} style={qcBtn(t)}>
                    <Icon name="gear" size={12} /> Edit
                  </button>
                ) : (
                  <button onClick={() => setEditingId(null)} style={qcBtn(t)}>
                    Cancel edit
                  </button>
                )}
                <button
                  onClick={() => send(d)}
                  disabled={decide.isPending}
                  style={{ ...qcBtnPrimary(t), opacity: decide.isPending ? 0.6 : 1 }}
                >
                  <Icon name="bolt" size={12} /> {decide.isPending ? "Sending…" : "Approve & send"}
                </button>
              </div>
            </div>
          );
        })}

        {recent.length > 0 && (
          <>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginTop: 8 }}>
              Recent
            </div>
            {recent.map((d) => (
              <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`, fontSize: 12 }}>
                <Pill bg={d.status === "sent" ? t.profitBg : t.chip} color={d.status === "sent" ? t.profit : t.ink3}>{d.status}</Pill>
                <span style={{ flex: 1, color: t.ink2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {d.subject}
                </span>
                <span style={{ color: t.ink3, fontSize: 11 }}>→ {d.to_email}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </Card>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%", padding: "8px 10px", borderRadius: 8, background: t.surface2,
    border: `1px solid ${t.line}`, color: t.ink, fontSize: 12.5, fontFamily: "inherit", outline: "none",
  };
}
