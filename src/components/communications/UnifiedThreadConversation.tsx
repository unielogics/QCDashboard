"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Textarea, cx } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { UnifiedCommunicationThreadDetail } from "@/lib/communications";

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
        {thread.data?.messages.map((message) => (
          <article key={message.id} className={cx("unified-message", message.direction)}>
            <header><b>{message.sender_name || (message.direction === "outbound" ? "Qualified Commercial" : message.sender_type.replaceAll("_", " "))}</b><span>{new Date(message.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span></header>
            <p>{message.body}</p>
            {message.delivery_status ? <small>{message.delivery_status}</small> : null}
          </article>
        ))}
      </div>
      <footer className="unified-thread-composer">
        <Textarea aria-label="Message" value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} placeholder="Write a message..." disabled={!thread.data?.thread.can_reply} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (draft.trim()) send.mutate(draft.trim()); } }} />
        <Btn variant="pri" disabled={!draft.trim() || send.isPending || !thread.data?.thread.can_reply} onClick={() => send.mutate(draft.trim())}><Icon name="send" size={14} />{send.isPending ? "Sending..." : "Send"}</Btn>
      </footer>
      {error ? <div className="unified-thread-error">{error}</div> : null}
    </div>
  );
}
