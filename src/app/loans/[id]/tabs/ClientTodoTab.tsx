"use client";

// Desktop parity with the mobile client "To Do" tab. Same backend
// (GET /loans/{id}/todo?status=) which is strictly scoped: a client
// only ever sees their own loan's documents + calls; internal AI-task
// asks are operators-only. Pending / Completed / All filter mirrors
// mobile.
//
// Styling lives in globals.css / app-extras.css. The status control is a
// `Seg as="filter"` — it narrows a list rather than switching which view you
// are looking at, and describing it as a tablist would tell a screen-reader
// user the page is about to change when it is not.

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Field,
  Input,
  ItemRow,
  Panel,
  Seg,
  StatusLine,
  Textarea,
} from "@/components/ds";
import {
  useLoanTodo,
  useSendDealChat,
  useCreateCalendarEvent,
  type TodoStatusFilter,
} from "@/hooks/useApi";
import { DealChatMode } from "@/lib/enums.generated";

const FILTERS: { value: TodoStatusFilter; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All" },
];
const GROUPS: { kind: "document" | "call" | "task"; label: string; icon: "doc" | "cal" | "check" }[] = [
  { kind: "document", label: "Documents", icon: "doc" },
  { kind: "call", label: "Calls", icon: "cal" },
  { kind: "task", label: "Asks", icon: "check" },
];

export function ClientTodoTab({ loanId }: { loanId: string }) {
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
    <div className="grid">
      <div className="row">
        <Seg
          as="filter"
          ariaLabel="Filter to-do items"
          value={filter}
          onChange={setFilter}
          options={FILTERS}
        />
        <span className="grow" />
        <Btn onClick={() => { setMode("call"); setFlash(null); }}>
          <Icon name="cal" size={13} /> Request a call
        </Btn>
        <Btn variant="pri" onClick={() => { setMode("note"); setFlash(null); }}>
          <Icon name="chat" size={13} /> Send a note
        </Btn>
      </div>

      {flash ? (
        <StatusLine tone={flash.includes("Couldn") ? "bad" : "pet"}>{flash}</StatusLine>
      ) : null}

      {mode === "call" ? (
        <Panel title="Request a call">
          <Field label="Preferred time">
            <Input
              value={callWhen}
              onChange={(e) => setCallWhen(e.target.value)}
              placeholder="When works for you? (e.g. Tue afternoon)"
            />
          </Field>
          <div className="row mt">
            <Btn variant="pri" onClick={submitCall} disabled={busy}>
              {busy ? "Sending…" : "Send request"}
            </Btn>
          </div>
        </Panel>
      ) : null}
      {mode === "note" ? (
        <Panel title="Send a note">
          <Field label="Message">
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Type your message…"
              rows={3}
            />
          </Field>
          <div className="row mt">
            <Btn variant="pri" onClick={submitNote} disabled={busy}>
              {busy ? "Sending…" : "Send note"}
            </Btn>
          </div>
        </Panel>
      ) : null}

      {isLoading ? <span className="sub">Loading your to-do…</span> : null}
      {!isLoading && items.length === 0 ? (
        <Panel>
          <span className="sub">
            You&apos;re all caught up — nothing {filter === "completed" ? "completed" : "outstanding"} on this loan.
          </span>
        </Panel>
      ) : null}

      {GROUPS.map((g) => {
        const rows = items.filter((i) => i.kind === g.kind);
        if (rows.length === 0) return null;
        return (
          <div key={g.kind} className="grid g8">
            <div className="lbl">{g.label}</div>
            {rows.map((it) => (
              <ItemRow
                key={it.id}
                icon={<Icon name={g.icon} size={15} />}
                right={it.status ? <CellChip tone="mut">{it.status}</CellChip> : undefined}
              >
                <div><strong>{it.title}</strong></div>
                {it.subtitle ? <div className="sub">{it.subtitle}</div> : null}
              </ItemRow>
            ))}
          </div>
        );
      })}
    </div>
  );
}
