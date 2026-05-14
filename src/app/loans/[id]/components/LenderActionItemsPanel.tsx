"use client";

// Renders the structured AI extract from the lender thread.
//
// Two modes via prop:
//   * "operator" — full extract (internal + external items + status changes)
//                  Used for super_admin / loan_exec
//   * "external" — externals-only view used by broker / client AI chats.
//                  In practice this component receives whatever the
//                  backend returned (the backend filters server-side
//                  based on the viewer role), so we just render what
//                  we got.

import { useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import type { LenderActionItem, LenderExtract } from "@/lib/types";

interface Props {
  extract: LenderExtract | null | undefined;
}

export function LenderActionItemsPanel({ extract }: Props) {
  const { t } = useTheme();
  const items = extract?.action_items ?? [];
  const statusChanges = extract?.status_changes ?? [];

  if (!extract) {
    return (
      <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
        AI extract not generated yet. It appears automatically after the
        next inbound or outbound lender message.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {extract.current_situation ? (
        <div
          style={{
            padding: "8px 10px",
            borderRadius: 8,
            background: t.brandSoft,
            border: `1px solid ${t.line}`,
            fontSize: 12.5,
            color: t.ink,
            lineHeight: 1.5,
          }}
        >
          {extract.current_situation}
        </div>
      ) : null}

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic" }}>
          No outstanding action items detected.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((i) => (
            <ActionItemRow key={i.id} t={t} item={i} />
          ))}
        </div>
      )}

      {statusChanges.length > 0 ? (
        <div style={{ marginTop: 4 }}>
          <SubLabel t={t}>Status changes</SubLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {statusChanges.map((s, i) => (
              <div
                key={i}
                style={{
                  fontSize: 11.5,
                  color: t.ink2,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <KindPill t={t} kind={s.kind} />
                <span style={{ flex: 1 }}>{s.summary}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {extract.generated_at ? (
        <div
          style={{
            fontSize: 10.5,
            color: t.ink4,
            marginTop: 6,
            fontStyle: "italic",
          }}
        >
          updated {timeAgo(extract.generated_at)}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ActionItemRow({
  t,
  item,
}: {
  t: ReturnType<typeof useTheme>["t"];
  item: LenderActionItem;
}) {
  const ownerPill = ownerStyle(t, item.owner);
  const isInternal = item.sensitivity === "internal";
  return (
    <div
      style={{
        padding: "9px 11px",
        borderRadius: 8,
        background: isInternal ? t.surface2 : t.surface,
        border: `1px solid ${isInternal ? t.lineStrong : t.line}`,
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <Pill bg={ownerPill.bg} color={ownerPill.fg}>
          {ownerPill.label}
        </Pill>
        <PriorityPill t={t} priority={item.priority} />
        {isInternal ? (
          <Pill bg={t.warnBg} color={t.warn}>Internal</Pill>
        ) : (
          <Pill bg={t.profitBg} color={t.profit}>External</Pill>
        )}
        {item.due_date ? (
          <span style={{ fontSize: 11, color: t.ink3 }}>
            due {item.due_date}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 12.5, color: t.ink, lineHeight: 1.45 }}>
        {item.summary}
      </div>
      {(item.requested_documents?.length || item.amounts?.length) ? (
        <div
          style={{
            fontSize: 11,
            color: t.ink3,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          {item.requested_documents && item.requested_documents.length > 0 ? (
            <span>📎 {item.requested_documents.join(", ")}</span>
          ) : null}
          {item.amounts && item.amounts.length > 0 ? (
            <span>💵 {item.amounts.join(", ")}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ownerStyle(
  t: ReturnType<typeof useTheme>["t"],
  owner: string,
): { bg: string; fg: string; label: string } {
  switch (owner) {
    case "client":
      return { bg: t.petrolSoft, fg: t.petrol, label: "Borrower" };
    case "broker":
      return { bg: t.brandSoft, fg: t.brand, label: "Broker" };
    case "lender":
      return { bg: t.warnBg, fg: t.warn, label: "Lender" };
    case "super_admin":
      return { bg: t.surface2, fg: t.ink2, label: "Super Admin" };
    default:
      return { bg: t.surface2, fg: t.ink3, label: owner };
  }
}

function PriorityPill({
  t,
  priority,
}: {
  t: ReturnType<typeof useTheme>["t"];
  priority: string;
}) {
  if (priority === "high") return <Pill bg={t.dangerBg} color={t.danger}>High</Pill>;
  if (priority === "low") return <Pill bg={t.surface2} color={t.ink3}>Low</Pill>;
  return <Pill bg={t.brandSoft} color={t.brand}>Med</Pill>;
}

function KindPill({
  t,
  kind,
}: {
  t: ReturnType<typeof useTheme>["t"];
  kind: string;
}) {
  const profit = ["approved", "rate_locked"].includes(kind);
  const danger = ["declined"].includes(kind);
  if (profit) return <Pill bg={t.profitBg} color={t.profit}>{kind.replace("_", " ")}</Pill>;
  if (danger) return <Pill bg={t.dangerBg} color={t.danger}>{kind.replace("_", " ")}</Pill>;
  return <Pill bg={t.brandSoft} color={t.brand}>{kind.replace("_", " ")}</Pill>;
}

function SubLabel({
  t,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: t.ink3,
      }}
    >
      {children}
    </div>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}
