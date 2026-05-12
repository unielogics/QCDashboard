"use client";

// Activity tab — extracted from the original inline implementation
// in workspace/page.tsx.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useEngagement, useLogClientEngagement } from "@/hooks/useApi";
import { ClientAuditTrail } from "@/components/ClientAuditTrail";

export function ActivityPanel({ clientId }: { clientId: string }) {
  const { t } = useTheme();
  const { data: events = [], isLoading } = useEngagement(clientId);
  const log = useLogClientEngagement(clientId);
  const [composeKind, setComposeKind] = useState<string | null>(null);
  const [composeText, setComposeText] = useState("");

  async function logEvent() {
    if (!composeKind || !composeText.trim()) return;
    try {
      await log.mutateAsync({ kind: composeKind, summary: composeText.trim() });
      setComposeKind(null);
      setComposeText("");
    } catch {
      /* swallowed */
    }
  }

  function quickAction(kind: string, label: string, icon: "phone" | "chat" | "cal" | "doc") {
    return (
      <button
        onClick={() => {
          setComposeKind(kind);
          setComposeText("");
        }}
        style={{
          padding: "6px 10px",
          fontSize: 12,
          fontWeight: 600,
          borderRadius: 6,
          border: `1px solid ${t.line}`,
          background: composeKind === kind ? t.brandSoft : t.surface,
          color: composeKind === kind ? t.brand : t.ink,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <Icon name={icon} size={12} /> {label}
      </button>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <SectionLabel>Log activity</SectionLabel>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
          {quickAction("call_logged", "Log call", "phone")}
          {quickAction("sms_sent", "Log SMS", "chat")}
          {quickAction("email_sent", "Log email", "doc")}
          {quickAction("meeting_held", "Log meeting", "cal")}
        </div>
        {composeKind ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <textarea
              value={composeText}
              onChange={(e) => setComposeText(e.target.value)}
              rows={2}
              autoFocus
              placeholder={
                composeKind === "call_logged"
                  ? "What was discussed on the call?"
                  : composeKind === "sms_sent"
                  ? "What was the SMS about?"
                  : composeKind === "email_sent"
                  ? "Subject + brief context…"
                  : "Meeting summary…"
              }
              style={{
                padding: 10,
                fontSize: 13,
                fontFamily: "inherit",
                borderRadius: 6,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
                resize: "vertical",
              }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={logEvent}
                disabled={!composeText.trim() || log.isPending}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: "none",
                  background: t.brand,
                  color: t.inverse,
                  cursor: "pointer",
                  opacity: composeText.trim() && !log.isPending ? 1 : 0.5,
                }}
              >
                {log.isPending ? "Logging…" : "Save"}
              </button>
              <button
                onClick={() => {
                  setComposeKind(null);
                  setComposeText("");
                }}
                style={{
                  padding: "8px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  borderRadius: 6,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  color: t.ink,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      <Card pad={16}>
        <SectionLabel>Recent activity</SectionLabel>
        {isLoading ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>Loading…</div>
        ) : events.length === 0 ? (
          <div style={{ marginTop: 10, color: t.ink3, fontSize: 13 }}>
            No activity logged yet. Use the buttons above to log a call, SMS, email, or meeting
            against this client.
          </div>
        ) : (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            {events.map((e, i: number) => {
              const ev = e as unknown as Record<string, unknown>;
              return (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: "10px 0",
                    borderBottom: `1px solid ${t.line}`,
                  }}
                >
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                      background: t.surface2,
                      color: t.ink2,
                      textTransform: "uppercase",
                      fontFamily: "monospace",
                    }}
                  >
                    {String(ev.kind || "event")}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: t.ink }}>
                      {String(ev.summary || ev.title || "—")}
                    </div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {ev.created_at ? new Date(String(ev.created_at)).toLocaleString() : ""}
                      {ev.actor_label ? ` · ${String(ev.actor_label)}` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <ClientAuditTrail clientId={clientId} limit={50} />
    </div>
  );
}
