"use client";

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useAIChat, useAITasks } from "@/hooks/useApi";
import type { AIChatTurn } from "@/lib/types";
import { Card, CellChip, IconBtn, Input, Seg } from "@/components/ds";

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
  const [tab, setTab] = useState<TabId>("chat");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([SEED_GREETING]);
  const [input, setInput] = useState("");

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

  return (
    // `.rail` (app-extras.css) is this component's own class: 360px sticky
    // sibling of .content, hairline on the left, full-height flex column.
    <aside className="rail">
      {/* Header */}
      <div className="panel-h">
        <span
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: "var(--petrol-100)",
            color: "var(--petrol)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
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
      <span className="repdot" style={{ background: "var(--petrol)" }} />
      <span>{children}</span>
    </div>
  );
}
