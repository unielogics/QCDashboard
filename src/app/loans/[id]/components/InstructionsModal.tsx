"use client";

// InstructionsModal — wraps InstructionStrip in a modal. Replaces the
// in-line "Instructions" tab in the old DealWorkspaceTab layout. The
// header Elara action button toggles it open.
//
// Restyled onto `Drawer`, which owns Escape-to-close, the backdrop click,
// focus return and the body scroll lock. The local keydown listener is gone
// because the dialog now carries it.

import { Drawer } from "@/components/ds/Drawer";
import { InstructionStrip } from "./InstructionStrip";
import type { LoanInstruction } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  instructions: LoanInstruction[];
  canEdit: boolean;
}

export function InstructionsModal({ open, onClose, loanId, instructions, canEdit }: Props) {
  if (!open) return null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="File instructions"
      sub="Standing rules the AI honors on this loan"
      width="md"
    >
      <InstructionStrip
        loanId={loanId}
        instructions={instructions}
        canEdit={canEdit}
      />
    </Drawer>
  );
}
