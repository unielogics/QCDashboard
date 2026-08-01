"use client";

// Hard gate rendered by AppShell.tsx instead of the app shell for any
// Role.DEALER_PARTNER user who hasn't signed the platform NDA / non-
// solicitation agreement yet. No sidebar, no nav, no way to reach any other
// route until this is submitted -- the actual enforcement is server-side
// (`_require_nda_signed` on every broker endpoint); this is the UX side of
// that same guarantee.

import { useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { useSignNda, type NdaStatus } from "@/hooks/useApi";
import { BROKER_NDA_DOCUMENT } from "@/lib/legal";

export function BrokerNdaGate({ status }: { status: NdaStatus | undefined }) {
  const { t } = useTheme();
  const sign = useSignNda();
  const sigPadRef = useRef<SignaturePadHandle | null>(null);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [disclosure, setDisclosure] = useState("");
  const [formError, setFormError] = useState("");

  function submit() {
    if (!typedName.trim()) { setFormError("Type your full legal name."); return; }
    if (!esignConsent) { setFormError("Check the E-SIGN consent box."); return; }
    const sigPad = sigPadRef.current;
    if (!sigPad?.hasSignature()) { setFormError("Draw your signature."); return; }
    setFormError("");
    sign.mutate({
      typed_name: typedName.trim(),
      esign_consent: true,
      signature_data_url: sigPad.getDataUrl(),
      prior_relationships_disclosure: disclosure.trim() || undefined,
    });
  }

  return (
    <div style={{ minHeight: "100vh", background: t.bg, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px" }}>
      <div style={{ width: "min(760px, 100%)", display: "grid", gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: t.ink }}>Dealer Partner Agreement</h1>
          <p style={{ margin: "6px 0 0", color: t.ink3, fontSize: 13.5, lineHeight: 1.5 }}>
            Before you can access leads, chat, or any other part of the platform, please read and sign the
            non-disclosure and non-solicitation agreement below (version {status?.document_version ?? BROKER_NDA_DOCUMENT.effectiveDate}).
          </p>
        </div>

        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface2, padding: 16 }}>
          <h2 style={{ margin: 0, fontSize: 15, color: t.ink }}>{BROKER_NDA_DOCUMENT.title}</h2>
          <p style={{ margin: "4px 0 12px", color: t.ink3, fontSize: 12 }}>Effective {BROKER_NDA_DOCUMENT.effectiveDate}</p>
          {BROKER_NDA_DOCUMENT.preamble ? (
            <p style={{ color: t.ink2, fontSize: 12.5, lineHeight: 1.55, marginBottom: 12 }}>{BROKER_NDA_DOCUMENT.preamble}</p>
          ) : null}
          <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 12, paddingRight: 4 }}>
            {BROKER_NDA_DOCUMENT.sections.map((section, i) => (
              <div key={i}>
                {section.heading ? <div style={{ fontWeight: 700, fontSize: 12.5, color: t.ink, marginBottom: 4 }}>{section.heading}</div> : null}
                {section.paragraphs.map((p, j) => (
                  <p key={j} style={{ margin: "0 0 6px", color: t.ink2, fontSize: 12.5, lineHeight: 1.55 }}>{p}</p>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ border: `1px solid ${t.line}`, borderRadius: 14, background: t.surface2, padding: 16, display: "grid", gap: 10 }}>
          <label>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3, marginBottom: 4 }}>
              Prior relationships to disclose (optional)
            </div>
            <textarea
              value={disclosure}
              onChange={(e) => setDisclosure(e.target.value)}
              rows={3}
              placeholder="List any lenders, dealers, or other relationships you had before joining the platform that you want excluded from Section 2's non-solicitation scope. Leave blank if none."
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.45 }}
            />
          </label>

          <label>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3, marginBottom: 4 }}>
              Type your full legal name
            </div>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13, outline: "none" }}
            />
          </label>

          <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: t.ink2, cursor: "pointer" }}>
            <input type="checkbox" checked={esignConsent} onChange={(e) => setEsignConsent(e.target.checked)} style={{ marginTop: 2 }} />
            I consent to use electronic records and signatures under the U.S. E-SIGN Act and UETA, and I agree to the terms above.
          </label>

          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3, marginBottom: 6 }}>
              Draw your signature
            </div>
            <SignaturePad ref={sigPadRef} />
            <button
              type="button"
              onClick={() => sigPadRef.current?.clear()}
              style={{ marginTop: 8, fontSize: 12, background: "none", border: `1px solid ${t.line}`, color: t.ink2, borderRadius: 8, padding: "6px 10px", cursor: "pointer" }}
            >
              Clear signature
            </button>
          </div>

          {(formError || sign.error) ? (
            <div style={{ color: t.danger, fontSize: 12.5 }}>
              {formError || (sign.error instanceof Error ? sign.error.message : "Something went wrong.")}
            </div>
          ) : null}

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={submit}
              disabled={sign.isPending}
              style={{ ...qcBtnPrimary(t), opacity: sign.isPending ? 0.6 : 1 }}
            >
              {sign.isPending ? "Submitting…" : "Sign & continue"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
