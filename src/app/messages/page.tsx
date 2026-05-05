"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { useLoans, useMessages } from "@/hooks/useApi";

export default function MessagesPage() {
  const { t } = useTheme();
  const { data: loans = [] } = useLoans();
  const [activeLoan, setActiveLoan] = useState<string | null>(null);
  const { data: messages = [] } = useMessages(activeLoan);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 14, height: "100%" }}>
      <Card pad={0} style={{ overflow: "auto" }}>
        <div style={{ padding: 12, borderBottom: `1px solid ${t.line}`, fontSize: 13, fontWeight: 700, color: t.ink }}>Threads</div>
        {loans.map((l) => (
          <button key={l.id} onClick={() => setActiveLoan(l.id)} style={{
            width: "100%", textAlign: "left", padding: "12px 14px", borderBottom: `1px solid ${t.line}`,
            background: activeLoan === l.id ? t.brandSoft : "transparent",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3 }}>{l.deal_id}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginTop: 2 }}>{l.address}</div>
          </button>
        ))}
      </Card>
      <Card pad={0} style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
          {!activeLoan && <div style={{ color: t.ink3, fontSize: 13 }}>Pick a thread.</div>}
          {messages.map((m) => (
            <div key={m.id} style={{ alignSelf: m.from_role === "lender" ? "flex-start" : m.from_role === "client" ? "flex-end" : "center", maxWidth: "70%" }}>
              <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                <Pill>{m.from_role}</Pill>
                {m.is_draft && <Pill bg={t.warnBg} color={t.warn}>Draft</Pill>}
              </div>
              <div style={{
                padding: "10px 14px", borderRadius: 14,
                background: m.from_role === "client" ? t.brandSoft : t.surface2,
                color: t.ink, fontSize: 13,
              }}>{m.body}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8 }}>
          <input placeholder="Type a message…" style={{ flex: 1, padding: "10px 12px", borderRadius: 10, background: t.surface2, border: `1px solid ${t.line}`, color: t.ink }} />
          <button style={{ padding: "10px 16px", borderRadius: 10, background: t.brand, color: t.inverse, fontWeight: 700 }}>Send</button>
        </div>
      </Card>
    </div>
  );
}
