"use client";

// AIAgentAssignPicker — cursor-anchored popover that lists the
// broker's AI Agents and enrolls the selected one onto a specific
// client (and, when known, a specific deal/file).
//
// Used by the pipeline right-click flow (PipelineRowContextMenu) on
// both funding-files and lead/client cards. The picker shows agents
// whose domain matches the source ("pipeline" agents on funding-file
// rows; "clients" on lead/client rows; "both" always).

import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/design-system/Icon";
import { useAiAgents, useAssignWarmupLeads } from "@/hooks/useAiAgents";
import { restoreTransientFocus } from "@/lib/focusManagement";

type DomainSource = "pipeline" | "clients";

export function AIAgentAssignPicker({
  clientId,
  dealId,
  source,
  anchor,
  portalHost,
  returnFocus,
  onClose,
}: {
  clientId: string;
  dealId?: string;
  source: DomainSource;
  anchor: { x: number; y: number };
  portalHost?: HTMLElement | null;
  returnFocus?: HTMLElement | null;
  onClose: () => void;
}) {
  const { data: agents = [], isLoading } = useAiAgents();
  const assign = useAssignWarmupLeads();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuReceivedFocusRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
    menuReceivedFocusRef.current = false;
    const menu = menuRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstItem = menu?.querySelector<HTMLButtonElement>("button:not([disabled])");
      (firstItem ?? menu)?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key === "Tab") {
        onCloseRef.current();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const choices = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ?? []);
      if (!choices.length) return;
      e.preventDefault();
      const current = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "Home"
        ? 0
        : e.key === "End"
          ? choices.length - 1
          : e.key === "ArrowDown"
            ? current < 0 || current === choices.length - 1 ? 0 : current + 1
            : current <= 0 ? choices.length - 1 : current - 1;
      choices[next].focus({ preventScroll: true });
    };
    const onClick = () => onCloseRef.current();
    window.addEventListener("keydown", onKey);
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
      if (menuReceivedFocusRef.current) {
        restoreTransientFocus(returnFocus ?? null);
      }
    };
  }, [returnFocus]);

  const pick = async (agentId: string) => {
    await assign.mutateAsync({
      id: agentId,
      client_ids: [clientId],
      ...(dealId ? { deal_id: dealId } : {}),
    });
    menuReceivedFocusRef.current = false;
    returnFocus?.focus({ preventScroll: true });
    onCloseRef.current();
  };

  // Cursor coordinates are the only genuinely dynamic value; they sit on a
  // zero-height fixed anchor so `.popmenu` keeps owning the panel's own box
  // (and `.popmenu .mi:hover` replaces the JS hover handlers).
  const picker = (
    <div
      ref={menuRef}
      role="menu"
      aria-label="Assign an AI agent"
      tabIndex={-1}
      onFocusCapture={() => { menuReceivedFocusRef.current = true; }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      style={{ position: "fixed", top: anchor.y, left: anchor.x, zIndex: 90, width: 280, height: 0 }}
    >
      <div className="popmenu" style={{ width: 280, maxHeight: 360, overflowY: "auto" }}>
        <div className="lbl" style={{ padding: "8px 10px 4px" }}>
          Assign an AI agent
        </div>
        {isLoading && <div className="sub" style={{ padding: 10 }}>Loading…</div>}
        {!isLoading && matches.length === 0 && (
          <div className="sub" style={{ padding: 10 }}>
            No AI agents yet — create one from the AI Agents page.
          </div>
        )}
        {matches.map((a) => (
          <button
            key={a.id}
            type="button"
            role="menuitem"
            className="mi"
            onClick={(e) => {
              e.stopPropagation();
              void pick(a.id);
            }}
            disabled={assign.isPending}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <Icon name="spark" size={13} stroke={2.2} />
              {a.name}
            </span>
            <small>
              {a.kind.replace(/_/g, " ")}
              {a.ai_display_name ? ` · ${a.ai_display_name}` : ""}
            </small>
          </button>
        ))}
      </div>
    </div>
  );
  if (!portalHost) return picker;
  return createPortal(picker, portalHost);
}
