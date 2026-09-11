"use client";

import type { IntakeChatAction } from "@/lib/intake";
import { semanticStatusClass } from "@/lib/semanticStatus";

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
        return (
          <button
            key={action.id}
            type="button"
            className={`${action.action_type === "email_template" ? "primary " : ""}${semanticStatusClass(action.status)}`}
            disabled={unavailable || busyActionId === action.id}
            onClick={() => onAction(action)}
          >
            {busyActionId === action.id ? "Working..." : unavailable ? "No longer available" : action.label}
          </button>
        );
      })}
    </div>
  );
}
