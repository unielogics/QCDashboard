"use client";

// Hard gate rendered by AppShell.tsx instead of the app shell for any
// Role.DEALER_PARTNER user who hasn't signed the real Platform Access and
// Technology Use Agreement yet. No sidebar, no nav, no way to reach any
// other route until this is submitted -- the actual enforcement is
// server-side (`_require_dealer_partner` on every broker endpoint checks
// BOTH this individual signature AND the user's company's Referral
// Protection Agreement); this is the UX side of that same guarantee.
//
// The document body itself is entirely server-rendered (GET
// /contracts/platform-access/status returns the filled contract text) --
// unlike the retired interim broker-NDA gate, no legal text is duplicated
// in this file at all.

import { useRef, useState } from "react";
import { Btn, Input, PageHeader, Panel, StatusLine, Sub, WarnLine, cx } from "@/components/ds";
import { SignaturePad, type SignaturePadHandle } from "@/components/design-system/SignaturePad";
import { useContractStatus, useSignPlatformAccess } from "@/hooks/useApi";
import { ContractType } from "@/lib/enums.generated";

export function PlatformAccessGate() {
  const { data: status } = useContractStatus(ContractType.PLATFORM_ACCESS);
  const sign = useSignPlatformAccess();
  const sigPadRef = useRef<SignaturePadHandle | null>(null);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
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
    });
  }

  const doc = status?.document;

  return (
    // `.bareshell` is the ground under a route that skips the app chrome —
    // this gate REPLACES the shell. The centring and the gutter are this
    // page's own.
    <div className="bareshell" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px" }}>
      <div className="grid" style={{ width: "min(760px, 100%)" }}>
        <div>
          <PageHeader title="Platform Access Agreement" />
          <Sub>
            Before you can access leads, chat, or any other part of the platform, please read and sign the
            agreement below{status?.document_version ? ` (version ${status.document_version})` : ""}.
          </Sub>
        </div>

        {!doc ? (
          <Panel>
            <Sub>Loading agreement…</Sub>
          </Panel>
        ) : (
          <Panel title={doc.title}>
            <div className="grid g10">
              {doc.party_facing_notice ? <WarnLine>{doc.party_facing_notice}</WarnLine> : null}
              {/* `.docwell` is the bounded scroller for text you are about to
                  sign; the cap is this page's, so it stays inline. */}
              <div className="docwell grid g10" style={{ maxHeight: 320 }}>
                {doc.preamble.map((p, i) => (
                  <p key={`pre-${i}`}>{p}</p>
                ))}
                {doc.sections.map((section, i) => (
                  <div key={i} className="grid g6">
                    <b>{section.heading}</b>
                    {section.paragraphs.map((p, j) => (
                      <p key={j}>{p}</p>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </Panel>
        )}

        <Panel>
          <div className="grid g10">
            <label className="grid g4">
              <span className="lbl">Type your full legal name</span>
              <Input value={typedName} onChange={(e) => setTypedName(e.target.value)} />
            </label>

            {/* `.consent` runs the disclosure at body size on purpose — shrinking
                one to fit is the thing a compliance review flags. */}
            <div className={cx("consent", esignConsent && "on")}>
              <label>
                <input type="checkbox" checked={esignConsent} onChange={(e) => setEsignConsent(e.target.checked)} />
                <span className="ctext">
                  I consent to use electronic records and signatures under the U.S. E-SIGN Act and UETA, and I agree to the terms above.
                  I understand I may request a paper copy of this signed agreement at any time by contacting
                  support@qualifiedcommercial.com, and that I may withdraw consent to electronic records prospectively
                  through that same address.
                </span>
              </label>
            </div>

            <div className="grid g8">
              <span className="lbl">Draw your signature</span>
              <SignaturePad ref={sigPadRef} />
              <div className="row">
                <Btn onClick={() => sigPadRef.current?.clear()}>Clear signature</Btn>
              </div>
            </div>

            {(formError || sign.error) ? (
              <StatusLine tone="bad">
                {formError || (sign.error instanceof Error ? sign.error.message : "Something went wrong.")}
              </StatusLine>
            ) : null}

            <div className="row end">
              <Btn variant="pri" onClick={submit} disabled={sign.isPending || !doc}>
                {sign.isPending ? "Submitting…" : "Sign & continue"}
              </Btn>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
