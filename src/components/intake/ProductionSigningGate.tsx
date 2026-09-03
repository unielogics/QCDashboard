"use client";
// The client owes a signature on a Production Package: this replaces the
// intake room until it is signed. Read the agreement, type the name on it,
// draw a signature, accept electronic signing, sign. Nothing else renders.
//
// Stage two (the Program Activation and Production Agreement) adds, above the
// PDF, "What changed since your commitment": the frozen comparison rows the
// dealer is entitled to review under §4.7 of the Production Commitment, a
// link to the executed commitment, typed initials beside the typed name, and
// the stage-specific acknowledgement wording the desk sends with the gate.

import { useEffect, useMemo, useRef, useState } from "react";
import { QCMark } from "@/components/QCMark";
import { LandscapePad } from "@/components/room/ContractSigner";
import type { ComparisonRow } from "@/production-package/types";

export type { ComparisonRow };

// The executed stage-one record the final supersedes (parent's executed revision).
export type SigningGateOriginal = {
  title: string;
  revision_no: number;
  executed_at?: string | null;
  executed_on?: string | null;
  content_sha256: string;
  pdf_url?: string | null;
  executed_url?: string | null;
};

export type SigningGate = {
  package_id: string;
  revision_id: string;
  revision_no: number;
  stage: number;
  document_key: string | null;
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
  initials_expected: boolean;
  original: SigningGateOriginal | null;
  changes: ComparisonRow[];
  review_clause: string | null;
  acknowledgement_text: string | null;
};

export type SignPayload = {
  revision_id: string;
  typed_name: string;
  initials: string;
  esign_consent: boolean;
  acknowledged: boolean;
  signature_data_url: string;
  document_sha256: string;
};

export type SignResult = {
  signed: boolean;
  signed_at: string | null;
  pdf_sha256: string | null;
  download_url: string | null;
  execution_status: string;
  title?: string | null;
};

const REVIEW_CLAUSE_SENTENCE =
  "Under §4.7 of your Production Commitment you are entitled to review the completed Addendum A before signing. " +
  "Where a figure appears in both agreements, this Agreement controls (§4.8 of the Commitment, §1.8 here).";
const STAGE_ONE_ACK = "I have read the agreement and the figures in it are the ones I am agreeing to.";
const STAGE_TWO_ACK = "I have reviewed the completed Addendum A and the changes listed above, and the figures in this Agreement are the ones I am agreeing to.";

function normalize(v: string): string { return v.toLowerCase().replace(/\s+/g, " ").trim(); }

// "Rafael Delgado" → "RD"; the desk validates the initials against the signer
// name server-side, this only tells the client what is expected.
function expectedInitials(name: string): string {
  return name.split(/[\s-]+/).map((part) => part.replace(/[^A-Za-z]/g, "").charAt(0)).filter(Boolean).join("").toUpperCase().slice(0, 4);
}

function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

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

function ChangesSinceCommitment({ gate }: { gate: SigningGate }) {
  const original = gate.original;
  const originalUrl = original?.pdf_url || original?.executed_url || null;
  const executedOn = original?.executed_at || original?.executed_on || null;
  const rows = gate.changes ?? [];
  return (
    <div className="pp-panel pp-changes">
      <div className="pp-panel-h">
        <div>
          <h3 className="pp-sect">What changed since your commitment</h3>
          <p className="pp-sub">
            {original
              ? <>Your {original.title || "Production Commitment"} · revision {original.revision_no}{executedOn ? ` · executed ${formatDate(executedOn)}` : ""} · fingerprint {original.content_sha256.slice(0, 12)}…</>
              : "Compared against the commitment you executed."}
          </p>
        </div>
        {originalUrl ? <a className="pp-btn s-sm" href={originalUrl} target="_blank" rel="noreferrer">Open the executed commitment</a> : null}
      </div>
      <div className="pp-panel-b">
        <p className="pp-sub" style={{ marginTop: 0 }}>{gate.review_clause && gate.review_clause.length > 40 ? gate.review_clause : REVIEW_CLAUSE_SENTENCE}</p>
        {rows.length ? (
          <div className="pp-tblwrap">
            <table className="pp-tbl compare">
              <thead><tr><th>Field</th><th>Original</th><th>Final</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.section}:${row.key}`} className={row.changed ? "changed" : undefined}>
                    <td><span>{row.label}</span>{row.section ? <span className="pp-hint" style={{ display: "block" }}>{row.section}</span> : null}</td>
                    <td className={row.format === "money" || row.format === "pct" || row.format === "count" || row.format === "num" ? "n" : undefined}>{row.original_blank ? "—" : row.before || "—"}</td>
                    <td className={row.format === "money" || row.format === "pct" || row.format === "count" || row.format === "num" ? "n" : undefined}><strong>{row.after || "—"}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="pp-notice t-mut"><span>No figure you agreed to in your commitment changed. The closing schedules below are new to this Agreement.</span></div>
        )}
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
  const stageTwo = (gate.stage ?? 1) >= 2;
  const initialsExpected = gate.initials_expected !== false;
  const [typed, setTyped] = useState("");
  const [initials, setInitials] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<SignResult | null>(null);
  const [showPad, setShowPad] = useState(false);
  const nameMatches = normalize(typed) === normalize(gate.signer_name) && Boolean(typed.trim());
  const expected = useMemo(() => expectedInitials(gate.signer_name), [gate.signer_name]);
  const initialsValid = /^[A-Z]{2,4}$/.test(initials);
  const initialsOk = !initialsExpected || initialsValid;
  const ready = nameMatches && initialsOk && Boolean(signature) && consent && acknowledged && Boolean(gate.pdf_sha256);
  const ackText = gate.acknowledgement_text || (stageTwo ? STAGE_TWO_ACK : STAGE_ONE_ACK);

  // The desk may reopen or void while this screen is up; check every 20 s.
  useEffect(() => {
    const t = window.setInterval(() => { onRefresh().catch(() => undefined); }, 20_000);
    return () => window.clearInterval(t);
  }, [onRefresh]);

  const submit = async () => {
    if (!ready || !signature || !gate.pdf_sha256) return;
    setBusy(true); setError(null);
    try {
      const result = await onSign({
        revision_id: gate.revision_id, typed_name: typed.trim(), initials: initialsExpected ? initials : "",
        esign_consent: true, acknowledged: true, signature_data_url: signature, document_sha256: gate.pdf_sha256,
      });
      setDone(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Your signature could not be recorded. Please try again.");
    } finally { setBusy(false); }
  };

  const executed = done?.execution_status === "executed";
  const doneTitle = done?.title || gate.title;

  return (
    <section className="pp-gate" aria-labelledby="pp-gate-title">
      <header className="pp-row" style={{ justifyContent: "space-between" }}>
        <div className="pp-row"><QCMark size={30} /><div><div className="pp-eyebrow">Qualified Commercial</div><div style={{ fontWeight: 700 }}>{gate.business_name}</div></div></div>
        <button type="button" className="pp-btn s-sm" onClick={onLogout}>Log out</button>
      </header>
      {done ? (
        <div className="pp-panel"><div className="pp-panel-b pp-gate-done">
          <h2 id="pp-gate-title" className="pp-title">{executed ? `Your ${doneTitle} is executed` : "Your signature is recorded"}</h2>
          <p className="pp-sub">
            {executed
              ? <>Thank you. Every party has signed and the executed agreement has been emailed to you{done.pdf_sha256 ? ` (fingerprint ${done.pdf_sha256.slice(0, 12)}…)` : ""}.</>
              : <>Thank you. A signed copy has been emailed to you{done.pdf_sha256 ? ` (fingerprint ${done.pdf_sha256.slice(0, 12)}…)` : ""}. Qualified Commercial completes the remaining signatures and sends you the executed agreement.</>}
          </p>
          <div className="pp-row" style={{ justifyContent: "center", marginTop: 12 }}>
            {done.download_url ? <a className="pp-btn" href={done.download_url} target="_blank" rel="noreferrer">{executed ? "Download the executed agreement" : "Download your signed copy"}</a> : null}
            <button type="button" className="pp-btn v-pri" onClick={() => onRefresh()}>Continue to your room</button>
          </div>
        </div></div>
      ) : (
        <>
          <div>
            <div className="pp-eyebrow">Before you continue</div>
            <h2 id="pp-gate-title" className="pp-title">Sign your {gate.title}</h2>
            <p className="pp-sub">
              {stageTwo
                ? "Qualified Commercial has completed your closing agreement. It converts your commitment into operative obligations and controls where a figure appears in both. Review what changed, read the agreement, then sign below. Your room opens as soon as you have signed."
                : "Qualified Commercial has prepared the schedules to your production commitment. Read them, then sign below. Your room opens as soon as you have signed."}
            </p>
          </div>
          {stageTwo ? <ChangesSinceCommitment gate={gate} /> : null}
          <div className="pp-panel">
            <div className="pp-panel-h"><div><h3 className="pp-sect">{stageTwo ? "2. Read the agreement" : "1. Read the agreement"}</h3><p className="pp-sub">Revision {gate.revision_no} · version {gate.document_version} · fingerprint {gate.content_sha256.slice(0, 12)}…</p></div>
              {gate.pdf_url ? <a className="pp-btn s-sm" href={gate.pdf_url} target="_blank" rel="noreferrer">Open the PDF</a> : null}</div>
            <div className="pp-panel-b">
              {gate.pdf_url ? <iframe title={gate.title} src={gate.pdf_url} style={{ width: "100%", height: compact ? 320 : 480, border: "1px solid var(--line2)", borderRadius: 10, background: "#fff" }} /> : <div className="pp-notice t-warn">The agreement PDF is not available right now. Please try again in a moment.</div>}
              <label className="pp-check"><input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} /> {ackText}</label>
            </div>
          </div>
          <div className="pp-panel">
            <div className="pp-panel-h"><div><h3 className="pp-sect">{stageTwo ? "3. Sign" : "2. Sign"}</h3><p className="pp-sub">Type your name exactly as it appears on the agreement{initialsExpected ? " and your initials" : ""}, then draw your signature.</p></div></div>
            <div className="pp-panel-b">
              <div className="pp-grid">
                <label className={`pp-field${initialsExpected ? " span-2" : " span-3"}`}><span className="pp-lbl">Type your full legal name</span>
                  <input className="pp-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={gate.signer_name} autoComplete="name" />
                  {typed && !nameMatches ? <span className="pp-hint bad">Type your name exactly as it appears on the agreement: {gate.signer_name}</span> : <span className="pp-hint">Signing as {gate.signer_name}{gate.signer_title ? `, ${gate.signer_title}` : ""}</span>}
                </label>
                {initialsExpected ? (
                  <label className={`pp-field${initials && !initialsValid ? " bad" : ""}`}><span className="pp-lbl">Your initials</span>
                    <input className="pp-input" value={initials} onChange={(e) => setInitials(e.target.value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4))} placeholder={expected || "AB"} autoComplete="off" maxLength={4} style={{ textTransform: "uppercase", letterSpacing: ".12em" }} />
                    {initials && !initialsValid ? <span className="pp-hint bad">Two to four letters.</span>
                      : initials && expected && initials !== expected ? <span className="pp-hint warn">Expected {expected} from your name on the agreement.</span>
                        : <span className="pp-hint">Placed on every initials line of the agreement.</span>}
                  </label>
                ) : null}
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
