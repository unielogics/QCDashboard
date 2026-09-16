"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Callout, Field, IconBtn, Input, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { useActiveProfile } from "@/store/role";
import type { ApplicationTermSheet } from "@/lib/applicationProfile";

type Props = {
  profileId: string;
  terms: ApplicationTermSheet;
  defaultRecipient?: string | null;
  contactSuppressed?: boolean;
  onEdit: () => void;
};

function responseFilename(response: Response): string {
  const disposition = response.headers.get("Content-Disposition") ?? "";
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1];
  const plain = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const raw = utf8 ?? plain;
  if (!raw) return "loan-terms.pdf";
  try {
    return decodeURIComponent(raw.trim());
  } catch {
    return raw.trim();
  }
}

async function responseError(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null) as { detail?: unknown } | null;
  if (typeof payload?.detail === "string" && payload.detail.trim()) return payload.detail;
  if (payload?.detail && typeof payload.detail === "object" && "message" in payload.detail) {
    const message = (payload.detail as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return `The loan-terms PDF could not be created (${response.status}).`;
}

export function DealerTermSheetDocumentActions({
  profileId,
  terms,
  defaultRecipient,
  contactSuppressed = false,
  onEdit,
}: Props) {
  const { getToken, isLoaded, isSignedIn } = useConsoleAuth();
  const call = useAuthedApi();
  const devUser = visualQaUser(useActiveProfile().email);
  const previewUrlRef = useRef<string | null>(null);
  const previewControllerRef = useRef<AbortController | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<"preview" | "download" | "email" | "">("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [deliveryKey, setDeliveryKey] = useState("");
  const [emailTo, setEmailTo] = useState(defaultRecipient ?? "");
  const [emailCc, setEmailCc] = useState("");
  const [emailSubject, setEmailSubject] = useState("Your loan terms from Qualified Commercial");
  const [emailBody, setEmailBody] = useState("We have prepared the attached loan terms for your review. Please reply with any questions or requested changes.");

  const clearPreviewUrl = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = null;
    setPreviewUrl(null);
  };

  useEffect(() => () => {
    previewControllerRef.current?.abort();
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    previewControllerRef.current?.abort();
    previewControllerRef.current = null;
    clearPreviewUrl();
    setPreviewOpen(false);
    setEmailOpen(false);
    setDeliveryKey("");
    setEmailTo(defaultRecipient ?? "");
    setError("");
    setNotice("");
    // Every recorded version is a different document. Never leave the prior
    // version visible after the strip refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileId, terms.version]);

  async function pdfResponse(disposition: "inline" | "attachment", signal?: AbortSignal): Promise<Response> {
    if (!isLoaded) throw new Error("Your session is still loading. Try the PDF again in a moment.");
    const token = isSignedIn ? await getToken() : null;
    const response = await fetch(
      `${apiBase}/api/v1/production-packages/term-sheets/${profileId}/client.pdf?expected_version=${terms.version}&disposition=${disposition}`,
      {
        signal,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(devUser ? { "X-Dev-User": devUser } : {}),
        },
      },
    );
    if (!response.ok) throw new Error(await responseError(response));
    return response;
  }

  async function previewPdf() {
    previewControllerRef.current?.abort();
    const controller = new AbortController();
    previewControllerRef.current = controller;
    setPreviewOpen(true);
    setBusy("preview");
    setError("");
    setNotice("");
    try {
      const response = await pdfResponse("inline", controller.signal);
      const url = URL.createObjectURL(await response.blob());
      if (controller.signal.aborted || previewControllerRef.current !== controller) {
        URL.revokeObjectURL(url);
        return;
      }
      clearPreviewUrl();
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (reason) {
      if (!(reason instanceof DOMException && reason.name === "AbortError")) {
        setError(reason instanceof Error ? reason.message : "The loan-terms PDF could not be opened.");
      }
    } finally {
      if (previewControllerRef.current === controller) {
        previewControllerRef.current = null;
        setBusy("");
      }
    }
  }

  function closePreview() {
    previewControllerRef.current?.abort();
    previewControllerRef.current = null;
    setBusy((current) => current === "preview" ? "" : current);
    setPreviewOpen(false);
    clearPreviewUrl();
    setError("");
  }

  async function downloadPdf() {
    setBusy("download");
    setError("");
    setNotice("");
    try {
      const response = await pdfResponse("attachment");
      const filename = responseFilename(response);
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setNotice(`${filename} downloaded.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The loan-terms PDF could not be downloaded.");
    } finally {
      setBusy("");
    }
  }

  function openEmail() {
    setError("");
    setNotice("");
    // The email composer replaces the preview. Keeping both open creates two
    // modal focus traps and makes Escape close an unpredictable surface.
    closePreview();
    setEmailTo(defaultRecipient ?? "");
    if (!deliveryKey) setDeliveryKey(crypto.randomUUID());
    setEmailOpen(true);
  }

  async function sendEmail() {
    if (!deliveryKey) return;
    setBusy("email");
    setError("");
    try {
      const result = await call<{ sent: boolean; filename: string }>(
        `/production-packages/term-sheets/${profileId}/client/email`,
        {
          method: "POST",
          body: JSON.stringify({
            expected_version: terms.version,
            delivery_key: deliveryKey,
            to_emails: emailTo.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
            cc_emails: emailCc.split(/[;,]/).map((value) => value.trim()).filter(Boolean),
            subject: emailSubject.trim(),
            body: emailBody.trim(),
          }),
        },
      );
      setEmailOpen(false);
      setDeliveryKey("");
      setNotice(`${result.filename} was emailed successfully.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The loan-terms email could not be sent.");
    } finally {
      setBusy("");
    }
  }

  const emailTitle = contactSuppressed
    ? "Direct client email is suppressed on this referral-managed file"
    : "Email loan terms";

  return (
    <>
      <div className="dealer-term-document-actions" role="group" aria-label="Loan terms document actions">
        <IconBtn onClick={onEdit} aria-label="Edit loan terms" title="Edit loan terms">
          <Icon name="pencil" size={15} />
        </IconBtn>
        <IconBtn onClick={() => void previewPdf()} aria-label="Preview loan terms PDF" title="Preview loan terms PDF" disabled={busy !== "" || !isLoaded}>
          <Icon name="eye" size={15} />
        </IconBtn>
        <IconBtn onClick={() => void downloadPdf()} aria-label="Download loan terms PDF" title="Download loan terms PDF" disabled={busy !== "" || !isLoaded}>
          <Icon name="download" size={15} />
        </IconBtn>
        <IconBtn onClick={openEmail} aria-label={emailTitle} title={emailTitle} disabled={busy !== "" || !isLoaded || contactSuppressed}>
          <Icon name="mail" size={15} />
        </IconBtn>
      </div>
      {busy ? <span className="dealer-term-document-status" role="status" aria-live="polite">{busy === "preview" ? "Building preview…" : busy === "download" ? "Preparing download…" : "Sending…"}</span> : null}
      {error && !emailOpen ? <span className="dealer-term-document-status c-bad" role="alert">{error}</span> : null}
      {notice ? <span className="dealer-term-document-status c-ok" role="status">{notice}</span> : null}

      <Drawer
        open={previewOpen}
        onClose={closePreview}
        title={`Loan terms · version ${terms.version}`}
        sub="Client-facing PDF generated from the current recorded production term sheet."
        width="xl"
        bodyClass="dealer-term-preview-body"
        headerActions={(
          <>
            <IconBtn onClick={() => void downloadPdf()} aria-label="Download loan terms PDF" title="Download PDF" disabled={busy !== ""}>
              <Icon name="download" size={15} />
            </IconBtn>
            <IconBtn onClick={openEmail} aria-label={emailTitle} title={emailTitle} disabled={busy !== "" || !isLoaded || contactSuppressed}>
              <Icon name="mail" size={15} />
            </IconBtn>
          </>
        )}
      >
        {error ? <Callout tone="bad"><span role="alert">{error}</span></Callout> : null}
        {busy === "preview" && !previewUrl ? <div className="dealer-term-preview-loading" role="status">Generating the current loan-terms PDF…</div> : null}
        {previewUrl ? <iframe className="dealer-term-preview-frame" src={previewUrl} title={`Loan terms PDF version ${terms.version}`} /> : null}
      </Drawer>

      <Drawer
        open={emailOpen}
        onClose={() => { if (busy !== "email") { setEmailOpen(false); setError(""); } }}
        title="Email loan terms"
        sub={`The attached PDF will match recorded term sheet version ${terms.version}.`}
        width="md"
        closeOnBackdrop={busy !== "email"}
        footer={(
          <>
            <Btn onClick={() => setEmailOpen(false)} disabled={busy === "email"}>Cancel</Btn>
            <span className="sp" />
            <Btn variant="pri" onClick={() => void sendEmail()} disabled={busy === "email" || !emailTo.trim() || !emailSubject.trim() || !emailBody.trim()}>
              {busy === "email" ? "Sending…" : "Send PDF"}
            </Btn>
          </>
        )}
      >
        <div className="grid g12">
          {error ? <Callout tone="bad"><span role="alert">{error}</span></Callout> : null}
          <Field label="To"><Input aria-label="Loan terms email recipients" value={emailTo} onChange={(event) => setEmailTo(event.target.value)} placeholder="client@example.com" /></Field>
          <Field label="Cc"><Input aria-label="Loan terms cc recipients" value={emailCc} onChange={(event) => setEmailCc(event.target.value)} placeholder="Optional; separate addresses with commas" /></Field>
          <Field label="Subject"><Input aria-label="Loan terms email subject" value={emailSubject} onChange={(event) => setEmailSubject(event.target.value)} /></Field>
          <Field label="Message"><Textarea aria-label="Loan terms email message" rows={7} value={emailBody} onChange={(event) => setEmailBody(event.target.value)} /></Field>
        </div>
      </Drawer>
    </>
  );
}
