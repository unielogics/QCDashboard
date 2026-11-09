"use client";

// New message — start a conversation from the inbox instead of hunting for the
// record first. Pick a person (client, AI-intake lead, or audit file), pick
// channels, write once. Each channel reports its own outcome: "the text failed
// but the email went" is a different situation from "nothing went", and this
// shows both rather than collapsing them into one optimistic toast.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Input, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import type { ComposeRecipient, UnifiedComposeResult } from "@/lib/communications";
import { MessageImagePicker, useMessageImages, useMessageImageCapabilities } from "./MessageImages";
import { outgoingDeliveryWarning, smsImageDeliveryNotice } from "@/lib/messageImages";

const KIND_LABEL = { client: "Client", intake: "File", dealer: "Audit file" } as const;
const KIND_TONE = { client: "acc", intake: "pet", dealer: "gold" } as const;

export function NewMessageDrawer({
  open,
  onClose,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the thread to focus after a successful send (null = just refresh). */
  onSent: (threadId: string | null) => void;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [recipient, setRecipient] = useState<ComposeRecipient | null>(null);
  const [useSms, setUseSms] = useState(false);
  const [useEmail, setUseEmail] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [outcome, setOutcome] = useState<UnifiedComposeResult | null>(null);
  const [sentChannels, setSentChannels] = useState<string[]>([]);
  const images = useMessageImages(`new:${open}:${recipient?.kind || ""}:${recipient?.id || ""}`);
  const capabilities = useMessageImageCapabilities(open && useSms);

  const recipients = useQuery({
    queryKey: ["compose-recipients", search],
    queryFn: () => apiCall<ComposeRecipient[]>(`/communications/recipients?q=${encodeURIComponent(search.trim())}`),
    enabled: open && !recipient,
  });

  const pick = (row: ComposeRecipient) => {
    setRecipient(row);
    // Default to every channel the person can actually receive.
    setUseSms(Boolean(row.phone));
    setUseEmail(Boolean(row.email));
    setOutcome(null);
    setSentChannels([]);
  };

  const reset = () => {
    setRecipient(null); setSearch(""); setSubject(""); setBody("");
    setUseSms(false); setUseEmail(false); setOutcome(null); setSentChannels([]); images.reset();
  };

  const send = useMutation({
    mutationFn: async () => {
      const channels = [...(useSms && !sentChannels.includes("sms") ? ["sms"] : []), ...(useEmail && !sentChannels.includes("email") ? ["email"] : [])];
      const image_ids = await images.flush();
      return apiCall<UnifiedComposeResult>("/communications/compose", {
        method: "POST",
        body: JSON.stringify({
          recipient_kind: recipient!.kind,
          recipient_id: recipient!.id,
          channels,
          subject: useEmail && subject.trim() ? subject.trim() : null,
          body: body.trim(),
          image_ids,
        }),
      });
    },
    onSuccess: (data) => {
      const sent = [...new Set([...sentChannels, ...data.results.filter((result) => result.ok).map((result) => result.channel)])];
      const warning = outgoingDeliveryWarning(data);
      setSentChannels(sent);
      setOutcome({ ...data, delivery_warning: warning, results: [...(outcome?.results || []).filter((result) => !data.results.some((next) => next.channel === result.channel)), ...data.results] });
      void qc.invalidateQueries({ queryKey: ["unified-communication-contacts"] });
      if ((!useSms || sent.includes("sms")) && (!useEmail || sent.includes("email")) && !warning) {
        const threadId = data.thread_id;
        reset();
        onClose();
        onSent(threadId);
      }
    },
    onError: (reason) => setOutcome({ ok: false, thread_id: null, results: [{ channel: "request", ok: false, detail: reason instanceof Error ? reason.message : "The message could not be sent." }] }),
  });

  const imageDeliveryBlocked = images.images.length > 0 && useSms && !sentChannels.includes("sms") && (!capabilities.data || capabilities.data.sms.image_delivery === "unavailable");
  const canSend = Boolean(recipient && (body.trim() || images.images.length) && ((useSms && !sentChannels.includes("sms")) || (useEmail && !sentChannels.includes("email")))) && !send.isPending && !imageDeliveryBlocked;
  const rows = useMemo(() => recipients.data ?? [], [recipients.data]);

  return (
    <Drawer open={open} onClose={() => { if (!send.isPending) { reset(); onClose(); } }} title="New message" sub="Reach a client, AI-intake lead, or audit file by text, email, or both.">
      {!recipient ? (
        <div className="grid g8">
          <div className="global-inbox-search" style={{ padding: 0 }}>
            <span style={{ top: 10, left: 11 }}><Icon name="search" size={14} /></span>
            <Input autoFocus aria-label="Search recipients" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search clients, intake leads, audit files..." />
          </div>
          <div className="compose-recipient-list">
            {recipients.isLoading ? <div className="empty"><span className="spinner solo" />Searching...</div> : null}
            {rows.map((row) => (
              <button key={`${row.kind}:${row.id}`} type="button" className="compose-recipient-row" onClick={() => pick(row)}>
                <CellChip tone={KIND_TONE[row.kind]}>{KIND_LABEL[row.kind]}</CellChip>
                <span className="grow trunc">
                  <b>{row.name}</b>
                  {row.label && row.kind !== "client" ? <span className="sub"> · {row.label}</span> : null}
                  <span className="compose-recipient-contact trunc">
                    {[row.email, row.phone].filter(Boolean).join(" · ") || "No contact details on file"}
                  </span>
                </span>
                <Icon name="chevR" size={14} />
              </button>
            ))}
            {!recipients.isLoading && !rows.length ? <div className="empty">No one matches that search.</div> : null}
          </div>
        </div>
      ) : (
        <div className="grid g10">
          <div className="compose-recipient-row picked">
            <CellChip tone={KIND_TONE[recipient.kind]}>{KIND_LABEL[recipient.kind]}</CellChip>
            <span className="grow trunc"><b>{recipient.name}</b><span className="compose-recipient-contact trunc">{[recipient.email, recipient.phone].filter(Boolean).join(" · ")}</span></span>
            <Btn size="sm" disabled={send.isPending} onClick={() => { setRecipient(null); setSentChannels([]); setOutcome(null); }}>Change</Btn>
          </div>

          <div className="row" role="group" aria-label="Channels">
            <Btn size="sm" variant={useSms ? "pri" : undefined} disabled={!recipient.phone || send.isPending || sentChannels.includes("sms")} title={recipient.phone ? undefined : "No phone number on file"} onClick={() => setUseSms((v) => !v)}><Icon name="phone" size={13} /> {sentChannels.includes("sms") ? "SMS sent" : "SMS"}</Btn>
            <Btn size="sm" variant={useEmail ? "pri" : undefined} disabled={!recipient.email || send.isPending || sentChannels.includes("email")} title={recipient.email ? undefined : "No email on file"} onClick={() => setUseEmail((v) => !v)}><Icon name="mail" size={13} /> {sentChannels.includes("email") ? "Email sent" : "Email"}</Btn>
            {!recipient.phone && !recipient.email ? <span className="sub">No contact details on file — add one to their record first.</span> : null}
          </div>

          {useEmail ? <Input aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (email)" /> : null}
          <Textarea aria-label="Message" rows={5} value={body} disabled={send.isPending} onPaste={images.onPaste} onChange={(event) => setBody(event.target.value)} placeholder={useSms && !useEmail ? "Text message..." : "Write your message..."} />
          <MessageImagePicker draft={images} disabled={send.isPending} />
          {images.images.length > 0 && useSms ? <Callout tone={imageDeliveryBlocked ? "warn" : "mut"}>{smsImageDeliveryNotice(capabilities.data)}{capabilities.isError ? <button type="button" className="linky" onClick={() => void capabilities.refetch()}>Retry provider check</button> : null}</Callout> : null}

          {outcome ? (
            <div className="grid g6">
              {outcome.delivery_warning ? <Callout tone="warn">{outcome.delivery_warning}</Callout> : null}
              {outcome.results.map((r) => (
                <Callout key={r.channel} tone={r.ok ? "ok" : "bad"} icon={<Icon name={r.ok ? "check" : "alert"} size={14} />}>
                  <b className={cx("cap")}>{r.channel}</b>: {r.detail || (r.ok ? "sent" : "failed")}
                </Callout>
              ))}
            </div>
          ) : null}

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Btn disabled={send.isPending} onClick={() => { reset(); onClose(); }}>Cancel</Btn>
            <Btn variant="pri" disabled={!canSend} onClick={() => send.mutate()}><Icon name="send" size={14} />{send.isPending ? "Sending..." : sentChannels.length ? "Retry remaining channels" : "Send"}</Btn>
          </div>
        </div>
      )}
    </Drawer>
  );
}
