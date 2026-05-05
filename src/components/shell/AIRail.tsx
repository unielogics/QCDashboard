"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useAIChat, useAITasks } from "@/hooks/useApi";
import type { AIChatTurn } from "@/lib/types";

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
  const { t } = useTheme();
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
        { from: "ai", text: e instanceof Error ? `(error) ${e.message}` : "Co-pilot is unavailable right now.", stub: true },
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
    <aside style={{
      borderLeft: `1px solid ${t.line}`,
      background: t.surface,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.petrolSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", color: t.petrol }}>
            <Icon name="sparkles" size={14} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>QC Co-pilot</div>
            <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>
              ● ONLINE · {tasks.length} QUEUED
            </div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{ color: t.ink3, background: "transparent", border: "none", cursor: "pointer" }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      {/* Tab strip */}
      <div style={{ display: "flex", padding: "0 12px", borderBottom: `1px solid ${t.line}` }}>
        {TABS.map((tabDef) => (
          <button
            key={tabDef.id}
            onClick={() => setTab(tabDef.id)}
            style={{
              padding: "10px 12px",
              borderBottom: `2px solid ${tab === tabDef.id ? t.petrol : "transparent"}`,
              color: tab === tabDef.id ? t.ink : t.ink3,
              fontSize: 12, fontWeight: 700,
              background: "transparent", border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 6,
            }}
          >
            <Icon name={tabDef.icon} size={12} />
            {tabDef.label}
            {tabDef.id === "tasks" && tasks.length > 0 && (
              <span style={{
                padding: "0 6px", borderRadius: 999, background: t.chip, color: t.ink2,
                fontSize: 10, fontWeight: 800, fontFeatureSettings: '"tnum"',
              }}>{tasks.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {tab === "chat" && (
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {chatLog.map((m, i) => (
              <div key={i} style={{ alignSelf: m.from === "me" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                <div style={{
                  background: m.from === "me" ? t.brand : t.surface2,
                  color: m.from === "me" ? t.inverse : t.ink,
                  padding: "10px 12px", borderRadius: 12,
                  fontSize: 12.5, lineHeight: 1.45,
                  border: m.from === "ai" ? `1px solid ${t.line}` : "none",
                }}>
                  {m.text}
                </div>
                {m.stub && (
                  <div style={{ fontSize: 10, color: t.ink3, marginTop: 4, fontStyle: "italic" }}>
                    Dev stub — set ANTHROPIC_API_KEY to enable real replies.
                  </div>
                )}
              </div>
            ))}
            {aiChat.isPending && (
              <div style={{ alignSelf: "flex-start", padding: "10px 12px", fontSize: 12, color: t.ink3 }}>
                Co-pilot is thinking…
              </div>
            )}
            {chatLog.length === 1 && !aiChat.isPending && (
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 6 }}>
                <Suggestion t={t} onClick={() => setInput("Summarize today's pipeline")}>Summarize today&rsquo;s pipeline</Suggestion>
                <Suggestion t={t} onClick={() => setInput("Which loans are at risk of slipping past close?")}>Which loans are at risk of slipping past close?</Suggestion>
                <Suggestion t={t} onClick={() => setInput("Draft a follow-up for stale doc requests")}>Draft a follow-up for stale doc requests</Suggestion>
              </div>
            )}
          </div>
        )}

        {tab === "tasks" && (
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {tasks.length === 0 && <div style={{ fontSize: 12.5, color: t.ink3 }}>No queued tasks right now.</div>}
            {tasks.map((task) => (
              <div key={task.id} style={{ background: t.surface2, padding: 12, borderRadius: 12, border: `1px solid ${t.line}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: t.ink3, textTransform: "uppercase", letterSpacing: 1 }}>{task.source}</span>
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: task.priority === "high" ? t.danger : task.priority === "medium" ? t.warn : t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>
                    {task.priority}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{task.title}</div>
                <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }}>conf {(task.confidence * 100).toFixed(0)}% · {task.agent}</div>
              </div>
            ))}
          </div>
        )}

        {tab === "context" && (
          <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <ContextSection t={t} title="What I can see">
              <ContextItem t={t}>Read-only access to all loan files, clients, docs, calendar, messages.</ContextItem>
              <ContextItem t={t}>Live activity log + immutable audit trail.</ContextItem>
              <ContextItem t={t}>Last 90 days of rate-sheet movements.</ContextItem>
            </ContextSection>
            <ContextSection t={t} title="What I can do (with approval)">
              <ContextItem t={t}>Draft messages to clients (you approve & send).</ContextItem>
              <ContextItem t={t}>Request documents from borrowers.</ContextItem>
              <ContextItem t={t}>Re-price loans within rate-sheet floors.</ContextItem>
              <ContextItem t={t}>Route loans between UW queues.</ContextItem>
            </ContextSection>
            <ContextSection t={t} title="What I never do">
              <ContextItem t={t}>Send messages without your approval.</ContextItem>
              <ContextItem t={t}>Move loans past Closing without operator sign-off.</ContextItem>
              <ContextItem t={t}>Initiate wires, ACH, or financial transfers.</ContextItem>
            </ContextSection>
          </div>
        )}
      </div>

      {/* Footer chat input */}
      {tab === "chat" && (
        <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            placeholder="Ask co-pilot…"
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 10,
              background: t.surface2, border: `1px solid ${t.line}`, color: t.ink, fontSize: 13,
              fontFamily: "inherit", outline: "none",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || aiChat.isPending}
            style={{
              width: 40, height: 40, borderRadius: 10, background: t.petrol, color: "#fff",
              border: "none", cursor: input.trim() && !aiChat.isPending ? "pointer" : "not-allowed",
              opacity: input.trim() && !aiChat.isPending ? 1 : 0.5,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}
            aria-label="Send"
          >
            <Icon name={aiChat.isPending ? "ai" : "bolt"} size={14} />
          </button>
        </div>
      )}
    </aside>
  );
}

function Suggestion({ t, onClick, children }: { t: ReturnType<typeof useTheme>["t"]; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "8px 12px", borderRadius: 9, border: `1px solid ${t.line}`,
        background: "transparent", color: t.ink2, textAlign: "left", fontSize: 12, fontWeight: 600,
        cursor: "pointer", fontFamily: "inherit",
      }}
    >
      {children}
    </button>
  );
}

function ContextSection({ t, title, children }: { t: ReturnType<typeof useTheme>["t"]; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.petrol, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>{children}</div>
    </div>
  );
}

function ContextItem({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: t.ink2, lineHeight: 1.45 }}>
      <span style={{ width: 4, height: 4, borderRadius: 999, background: t.petrol, marginTop: 7, flexShrink: 0 }} />
      <span>{children}</span>
    </div>
  );
}
