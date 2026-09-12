"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Field, Input, Lbl, Select, Sub, Textarea, WarnLine, cx } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { ClientSmsMessage, ClientThreadMessage, ClientThreadResponse, LeadCockpitAdapter } from "@/components/admin/LeadCockpit";

type SmsConsentGrant = {
  id: string;
  phone_e164: string;
  consent_kind: string;
  granted: boolean;
  method: string;
  disclosure_version: string;
  consenter_name: string | null;
  captured_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
};

type SmsConsentState = {
  phone: string | null;
  can_send: boolean;
  delivery_enabled: boolean;
  transactional_consented: boolean;
  marketing_consented: boolean;
  opted_out: boolean;
  provider_available: boolean;
  blocked_reason: string | null;
  grants: SmsConsentGrant[];
};

type SmsDisclosure = {
  version: string;
  brand: string;
  transactional: string;
  marketing: string;
  legal: string;
  terms_url: string;
  privacy_url: string;
};

type CommunicationContact = {
  id: string;
  kind: "client" | "owner";
  name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  owner_id: string | null;
  credit_required: boolean;
};

type EmailThread = {
  id: string;
  subject: string;
  owner_user_id: string | null;
  owner_name: string | null;
  owner_email: string | null;
  to_email: string;
  cc_emails: string[];
  participant_names: string[];
  last_message_at: string | null;
  unread_count: number;
  can_reply: boolean;
  created_at: string;
};

type EmailMessage = {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  subject: string | null;
  body: string;
  sender: string | null;
  recipient: string | null;
  cc_emails: string[];
  provider: string | null;
  delivery_status: string;
  delivery_detail: string | null;
  created_at: string;
};

type EmailThreadDetail = { thread: EmailThread; messages: EmailMessage[] };

type CommunicationLinkOption = {
  key: string;
  kind: "business_banking" | "financial_form" | "credit_authorization";
  label: string;
  form_kind: string | null;
  owner_id: string | null;
  recipient_contact_id: string | null;
  enabled: boolean;
  disabled_reason: string | null;
};

type CommunicationLink = {
  label: string;
  url: string;
  expires_at: string | null;
  required_recipient_contact_id: string | null;
  required_recipient_email: string | null;
  exclusive_recipient: boolean;
};

function when(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function deliveryTone(status: string): "ok" | "warn" | "bad" | "mut" {
  if (["sent", "delivered", "received", "opened"].includes(status)) return "ok";
  if (["failed", "blocked", "bounced", "complained"].includes(status)) return "bad";
  if (status === "queued") return "warn";
  return "mut";
}

type TimelineItem =
  | { key: string; createdAt: string; type: "portal"; message: ClientThreadMessage; sms: ClientSmsMessage | null }
  | { key: string; createdAt: string; type: "sms"; sms: ClientSmsMessage };

export function AIIntakeClientConversation({
  adapter,
  intakeId,
  profileId,
  clientName,
}: {
  adapter: LeadCockpitAdapter;
  intakeId: string;
  profileId: string | null;
  clientName?: string | null;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [response, setResponse] = useState<ClientThreadResponse>({ messages: [] });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showConsent, setShowConsent] = useState(false);
  const [consenterName, setConsenterName] = useState(clientName || "");
  const [transactional, setTransactional] = useState(true);
  const [marketing, setMarketing] = useState(false);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [resuming, setResuming] = useState(false);

  const smsConsent = useQuery({
    queryKey: ["application-sms-consent", profileId],
    enabled: Boolean(profileId),
    queryFn: () => apiCall<SmsConsentState>(`/application-profiles/${profileId}/communications/sms-consent`),
  });
  const disclosure = useQuery({
    queryKey: ["application-sms-disclosure", profileId],
    enabled: Boolean(profileId && showConsent),
    queryFn: () => apiCall<SmsDisclosure>(`/application-profiles/${profileId}/communications/sms-disclosure`),
  });

  const adopt = (next: ClientThreadResponse) => setResponse(next);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adapter.loadClientThread()
      .then((next) => { if (alive) adopt(next); })
      .catch((reason) => { if (alive) setError(reason instanceof Error ? reason.message : "Could not load the client conversation."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter]);

  const state = smsConsent.data ?? response.sms_state ?? null;
  const useSms = Boolean(smsConsent.data?.delivery_enabled);
  const sendBySms = Boolean(useSms && state?.can_send);

  const smsPreference = useMutation({
    mutationFn: (enabled: boolean) => apiCall<SmsConsentState>(`/application-profiles/${profileId}/communications/sms-preference`, {
      method: "PATCH",
      body: JSON.stringify({ enabled }),
    }),
    onSuccess: (next) => {
      qc.setQueryData(["application-sms-consent", profileId], next);
    },
  });

  const timeline = useMemo<TimelineItem[]>(() => {
    const latestByPortal = new Map<string, ClientSmsMessage>();
    const unlinked: ClientSmsMessage[] = [];
    for (const sms of response.sms_messages ?? []) {
      if (sms.portal_message_id) latestByPortal.set(sms.portal_message_id, sms);
      else if (sms.direction === "inbound" || sms.context.startsWith("intake_client")) unlinked.push(sms);
    }
    return [
      ...response.messages.map((message) => ({ key: `portal:${message.id}`, createdAt: message.created_at, type: "portal" as const, message, sms: latestByPortal.get(message.id) ?? null })),
      ...unlinked.map((sms) => ({ key: `sms:${sms.id}`, createdAt: sms.created_at, type: "sms" as const, sms })),
    ].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [response]);
  const latestOutboundSms = [...(response.sms_messages ?? [])]
    .reverse()
    .find((message) => message.direction === "outbound");
  const latestSmsFailure = latestOutboundSms?.status === "failed" ? latestOutboundSms : null;

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      adopt(await adapter.replyClientThread(text, sendBySms));
      setDraft("");
      if (profileId) void qc.invalidateQueries({ queryKey: ["application-sms-consent", profileId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  }

  const captureConsent = useMutation({
    mutationFn: () => apiCall<SmsConsentState>(`/application-profiles/${profileId}/communications/sms-consent`, {
      method: "POST",
      body: JSON.stringify({
        phone: state?.phone,
        transactional,
        marketing,
        accepted_legal: acceptedLegal,
        method: "rep_attested",
        consenter_name: consenterName.trim() || null,
      }),
    }),
    onSuccess: async (next) => {
      qc.setQueryData(["application-sms-consent", profileId], next);
      setShowConsent(false);
      setAcceptedLegal(false);
      adopt(await adapter.loadClientThread());
    },
  });

  async function retrySms(messageId: string) {
    setError("");
    try {
      adopt(await apiCall<ClientThreadResponse>(`/admin/ai-underwriter-leads/${intakeId}/client-thread/${messageId}/sms-retry`, { method: "POST" }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SMS retry failed.");
    }
  }

  async function resumeAI() {
    if (!adapter.resumeClientThreadAI || resuming) return;
    setResuming(true);
    try { adopt(await adapter.resumeClientThreadAI()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not hand the conversation back."); }
    finally { setResuming(false); }
  }

  const pauseMinutes = response.ai_paused_until
    ? Math.max(0, Math.ceil((new Date(response.ai_paused_until).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <section className="ai-intake-client-comms">
      <WarnLine>
        This is the <strong>client-facing</strong> conversation{clientName ? ` with ${clientName}` : ""}. Every reply goes to the secure portal; SMS can mirror the same reply when consent is active.
      </WarnLine>

      {response.ai_paused_until ? <Callout tone="warn" icon={<Icon name="user" size={16} />}>
        <b>You have the conversation.</b> The AI is standing by for about {pauseMinutes} {pauseMinutes === 1 ? "minute" : "minutes"}.
        {adapter.resumeClientThreadAI ? <Btn size="sm" onClick={() => void resumeAI()} disabled={resuming}>{resuming ? "Handing back…" : "Hand back to AI"}</Btn> : null}
      </Callout> : null}

      <div className="ai-intake-client-thread">
        <div className="ai-intake-client-timeline" aria-live="polite">
          {loading ? <div className="empty"><span className="spinner solo" />Loading client conversation…</div> : null}
          {!loading && timeline.length === 0 ? <div className="empty">No client messages yet.</div> : null}
          {timeline.map((item) => {
            if (item.type === "sms") {
              const inbound = item.sms.direction === "inbound";
              return <article key={item.key} className={cx("msg", inbound ? "client-ch" : "mine", "transport-sms-only")}>
                <div className="msg-h"><span className="msg-who">{inbound ? clientName || "Client" : "You"}</span><CellChip tone="pet">SMS</CellChip></div>
                <div className="msg-b">{item.sms.body || "Text message"}</div>
                <div className="msg-delivery"><span>{when(item.sms.created_at)}</span><CellChip tone={deliveryTone(item.sms.status)}>{item.sms.status}</CellChip></div>
              </article>;
            }
            const message = item.message;
            const isAI = message.role === "assistant";
            const isClient = !isAI && (message.sender_kind ? message.sender_kind === "client" : !(message.author_name || "").toLowerCase().startsWith("underwriter"));
            const label = isAI ? "AI" : message.author_name || (isClient ? clientName || "Client" : "You");
            return <article key={item.key} className={cx("msg", isAI ? "ai" : isClient ? "client-ch" : "mine")}>
              <div className="msg-h"><span className="msg-who">{label}</span><CellChip tone="acc">Portal</CellChip>{item.sms ? <CellChip tone={deliveryTone(item.sms.status)}>SMS · {item.sms.status}</CellChip> : null}</div>
              <div className="msg-b">{message.content}</div>
              <div className="msg-delivery"><span>{when(message.created_at)}</span>{item.sms && ["failed", "blocked"].includes(item.sms.status) ? <button type="button" className="linky" onClick={() => void retrySms(message.id)}>Retry SMS</button> : null}</div>
            </article>;
          })}
        </div>

        <div className="ai-intake-client-composer">
          {latestSmsFailure ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>
            <div className="sms-failure-alert-copy">
              <b>SMS delivery failed</b>
              <span>{latestSmsFailure.detail || "The SMS provider did not accept this message."}</span>
            </div>
            {latestSmsFailure.portal_message_id ? <Btn size="sm" onClick={() => void retrySms(latestSmsFailure.portal_message_id as string)}>Retry SMS</Btn> : null}
          </Callout> : null}
          <Lbl>Reply on behalf (as underwriter)</Lbl>
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }}
            rows={4}
            placeholder="Write a reply for the client…"
            aria-label="Reply on behalf (as underwriter)"
          />
          <div className="sms-delivery-row">
            <button
              type="button"
              role="switch"
              aria-checked={useSms}
              className={cx("sms-delivery-toggle", useSms && "on")}
              disabled={!profileId || smsPreference.isPending || (!useSms && !state?.can_send)}
              onClick={() => smsPreference.mutate(!useSms)}
              title={useSms ? "SMS stays on for this file until you turn it off" : state?.can_send ? "Keep sending client replies by SMS" : state?.blocked_reason || "SMS unavailable"}
            ><span aria-hidden="true" /><Icon name="phone" size={14} />Also send by SMS</button>
            <span className="sub">{state?.phone || "No mobile number"}{useSms ? state?.can_send ? " · stays on for this file" : ` · preference on · ${state?.blocked_reason || "SMS unavailable"}` : state?.can_send ? " · consent active" : state?.blocked_reason ? ` · ${state.blocked_reason}` : ""}</span>
            {profileId && state?.phone && !state.transactional_consented && !state.opted_out ? <Btn size="sm" onClick={() => setShowConsent((value) => !value)}>Record consent</Btn> : null}
          </div>
          {smsPreference.isError ? <Callout tone="bad">{smsPreference.error instanceof Error ? smsPreference.error.message : "The SMS preference could not be saved."}</Callout> : null}
          {error ? <Callout tone="bad" icon={<Icon name="alert" size={15} />}>{error}</Callout> : null}
          <div className="composer-row"><Btn variant="pri" onClick={() => void send()} disabled={sending || !draft.trim()}><Icon name="send" size={14} />{sending ? "Sending…" : sendBySms ? "Send to portal + SMS" : "Send to portal"}</Btn><span className="hint">Enter sends · Shift + Enter adds a line</span></div>
        </div>
      </div>

      {showConsent ? <div className="sms-consent-card">
        <div><Lbl>Client SMS consent</Lbl><Sub>Record only consent the owner of {state?.phone} gave after seeing this disclosure.</Sub></div>
        {disclosure.isLoading ? <div className="empty"><span className="spinner solo" />Loading disclosure…</div> : null}
        {disclosure.data ? <>
          <label className="consent-choice"><input type="checkbox" checked={transactional} onChange={(event) => setTransactional(event.target.checked)} /><span><b>Application messages</b><small>{disclosure.data.transactional}</small></span></label>
          <label className="consent-choice"><input type="checkbox" checked={marketing} onChange={(event) => setMarketing(event.target.checked)} /><span><b>Optional marketing messages</b><small>{disclosure.data.marketing}</small></span></label>
          <label className="consent-choice"><input type="checkbox" checked={acceptedLegal} onChange={(event) => setAcceptedLegal(event.target.checked)} /><span><b>Terms and privacy accepted</b><small>{disclosure.data.legal}</small></span></label>
          <Field label="Consenter name"><Input value={consenterName} onChange={(event) => setConsenterName(event.target.value)} placeholder="Full legal name" /></Field>
          {captureConsent.isError ? <Callout tone="bad">{captureConsent.error instanceof Error ? captureConsent.error.message : "Consent could not be recorded."}</Callout> : null}
          <div className="row"><Btn onClick={() => setShowConsent(false)}>Cancel</Btn><Btn variant="pri" disabled={captureConsent.isPending || !acceptedLegal || !transactional || !consenterName.trim()} onClick={() => captureConsent.mutate()}>{captureConsent.isPending ? "Recording…" : "Record consent"}</Btn></div>
        </> : null}
      </div> : null}
    </section>
  );
}

export function AIIntakeEmailWorkspace({ profileId, clientName }: { profileId: string; clientName?: string | null }) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [toContactId, setToContactId] = useState("");
  const [ccContactIds, setCcContactIds] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const [recipientLock, setRecipientLock] = useState<string | null>(null);
  const composeRef = useRef<HTMLTextAreaElement | null>(null);

  const contacts = useQuery({
    queryKey: ["application-communication-contacts", profileId],
    queryFn: () => apiCall<CommunicationContact[]>(`/application-profiles/${profileId}/communications/contacts`),
  });
  const threads = useQuery({
    queryKey: ["application-email-threads", profileId],
    queryFn: () => apiCall<EmailThread[]>(`/application-profiles/${profileId}/communications/email/threads`),
    refetchInterval: 10000,
  });
  const links = useQuery({
    queryKey: ["application-communication-links", profileId],
    queryFn: () => apiCall<CommunicationLinkOption[]>(`/application-profiles/${profileId}/communications/links`),
  });
  const detail = useQuery({
    queryKey: ["application-email-thread", profileId, selectedThreadId],
    enabled: Boolean(selectedThreadId && !composing),
    queryFn: () => apiCall<EmailThreadDetail>(`/application-profiles/${profileId}/communications/email/threads/${selectedThreadId}`),
    refetchInterval: 8000,
  });

  const availableContacts = useMemo(() => contacts.data ?? [], [contacts.data]);
  useEffect(() => {
    if (toContactId || !availableContacts.length) return;
    const primary = availableContacts.find((item) => item.is_primary && item.email) ?? availableContacts.find((item) => item.email);
    if (primary) setToContactId(primary.id);
  }, [availableContacts, toContactId]);
  useEffect(() => {
    if (selectedThreadId || composing || !threads.data?.length) return;
    setSelectedThreadId(threads.data[0].id);
  }, [threads.data, selectedThreadId, composing]);
  useEffect(() => {
    if (!threads.isLoading && !threads.data?.length) setComposing(true);
  }, [threads.isLoading, threads.data]);

  const createThread = useMutation({
    mutationFn: () => apiCall<EmailThreadDetail>(`/application-profiles/${profileId}/communications/email/threads`, {
      method: "POST",
      body: JSON.stringify({ to_contact_id: toContactId, cc_contact_ids: ccContactIds, subject: subject.trim(), body: body.trim() }),
    }),
    onSuccess: (created) => {
      qc.setQueryData(["application-email-thread", profileId, created.thread.id], created);
      void qc.invalidateQueries({ queryKey: ["application-email-threads", profileId] });
      setSelectedThreadId(created.thread.id);
      setComposing(false);
      setSubject(""); setBody(""); setCcContactIds([]); setLinkKey(""); setRecipientLock(null);
    },
  });
  const sendReply = useMutation({
    mutationFn: () => apiCall<EmailThreadDetail>(`/application-profiles/${profileId}/communications/email/threads/${selectedThreadId}/messages`, { method: "POST", body: JSON.stringify({ body: reply.trim() }) }),
    onSuccess: (next) => {
      qc.setQueryData(["application-email-thread", profileId, selectedThreadId], next);
      void qc.invalidateQueries({ queryKey: ["application-email-threads", profileId] });
      setReply("");
    },
  });
  const addLink = useMutation({
    mutationFn: () => {
      const option = (links.data ?? []).find((item) => item.key === linkKey);
      if (!option) throw new Error("Choose a link to insert.");
      return apiCall<CommunicationLink>(`/application-profiles/${profileId}/communications/links`, {
        method: "POST",
        body: JSON.stringify({ kind: option.kind, form_kind: option.form_kind, owner_id: option.owner_id }),
      });
    },
    onSuccess: (created) => {
      const input = composeRef.current;
      const start = input?.selectionStart ?? body.length;
      const end = input?.selectionEnd ?? start;
      const prefix = start > 0 && body[start - 1] !== "\n" ? "\n" : "";
      const suffix = end < body.length && body[end] !== "\n" ? "\n" : "";
      const insertion = `${prefix}${created.label}: ${created.url}${suffix}`;
      setBody((current) => `${current.slice(0, start)}${insertion}${current.slice(end)}`);
      if (created.exclusive_recipient && created.required_recipient_contact_id) {
        setToContactId(created.required_recipient_contact_id);
        setCcContactIds([]);
        setRecipientLock(created.required_recipient_contact_id);
      }
      requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + insertion.length, start + insertion.length); });
    },
  });

  const resetCompose = () => {
    setComposing(false); setSubject(""); setBody(""); setCcContactIds([]); setLinkKey(""); setRecipientLock(null);
    if (!selectedThreadId && threads.data?.[0]) setSelectedThreadId(threads.data[0].id);
  };
  const selectedContact = availableContacts.find((item) => item.id === toContactId);

  return <section className="ai-intake-email-workspace">
    <aside className="ai-intake-email-list">
      <div className="ai-intake-email-list-head"><div><Lbl>Email</Lbl><Sub>{clientName || "Client"} and verified file owners</Sub></div><Btn size="sm" variant="pri" onClick={() => setComposing(true)}><Icon name="plus" size={13} />New email</Btn></div>
      {threads.isLoading ? <div className="empty"><span className="spinner solo" />Loading email…</div> : null}
      {!threads.isLoading && !threads.data?.length ? <div className="empty">No email conversations yet.</div> : null}
      {(threads.data ?? []).map((thread) => <button key={thread.id} type="button" className={cx("ai-intake-email-thread-row", selectedThreadId === thread.id && !composing && "on")} onClick={() => { setSelectedThreadId(thread.id); setComposing(false); }}>
        <span><b>{thread.subject}</b><small>{thread.participant_names.join(", ") || thread.to_email}</small></span>
        <time>{when(thread.last_message_at || thread.created_at)}</time>
      </button>)}
    </aside>

    <div className="ai-intake-email-main">
      {composing ? <div className="ai-intake-email-compose">
        <header><div><Lbl>New email</Lbl><Sub>Recipients are limited to contacts verified on this file.</Sub></div>{recipientLock ? <CellChip tone="warn">Private credit recipient locked</CellChip> : null}</header>
        <Field label="To">
          <Select value={toContactId} onChange={(event) => setToContactId(event.target.value)} disabled={Boolean(recipientLock)}>
            <option value="">Choose a recipient</option>
            {availableContacts.map((contact) => <option key={contact.id} value={contact.id} disabled={!contact.email}>{contact.name}{contact.email ? ` — ${contact.email}` : " — no email"}</option>)}
          </Select>
        </Field>
        <Field label="Cc" hint={recipientLock ? "Credit authorization links cannot be copied to anyone else." : "Optional verified file contacts."}>
          <div className="email-cc-choices">
            {availableContacts.filter((contact) => contact.email && contact.id !== toContactId).map((contact) => <label key={contact.id}><input type="checkbox" disabled={Boolean(recipientLock)} checked={ccContactIds.includes(contact.id)} onChange={(event) => setCcContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />{contact.name}</label>)}
            {!availableContacts.some((contact) => contact.email && contact.id !== toContactId) ? <span className="sub">No additional file contacts have email addresses.</span> : null}
          </div>
        </Field>
        <Field label="Subject"><Input value={subject} maxLength={200} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject" /></Field>
        <Field label="Message">
          <textarea ref={composeRef} className="field" rows={10} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write your email…" />
        </Field>
        <div className="email-link-toolbar">
          <Select value={linkKey} onChange={(event) => setLinkKey(event.target.value)} aria-label="Secure link to insert">
            <option value="">Add a secure link…</option>
            {(links.data ?? []).map((option) => <option key={option.key} value={option.key} disabled={!option.enabled || Boolean(recipientLock && option.recipient_contact_id && option.recipient_contact_id !== recipientLock)}>{option.label}{option.disabled_reason ? ` — ${option.disabled_reason}` : ""}</option>)}
          </Select>
          <Btn disabled={!linkKey || addLink.isPending} onClick={() => addLink.mutate()}><Icon name="link" size={14} />{addLink.isPending ? "Creating link…" : "Insert link"}</Btn>
          <span className="sub">A fresh secure link is inserted at the cursor.</span>
        </div>
        {addLink.isError ? <Callout tone="bad">{addLink.error instanceof Error ? addLink.error.message : "The secure link could not be created."}</Callout> : null}
        {createThread.isError ? <Callout tone="bad">{createThread.error instanceof Error ? createThread.error.message : "The email could not be sent."}</Callout> : null}
        <div className="email-compose-actions"><Btn onClick={resetCompose}>Cancel</Btn><Btn variant="pri" disabled={createThread.isPending || !selectedContact?.email || !subject.trim() || !body.trim()} onClick={() => createThread.mutate()}><Icon name="send" size={14} />{createThread.isPending ? "Sending…" : "Send email"}</Btn></div>
      </div> : selectedThreadId ? <div className="ai-intake-email-detail">
        {detail.isLoading ? <div className="empty"><span className="spinner solo" />Loading thread…</div> : null}
        {detail.isError ? <Callout tone="bad">{detail.error instanceof Error ? detail.error.message : "Email thread unavailable."}</Callout> : null}
        {detail.data ? <>
          <header className="ai-intake-email-detail-head"><div><h3>{detail.data.thread.subject}</h3><Sub>To {detail.data.thread.to_email}{detail.data.thread.cc_emails.length ? ` · Cc ${detail.data.thread.cc_emails.join(", ")}` : ""}</Sub></div><CellChip tone={detail.data.thread.can_reply ? "ok" : "mut"}>{detail.data.thread.owner_name || detail.data.thread.owner_email || "Firm mailbox"}</CellChip></header>
          <div className="ai-intake-email-messages">
            {detail.data.messages.map((message) => <article key={message.id} className={cx("email-message", message.direction)}>
              <div className="email-message-head"><b>{message.direction === "outbound" ? "You" : message.sender || "Client"}</b><span>{when(message.created_at)}</span></div>
              <p>{message.body}</p>
              <div className="email-message-meta"><CellChip tone={message.direction === "inbound" ? "acc" : deliveryTone(message.delivery_status)}>{message.direction === "inbound" ? "Reply received" : message.delivery_status}</CellChip>{message.provider ? <span>{message.provider}</span> : null}{message.delivery_detail && ["failed", "blocked", "bounced", "complained"].includes(message.delivery_status) ? <span>{message.delivery_detail}</span> : null}</div>
            </article>)}
          </div>
          {detail.data.thread.can_reply ? <div className="ai-intake-email-reply"><Textarea rows={4} value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Reply by email…" aria-label="Email reply" />{sendReply.isError ? <Callout tone="bad">{sendReply.error instanceof Error ? sendReply.error.message : "Reply failed."}</Callout> : null}<div className="row"><span className="sub">Replies sync here when the connected mailbox receives them.</span><span className="sp" /><Btn variant="pri" disabled={sendReply.isPending || !reply.trim()} onClick={() => sendReply.mutate()}><Icon name="send" size={14} />{sendReply.isPending ? "Sending…" : "Send reply"}</Btn></div></div> : <Callout tone="mut">This thread belongs to {detail.data.thread.owner_name || detail.data.thread.owner_email || "another mailbox"}. Start a new email to reply from your mailbox.</Callout>}
        </> : null}
      </div> : <div className="empty">Choose an email thread or start a new email.</div>}
    </div>
  </section>;
}
