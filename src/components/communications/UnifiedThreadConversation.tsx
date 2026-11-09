"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, cx } from "@/components/ds";
import { ChatComposer } from "@/components/ds/ChatComposer";
import { InlineImageStrip } from "@/components/InlineImages";
import { useAuthedApi } from "@/hooks/useApi";
import type { UnifiedCommunicationThreadDetail } from "@/lib/communications";
import { LIVE_MESSAGE_QUERY_OPTIONS } from "@/lib/communications";
import { useVisibleMessageReceipts } from "./useVisibleMessageReceipts";
import { MessageImageDrafts, useMessageImages, useMessageImageCapabilities } from "./MessageImages";
import { MESSAGE_IMAGE_ACCEPT, outgoingDeliveryWarning, smsImageDeliveryNotice } from "@/lib/messageImages";

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
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const images = useMessageImages(`thread:${threadId}`);
  const activeThread = useRef(threadId);
  activeThread.current = threadId;
  const scroller = useRef<HTMLDivElement | null>(null);
  const key = ["unified-communication-thread", threadId];
  const thread = useQuery({
    queryKey: key,
    queryFn: () => apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${encodeURIComponent(threadId)}`),
    ...LIVE_MESSAGE_QUERY_OPTIONS,
  });
  const readReceipt = useVisibleMessageReceipts(scroller, { unifiedThreadId: threadId }, (thread.data?.messages ?? []).filter((message) => message.direction === "inbound").map((message) => message.id), Boolean(thread.data && !thread.isError));
  const isSms = thread.data?.thread.channel === "sms";
  const supportsImages = isSms || thread.data?.thread.channel === "email";
  const capabilities = useMessageImageCapabilities(Boolean(thread.data?.thread.can_reply && isSms));
  const imageDeliveryBlocked = images.images.length > 0 && isSms && (!capabilities.data || capabilities.data.sms.image_delivery === "unavailable");
  const send = useMutation({
    mutationFn: async ({ body, id }: { body: string; id: string }) => {
      const image_ids = await images.flush(isSms ? capabilities.data?.sms.max_total_bytes : undefined);
      return apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ body, image_ids }) });
    },
    onSuccess: (data, variables) => {
      qc.setQueryData(["unified-communication-thread", variables.id], data);
      if (variables.id === activeThread.current) { setDraft(""); setError(""); setDeliveryWarning(outgoingDeliveryWarning(data) || ""); images.reset(); }
      void qc.invalidateQueries({ queryKey: ["unified-communication-threads"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The message could not be sent."),
  });
  useEffect(() => { setDraft(""); setError(""); setDeliveryWarning(""); }, [threadId]);
  useEffect(() => {
    if (!scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread.data?.messages.length]);

  if (thread.isError) return <div className="unified-thread-chat"><header className="unified-thread-chat-head"><b>Requested conversation unavailable</b></header><Callout tone="bad" icon={<Icon name="alert" size={16} />}>{thread.error instanceof Error ? thread.error.message : "This conversation could not be loaded."} <Btn size="sm" onClick={() => void thread.refetch()}>Retry requested conversation</Btn></Callout></div>;

  return (
    <div className="unified-thread-chat">
      <header className="unified-thread-chat-head">
        <div><b>{thread.data?.thread.source_label || "Conversation"}</b><span>{thread.data?.thread.participant_name || thread.data?.thread.participant_email || "File channel"}</span></div>
        {thread.data ? <><CellChip tone="acc">{thread.data.thread.channel.replaceAll("_", " ")}</CellChip><CellChip tone="mut">{thread.data.messages.length} messages</CellChip></> : null}
      </header>
      {deliveryWarning ? <Callout tone="warn">{deliveryWarning}</Callout> : null}
      <div className="unified-thread-messages" ref={scroller}>
        {thread.isLoading ? <div className="empty"><span className="spinner solo" />Loading conversation...</div> : null}
        {thread.data && !thread.data.messages.length ? <div className="empty">{emptyLabel}</div> : null}
        {thread.data?.messages.map((message, index) => {
          const previous = index > 0 ? thread.data!.messages[index - 1] : null;
          return (
            <div key={message.id} className="msg-group">
              {dayBreak(previous?.created_at ?? null, message.created_at) ? (
                <div className="msg-daybreak"><span>{dayLabel(message.created_at)}</span></div>
              ) : null}
              <article data-communication-message-id={message.direction === "inbound" ? message.id : undefined} className={cx("bubble-row", message.direction)}>
                <div className="bubble">
                  {/* Only name inbound: every outbound is us, and repeating
                      that on each bubble is noise the alignment already says. */}
                  {message.direction !== "outbound" && message.sender_name ? (
                    <span className="bubble-who">{message.sender_name}</span>
                  ) : null}
                  {/* A picture with no caption is a real message: the body
                      is empty and the image is the whole content. */}
                  {message.body ? <p>{message.body}</p> : null}
                  <InlineImageStrip images={message.images} />
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
      {readReceipt.error ? <Callout tone="bad">Messages loaded, but read status could not be saved. <Btn size="sm" onClick={readReceipt.retry}>Retry read status</Btn></Callout> : null}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={() => send.mutate({ body: draft.trim(), id: threadId })}
        sending={send.isPending}
        disabled={!thread.data?.thread.can_reply}
        sendDisabled={imageDeliveryBlocked}
        onFiles={supportsImages ? images.add : undefined}
        accept={MESSAGE_IMAGE_ACCEPT}
        attachments={images.images.length || images.error ? <MessageImageDrafts draft={images} disabled={send.isPending} /> : undefined}
        allowEmpty={images.images.length > 0}
        placeholder={thread.data?.thread.can_reply ? "Write a message..." : "This conversation is read-only"}
        sendLabel="Send message"
        error={error || null}
        notice={images.images.length > 0 && isSms ? smsImageDeliveryNotice(capabilities.data) : undefined}
        hint="Enter sends, Shift + Enter adds a line. Paste or attach an image."
      />
      {images.images.length > 0 && isSms && capabilities.isError ? <Callout tone="warn">The SMS image provider could not be checked. <Btn size="sm" onClick={() => void capabilities.refetch()}>Retry provider check</Btn></Callout> : null}
    </div>
  );
}
