"use client";

// What this room can DO, beyond receiving files.
//
// Until now the client room was upload-only, which quietly broke two flows:
// the rep's "connect your bank" email pointed here and the room had no
// connect button, and the rep's signature request pointed here and the room
// drew it as an ordinary upload row. The backend halves of both flows were
// finished and unreachable.
//
// One capabilities call decides what renders, so this component never shows a
// button that will 404. The signing UI is the intake flows' own
// SignRequestedDocument, reused rather than rebuilt — the evidence produced
// (typed name, drawn signature, hashes, certificate) must be identical no
// matter which door the signer came through.

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { apiBase } from "@/lib/api";
import {
  SignRequestedDocument,
  type SignableDoc,
  type SignRequestedDocumentPayload,
} from "@/components/intake/SignRequestedDocument";
import { ContractSigner, type RoomContract } from "@/components/room/ContractSigner";

type Signable = {
  id: string;
  name: string;
  kind: string | null;
  signed: boolean;
  signable: boolean;
  document_text: string;
};

type Features = {
  business_name: string;
  bank_connect_available: boolean;
  plaid_environment: string;
  signable: Signable[];
  contracts: RoomContract[];
};

const section: React.CSSProperties = {
  border: "1px solid #d8dee9",
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
  background: "#fff",
};
const title: React.CSSProperties = { margin: 0, fontSize: 15, fontWeight: 700 };
const sub: React.CSSProperties = { color: "#5a6675", fontSize: 12.5, lineHeight: 1.5 };
const btn: React.CSSProperties = {
  border: "1px solid #1b4b9e",
  background: "#1b4b9e",
  color: "#fff",
  borderRadius: 9,
  padding: "9px 16px",
  fontWeight: 650,
  fontSize: 13,
  cursor: "pointer",
};
const okBadge: React.CSSProperties = {
  background: "#e6f4ec",
  color: "#0f7b4f",
  borderRadius: 99,
  padding: "2px 9px",
  fontSize: 11,
  fontWeight: 750,
};

function BankConnect({
  token,
  passcode,
  environment,
  onConnected,
}: {
  token: string;
  passcode: string;
  environment: string;
  onConnected: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const onSuccess = useCallback(
    async (publicToken: string | null, metadata: { institution?: { name?: string } | null }) => {
      // react-plaid-link types the token as nullable; a null here means Link
      // closed without a grant and there is nothing to exchange.
      if (!publicToken) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passcode,
            public_token: publicToken,
            institution_name: metadata?.institution?.name ?? null,
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(body?.detail || "The connection could not be completed.");
        }
        const out = (await res.json()) as { message: string };
        setDone(out.message);
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The connection could not be completed.");
      } finally {
        setBusy(false);
        setLinkToken(null);
      }
    },
    [token, passcode, onConnected],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => setLinkToken(null),
  });

  // Plaid Link can only open once its token exists; minting happens on the
  // button press so a room view costs no Plaid API call.
  useEffect(() => {
    if (linkToken && ready) open();
  }, [linkToken, ready, open]);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/link-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "Bank connection is not available right now.");
      }
      const out = (await res.json()) as { link_token: string };
      setLinkToken(out.link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bank connection is not available right now.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <section style={section}>
        <h2 style={title}>
          Bank connection <span style={okBadge}>Connected</span>
        </h2>
        <p style={{ ...sub, marginTop: 6 }}>{done}</p>
      </section>
    );
  }

  return (
    <section style={section}>
      <h2 style={title}>Connect your bank</h2>
      <p style={{ ...sub, marginTop: 6 }}>
        A read-only connection through Plaid retrieves your bank statements directly, so you do
        not have to download and upload them yourself. No credentials pass through Qualified
        Commercial, and nothing can be moved or charged.
      </p>
      {environment === "sandbox" ? (
        <p style={{ ...sub, color: "#a15c07" }}>
          Test mode: this connection currently reaches Plaid&apos;s test institutions only.
        </p>
      ) : null}
      <div style={{ marginTop: 10 }}>
        <button type="button" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy} onClick={start}>
          {busy ? "Opening…" : "Connect bank securely"}
        </button>
      </div>
      {error ? <p style={{ ...sub, color: "#b42318", marginTop: 8 }}>{error}</p> : null}
    </section>
  );
}

export function RoomActions({
  token,
  passcode,
  onChanged,
}: {
  token: string;
  passcode: string;
  /** Called after a connection or signature lands so the page can refresh its checklist. */
  onChanged: () => void;
}) {
  const [features, setFeatures] = useState<Features | null>(null);
  const [signing, setSigning] = useState<Signable | null>(null);
  const [signingContract, setSigningContract] = useState<RoomContract | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      // A room with no case behind it (or an older link) simply has no extra
      // capabilities; the page stays a plain upload room rather than erroring.
      if (!res.ok) return;
      setFeatures((await res.json()) as Features);
    } catch {
      /* capabilities are additive; failure to load them is not a room failure */
    }
  }, [token, passcode]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign(payload: SignRequestedDocumentPayload) {
    setSignBusy(true);
    setSignError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, ...payload }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The signature could not be recorded.");
      }
      setSigning(null);
      await load();
      onChanged();
    } catch (e) {
      setSignError(e instanceof Error ? e.message : "The signature could not be recorded.");
    } finally {
      setSignBusy(false);
    }
  }

  if (!features) return null;

  const pending = features.signable.filter((d) => !d.signed && d.signable);
  const signed = features.signable.filter((d) => d.signed);
  const contractsPending = (features.contracts ?? []).filter((c) => c.status === "out_for_signature");
  const contractsSigned = (features.contracts ?? []).filter((c) => c.status === "executed");

  return (
    <>
      {signingContract ? (
        <ContractSigner
          token={token}
          passcode={passcode}
          contract={signingContract}
          onClose={() => setSigningContract(null)}
          onDone={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}

      {!signingContract && (contractsPending.length > 0 || contractsSigned.length > 0) ? (
        <section style={section}>
          <h2 style={title}>Agreements to sign</h2>
          <p style={{ ...sub, marginTop: 6 }}>
            Prepared for you by your representative. Review the full agreement, then sign on
            this device — a copy is emailed to you the moment it executes.
          </p>
          {contractsPending.map((c) => (
            <div
              key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #eef1f6" }}
            >
              <span style={{ fontWeight: 650, fontSize: 13.5, flex: 1 }}>{c.title}</span>
              <button type="button" style={btn} onClick={() => setSigningContract(c)}>
                Review and sign
              </button>
            </div>
          ))}
          {contractsSigned.map((c) => (
            <div
              key={c.id}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: "1px solid #eef1f6" }}
            >
              <span style={{ fontWeight: 650, fontSize: 13.5, flex: 1 }}>{c.title}</span>
              <span style={okBadge}>Signed</span>
            </div>
          ))}
        </section>
      ) : null}
      {features.bank_connect_available ? (
        <BankConnect
          token={token}
          passcode={passcode}
          environment={features.plaid_environment}
          onConnected={onChanged}
        />
      ) : null}

      {pending.length > 0 || signed.length > 0 ? (
        <section style={section}>
          <h2 style={title}>Signatures needed</h2>
          <p style={{ ...sub, marginTop: 6 }}>
            Review each document in full and sign on this device. You will receive a copy of
            everything you sign by email.
          </p>
          {pending.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid #eef1f6",
              }}
            >
              <span style={{ fontWeight: 650, fontSize: 13.5, flex: 1 }}>{d.name}</span>
              <button type="button" style={btn} onClick={() => { setSigning(d); setSignError(null); }}>
                Review and sign
              </button>
            </div>
          ))}
          {signed.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "10px 0",
                borderTop: "1px solid #eef1f6",
              }}
            >
              <span style={{ fontWeight: 650, fontSize: 13.5, flex: 1 }}>{d.name}</span>
              <span style={okBadge}>Signed</span>
            </div>
          ))}
        </section>
      ) : null}

      {signing ? (
        <section style={section}>
          <SignRequestedDocument
            doc={
              {
                id: signing.id,
                name: signing.name,
                signature_kind: signing.kind,
                signature_document_text: signing.document_text,
              } as SignableDoc
            }
            busy={signBusy}
            error={signError}
            onSign={sign}
            onCancel={() => setSigning(null)}
          />
        </section>
      ) : null}
    </>
  );
}
