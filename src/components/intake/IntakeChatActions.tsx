"use client";

import type { IntakeChatAction } from "@/lib/intake";
import { semanticStatusClass } from "@/lib/semanticStatus";

// `open_worksheet` opens the full four-sheet worksheet in a new tab, so it
// reads differently from the per-requirement buttons: an accent outline on a
// light accent tint (between the neutral default and the filled-accent
// `email_template`), plus an outward arrow. Same tokens as the
// .intake-chat-actions rules in app-extras.css; kept inline here so that
// stylesheet and the other three buttons stay exactly as they are.

function variantClass(actionType: IntakeChatAction["action_type"]): string {
  if (actionType === "email_template") return "primary ";
  if (actionType === "open_worksheet") return "worksheet ";
  return "";
}

export function IntakeChatActions({
  actions,
  sourceMessageId,
  busyActionId,
  onAction,
}: {
  actions: IntakeChatAction[];
  sourceMessageId: string;
  busyActionId: string;
  onAction: (action: IntakeChatAction) => void;
}) {
  const visible = actions.filter((action) => action.source_message_id === sourceMessageId);
  if (!visible.length) return null;
  return (
    <div className="intake-chat-actions" aria-label="Secure document actions">
      {visible.map((action) => {
        const unavailable = action.status === "expired" || action.status === "disabled";
        const busy = busyActionId === action.id;
        const worksheet = action.action_type === "open_worksheet";
        return (
          <button
            key={action.id}
            type="button"
            className={`${variantClass(action.action_type)}${semanticStatusClass(action.status)}`}
            disabled={unavailable || busy}
            onClick={() => onAction(action)}
          >
            {busy ? "Working..." : unavailable ? "No longer available" : action.label}
            {worksheet && !busy && !unavailable ? <span aria-hidden="true"> ↗</span> : null}
          </button>
        );
      })}
    </div>
  );
}
