"use client";

// Desktop parity with the mobile client "To Do" tab. Same backend
// (GET /loans/{id}/todo?status=) which is strictly scoped: a client
// only ever sees their own loan's documents + calls; internal AI-task
// asks are operators-only. Pending / Completed / All filter mirrors
// mobile.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useLoanTodo,
  useSendDealChat,
  useCreateCalendarEvent,
  type TodoStatusFilter,
} from "@/hooks/useApi";
import { DealChatMode } from "@/lib/enums.generated";

const FILTERS: { key: TodoStatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
  { key: "all", label: "All" },
];
const GROUPS: { kind: "document" | "call" | "task"; label: string; icon: "doc" | "cal" | "check" }[] = [
  { kind: "document", label: "Documents", icon: "doc" },
  { kind: "call", label: "Calls", icon: "cal" },
  { kind: "task", label: "Asks", icon: "check" },
];

export function ClientTodoTab({ loanId }: { loanId: string }) {
  const { t } = useTheme();
  const [filter, setFilter] = useState<TodoStatusFilter>("pending");
  const { data: items = [], isLoading } = useLoanTodo(loanId, filter);
  const [mode, setMode] = useState<null | "call" | "note">(null);
  const [callWhen, setCallWhen] = useState("");
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const createEvent = useCreateCalendarEvent();
  const sendChat = useSendDealChat();
  const busy = createEvent.isPending || sendChat.isPending;

  const submitCall = async () => {
    try {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(10, 0, 0, 0);
      await createEvent.mutateAsync({
        loan_id: loanId,
        kind: "call",
        title: "Call requested by borrower",
        description: callWhen.trim() ? `Preferred: ${callWhen.trim()}` : "Borrower requested a call.",
        who: "Agent",
        starts_at: d.toISOString(),
        duration_min: 30,
      });
      setFlash("Call request sent — your agent will confirm a time.");
      setMode(null);
      setCallWhen("");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't send the request.");
    }
  };
  const submitNote = async () => {
    if (!note.trim()) { setFlash("Add a note message first."); return; }
    try {
      await sendChat.mutateAsync({ loanId, body: note.trim(), mode: DealChatMode.CHAT });
      setFlash("Note sent to your team.");
      setMode(null);
      setNote("");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't send the note.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "inline-flex", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 10, padding: 3, gap: 2 }}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                style={{
                  all: "unset", cursor: "pointer", padding: "6px 14px", borderRadius: 8,
                  fontSize: 12.5, fontWeight: 700,
                  background: active ? t.petrolSoft : "transparent",
                  color: active ? t.petrol : t.ink3,
                }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => { setMode("call"); setFlash(null); }} style={{ ...qcBtnPrimary(t), background: t.surface, color: t.ink, border: `1px solid ${t.line}` }}>
            <Icon name="cal" size={13} /> Request a call
          </button>
          <button onClick={() => { setMode("note"); setFlash(null); }} style={qcBtnPrimary(t)}>
            <Icon name="chat" size={13} /> Send a note
          </button>
        </div>
      </div>

      {flash ? <div style={{ fontSize: 12.5, color: flash.includes("Couldn") ? t.danger : t.petrol, fontWeight: 600 }}>{flash}</div> : null}

      {mode === "call" ? (
        <Card pad={16}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 8 }}>Request a call</div>
          <input
            value={callWhen}
            onChange={(e) => setCallWhen(e.target.value)}
            placeholder="When works for you? (e.g. Tue afternoon)"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13 }}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={submitCall} disabled={busy} style={{ ...qcBtnPrimary(t), opacity: busy ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Send request"}
            </button>
          </div>
        </Card>
      ) : null}
      {mode === "note" ? (
        <Card pad={16}>
          <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginBottom: 8 }}>Send a note</div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Type your message…"
            rows={3}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13, resize: "vertical", fontFamily: "inherit" }}
          />
          <div style={{ marginTop: 10 }}>
            <button onClick={submitNote} disabled={busy} style={{ ...qcBtnPrimary(t), opacity: busy ? 0.6 : 1 }}>
              {busy ? "Sending…" : "Send note"}
            </button>
          </div>
        </Card>
      ) : null}

      {isLoading ? <div style={{ color: t.ink3, fontSize: 13 }}>Loading your to-do…</div> : null}
      {!isLoading && items.length === 0 ? (
        <Card pad={18}>
          <div style={{ color: t.ink3, fontSize: 13 }}>
            You&apos;re all caught up — nothing {filter === "completed" ? "completed" : "outstanding"} on this loan.
          </div>
        </Card>
      ) : null}

      {GROUPS.map((g) => {
        const rows = items.filter((i) => i.kind === g.kind);
        if (rows.length === 0) return null;
        return (
          <div key={g.kind} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>{g.label}</div>
            {rows.map((it) => (
              <Card key={it.id} pad={14}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: t.brandSoft, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name={g.icon} size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{it.title}</div>
                    {it.subtitle ? <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>{it.subtitle}</div> : null}
                  </div>
                  {it.status ? (
                    <span style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>{it.status}</span>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        );
      })}
    </div>
  );
}
