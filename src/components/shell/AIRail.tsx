"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useAIChat, useAITaskDecision, useAITasks } from "@/hooks/useApi";
import type { AITask, AIChatTurn } from "@/lib/types";
import { Btn, Card, CellChip, Field, IconBtn, Input, Seg, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";

const TABS = [
  { id: "chat", label: "Chat", icon: "messages" as const },
  { id: "tasks", label: "Tasks", icon: "bolt" as const },
  { id: "context", label: "Context", icon: "shield" as const },
] as const;
type TabId = (typeof TABS)[number]["id"];

interface ChatMsg {
  from: "ai" | "me";
  text: string;
  stub?: boolean;
}

const SEED_GREETING: ChatMsg = {
  from: "ai",
  text: "I'm watching your pipeline. Ask me anything about loans, tasks, or risk.",
};

export default function AIRail() {
  const open = useUI((s) => s.aiOpen);
  const setOpen = useUI((s) => s.setAiOpen);
  const { data: tasks = [] } = useAITasks();
  const aiChat = useAIChat();
  const taskDecision = useAITaskDecision();
  const [tab, setTab] = useState<TabId>("chat");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([SEED_GREETING]);
  const [input, setInput] = useState("");
  const [review, setReview] = useState<{ task: AITask; decision: "approved" | "dismissed"; edit: boolean } | null>(null);
  const [editedPayload, setEditedPayload] = useState("");
  const [decisionError, setDecisionError] = useState<string | null>(null);

  if (!open) return <div />;

  const handleSend = async () => {
    const text = input.trim();
    if (!text || aiChat.isPending) return;
    const nextLog: ChatMsg[] = [...chatLog, { from: "me", text }];
    setChatLog(nextLog);
    setInput("");

    // Build the message history for the API (skip the seed greeting; map to user/assistant roles).
    const turns: AIChatTurn[] = nextLog
      .filter((m) => m !== SEED_GREETING)
      .map((m) => ({ role: m.from === "me" ? "user" : "assistant", content: m.text }));

    try {
      const result = await aiChat.mutateAsync({ messages: turns });
      setChatLog((log) => [...log, { from: "ai", text: result.reply, stub: result.used_stub }]);
    } catch (e) {
      setChatLog((log) => [
        ...log,
        { from: "ai", text: e instanceof Error ? `(error) ${e.message}` : "Elara is unavailable right now.", stub: true },
      ]);
    }
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const openReview = (task: AITask, decision: "approved" | "dismissed", edit = false) => {
    setReview({ task, decision, edit });
    setEditedPayload(JSON.stringify(task.draft_payload ?? {}, null, 2));
    setDecisionError(null);
  };

  const confirmDecision = async () => {
    if (!review) return;
    setDecisionError(null);
    try {
      const payload = review.edit ? JSON.parse(editedPayload) as Record<string, unknown> : review.task.draft_payload;
      await taskDecision.mutateAsync({
        taskId: review.task.id,
        decision: review.decision,
        edited_payload: payload,
        loanId: review.task.loan_id,
      });
      setReview(null);
    } catch (error) {
      setDecisionError(error instanceof Error ? error.message : "Unable to update this task.");
    }
  };

  return (
    // `.rail` (app-extras.css) is this component's own class: 360px sticky
    // sibling of .content, hairline on the left, full-height flex column.
    <aside className="rail">
      {/* Header */}
      <div className="panel-h">
        {/* `.botmark` is the sheet's "Elara's mark in a header strip". */}
        <span className="botmark pet">
          <Icon name="sparkles" size={14} />
        </span>
        <div>
          <b>Elara</b>
          <div className="lbl">● ONLINE · {tasks.length} QUEUED</div>
        </div>
        <span className="sp" />
        <IconBtn onClick={() => setOpen(false)} aria-label="Close Elara">
          <Icon name="x" size={16} />
        </IconBtn>
      </div>

      {/* Tab strip */}
      <div className="panel-h">
        <Seg
          as="tabs"
          ariaLabel="Elara panels"
          value={tab}
          onChange={setTab}
          options={TABS.map((tabDef) => ({
            value: tabDef.id,
            label: (
              // Icon + label + count on one baseline inside a `.seg` button.
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon name={tabDef.icon} size={12} />
                {tabDef.label}
                {tabDef.id === "tasks" && tasks.length > 0 && (
                  <CellChip tone="acc" className="num">
                    {tasks.length}
                  </CellChip>
                )}
              </span>
            ),
          }))}
        />
      </div>

      {/* Tab content — .panel-b owns the padding, the scroll is this box's own job. */}
      <div className="panel-b" style={{ overflowY: "auto" }}>
        {tab === "chat" && (
          <div className="ladder">
            {chatLog.map((m, i) => (
              <div key={i} className={m.from === "me" ? "msg mine" : "msg ai"}>
                <div className="msg-h">
                  <span className="msg-who">{m.from === "me" ? "You" : "Elara"}</span>
                </div>
                <div className="msg-b">{m.text}</div>
                {m.stub && (
                  <span className="sub">Dev stub — set ANTHROPIC_API_KEY to enable real replies.</span>
                )}
              </div>
            ))}
            {aiChat.isPending && <div className="sub">Elara is thinking…</div>}
            {chatLog.length === 1 && !aiChat.isPending && (
              <div className="mt">
                <Suggestion onClick={() => setInput("Summarize today's pipeline")}>Summarize today&rsquo;s pipeline</Suggestion>
                <Suggestion onClick={() => setInput("Which loans are at risk of slipping past close?")}>Which loans are at risk of slipping past close?</Suggestion>
                <Suggestion onClick={() => setInput("Draft a follow-up for stale doc requests")}>Draft a follow-up for stale doc requests</Suggestion>
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <div className="ladder">
            {tasks.length === 0 && <div className="sub">No queued tasks right now.</div>}
            {tasks.map((task) => (
              <Card key={task.id}>
                <div className="row">
                  <span className="lbl">{task.source}</span>
                  <span className="sp" />
                  <CellChip
                    tone={task.priority === "high" ? "bad" : task.priority === "medium" ? "warn" : "mut"}
                  >
                    {task.priority.toUpperCase()}
                  </CellChip>
                </div>
                <b>{task.title}</b>
                <div className="sub">
                  conf {(task.confidence * 100).toFixed(0)}% · {task.agent}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <Btn size="sm" variant="pri" onClick={() => openReview(task, "approved")}>Approve</Btn>
                  <Btn size="sm" onClick={() => openReview(task, "approved", true)}>Edit</Btn>
                  <Btn size="sm" onClick={() => openReview(task, "dismissed")}>Dismiss</Btn>
                </div>
              </Card>
            ))}
          </div>
        )}

        {tab === "context" && (
          <div className="ladder">
            <ContextSection title="What I can see">
              <ContextItem>Read-only access to all loan files, clients, docs, calendar, messages.</ContextItem>
              <ContextItem>Live activity log + immutable audit trail.</ContextItem>
              <ContextItem>Last 90 days of rate-sheet movements.</ContextItem>
            </ContextSection>
            <ContextSection title="What I can do (with approval)">
              <ContextItem>Draft messages to clients (you approve &amp; send).</ContextItem>
              <ContextItem>Request documents from borrowers.</ContextItem>
              <ContextItem>Re-price loans within rate-sheet floors.</ContextItem>
              <ContextItem>Route loans between UW queues.</ContextItem>
            </ContextSection>
            <ContextSection title="What I never do">
              <ContextItem>Send messages without your approval.</ContextItem>
              <ContextItem>Move loans past Closing without operator sign-off.</ContextItem>
              <ContextItem>Initiate wires, ACH, or financial transfers.</ContextItem>
            </ContextSection>
          </div>
        )}
      </div>

      {/* Footer chat input */}
      {tab === "chat" && (
        // `.composer` is the stacked textarea composer; this rail has a
        // single-line input, so it uses `.composer-row` alone and brings the
        // footer rule and padding the full composer would have carried.
        <div className="composer-row" style={{ padding: 12, borderTop: "1px solid var(--line)" }}>
          <Input
            grow
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask Elara…"
            aria-label="Ask Elara"
          />
          {/* .btn:disabled carries the dimmed, not-actionable state. */}
          <IconBtn
            className="pri"
            onClick={handleSend}
            disabled={!input.trim() || aiChat.isPending}
            aria-label="Send"
          >
            <Icon name={aiChat.isPending ? "ai" : "bolt"} size={14} />
          </IconBtn>
        </div>
      )}
      <Drawer
        open={review != null}
        onClose={() => setReview(null)}
        title="Review before running"
        sub={review?.task.title}
        width="md"
        closeOnBackdrop={!taskDecision.isPending}
        footer={
          <>
            <Btn onClick={() => setReview(null)} disabled={taskDecision.isPending}>Cancel</Btn>
            <span className="sp" />
            <Btn variant={review?.decision === "dismissed" ? "default" : "pri"} onClick={confirmDecision} disabled={taskDecision.isPending}>
              {taskDecision.isPending ? "Running..." : review?.decision === "dismissed" ? "Dismiss task" : review?.edit ? "Approve edited draft" : "Approve task"}
            </Btn>
          </>
        }
      >
        <div className="grid">
          <div className="hintbox"><b>Effects</b><div className="sub">Updates this queued Elara task and records the signed-in operator decision immediately.</div></div>
          <div className="kv"><span>Action</span><b>{review?.decision === "dismissed" ? "Dismiss recommendation" : "Approve recommendation"}</b></div>
          <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
          <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
          <div className="kv"><span>Reversible</span><b>No · decision remains in audit history</b></div>
          {review?.edit ? <Field label="Edited action payload"><Textarea value={editedPayload} onChange={(event) => setEditedPayload(event.target.value)} rows={9} className="mono" /></Field> : null}
          {decisionError ? <div className="warnline">{decisionError}</div> : null}
        </div>
      </Drawer>
    </aside>
  );
}

function Suggestion({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="pick" onClick={onClick}>
      {children}
    </button>
  );
}

function ContextSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="lbl">{title}</div>
      {children}
    </div>
  );
}

function ContextItem({ children }: { children: ReactNode }) {
  return (
    <div className="filerow">
      {/* `.repdot` is geometry only and never claims a colour. */}
      <span className="repdot" style={{ background: "var(--petrol)" }} />
      <span>{children}</span>
    </div>
  );
}
