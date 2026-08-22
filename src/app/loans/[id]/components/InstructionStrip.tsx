"use client";

// Horizontal strip of active loan instructions in the Deal Workspace.
// "+ Add" composer is inline — distinct from the chat-mode 'instruct'
// path so operators can manage instructions without opening the chat.
//
// Restyled onto `.panel`. Each instruction is an `.itemrow`; see the note in
// `problems` about the petrol tint those blocks used to carry.

import { useState } from "react";
import { Btn, CellChip, IconBtn, Panel, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useCreateInstruction, useDeactivateInstruction } from "@/hooks/useApi";
import type { LoanInstruction } from "@/lib/types";

interface Props {
  loanId: string;
  instructions: LoanInstruction[];
  canEdit: boolean;
}

export function InstructionStrip({ loanId, instructions, canEdit }: Props) {
  const create = useCreateInstruction();
  const deactivate = useDeactivateInstruction();
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");

  const submit = async () => {
    if (!draft.trim()) return;
    await create.mutateAsync({ loanId, body: draft.trim() });
    setDraft("");
    setComposing(false);
  };

  return (
    <Panel
      title={
        <>
          Active Instructions <CellChip>{instructions.length}</CellChip>
        </>
      }
      actions={
        canEdit && !composing ? (
          <Btn size="sm" onClick={() => setComposing(true)}>
            <Icon name="plus" size={11} stroke={2.4} /> Add instruction
          </Btn>
        ) : undefined
      }
      bodyClass="grid g10"
    >
      {composing && (
        <div className="grid g6">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. always cc legal on outbound emails for this deal"
            rows={2}
            autoFocus
          />
          <div className="row end">
            <Btn
              size="sm"
              onClick={() => {
                setComposing(false);
                setDraft("");
              }}
            >
              Cancel
            </Btn>
            <Btn
              size="sm"
              variant="pri"
              onClick={submit}
              disabled={!draft.trim() || create.isPending}
            >
              {create.isPending ? "Saving…" : "Save instruction"}
            </Btn>
          </div>
        </div>
      )}

      {instructions.length === 0 && !composing && (
        <Sub>
          No active instructions. Add one from the chat input (mode: <strong>Instruct Elara</strong>) or the
          + button above.
        </Sub>
      )}

      {instructions.length > 0 && (
        // Bespoke: instruction cards flow and wrap, each with its own floor
        // so a one-line rule does not become a sliver.
        <div className="row top">
          {instructions.map((inst) => (
            <div key={inst.id} className="itemrow top" style={{ flex: "0 1 auto", minWidth: 220, maxWidth: "100%" }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{inst.body}</div>
                <Sub>
                  {new Date(inst.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </Sub>
              </div>
              {canEdit && (
                <IconBtn
                  onClick={() => deactivate.mutate({ loanId, instructionId: inst.id })}
                  aria-label="Deactivate instruction"
                >
                  <Icon name="x" size={12} />
                </IconBtn>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
