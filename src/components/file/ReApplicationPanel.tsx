"use client";

// The desk's view of a file's real-estate loan application: what onboarding
// already answered (with where each answer came from), what is still needed,
// stored values that were dropped because they were not what their field
// claims, and the actions around it: email the client a link, copy it,
// preview the PDF, download a submitted version. The desk may answer for the
// client during a call; the client still reviews and signs.

import { useCallback, useEffect, useState } from "react";
import { Btn, Callout, Input, StatusLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError, apiBase } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { ReApplicationForm } from "@/components/application/ReApplicationForm";
import { useApplicationDraft, type DraftPayload, type SaveError } from "@/components/application/useApplicationDraft";
import type { ApplicationView, SigningView } from "@/lib/reApplication";

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
  const [link, setLink] = useState<{ url: string; email: string | null; emailed: boolean } | null>(null);
  const [busy, setBusy] = useState("");

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

  async function makeLink(sendEmail: boolean) {
    setBusy(sendEmail ? "email" : "copy");
    setNotice(null);
    try {
      const reply = await apiCall<{ url: string; email: string | null; emailed: boolean }>(`${PATH(profileId)}/link`, { method: "POST", body: JSON.stringify({ send_email: sendEmail }) });
      setLink(reply);
      if (!sendEmail) await navigator.clipboard?.writeText(reply.url).catch(() => undefined);
      setNotice({ tone: "ok", text: sendEmail ? (reply.emailed ? `Emailed the link to ${reply.email}.` : "The link was made, but the email did not send. Copy it below.") : "Link copied. The client opens it with a code emailed to them." });
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
      <Btn variant="pri" disabled={Boolean(busy)} onClick={() => void makeLink(true)}><Icon name="send" size={14} />{busy === "email" ? "Sending…" : "Email the client a link"}</Btn>
      <Btn disabled={Boolean(busy)} onClick={() => void makeLink(false)}><Icon name="copy" size={14} />Copy a link</Btn>
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
      {link ? <Callout tone="acc"><span style={{ overflowWrap: "anywhere" }}>{link.url}</span></Callout> : null}
      {loading && !view ? <div className="empty"><span className="spinner solo" />Loading the application…</div> : null}
      {view ? (
        <ReApplicationForm view={view} body={draft.body} problems={draft.problems} busy={Boolean(busy)} audience="desk" onValue={draft.setValue} onConfirm={draft.confirm} onCoborrower={draft.setCoborrower} />
      ) : null}
    </Drawer>
  );
}
