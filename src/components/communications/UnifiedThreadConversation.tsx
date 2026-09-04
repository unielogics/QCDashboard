"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Callout, CellChip, cx } from "@/components/ds";
import { ChatComposer } from "@/components/ds/ChatComposer";
import { useAuthedApi } from "@/hooks/useApi";
import type { UnifiedCommunicationThreadDetail } from "@/lib/communications";

/** A new calendar day between two messages earns a divider, as in iMessage. */
function dayBreak(previousIso: string | null, currentIso: string): boolean {
  if (!previousIso) return true;
  const a = new Date(previousIso);
  const b = new Date(currentIso);
  return a.toDateString() !== b.toDateString();
}

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function UnifiedThreadConversation({ threadId, emptyLabel = "No messages in this channel yet." }: { threadId: string; emptyLabel?: string }) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement | null>(null);
  const key = ["unified-communication-thread", threadId];
  const thread = useQuery({
    queryKey: key,
    queryFn: () => apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${threadId}`),
    refetchInterval: 6000,
  });
  const send = useMutation({
    mutationFn: (body: string) => apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${threadId}/messages`, { method: "POST", body: JSON.stringify({ body }) }),
    onSuccess: (data) => {
      qc.setQueryData(key, data);
      setDraft("");
      setError("");
      void qc.invalidateQueries({ queryKey: ["unified-communication-threads"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The message could not be sent."),
  });
  useEffect(() => {
    if (!scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread.data?.messages.length]);

  return (
    <div className="unified-thread-chat">
      <header className="unified-thread-chat-head">
        <div><b>{thread.data?.thread.source_label || "Conversation"}</b><span>{thread.data?.thread.participant_name || thread.data?.thread.participant_email || "File channel"}</span></div>
        {thread.data ? <><CellChip tone="acc">{thread.data.thread.channel.replaceAll("_", " ")}</CellChip><CellChip tone="mut">{thread.data.messages.length} messages</CellChip></> : null}
      </header>
      <div className="unified-thread-messages" ref={scroller}>
        {thread.isLoading ? <div className="empty"><span className="spinner solo" />Loading conversation...</div> : null}
        {thread.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{thread.error instanceof Error ? thread.error.message : "Conversation unavailable."}</Callout> : null}
        {thread.data && !thread.data.messages.length ? <div className="empty">{emptyLabel}</div> : null}
        {thread.data?.messages.map((message, index) => {
          const previous = index > 0 ? thread.data!.messages[index - 1] : null;
          return (
            <div key={message.id} className="msg-group">
              {dayBreak(previous?.created_at ?? null, message.created_at) ? (
                <div className="msg-daybreak"><span>{dayLabel(message.created_at)}</span></div>
              ) : null}
              <article className={cx("bubble-row", message.direction)}>
                <div className="bubble">
                  {/* Only name inbound: every outbound is us, and repeating
                      that on each bubble is noise the alignment already says. */}
                  {message.direction !== "outbound" && message.sender_name ? (
                    <span className="bubble-who">{message.sender_name}</span>
                  ) : null}
                  <p>{message.body}</p>
                </div>
                <span className="bubble-meta">
                  <time dateTime={message.created_at}>{clock(message.created_at)}</time>
                  {message.direction === "outbound" && message.delivery_status ? (
                    <span className={cx("bubble-status", message.delivery_status)}>{message.delivery_status}</span>
                  ) : null}
                </span>
              </article>
            </div>
          );
        })}
      </div>
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={() => send.mutate(draft.trim())}
        sending={send.isPending}
        disabled={!thread.data?.thread.can_reply}
        placeholder={thread.data?.thread.can_reply ? "Write a message..." : "This conversation is read-only"}
        sendLabel="Send message"
        error={error || null}
        hint="Enter sends, Shift + Enter adds a line."
      />
    </div>
  );
}
