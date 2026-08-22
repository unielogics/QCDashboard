"use client";

// LoanChatSlideOut — 1/3-width slide-in panel from the right side of
// Elara tab. Renders the AI ↔ client conversation for this
// loan (DealChatThread + DealChatInput).
//
// Opens via the "Loan chat" button in Elara header. ESC or
// the close button hides it. Click outside also closes (the backdrop).
// State is owned by the parent so other affordances can open/close it
// programmatically (e.g. the AIQuestionsPopover answering a question
// jumps the operator into the chat).
//
// Restyled onto the shared `RightPanel` — the edge-anchored sheet shape the
// design system already carries (`.sheet` / `.sheet-h` / `.sheet-b`). It owns
// the Escape handler and the backdrop click, so the hand-rolled copies of
// both are gone; the affordance is unchanged.

import { RightPanel } from "@/components/design-system/RightPanel";
import { Icon } from "@/components/design-system/Icon";
import { DealChatThread } from "./DealChatThread";
import { DealChatInput } from "./DealChatInput";
import type { User, WorkspaceState } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  user: User;
  workspace: WorkspaceState;
}

export function LoanChatSlideOut({ open, onClose, loanId, user, workspace }: Props) {
  return (
    <RightPanel
      open={open}
      onClose={onClose}
      // The visible title is one word; name the dialog for what it is.
      ariaLabel="Loan chat"
      eyebrow={
        <>
          <Icon name="chat" size={12} /> AI ↔ client conversation
        </>
      }
      title="Chat"
      width="min(420px, 38vw)"
      footer={
        <div className="grow">
          <DealChatInput
            loanId={loanId}
            user={user}
            pausedUntil={workspace.ai_paused_until}
          />
        </div>
      }
    >
      <DealChatThread
        loanId={loanId}
        user={user}
        messages={workspace.chat_messages}
        pausedUntil={workspace.ai_paused_until}
      />
    </RightPanel>
  );
}
