"use client";

// AIAgentAssignPicker — cursor-anchored popover that lists the
// broker's AI Agents and enrolls the selected one onto a specific
// client (and, when known, a specific deal/file).
//
// Used by the pipeline right-click flow (PipelineRowContextMenu) on
// both funding-files and lead/client cards. The picker shows agents
// whose domain matches the source ("pipeline" agents on funding-file
// rows; "clients" on lead/client rows; "both" always).

import { useEffect, useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useAiAgents, useAssignWarmupLeads } from "@/hooks/useAiAgents";

type DomainSource = "pipeline" | "clients";

export function AIAgentAssignPicker({
  clientId,
  dealId,
  source,
  anchor,
  onClose,
}: {
  clientId: string;
  dealId?: string;
  source: DomainSource;
  anchor: { x: number; y: number };
  onClose: () => void;
}) {
  const { t } = useTheme();
  const { data: agents = [], isLoading } = useAiAgents();
  const assign = useAssignWarmupLeads();

  // Match the picker to where the broker came from. Pipeline cards
  // surface pipeline + both; client cards surface clients + both.
  const matches = useMemo(() => {
    return agents.filter((a) => {
      if (a.status === "archived") return false;
      // We don't store targeting.domain on the list row — fall back to
      // workflow kind heuristic. Seller/buyer/investor/borrower-side
      // workflows naturally fit "pipeline"; nurture / past-client /
      // review-request fit "clients"; "custom" + "open_house" show in
      // both for safety.
      if (source === "pipeline") {
        return a.kind !== "past_client" && a.kind !== "review_request";
      }
      return true;
    });
  }, [agents, source]);

  // Dismiss on Escape + outside-click.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = () => onClose();
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
    };
  }, [onClose]);

  const pick = async (agentId: string) => {
    await assign.mutateAsync({
      id: agentId,
      client_ids: [clientId],
      ...(dealId ? { deal_id: dealId } : {}),
    });
    onClose();
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        top: anchor.y,
        left: anchor.x,
        zIndex: 90,
        width: 280,
        background: t.surface,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        boxShadow: "0 14px 32px rgba(0,0,0,0.32)",
        padding: 6,
        display: "flex",
        flexDirection: "column",
        gap: 2,
        maxHeight: 360,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          padding: "8px 10px 4px",
          fontSize: 10,
          fontWeight: 900,
          color: t.ink3,
          letterSpacing: 0.6,
          textTransform: "uppercase",
        }}
      >
        Assign an AI agent
      </div>
      {isLoading && (
        <div style={{ padding: 10, fontSize: 12, color: t.ink3 }}>Loading…</div>
      )}
      {!isLoading && matches.length === 0 && (
        <div style={{ padding: 10, fontSize: 12, color: t.ink3 }}>
          No AI agents yet — create one from the AI Agents page.
        </div>
      )}
      {matches.map((a) => (
        <button
          key={a.id}
          onClick={(e) => {
            e.stopPropagation();
            void pick(a.id);
          }}
          disabled={assign.isPending}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 10px",
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: t.ink,
            fontSize: 13,
            cursor: assign.isPending ? "wait" : "pointer",
            textAlign: "left",
            fontFamily: "inherit",
          }}
          onMouseOver={(e) =>
            ((e.currentTarget as HTMLElement).style.background = t.surface2)
          }
          onMouseOut={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          <Icon name="spark" size={13} stroke={2.2} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700 }}>{a.name}</div>
            <div style={{ fontSize: 11, color: t.ink3 }}>
              {a.kind.replace(/_/g, " ")}
              {a.ai_display_name ? ` · ${a.ai_display_name}` : ""}
            </div>
          </span>
        </button>
      ))}
    </div>
  );
}
