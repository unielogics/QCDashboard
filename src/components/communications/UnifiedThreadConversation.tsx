"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, cx } from "@/components/ds";
import { ChatComposer } from "@/components/ds/ChatComposer";
import { InlineImageStrip } from "@/components/InlineImages";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import type { UnifiedCommunicationMessage, UnifiedCommunicationThreadDetail } from "@/lib/communications";
import { isIntakeInternalNotesThread, LIVE_MESSAGE_QUERY_OPTIONS, unifiedCommunicationThreadKey } from "@/lib/communications";
import { useVisibleMessageReceipts } from "./useVisibleMessageReceipts";
import { MessageImageDrafts, useMessageImages, useMessageImageCapabilities } from "./MessageImages";
import { MESSAGE_IMAGE_ACCEPT, outgoingDeliveryWarning, smsImageDeliveryNotice } from "@/lib/messageImages";
import styles from "./UnifiedThreadConversation.module.css";

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

function InternalNoteAiContext({ threadId, message, disabled, authScope, isCurrent }: { threadId: string; message: UnifiedCommunicationMessage; disabled: boolean; authScope: string | null; isCurrent: () => boolean }) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const update = useMutation({
    mutationFn: (include: boolean) => {
      if (!authScope || !isCurrent()) throw new Error("The signed-in account or file changed. Reopen this note.");
      return apiCall<UnifiedCommunicationThreadDetail>(
        `/communications/threads/${encodeURIComponent(threadId)}/notes/${encodeURIComponent(message.id)}/ai-context`,
        { method: "PATCH", body: JSON.stringify({ include_in_ai_context: include }) },
      );
    },
    onSuccess: async data => {
      if (!isCurrent()) return;
      const key = unifiedCommunicationThreadKey(threadId, authScope);
      await qc.cancelQueries({ queryKey: key });
      if (!isCurrent()) return;
      qc.setQueryData(key, data);
      void qc.invalidateQueries({ queryKey: ["unified-communication-threads"] });
    },
  });
  return <div className={styles.contextControl}>
    <label><input type="checkbox" checked={message.include_in_ai_context === true} disabled={disabled || update.isPending}
      onChange={event => update.mutate(event.target.checked)} />Include in AI context</label>
    {update.isPending ? <span role="status">Saving…</span> : null}
    {update.isError ? <span className={styles.contextError} role="alert">{update.error instanceof Error ? update.error.message : "AI context choice could not be saved."} Try again.</span> : null}
  </div>;
}

export function UnifiedThreadConversation({ threadId, emptyLabel = "No messages in this channel yet.", compact = false, active = true }: { threadId: string; emptyLabel?: string; compact?: boolean; active?: boolean }) {
  const apiCall = useAuthedApi();
  const user = useCurrentUser();
  const authScope = user.authReady === false ? null : user.authScope ?? user.data?.id ?? null;
  const scope = `${authScope ?? ""}:${threadId}`;
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [deliveryWarning, setDeliveryWarning] = useState("");
  const [includeNewNoteInAiContext, setIncludeNewNoteInAiContext] = useState(false);
  const images = useMessageImages(`thread:${scope}`);
  const activeScope = useRef(scope);
  activeScope.current = scope;
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const scroller = useRef<HTMLDivElement | null>(null);
  const key = unifiedCommunicationThreadKey(threadId, authScope);
  const thread = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const data = await apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${encodeURIComponent(threadId)}`, { signal });
      if (!mounted.current || activeScope.current !== scope) throw new Error("The signed-in account or file changed while this conversation was loading.");
      return data;
    },
    enabled: active && Boolean(authScope),
    ...LIVE_MESSAGE_QUERY_OPTIONS,
  });
  const readReceipt = useVisibleMessageReceipts(scroller, { unifiedThreadId: threadId }, (thread.data?.messages ?? []).filter((message) => message.direction === "inbound").map((message) => message.id), Boolean(active && thread.data && !thread.isError));
  const isInternal = isIntakeInternalNotesThread(threadId, thread.data?.thread.channel);
  const isSms = thread.data?.thread.channel === "sms";
  const supportsImages = isSms || thread.data?.thread.channel === "email";
  const capabilities = useMessageImageCapabilities(Boolean(thread.data?.thread.can_reply && isSms));
  const imageDeliveryBlocked = images.images.length > 0 && isSms && (!capabilities.data || capabilities.data.sms.image_delivery === "unavailable");
  const send = useMutation({
    mutationFn: async ({ body, id, includeInAiContext, requestScope }: { body: string; id: string; includeInAiContext?: boolean; requestScope: string }) => {
      if (!mounted.current || !authScope || activeScope.current !== requestScope) throw new Error("The signed-in account or file changed. Reopen the conversation.");
      const image_ids = await images.flush(isSms ? capabilities.data?.sms.max_total_bytes : undefined);
      if (!mounted.current || activeScope.current !== requestScope) throw new Error("The signed-in account or file changed. Reopen the conversation.");
      return apiCall<UnifiedCommunicationThreadDetail>(`/communications/threads/${encodeURIComponent(id)}/messages`, { method: "POST", body: JSON.stringify({ body, image_ids, ...(includeInAiContext === undefined ? {} : { include_in_ai_context: includeInAiContext }) }) });
    },
    onSuccess: (data, variables) => {
      if (!mounted.current || variables.requestScope !== activeScope.current) return;
      qc.setQueryData(unifiedCommunicationThreadKey(variables.id, authScope), data);
      setDraft(""); setIncludeNewNoteInAiContext(false); setError(""); setDeliveryWarning(outgoingDeliveryWarning(data) || ""); images.reset();
      void qc.invalidateQueries({ queryKey: ["unified-communication-threads"] });
    },
    onError: (reason, variables) => { if (mounted.current && variables.requestScope === activeScope.current) setError(reason instanceof Error ? reason.message : "The message could not be sent."); },
  });
  useEffect(() => { setDraft(""); setIncludeNewNoteInAiContext(false); setError(""); setDeliveryWarning(""); }, [scope]);
  useEffect(() => {
    if (!scroller.current) return;
    scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [thread.data?.messages.length]);

  if (thread.isError) return <div className="unified-thread-chat"><header className="unified-thread-chat-head"><b>Requested conversation unavailable</b></header><Callout tone="bad" icon={<Icon name="alert" size={16} />}>{thread.error instanceof Error ? thread.error.message : "This conversation could not be loaded."} <Btn size="sm" onClick={() => void thread.refetch()}>Retry requested conversation</Btn></Callout></div>;

  return (
    <div className={cx("unified-thread-chat", isInternal && styles.internal, compact && styles.compact)}>
      {!compact ? <header className="unified-thread-chat-head">
        <div><b>{thread.data?.thread.source_label || "Conversation"}</b><span>{thread.data?.thread.participant_name || thread.data?.thread.participant_email || "File channel"}</span></div>
        {thread.data ? <><CellChip tone="acc">{thread.data.thread.channel.replaceAll("_", " ")}</CellChip><CellChip tone="mut">{thread.data.messages.length} messages</CellChip></> : null}
      </header> : null}
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
                  {(isInternal || message.direction !== "outbound") && message.sender_name ? (
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
                {isInternal ? <InternalNoteAiContext key={scope + message.id} threadId={threadId} message={message} authScope={authScope}
                  isCurrent={() => mounted.current && activeScope.current === scope} disabled={!authScope || !thread.data!.thread.can_reply} /> : null}
              </article>
            </div>
          );
        })}
      </div>
      {readReceipt.error ? <Callout tone="bad">Messages loaded, but read status could not be saved. <Btn size="sm" onClick={readReceipt.retry}>Retry read status</Btn></Callout> : null}
      {isInternal ? <label className={styles.newNoteContext}><input type="checkbox" checked={includeNewNoteInAiContext}
        disabled={!authScope || !thread.data?.thread.can_reply || send.isPending} onChange={event => setIncludeNewNoteInAiContext(event.target.checked)} />Include in AI context</label> : null}
      <ChatComposer
        value={draft}
        onChange={setDraft}
        onSend={() => send.mutate({ body: draft.trim(), id: threadId, requestScope: scope, ...(isInternal ? { includeInAiContext: includeNewNoteInAiContext } : {}) })}
        sending={send.isPending}
        disabled={!authScope || !thread.data?.thread.can_reply || !active}
        sendDisabled={imageDeliveryBlocked}
        onFiles={supportsImages ? images.add : undefined}
        accept={MESSAGE_IMAGE_ACCEPT}
        attachments={images.images.length || images.error ? <MessageImageDrafts draft={images} disabled={send.isPending} /> : undefined}
        allowEmpty={images.images.length > 0}
        placeholder={thread.data?.thread.can_reply ? isInternal ? "Write an internal note…" : "Write a message..." : "This conversation is read-only"}
        sendLabel={isInternal ? "Add internal note" : "Send message"}
        error={error || null}
        notice={images.images.length > 0 && isSms ? smsImageDeliveryNotice(capabilities.data) : undefined}
        hint="Enter sends, Shift + Enter adds a line. Paste or attach an image."
      />
      {images.images.length > 0 && isSms && capabilities.isError ? <Callout tone="warn">The SMS image provider could not be checked. <Btn size="sm" onClick={() => void capabilities.refetch()}>Retry provider check</Btn></Callout> : null}
    </div>
  );
}
