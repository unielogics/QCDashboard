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

const KIND_LABEL = { client: "Client", intake: "AI intake", dealer: "Audit file" } as const;
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
  };

  const reset = () => {
    setRecipient(null); setSearch(""); setSubject(""); setBody("");
    setUseSms(false); setUseEmail(false); setOutcome(null);
  };

  const send = useMutation({
    mutationFn: () => {
      const channels = [...(useSms ? ["sms"] : []), ...(useEmail ? ["email"] : [])];
      return apiCall<UnifiedComposeResult>("/communications/compose", {
        method: "POST",
        body: JSON.stringify({
          recipient_kind: recipient!.kind,
          recipient_id: recipient!.id,
          channels,
          subject: useEmail && subject.trim() ? subject.trim() : null,
          body: body.trim(),
        }),
      });
    },
    onSuccess: (data) => {
      setOutcome(data);
      void qc.invalidateQueries({ queryKey: ["unified-communication-contacts"] });
      if (data.ok && data.results.every((r) => r.ok)) {
        const threadId = data.thread_id;
        reset();
        onClose();
        onSent(threadId);
      }
    },
    onError: (reason) => setOutcome({ ok: false, thread_id: null, results: [{ channel: "request", ok: false, detail: reason instanceof Error ? reason.message : "The message could not be sent." }] }),
  });

  const canSend = Boolean(recipient && body.trim() && (useSms || useEmail)) && !send.isPending;
  const rows = useMemo(() => recipients.data ?? [], [recipients.data]);

  return (
    <Drawer open={open} onClose={() => { reset(); onClose(); }} title="New message" sub="Reach a client, AI-intake lead, or audit file by text, email, or both.">
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
            <Btn size="sm" onClick={() => setRecipient(null)}>Change</Btn>
          </div>

          <div className="row" role="group" aria-label="Channels">
            <Btn size="sm" variant={useSms ? "pri" : undefined} disabled={!recipient.phone} title={recipient.phone ? undefined : "No phone number on file"} onClick={() => setUseSms((v) => !v)}><Icon name="phone" size={13} /> SMS</Btn>
            <Btn size="sm" variant={useEmail ? "pri" : undefined} disabled={!recipient.email} title={recipient.email ? undefined : "No email on file"} onClick={() => setUseEmail((v) => !v)}><Icon name="mail" size={13} /> Email</Btn>
            {!recipient.phone && !recipient.email ? <span className="sub">No contact details on file — add one to their record first.</span> : null}
          </div>

          {useEmail ? <Input aria-label="Subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Subject (email)" /> : null}
          <Textarea aria-label="Message" rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder={useSms && !useEmail ? "Text message..." : "Write your message..."} />

          {outcome ? (
            <div className="grid g6">
              {outcome.results.map((r) => (
                <Callout key={r.channel} tone={r.ok ? "ok" : "bad"} icon={<Icon name={r.ok ? "check" : "alert"} size={14} />}>
                  <b className={cx("cap")}>{r.channel}</b>: {r.ok ? "sent" : r.detail || "failed"}
                </Callout>
              ))}
            </div>
          ) : null}

          <div className="row" style={{ justifyContent: "flex-end" }}>
            <Btn onClick={() => { reset(); onClose(); }}>Cancel</Btn>
            <Btn variant="pri" disabled={!canSend} onClick={() => send.mutate()}><Icon name="send" size={14} />{send.isPending ? "Sending..." : "Send"}</Btn>
          </div>
        </div>
      )}
    </Drawer>
  );
}
