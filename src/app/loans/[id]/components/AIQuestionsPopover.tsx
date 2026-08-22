"use client";

// AIQuestionsPopover — a small floating panel that appears when the AI
// has pending clarifying questions for the operator. Replaces the
// previous "AI questions" tab in the merged Loan-Chat container.
//
// Renders as a docked popover anchored to Elara header.
// When closed it collapses to a single button showing the count. The
// pulse animation only runs when there are unanswered questions so the
// affordance is impossible to miss without being obnoxious.
//
// Restyled onto `Drawer`. The amber header that carried "this is waiting on
// you" moved into a `Callout tone="warn"` at the top of the body, so the
// urgency survives the move onto the shared dialog shape. The local Escape
// listener is gone — the dialog owns it, plus focus return and a scroll lock.

import { useState } from "react";
import { Btn, Callout, StatusLine, Sub, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import type { DSAIQuestion } from "@/hooks/useApi";

interface Props {
  questions: DSAIQuestion[];
  onAnswer: (questionId: string, answer: string) => Promise<void>;
  /** When set, Elara header renders a badge with the count. */
  open: boolean;
  onClose: () => void;
}

export function AIQuestionsPopover({ questions, onAnswer, open, onClose }: Props) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const submit = async (id: string) => {
    const value = (drafts[id] ?? "").trim();
    if (!value) return;
    setSending(id);
    setError(null);
    try {
      await onAnswer(id, value);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer.");
    } finally {
      setSending(null);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="AI needs answers"
      width="md"
      bodyClass="grid g10"
    >
      {/* The amber header strip the popover used to carry, kept as a tone
          rather than a background on the dialog's own chrome. Same words. */}
      <Callout tone="warn" icon={<Icon name="alert" size={13} />}>
        {questions.length} pending
      </Callout>

      {questions.length === 0 ? (
        <Sub>
          No open questions. The AI will pop a question here when it needs context before engaging the borrower.
        </Sub>
      ) : null}

      {questions.map((q) => {
        const draft = (drafts[q.id] ?? "").trim();
        const busy = sending === q.id;
        return (
          <div key={q.id} className="itemrow top">
            <div className="grow grid g8">
              <div style={{ fontWeight: 700 }}>{q.question}</div>
              {q.context ? <Sub>{q.context}</Sub> : null}
              <Textarea
                value={drafts[q.id] ?? ""}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer…"
                rows={2}
              />
              <div className="row">
                <Btn size="sm" variant="pri" onClick={() => submit(q.id)} disabled={!draft || busy}>
                  {busy ? "Saving…" : "Answer"}
                </Btn>
                <Sub>asked {new Date(q.created_at).toLocaleString()}</Sub>
              </div>
            </div>
          </div>
        );
      })}

      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    </Drawer>
  );
}
