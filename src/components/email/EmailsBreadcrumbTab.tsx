"use client";

// Emails breadcrumb tab — a body-LESS feed of tracked email on a loan or client.
//
// ISOLATION (Phase 4/5 hard requirement): the shared loan/client surfaces show
// ONLY email metadata — sender, subject, direction, time — sourced from the
// `email.tracked` Activity breadcrumb. The message BODY lives solely in the
// mailbox owner's inbox and is NEVER rendered here. This component deliberately
// reads `payload.from` / `payload.subject` / `payload.received_at` and nothing
// that could carry body text.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";

export type BreadcrumbRow = {
  id: string;
  kind: string;
  summary: string;
  payload: Record<string, unknown> | null;
  occurredAt: string; // ISO
};

const TRACKED_KIND = "email.tracked";

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function EmailsBreadcrumbTab({
  rows,
  isLoading,
  showInboxHint = true,
}: {
  rows: BreadcrumbRow[];
  isLoading: boolean;
  showInboxHint?: boolean;
}) {
  const { t } = useTheme();

  const emails = rows.filter((r) => r.kind === TRACKED_KIND);

  if (isLoading) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 13, color: t.ink3 }}>Loading emails…</div>
      </Card>
    );
  }

  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <SectionLabel>Tracked email · {emails.length}</SectionLabel>
        {showInboxHint && (
          <Link href="/inbox" style={{ textDecoration: "none" }}>
            <Pill bg={t.brandSoft} color={t.brand}><Icon name="mail" size={11} /> Open Inbox</Pill>
          </Link>
        )}
      </div>

      {emails.length === 0 ? (
        <div style={{ padding: 16, fontSize: 13, color: t.ink3, lineHeight: 1.55 }}>
          No tracked email yet. When a client or party emails your connected Workspace
          mailbox, it appears here as a private breadcrumb — sender, subject, and time
          only. The full message stays in your inbox.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {emails.map((e, i) => {
            const p = e.payload ?? {};
            const from = str(p["from"]) ?? "unknown sender";
            const subject = str(p["subject"]) ?? "(no subject)";
            const direction = str(p["direction"]) ?? "inbound";
            const role = str(p["party_role"]);
            const received = str(p["received_at"]) ?? e.occurredAt;
            const outbound = direction === "outbound";
            return (
              <div
                key={e.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 1fr auto",
                  gap: 12,
                  padding: "12px 16px",
                  borderBottom: i === emails.length - 1 ? "none" : `1px solid ${t.line}`,
                  alignItems: "flex-start",
                }}
              >
                <div style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 8, background: t.brandSoft, color: t.brand, marginTop: 2 }}>
                  <Icon name="mail" size={14} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{subject}</span>
                    <Pill bg={outbound ? t.petrolSoft : t.chip} color={outbound ? t.petrol : t.ink2}>
                      {outbound ? "Sent" : "Received"}
                    </Pill>
                    {role && <Pill>{role}</Pill>}
                  </div>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>
                    {outbound ? "to " : "from "}{from}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: t.ink3, whiteSpace: "nowrap", marginTop: 2 }}>
                  {fmt(received)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
