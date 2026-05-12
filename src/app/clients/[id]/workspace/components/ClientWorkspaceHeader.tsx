"use client";

// Compact workspace header. Replaces the inline header block in
// workspace/page.tsx. Reads from WorkspaceData so role chips,
// funding-active state, AI status, and current blocker are all
// server-derived. Primary CTAs are gated by role_permissions.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type { WorkspaceData } from "@/lib/types";
import { AiStatusBadge } from "./AiStatusBadge";

interface Props {
  data: WorkspaceData;
  onMarkReady: () => void;
  onOpenChat: () => void;
  onConfigureFollowUp: () => void;
  busy: string | null;
}

export function ClientWorkspaceHeader({
  data,
  onMarkReady,
  onOpenChat,
  onConfigureFollowUp,
  busy,
}: Props) {
  const { t } = useTheme();
  const { client, deals, funding_files, ai_summary, role_permissions } = data;

  // Role chips derived from deals[] + funding_files[]. Buyer/Seller from
  // deal types, Investor when any investor deal, Borrower whenever a
  // loan exists, Funding Active when at least one loan is in an active
  // funding stage.
  const dealTypes = new Set(deals.map((d) => d.deal_type));
  const hasFunding = funding_files.length > 0;
  const activeFunding = funding_files.some((f) =>
    ["collecting_docs", "lender_connected", "processing", "closing"].includes(f.stage),
  );
  const chips: { label: string; bg?: string; color?: string }[] = [];
  if (dealTypes.has("buyer")) chips.push({ label: "Buyer", bg: t.brandSoft, color: t.brand });
  if (dealTypes.has("seller")) chips.push({ label: "Seller", bg: t.brandSoft, color: t.brand });
  if (dealTypes.has("investor")) chips.push({ label: "Investor" });
  if (hasFunding) chips.push({ label: "Borrower" });
  if (activeFunding) chips.push({ label: "Funding Active" });
  if (chips.length === 0) {
    chips.push({ label: client.client_type === "seller" ? "Seller Lead" : "Lead" });
  }

  const blocker = ai_summary.current_blocker;
  const initials = client.name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("");

  return (
    <Card pad={20}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            background: client.avatar_color ?? t.petrol,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 22,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>
              {client.name}
            </h1>
            {chips.map((c) => (
              <Pill key={c.label} bg={c.bg} color={c.color}>
                {c.label}
              </Pill>
            ))}
            <Pill>{client.tier}</Pill>
            <AiStatusBadge state={ai_summary.state} />
          </div>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 2 }}>
            {client.email ?? "No email"} · {client.phone ?? "No phone"} · {client.city ?? "—"}
          </div>
          {blocker ? (
            <div
              style={{
                marginTop: 6,
                fontSize: 12,
                color: t.danger,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="bolt" size={12} /> {blocker}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {client.phone ? (
            <a href={`tel:${client.phone}`} style={btnSecondary(t)}>
              <Icon name="phone" size={13} /> Call
            </a>
          ) : null}
          <button onClick={onOpenChat} disabled={busy !== null} style={btnSecondary(t)}>
            <Icon name="chat" size={13} /> {busy === "chat" ? "Opening…" : "Open AI Chat"}
          </button>
          <button onClick={onConfigureFollowUp} disabled={busy !== null} style={btnSecondary(t)}>
            <Icon name="cal" size={13} /> Follow-up rhythm
          </button>
          {role_permissions.can_mark_ready_for_lending &&
          client.stage === "lead" &&
          client.lead_promotion_status !== "agent_requested_review" ? (
            <button onClick={onMarkReady} disabled={busy !== null} style={btnPrimary(t)}>
              <Icon name="bolt" size={13} /> {busy === "ready" ? "Marking…" : "Mark Ready for Lending"}
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    textDecoration: "none",
  } as const;
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 8,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    textDecoration: "none",
  } as const;
}
