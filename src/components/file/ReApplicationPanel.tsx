"use client";

// The desk's view of a file's real-estate loan application: what onboarding
// already answered (with where each answer came from), what is still needed,
// stored values that were dropped because they were not what their field
// claims, and the actions around it: email the client a link, copy it,
// preview the PDF, download a submitted version. The desk may answer for the
// client during a call; the client still reviews and signs.

import { useCallback, useEffect, useState } from "react";
import { Btn, Callout, Field, Input, StatusLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError, apiBase } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { ReApplicationForm } from "@/components/application/ReApplicationForm";
import { useApplicationDraft, type DraftPayload, type SaveError } from "@/components/application/useApplicationDraft";
import { applicationLinkWords, useApplicationLink, type ApplicationLinkOptions } from "@/components/application/useApplicationLink";
import type { ApplicationView, PartnerShareResult, RelayView, SigningView } from "@/lib/reApplication";

const ROLE_WORDS: Record<string, string> = { borrower: "Borrower", coborrower: "Co-borrower" };

function SigningStatus({ signing, formStatus, busy, onReopen }: { signing: SigningView; formStatus: ApplicationView["status"]; busy: boolean; onReopen: (reason: string) => void }) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const waiting = signing.required_roles.filter((role) => !signing.signed[role]);
  const signedAndChanging = signing.status === "executed" && formStatus === "draft";
  const canReopen = formStatus === "submitted" && (signing.status === "in_progress" || signing.status === "ready" || signing.status === "executed");
  const words = signedAndChanging
    ? "The signed version stays on file. The client is changing the application; the new version is signed again once it is submitted."
    : signing.status === "executed"
    ? "Signed by everyone. The signed application is filed on the checklist."
    : signing.status === "in_progress"
      ? `Signed by ${Object.keys(signing.signed).map((role) => signing.signed[role].name || ROLE_WORDS[role]).join(", ")}; waiting for ${waiting.map((role) => ROLE_WORDS[role] || role).join(", ")}.`
      : signing.status === "ready"
        ? "Submitted and ready to sign."
        : "Not submitted yet.";
  return (
    <Callout tone={signing.status === "executed" ? "ok" : signing.held ? "bad" : "acc"}>
      <strong>Signing</strong> {words}
      {signing.held ? " Signing is paused while the personal-use review is open." : null}
      {!signing.signing_open ? " Signing is closed until the consent wording is approved (Settings → Signed forms)." : null}
      {canReopen && !asking ? <> <Btn size="sm" disabled={busy} onClick={() => setAsking(true)}>{signing.status === "executed" ? "Start a new version" : "Reopen for changes"}</Btn></> : null}
      {asking ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          <Input aria-label="Why the application is reopened" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is it being reopened?" style={{ flex: "1 1 220px" }} />
          <Btn size="sm" variant="pri" disabled={busy || reason.trim().length < 3} onClick={() => { onReopen(reason.trim()); setAsking(false); setReason(""); }}>Reopen</Btn>
          <Btn size="sm" disabled={busy} onClick={() => setAsking(false)}>Cancel</Btn>
        </div>
      ) : null}
    </Callout>
  );
}

type ShareInput = { recipient_name: string; organization: string; recipient_email: string };

function shortDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

function copyText(text: string) {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

// Lenders the desk submits to receive the signed application in their
// package. This is for anyone else the client's information-sharing consent
// covers: a link to the signed application only, opened with a code, ending
// after seven days, and logged on the client's timeline.
function PartnerShare({ relay, busy, onShare }: { relay: RelayView; busy: boolean; onShare: (input: ShareInput) => Promise<PartnerShareResult | null> }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ShareInput>({ recipient_name: "", organization: "", recipient_email: "" });
  const [made, setMade] = useState<PartnerShareResult | null>(null);
  if (!relay.signed) return null;
  if (!relay.signed.sharing_consent) {
    return <Callout tone="acc"><strong>Sharing</strong> The signed application does not include the information-sharing consent, so it cannot be shared from here.</Callout>;
  }
  const email = draft.recipient_email.trim();
  const valid = draft.recipient_name.trim().length >= 2 && (!email || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email));
  async function submit() {
    const reply = await onShare(draft);
    if (reply) {
      setMade(reply);
      setOpen(false);
      setDraft({ recipient_name: "", organization: "", recipient_email: "" });
    }
  }
  return (
    <section className="ra-relay" aria-label="Share with a partner">
      <div className="ra-relay-head">
        <strong>Share with a partner</strong>
        <span className="sub">Lenders you submit to get the signed application in their package. For anyone else the client's consent covers, make a link to the signed application only. It opens with a code and ends after 7 days, and the client sees it on their timeline.</span>
      </div>
      {relay.shares.length ? (
        <ul className="ra-relay-list">
          {relay.shares.map((share) => (
            <li key={share.id}>
              <span className="ra-relay-who">{share.recipient}</span>
              <span className="sub">{share.active ? `Open until ${shortDate(share.expires_at)}` : "Ended"} · {share.views} {share.views === 1 ? "view" : "views"} · {share.downloads} {share.downloads === 1 ? "download" : "downloads"}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {made ? (
        <Callout tone="ok">
          <div>Link for {made.recipient}, open until {shortDate(made.expires_at)}. Send the link and the code separately. The code is not shown again.</div>
          <div className="ra-relay-secret"><span className="ra-relay-url">{made.share_url}</span><Btn size="sm" onClick={() => copyText(made.share_url)}><Icon name="copy" size={13} />Copy link</Btn></div>
          <div className="ra-relay-secret"><span>Code <strong>{made.passcode}</strong></span><Btn size="sm" onClick={() => copyText(made.passcode)}><Icon name="copy" size={13} />Copy code</Btn></div>
        </Callout>
      ) : null}
      {open ? (
        <div className="ra-relay-form">
          <Field label="Who receives it"><Input aria-label="Who receives it" autoFocus maxLength={180} value={draft.recipient_name} onChange={(event) => setDraft((value) => ({ ...value, recipient_name: event.target.value }))} placeholder="Full name" /></Field>
          <Field label="Company (optional)"><Input aria-label="Company (optional)" maxLength={180} value={draft.organization} onChange={(event) => setDraft((value) => ({ ...value, organization: event.target.value }))} placeholder="For example: Bridge Lending Partners" /></Field>
          <Field label="Their email (optional)"><Input aria-label="Their email (optional)" type="email" maxLength={320} value={draft.recipient_email} onChange={(event) => setDraft((value) => ({ ...value, recipient_email: event.target.value }))} placeholder="name@company.com" /></Field>
          <div className="ra-relay-actions">
            <Btn variant="pri" size="sm" disabled={busy || !valid} onClick={() => void submit()}>Make the link</Btn>
            <Btn size="sm" disabled={busy} onClick={() => setOpen(false)}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <div><Btn size="sm" disabled={busy} onClick={() => { setOpen(true); setMade(null); }}><Icon name="link" size={13} />Share with a partner</Btn></div>
      )}
    </section>
  );
}

// The file's own address for this application: the same one every time it is
// copied, so the desk can paste it into a text or an email of its own. The
// client opens it with a code emailed to them. A co-borrower has their own
// link while the application waits for their signature.
function ApplicationLinkSection({ link, waitingOnCoborrower, busy, onCopy, onReset, onCoborrower }: {
  link: { url: string; expires_at: string | null } | null;
  waitingOnCoborrower: boolean;
  busy: boolean;
  onCopy: () => void;
  onReset: () => void;
  onCoborrower: (email: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <section className="ra-relay" aria-label="Application link">
      <div className="ra-relay-head">
        <strong>Application link</strong>
        <span className="sub">One address for this file, the same every time you copy it. The client opens it with a code we email them, so the link alone opens nothing.</span>
      </div>
      {link ? (
        <div className="ra-relay-secret"><span className="ra-relay-url">{link.url}</span><Btn size="sm" variant="pri" disabled={busy} onClick={onCopy}><Icon name="copy" size={13} />Copy link</Btn></div>
      ) : (
        <div><Btn size="sm" variant="pri" disabled={busy} onClick={onCopy}><Icon name="link" size={13} />Copy the link</Btn></div>
      )}
      {link?.expires_at ? <span className="sub">Open until {shortDate(link.expires_at)}. Copying it again keeps it open for another 30 days.</span> : null}
      {waitingOnCoborrower ? (
        <div className="ra-relay-actions">
          <Btn size="sm" disabled={busy} onClick={() => onCoborrower(false)}><Icon name="copy" size={13} />Copy the co-borrower&apos;s signing link</Btn>
          <Btn size="sm" disabled={busy} onClick={() => onCoborrower(true)}><Icon name="send" size={13} />Email it to the co-borrower</Btn>
        </div>
      ) : null}
      {link ? (
        confirming ? (
          <div className="ra-relay-actions">
            <span className="sub">The current link stops working for everyone who has it.</span>
            <Btn size="sm" disabled={busy} onClick={() => { setConfirming(false); onReset(); }}>Make a new link</Btn>
            <Btn size="sm" disabled={busy} onClick={() => setConfirming(false)}>Cancel</Btn>
          </div>
        ) : (
          <div><button type="button" className="linky" disabled={busy} onClick={() => setConfirming(true)}>Replace this link with a new one</button></div>
        )
      ) : null}
    </section>
  );
}

const PATH = (profileId: string) => `/application-profiles/${profileId}/forms/re_application`;

function asSaveError(error: unknown): SaveError {
  if (error instanceof ApiError) {
    const failure = new Error(error.message) as SaveError;
    failure.status = error.status;
    failure.detail = (error.body as { detail?: unknown } | undefined)?.detail;
    return failure;
  }
  return error as SaveError;
}

export function ReApplicationPanel({ profileId, open, onClose }: { profileId: string; open: boolean; onClose: () => void }) {
  const apiCall = useAuthedApi();
  const { getToken } = useConsoleAuth();
  const [view, setView] = useState<ApplicationView | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState("");
  const requestLink = useApplicationLink();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setView(await apiCall<ApplicationView>(PATH(profileId)));
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "The application could not be loaded." });
    } finally {
      setLoading(false);
    }
  }, [apiCall, profileId]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const save = useCallback(async (payload: DraftPayload) => {
    try {
      return await apiCall<ApplicationView>(PATH(profileId), { method: "PUT", body: JSON.stringify(payload) });
    } catch (error) {
      throw asSaveError(error);
    }
  }, [apiCall, profileId]);
  const draft = useApplicationDraft(view, save, setView, () => void load());

  async function makeLink(options: ApplicationLinkOptions, working: string) {
    setBusy(working);
    setNotice(null);
    try {
      const result = await requestLink(profileId, options);
      if (result.role === "borrower") setView((current) => current ? { ...current, link: { url: result.url, expires_at: result.expires_at } } : current);
      const sent = options.sendEmail ? result.emailed : result.copied;
      setNotice({ tone: sent ? "ok" : "bad", text: options.sendEmail && !result.emailed ? "The email did not send. Copy the link and send it yourself." : applicationLinkWords(result) });
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "The link could not be made." });
    } finally {
      setBusy("");
    }
  }

  async function reopen(reason: string) {
    setBusy("reopen");
    const wasSigned = view?.signing?.status === "executed";
    try {
      setView(await apiCall<ApplicationView>(`${PATH(profileId)}/reopen`, { method: "POST", body: JSON.stringify({ reason }) }));
      setNotice({ tone: "ok", text: wasSigned ? "Reopened as a new version. The signed version stays on file; the client changes the application and signs again." : "Reopened. Signatures already given on this version were voided; the client can change and submit again." });
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "The application could not be reopened." });
    } finally {
      setBusy("");
    }
  }

  async function share(input: ShareInput): Promise<PartnerShareResult | null> {
    setBusy("share");
    setNotice(null);
    try {
      const reply = await apiCall<PartnerShareResult>(`${PATH(profileId)}/share`, {
        method: "POST",
        body: JSON.stringify({ recipient_name: input.recipient_name.trim(), organization: input.organization.trim() || null, recipient_email: input.recipient_email.trim() || null }),
      });
      setView((current) => current?.relay ? { ...current, relay: { ...current.relay, shares: [{ id: reply.share_id, recipient: reply.recipient, created_at: new Date().toISOString(), expires_at: reply.expires_at, active: true, views: 0, downloads: 0 }, ...current.relay.shares] } } : current);
      return reply;
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "The link could not be made." });
      return null;
    } finally {
      setBusy("");
    }
  }

  async function openPdf(path: string) {
    setBusy("pdf");
    try {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
      if (!response.ok) throw new Error("The PDF could not be opened.");
      const url = URL.createObjectURL(await response.blob());
      window.open(url, "_blank", "noopener");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      setNotice({ tone: "bad", text: error instanceof Error ? error.message : "The PDF could not be opened." });
    } finally {
      setBusy("");
    }
  }

  const footer = view ? (
    <div className="row" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
      <Btn variant="pri" disabled={Boolean(busy)} onClick={() => void makeLink({ sendEmail: true }, "email")}><Icon name="send" size={14} />{busy === "email" ? "Sending…" : "Email the client a link"}</Btn>
      <Btn disabled={Boolean(busy)} onClick={() => void makeLink({}, "copy")}><Icon name="copy" size={14} />Copy link</Btn>
      <Btn disabled={Boolean(busy)} onClick={() => void openPdf(`${PATH(profileId)}/preview.pdf`)}><Icon name="eye" size={14} />Preview PDF</Btn>
      {view.version?.pdf_available ? <Btn disabled={Boolean(busy)} onClick={() => void openPdf(`${PATH(profileId)}/versions/${view.version?.id}/pdf`)}><Icon name="download" size={14} />Version {view.version.number}</Btn> : null}
      <span className="sub">{draft.saving ? "Saving…" : draft.error || ""}</span>
    </div>
  ) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Real estate loan application"
      sub={view ? `${view.completion.filled} of ${view.completion.total} answered · ${view.status === "submitted" ? `submitted, version ${view.version?.number}` : "draft"}` : "Loading…"}
      footer={footer}
      width="lg"
    >
      {notice ? <StatusLine tone={notice.tone}>{notice.text}</StatusLine> : null}
      {view?.signing ? <SigningStatus signing={view.signing} formStatus={view.status} busy={Boolean(busy)} onReopen={(reason) => void reopen(reason)} /> : null}
      {view?.relay ? <PartnerShare relay={view.relay} busy={Boolean(busy)} onShare={share} /> : null}
      {view?.changed_since_submission?.length ? (
        <Callout tone="warn">
          <strong>The file changed after this version was submitted.</strong> {view.changed_since_submission.map((item) => item.label).join(", ")}. The submitted application is unchanged; reopen it to include {view.changed_since_submission.length === 1 ? "the change" : "the changes"}.
        </Callout>
      ) : null}
      {view ? (
        <ApplicationLinkSection
          link={view.link ?? null}
          waitingOnCoborrower={Boolean(view.signing && view.signing.status === "in_progress" && view.signing.required_roles.includes("coborrower") && !view.signing.signed.coborrower)}
          busy={Boolean(busy)}
          onCopy={() => void makeLink({}, "copy")}
          onReset={() => void makeLink({ reset: true }, "reset")}
          onCoborrower={(email) => void makeLink({ role: "coborrower", sendEmail: email }, "coborrower")}
        />
      ) : null}
      {loading && !view ? <div className="empty"><span className="spinner solo" />Loading the application…</div> : null}
      {view ? (
        <ReApplicationForm view={view} body={draft.body} problems={draft.problems} busy={Boolean(busy)} audience="desk" onValue={draft.setValue} onConfirm={draft.confirm} onCoborrower={draft.setCoborrower} />
      ) : null}
    </Drawer>
  );
}
