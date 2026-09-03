"use client";
// The client owes a signature on a Production Package: this replaces the
// intake room until it is signed. Read the agreement, type the name on it,
// draw a signature, accept electronic signing, sign. Nothing else renders.

import { useEffect, useRef, useState } from "react";
import { QCMark } from "@/components/QCMark";
import { LandscapePad } from "@/components/room/ContractSigner";

export type SigningGate = {
  package_id: string;
  revision_id: string;
  revision_no: number;
  title: string;
  document_version: string;
  content_sha256: string;
  pdf_sha256: string | null;
  pdf_url: string | null;
  signer_name: string;
  signer_title: string | null;
  business_name: string;
  sent_at: string | null;
  esign_consent_text: string;
  esign_consent_version: string;
  already_signed: boolean;
};

export type SignPayload = {
  revision_id: string;
  typed_name: string;
  esign_consent: boolean;
  acknowledged: boolean;
  signature_data_url: string;
  document_sha256: string;
};

export type SignResult = { signed: boolean; signed_at: string | null; pdf_sha256: string | null; download_url: string | null; execution_status: string };

function normalize(v: string): string { return v.toLowerCase().replace(/\s+/g, " ").trim(); }

function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [inked, setInked] = useState(false);
  const point = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = 900; c.height = 260;
    const g = c.getContext("2d");
    if (g) { g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); }
  }, []);
  const down = (e: React.PointerEvent) => { drawing.current = true; last.current = point(e); (e.target as HTMLElement).setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const g = canvasRef.current!.getContext("2d")!;
    const p = point(e);
    g.strokeStyle = "#0f1720"; g.lineWidth = 3.2; g.lineCap = "round"; g.lineJoin = "round";
    g.beginPath(); g.moveTo(last.current.x, last.current.y); g.lineTo(p.x, p.y); g.stroke();
    last.current = p;
    if (!inked) setInked(true);
  };
  const up = () => { drawing.current = false; last.current = null; if (canvasRef.current && inked) onChange(canvasRef.current.toDataURL("image/png")); };
  const clear = () => { const c = canvasRef.current!; const g = c.getContext("2d")!; g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); setInked(false); onChange(null); };
  return (
    <div className="pp-pad">
      <canvas ref={canvasRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Signature pad" />
      <div className="pp-row" style={{ justifyContent: "space-between", padding: "6px 4px 0" }}>
        <span className="pp-sub">Sign above with your finger, stylus or mouse.</span>
        <button type="button" className="pp-btn v-link s-sm" onClick={clear}>Clear</button>
      </div>
    </div>
  );
}

export function ProductionSigningGate({ gate, onSign, onRefresh, onLogout, compact }: {
  gate: SigningGate;
  onSign: (payload: SignPayload) => Promise<SignResult>;
  onRefresh: () => Promise<void>;
  onLogout: () => void;
  compact: boolean;
}) {
  const [typed, setTyped] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignResult | null>(null);
  const [showPad, setShowPad] = useState(false);
  const nameMatches = normalize(typed) === normalize(gate.signer_name) && Boolean(typed.trim());
  const ready = nameMatches && Boolean(signature) && consent && acknowledged && Boolean(gate.pdf_sha256);

  // The desk may reopen or void while this screen is up; check every 20 s.
  useEffect(() => {
    const t = window.setInterval(() => { onRefresh().catch(() => undefined); }, 20_000);
    return () => window.clearInterval(t);
  }, [onRefresh]);

  const submit = async () => {
    if (!ready || !signature || !gate.pdf_sha256) return;
    setBusy(true); setError(null);
    try {
      const result = await onSign({ revision_id: gate.revision_id, typed_name: typed.trim(), esign_consent: true, acknowledged: true, signature_data_url: signature, document_sha256: gate.pdf_sha256 });
      setDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your signature could not be recorded. Please try again.");
    } finally { setBusy(false); }
  };

  return (
    <section className="pp-gate" aria-labelledby="pp-gate-title">
      <header className="pp-row" style={{ justifyContent: "space-between" }}>
        <div className="pp-row"><QCMark size={30} /><div><div className="pp-eyebrow">Qualified Commercial</div><div style={{ fontWeight: 700 }}>{gate.business_name}</div></div></div>
        <button type="button" className="pp-btn s-sm" onClick={onLogout}>Log out</button>
      </header>
      {done ? (
        <div className="pp-panel"><div className="pp-panel-b pp-gate-done">
          <h2 id="pp-gate-title" className="pp-title">Your signature is recorded</h2>
          <p className="pp-sub">Thank you. A signed copy has been emailed to you{done.pdf_sha256 ? ` (fingerprint ${done.pdf_sha256.slice(0, 12)}…)` : ""}.</p>
          <div className="pp-row" style={{ justifyContent: "center", marginTop: 12 }}>
            {done.download_url ? <a className="pp-btn" href={done.download_url} target="_blank" rel="noreferrer">Download your signed copy</a> : null}
            <button type="button" className="pp-btn v-pri" onClick={() => onRefresh()}>Continue to your room</button>
          </div>
        </div></div>
      ) : (
        <>
          <div>
            <div className="pp-eyebrow">Before you continue</div>
            <h2 id="pp-gate-title" className="pp-title">Sign your {gate.title}</h2>
            <p className="pp-sub">Qualified Commercial has prepared the schedules to your production commitment. Read them, then sign below. Your room opens as soon as you have signed.</p>
          </div>
          <div className="pp-panel">
            <div className="pp-panel-h"><div><h3 className="pp-sect">1. Read the agreement</h3><p className="pp-sub">Revision {gate.revision_no} · version {gate.document_version} · fingerprint {gate.content_sha256.slice(0, 12)}…</p></div>
              {gate.pdf_url ? <a className="pp-btn s-sm" href={gate.pdf_url} target="_blank" rel="noreferrer">Open the PDF</a> : null}</div>
            <div className="pp-panel-b">
              {gate.pdf_url ? <iframe title={gate.title} src={gate.pdf_url} style={{ width: "100%", height: compact ? 320 : 480, border: "1px solid var(--line2)", borderRadius: 10, background: "#fff" }} /> : <div className="pp-notice t-warn">The agreement PDF is not available right now. Please try again in a moment.</div>}
              <label className="pp-check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> I have read the agreement and the figures in it are the ones I am agreeing to.</label>
            </div>
          </div>
          <div className="pp-panel">
            <div className="pp-panel-h"><div><h3 className="pp-sect">2. Sign</h3><p className="pp-sub">Type your name exactly as it appears on the agreement, then draw your signature.</p></div></div>
            <div className="pp-panel-b">
              <div className="pp-grid">
                <label className="pp-field span-2"><span className="pp-lbl">Type your full legal name</span>
                  <input className="pp-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={gate.signer_name} autoComplete="name" />
                  {typed && !nameMatches ? <span className="pp-hint bad">Type your name exactly as it appears on the agreement: {gate.signer_name}</span> : <span className="pp-hint">Signing as {gate.signer_name}{gate.signer_title ? `, ${gate.signer_title}` : ""}</span>}
                </label>
              </div>
              <div style={{ marginTop: 10 }}>
                {compact ? (
                  signature ? <div className="pp-row"><img src={signature} alt="Your signature" style={{ height: 60, border: "1px solid var(--line2)", borderRadius: 8, background: "#fff" }} /><button type="button" className="pp-btn v-link s-sm" onClick={() => setSignature(null)}>Redo</button></div>
                    : <button type="button" className="pp-btn" onClick={() => setShowPad(true)}>Draw your signature</button>
                ) : <SignaturePad onChange={setSignature} />}
              </div>
              <label className="pp-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {gate.esign_consent_text}</label>
              {error ? <div className="pp-notice t-bad"><span>{error}</span></div> : null}
              <div className="pp-row" style={{ marginTop: 8 }}>
                <button type="button" className="pp-btn v-pri" onClick={submit} disabled={!ready || busy}>{busy ? "Recording your signature…" : "Sign the agreement"}</button>
                <span className="pp-sub">Electronic signature under the U.S. E-SIGN Act and UETA · consent version {gate.esign_consent_version}</span>
              </div>
            </div>
          </div>
          {showPad ? <LandscapePad onUse={(dataUrl) => { setSignature(dataUrl); setShowPad(false); }} onCancel={() => setShowPad(false)} /> : null}
        </>
      )}
    </section>
  );
}
