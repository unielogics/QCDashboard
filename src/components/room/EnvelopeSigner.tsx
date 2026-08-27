"use client";

import { useEffect, useMemo, useState } from "react";
import { apiBase } from "@/lib/api";
import { Btn, CellChip, Field, Input, Panel, StatusLine, cx } from "@/components/ds";
import { LandscapePad } from "@/components/room/ContractSigner";

export type RoomEnvelopeDocument = {
  id: string;
  contract_document_id: string;
  title: string;
  sort_order: number;
  required: boolean;
  status: string;
  acknowledged_at: string | null;
  preview_url: string | null;
  download_url: string | null;
  executed_sha256: string | null;
};

export type RoomEnvelope = {
  id: string;
  title: string;
  package_version: number;
  program_key: string;
  status: string;
  signer_name: string | null;
  completed_at: string | null;
  bundle_sha256: string | null;
  bundle_download_url: string | null;
  documents: RoomEnvelopeDocument[];
};

type SignResult = {
  message: string;
  execution_status: "executed" | "delivery_warning";
  pdf_sha256: string | null;
  download_url: string | null;
};

export function EnvelopeSigner({
  token,
  passcode,
  initialEnvelope,
  onDone,
  onClose,
}: {
  token: string;
  passcode: string;
  initialEnvelope: RoomEnvelope;
  onDone: () => void;
  onClose: () => void;
}) {
  const [envelope, setEnvelope] = useState(initialEnvelope);
  const [activeIndex, setActiveIndex] = useState(0);
  const [typedName, setTypedName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [esign, setEsign] = useState(false);
  const [applyAll, setApplyAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SignResult | null>(null);

  useEffect(() => setEnvelope(initialEnvelope), [initialEnvelope]);
  const documents = useMemo(() => envelope.documents ?? [], [envelope.documents]);
  const active = documents[activeIndex] ?? documents[0];
  const required = useMemo(() => documents.filter((document) => document.required), [documents]);
  const allAcknowledged = required.length > 0 && required.every((document) => Boolean(document.acknowledged_at));
  const executed = envelope.status === "executed";
  const canSign = allAcknowledged && typedName.trim().length > 1 && Boolean(signature) && esign && applyAll && !busy;

  async function acknowledge(document: RoomEnvelopeDocument, acknowledged: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/v1/dealer-os/public/room/${token}/contract-envelopes/${envelope.id}/documents/${document.id}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode, acknowledged }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The review acknowledgment could not be saved.");
      }
      setEnvelope((await response.json()) as RoomEnvelope);
      if (acknowledged && activeIndex < documents.length - 1) setActiveIndex(activeIndex + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The review acknowledgment could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function signPackage() {
    if (!signature) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `${apiBase}/api/v1/dealer-os/public/room/${token}/contract-envelopes/${envelope.id}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passcode,
            typed_name: typedName.trim(),
            signature_data_url: signature,
            esign_consent: true,
            applies_to_all_documents: true,
          }),
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The package could not be signed.");
      }
      const signed = (await response.json()) as SignResult;
      setResult(signed);
      if (signed.download_url) {
        const anchor = document.createElement("a");
        anchor.href = signed.download_url;
        anchor.download = "executed-application-package.pdf";
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The package could not be signed.");
    } finally {
      setBusy(false);
    }
  }

  if (result || executed) {
    const downloadUrl = result?.download_url || envelope.bundle_download_url;
    return (
      <Panel title={envelope.title} className="mb">
        <div style={{ textAlign: "center", padding: "24px 8px" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--ok-tint)", color: "var(--ok)", display: "grid", placeItems: "center", fontSize: 25, margin: "0 auto 10px", fontWeight: 800 }}>✓</div>
          <b>Application package signed</b>
          <p className="sub mt">Every document has an independent executed PDF and hash. The final page is the package certificate.</p>
          {result?.execution_status === "delivery_warning" && <StatusLine tone="warn" className="mt">Email delivery needs attention. Your download remains available.</StatusLine>}
          {downloadUrl && <a className="btn pri mt" href={downloadUrl} download="executed-application-package.pdf">Download signed package</a>}
          <div className="mt"><Btn onClick={onClose}>Close</Btn></div>
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      title={envelope.title}
      sub={`Package version ${envelope.package_version}`}
      className="mb envelopeSigner"
      actions={<Btn onClick={onClose}>Close</Btn>}
    >
      <div className="envelopeProgress" aria-label="Package review progress">
        {documents.map((document, index) => (
          <button type="button" key={document.id} className={cx(index === activeIndex && "on", document.acknowledged_at && "done")} onClick={() => setActiveIndex(index)}>
            <span>{document.acknowledged_at ? "✓" : index + 1}</span><b>{document.title}</b>
          </button>
        ))}
      </div>

      {active && (
        <section className="envelopeDocumentReview">
          <div className="row mb" style={{ gap: 8 }}><b>{active.title}</b><span className="sp" />{active.required ? <CellChip tone="warn">Required</CellChip> : <CellChip>Optional</CellChip>}</div>
          {active.preview_url ? <iframe src={active.preview_url} title={active.title} /> : <StatusLine tone="bad">The document preview is unavailable. Ask your representative to refresh the package.</StatusLine>}
          <label className={cx("consent", "mt", active.acknowledged_at && "on")}>
            <span style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <input type="checkbox" checked={Boolean(active.acknowledged_at)} disabled={busy} onChange={(event) => void acknowledge(active, event.target.checked)} />
              <span className="ctext">I reviewed this complete document and understand it is included in the application package I will sign.</span>
            </span>
          </label>
        </section>
      )}

      {allAcknowledged && (
        <section className="envelopeSignatureBlock mt">
          <div><b>Apply one signature to this package</b><p className="sub mt">Your visible signature is applied at the configured signature location on every listed document.</p></div>
          <Field label="Full legal name"><Input value={typedName} autoComplete="name" placeholder="Type the designated signer’s legal name" onChange={(event) => setTypedName(event.target.value)} /></Field>
          <button type="button" className="signatureCaptureButton" onClick={() => setPadOpen(true)}>{signature ? "Edit drawn signature" : "Draw signature"}</button>
          {signature && <div className="signaturePreview">
            {/* eslint-disable-next-line @next/next/no-img-element -- signer-created data URL */}
            <img src={signature} alt="Your drawn signature" />
          </div>}
          <label className={cx("consent", esign && "on")}><span style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={esign} onChange={(event) => setEsign(event.target.checked)} /><span className="ctext">I consent to electronic records and signatures under E-SIGN/UETA.</span></span></label>
          <label className={cx("consent", applyAll && "on")}><span style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} /><span className="ctext">I affirm that this electronic signature applies to every document listed and acknowledged in this package.</span></span></label>
          <Btn variant="pri" className="ctrl-block" disabled={!canSign} onClick={() => void signPackage()}>{busy ? "Signing package..." : `Sign ${documents.length} document${documents.length === 1 ? "" : "s"}`}</Btn>
        </section>
      )}
      {!allAcknowledged && <StatusLine tone="warn" className="mt">Review and acknowledge every required document before signing.</StatusLine>}
      {error && <StatusLine tone="bad" className="mt">{error}</StatusLine>}
      {padOpen && <LandscapePad onCancel={() => setPadOpen(false)} onUse={(dataUrl) => { setSignature(dataUrl); setPadOpen(false); }} />}
    </Panel>
  );
}
