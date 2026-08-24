"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { QCMark } from "@/components/QCMark";
import { apiBase } from "@/lib/api";
import {
  clearRoomHandoff,
  stashApplicationVerificationHandoff,
} from "@/lib/roomPlaidHandoff";

type BankConnection = {
  id: string;
  institution_name: string | null;
  accounts_label: string | null;
  status: string;
  is_primary_operating: boolean;
  last_pulled_at: string | null;
  statement_months: string[];
};

type Verification = {
  business_name: string;
  disclosure_version: string;
  disclosure_text: string;
  consent_granted: boolean;
  items: BankConnection[];
  manual_statement_months: string[];
  statement_upload_enabled: boolean;
  expires_at: string;
};

const ACCEPT = ".pdf,.csv,.xlsx,.xls,.zip,.png,.jpg,.jpeg,.webp,image/*";

async function publicCall<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}/api/v1${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail || "This request could not be completed.");
  }
  return response.json() as Promise<T>;
}

export default function ApplicationVerificationPage() {
  const picker = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState("");
  const [data, setData] = useState<Verification | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [signer, setSigner] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async (activeToken: string) => {
    const result = await publicCall<Verification>(
      `/application-profiles/public/bank-verification/${encodeURIComponent(activeToken)}`,
    );
    setData(result);
  }, []);

  useEffect(() => {
    const activeToken = new URLSearchParams(window.location.hash.slice(1)).get("t") || "";
    setToken(activeToken);
    if (!activeToken) {
      setError("This secure verification link is incomplete.");
      setLoading(false);
      return;
    }
    load(activeToken)
      .catch((reason) => setError(reason instanceof Error ? reason.message : "This link is unavailable."))
      .finally(() => setLoading(false));
  }, [load]);

  const onPlaidSuccess = useCallback(
    async (publicToken: string | null, metadata: { institution?: { name?: string } | null }) => {
      if (!publicToken || !token) return;
      setBusy(true);
      setError("");
      try {
        await publicCall(
          `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/exchange`,
          {
            method: "POST",
            body: JSON.stringify({
              public_token: publicToken,
              institution_name: metadata.institution?.name ?? null,
              is_primary_operating: !data?.items.length,
            }),
          },
        );
        clearRoomHandoff();
        setLinkToken(null);
        setMessage("Business bank connected. You can add another institution or finish here.");
        await load(token);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "The bank connection could not be saved.");
      } finally {
        setBusy(false);
      }
    },
    [data?.items.length, load, token],
  );

  const { open, ready, error: plaidError } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  });

  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, open, ready]);

  useEffect(() => {
    if (plaidError) setError("The secure bank connection window could not load.");
  }, [plaidError]);

  async function authorize() {
    if (!token || !agreed || signer.trim().length < 2) return;
    setBusy(true);
    setError("");
    try {
      const result = await publicCall<Verification>(
        `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/consent`,
        {
          method: "POST",
          body: JSON.stringify({ granted: true, consenter_name: signer.trim() }),
        },
      );
      setData(result);
      setMessage("Authorization recorded. You may now connect the business bank.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Authorization could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  async function connectBank() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      const result = await publicCall<{ link_token: string }>(
        `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/link-token`,
        { method: "POST" },
      );
      stashApplicationVerificationHandoff({
        linkToken: result.link_token,
        token,
        returnTo: window.location.href,
      });
      setLinkToken(result.link_token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bank connection could not start.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFiles(files: File[]) {
    if (!token || !files.length) return;
    setBusy(true);
    setError("");
    let count = 0;
    try {
      for (const file of files) {
        setMessage(`Uploading ${file.name} (${count + 1} of ${files.length})`);
        const init = await publicCall<{
          file_id: string;
          upload_url: string;
          required_headers: Record<string, string>;
        }>(
          `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/files/upload-init`,
          {
            method: "POST",
            body: JSON.stringify({
              file_name: file.name,
              content_type: file.type || "application/octet-stream",
              size_bytes: file.size,
            }),
          },
        );
        const upload = await fetch(init.upload_url, {
          method: "PUT",
          headers: init.required_headers,
          body: file,
        });
        if (!upload.ok) throw new Error(`${file.name} could not be uploaded.`);
        await publicCall(
          `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/files/complete`,
          { method: "POST", body: JSON.stringify({ file_id: init.file_id }) },
        );
        count += 1;
      }
      setMessage(`${count} statement file${count === 1 ? "" : "s"} received and queued for review.`);
      await load(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The statements could not be uploaded.");
    } finally {
      setBusy(false);
      setDragging(false);
      if (picker.current) picker.current.value = "";
    }
  }

  async function setPrimary(itemId: string) {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await publicCall(
        `/application-profiles/public/bank-verification/${encodeURIComponent(token)}/banks/${itemId}`,
        { method: "PATCH", body: JSON.stringify({ is_primary_operating: true }) },
      );
      await load(token);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The primary bank could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <main className="application-verification-page"><div className="application-verification-state">Opening secure verification...</div></main>;
  }

  if (!data) {
    return <main className="application-verification-page"><div className="application-verification-state"><QCMark size={42} /><h1>Secure verification unavailable</h1><p>{error || "Request a new link from your Qualified Commercial advisor."}</p></div></main>;
  }

  return (
    <main className="application-verification-page">
      <header className="application-verification-brand">
        <QCMark size={38} />
        <div><strong>Qualified Commercial</strong><span>Secure business verification</span></div>
        <span className="application-verification-secure">Encrypted connection</span>
      </header>

      <section className="application-verification-intro">
        <span className="lbl">Business bank evidence</span>
        <h1>{data.business_name}</h1>
        <p>Choose either method below. Connect the LLC operating accounts securely, or upload the business bank statements already available to you.</p>
      </section>

      {error ? <div className="application-verification-alert error" role="alert">{error}</div> : null}
      {message ? <div className="application-verification-alert" role="status">{message}</div> : null}

      <div className="application-verification-grid">
        <section className="application-verification-section">
          <header><span className="application-verification-step">1</span><div><h2>Connect business accounts</h2><p>Use the account credentials on your own device. Qualified Commercial never receives or stores them.</p></div></header>
          {!data.consent_granted ? (
            <div className="application-verification-consent">
              <div className="application-verification-disclosure">{data.disclosure_text}</div>
              <label><span>Your full name</span><input value={signer} onChange={(event) => setSigner(event.target.value)} autoComplete="name" placeholder="Name of authorized business representative" /></label>
              <label className="application-verification-check"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>I am authorized to provide this consent for the business and agree to the disclosure above.</span></label>
              <button type="button" className="application-verification-primary" disabled={busy || !agreed || signer.trim().length < 2} onClick={() => void authorize()}>Authorize secure connection</button>
            </div>
          ) : (
            <>
              <button type="button" className="application-verification-primary" disabled={busy} onClick={() => void connectBank()}>{data.items.length ? "Connect another business bank" : "Connect business bank"}</button>
              <div className="application-verification-banks">
                {data.items.map((item) => (
                  <div key={item.id} className="application-verification-bank">
                    <div><strong>{item.institution_name || "Connected institution"}</strong><span>{item.accounts_label || "Business accounts"} | {item.statement_months.length ? `${item.statement_months.length} statement months` : "Statements syncing"}</span></div>
                    {item.is_primary_operating ? <b>Primary operating</b> : <button type="button" disabled={busy} onClick={() => void setPrimary(item.id)}>Make primary</button>}
                  </div>
                ))}
              </div>
            </>
          )}
        </section>

        <section className="application-verification-section">
          <header><span className="application-verification-step">2</span><div><h2>Upload statements instead</h2><p>Upload PDF statements, images, spreadsheets, or one ZIP. This provides the manual evidence alternative to Plaid.</p></div></header>
          {data.statement_upload_enabled ? <>
            <input ref={picker} type="file" hidden multiple accept={ACCEPT} onChange={(event) => void uploadFiles(Array.from(event.target.files || []))} />
            <button type="button" className={`application-verification-dropzone${dragging ? " dragging" : ""}`} disabled={busy} onClick={() => picker.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
              <strong>{busy ? "Processing files..." : "Drop business bank statements here"}</strong>
              <span>or click to choose files from this device</span>
              <small>PDF, CSV, Excel, images, or ZIP up to 100 MB each</small>
            </button>
            {data.manual_statement_months.length ? <div className="application-verification-months"><span>Statement periods received</span><div>{data.manual_statement_months.map((month) => <b key={month}>{month}</b>)}</div></div> : null}
          </> : <p className="application-verification-muted">Statement upload is not enabled for this link. Contact your advisor for a new verification request.</p>}
        </section>
      </div>

      <footer className="application-verification-footer"><span>Link expires {new Date(data.expires_at).toLocaleString()}</span><span>Bank credentials are entered only in the financial institution connection window.</span></footer>
    </main>
  );
}
