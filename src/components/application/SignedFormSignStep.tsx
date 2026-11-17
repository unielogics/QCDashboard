"use client";

// The last step of the real-estate application: read what you agree to (the
// server's own consent texts, each versioned), type your legal name, draw your
// signature and sign. The page sends back each consent's SHA-256 and the frozen
// version's hash, so a changed text or a changed application is refused rather
// than signed unseen.

import { useRef, useState } from "react";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import type { SigningView } from "@/lib/reApplication";

export type SignPayload = {
  typed_name: string;
  signature_data_url: string;
  consents: { key: string; sha256: string }[];
  esign_consent: boolean;
  version_id: string;
  body_sha256: string;
};

export function SignedFormSignStep({ signing, busy, error, onSign }: { signing: SigningView; busy: boolean; error: string; onSign: (payload: SignPayload) => void }) {
  const pad = useRef<SignaturePadHandle | null>(null);
  const [agreed, setAgreed] = useState<Set<string>>(new Set());
  const [typed, setTyped] = useState("");
  const [problem, setProblem] = useState("");
  const consents = signing.consents.filter((consent) => consent.key !== "esign");
  const esign = signing.consents.find((consent) => consent.key === "esign");
  const allAgreed = consents.every((consent) => agreed.has(consent.key)) && (!esign || agreed.has("esign"));

  function toggle(key: string, on: boolean) {
    setAgreed((current) => {
      const next = new Set(current);
      if (on) next.add(key); else next.delete(key);
      return next;
    });
  }

  function submit() {
    if (!signing.version) return;
    if (!allAgreed) { setProblem("Agree to each item above to sign."); return; }
    if (typed.trim().split(/\s+/).length < 2) { setProblem("Type your full legal name."); return; }
    if (!pad.current?.hasSignature()) { setProblem("Draw your signature."); return; }
    setProblem("");
    onSign({
      typed_name: typed.trim(),
      signature_data_url: pad.current.getDataUrl(),
      consents: signing.consents.map((consent) => ({ key: consent.key, sha256: consent.sha256 })),
      esign_consent: true,
      version_id: signing.version.id,
      body_sha256: signing.version.body_sha256,
    });
  }

  return (
    <div className="fp-stack ra-form">
      <div className="fp-card ra-section">
        <h2 className="ra-section-title">What you agree to by signing</h2>
        {consents.map((consent) => (
          <label key={consent.key} className="ra-consent">
            <input type="checkbox" checked={agreed.has(consent.key)} disabled={busy} onChange={(event) => toggle(consent.key, event.target.checked)} />
            <span>
              <strong>{consent.label}.</strong> <span style={{ whiteSpace: "pre-line" }}>{consent.text}</span>
              <span className="fp-hint"> Version {consent.version}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="fp-card ra-section">
        <h2 className="ra-section-title">Sign{signing.signer_name ? ` as ${signing.signer_name}` : ""}</h2>
        <div className="fp-field">
          <label htmlFor="ra-typed">Type your full legal name</label>
          <input id="ra-typed" value={typed} disabled={busy} autoComplete="name" onChange={(event) => setTyped(event.target.value)} />
        </div>
        <div className="fp-field">
          <span className="ra-label">Draw your signature</span>
          <SignaturePad ref={pad} />
          <button type="button" className="fp-link-btn" onClick={() => pad.current?.clear()}>Clear signature</button>
        </div>
        {esign ? (
          <label className="ra-consent">
            <input type="checkbox" checked={agreed.has("esign")} disabled={busy} onChange={(event) => toggle("esign", event.target.checked)} />
            <span>{esign.text}</span>
          </label>
        ) : null}
        {problem || error ? <p className="fp-error" role="alert">{problem || error}</p> : null}
        <button type="button" className="fp-submit" disabled={busy} onClick={submit}>{busy ? "Signing…" : "Sign the application"}</button>
      </div>
    </div>
  );
}
