"use client";

// Horizontal strip of active loan instructions in the Deal Workspace.
// "+ Add" composer is inline — distinct from the chat-mode 'instruct'
// path so operators can manage instructions without opening the chat.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCreateInstruction, useDeactivateInstruction } from "@/hooks/useApi";
import type { LoanInstruction } from "@/lib/types";

interface Props {
  loanId: string;
  instructions: LoanInstruction[];
  canEdit: boolean;
}

export function InstructionStrip({ loanId, instructions, canEdit }: Props) {
  const { t } = useTheme();
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
    <Card pad={14}>
      <SectionLabel
        action={
          canEdit && !composing ? (
            <button
              onClick={() => setComposing(true)}
              style={{
                all: "unset",
                cursor: "pointer",
                color: t.petrol,
                fontSize: 12,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <Icon name="plus" size={11} stroke={2.4} /> Add instruction
            </button>
          ) : null
        }
      >
        Active Instructions <Pill>{instructions.length}</Pill>
      </SectionLabel>

      {composing && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. always cc legal on outbound emails for this deal"
            rows={2}
            autoFocus
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: 8,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              color: t.ink,
              fontSize: 12.5,
              fontFamily: "inherit",
              outline: "none",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              onClick={() => {
                setComposing(false);
                setDraft("");
              }}
              style={ghostBtn(t)}
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!draft.trim() || create.isPending}
              style={{ ...ghostBtn(t), background: t.ink, color: t.inverse, border: "none", fontWeight: 700 }}
            >
              {create.isPending ? "Saving…" : "Save instruction"}
            </button>
          </div>
        </div>
      )}

      {instructions.length === 0 && !composing && (
        <div style={{ fontSize: 12.5, color: t.ink3, padding: "6px 0" }}>
          No active instructions. Add one from the chat input (mode: <strong>Instruct AI</strong>) or the
          + button above.
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {instructions.map((inst) => (
          <div
            key={inst.id}
            style={{
              flex: "0 1 auto",
              maxWidth: "100%",
              minWidth: 220,
              padding: "8px 10px",
              borderRadius: 9,
              background: t.petrolSoft,
              border: `1px solid ${t.line}`,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12.5, color: t.ink, fontWeight: 600, lineHeight: 1.4 }}>
                {inst.body}
              </div>
              <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 4 }}>
                {new Date(inst.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </div>
            </div>
            {canEdit && (
              <button
                onClick={() => deactivate.mutate({ loanId, instructionId: inst.id })}
                aria-label="Deactivate instruction"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  width: 22,
                  height: 22,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 6,
                  color: t.ink3,
                  flexShrink: 0,
                }}
              >
                <Icon name="x" size={12} />
              </button>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

function ghostBtn(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    background: t.surface,
    border: `1px solid ${t.line}`,
    color: t.ink2,
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "inherit",
  };
}
