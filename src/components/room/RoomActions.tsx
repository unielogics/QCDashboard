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
//
// Styling: a BARE route (no app shell). The sections are `.panel` written out
// by hand rather than the <Panel> component for one reason — the host page
// (buckets/request/[token]) heads its sections with <h2> under a single <h1>,
// and <Panel> hard-codes <h3>. Dropping a level here would leave a public page
// with a broken heading outline. `.panel-h h2` in app-extras carries the size.

import { useCallback, useEffect, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { stashRoomHandoff } from "@/lib/roomPlaidHandoff";
import { apiBase } from "@/lib/api";
import { Btn, CellChip, Field, Input, StatusLine, WarnLine, cx } from "@/components/ds";
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

type BankConnection = {
  id: string;
  institution_name: string | null;
  accounts_label: string | null;
  status: string;
  is_primary_operating: boolean;
  last_pulled_at: string | null;
  statement_months: string[];
};

type Features = {
  business_name: string;
  bank_connect_available: boolean;
  plaid_environment: string;
  bank_consent_granted: boolean;
  /** Server-owned wording. Shown verbatim; never edited or echoed back. */
  bank_consent_disclosure: string;
  bank_connections: BankConnection[];
  signable: Signable[];
  contracts: RoomContract[];
};

function BankConnect({
  token,
  passcode,
  environment,
  consentGranted: initialConsent,
  disclosure,
  connections,
  onConnected,
}: {
  token: string;
  passcode: string;
  environment: string;
  /** Whether a consent is already on file for this case. */
  consentGranted: boolean;
  /** The exact wording the server will store against the grant. */
  disclosure: string;
  connections: BankConnection[];
  onConnected: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // Seeded from the server, then flipped locally once recorded, so the client
  // moves straight on to the bank rather than waiting for a room refetch.
  const [consentGranted, setConsentGranted] = useState(initialConsent);
  const [agreed, setAgreed] = useState(false);
  const [signer, setSigner] = useState("");

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
            is_primary_operating: connections.length === 0,
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
    [token, passcode, onConnected, connections.length],
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

  useEffect(() => {
    if (initialConsent) setConsentGranted(true);
  }, [initialConsent]);

  async function setPrimary(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/${itemId}/primary`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The main operating bank could not be changed.");
      }
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The main operating bank could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  async function authorize() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/bank-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The disclosure text is deliberately not sent — the server records the
        // wording it served, which is what makes the stored proof meaningful.
        body: JSON.stringify({ passcode, consenter_name: signer.trim(), method: "self_web" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "That authorization could not be recorded.");
      }
      setConsentGranted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That authorization could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

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
      // An OAuth bank navigates away from this page entirely, so everything
      // needed to finish the connection has to outlive the room's URL.
      stashRoomHandoff({
        linkToken: out.link_token,
        token,
        passcode,
        returnTo: window.location.href,
      });
      setLinkToken(out.link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bank connection is not available right now.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mb">
      <div className="panel-h">
        <h2>Connect your bank</h2>
      </div>
      <div className="panel-b">
        <p className="sub">
          A read-only connection through Plaid retrieves your bank statements directly, so you do
          not have to download and upload them yourself. No credentials pass through Qualified
          Commercial, and nothing can be moved or charged.
        </p>
        {connections.length > 0 ? (
          <div className="mt" style={{ display: "grid", gap: 8 }}>
            {connections.map((connection) => (
              <div key={connection.id} className="filerow">
                <div className="grow">
                  <b>{connection.institution_name || "Connected institution"}</b>
                  <span className="sub" style={{ display: "block", marginTop: 3 }}>
                    {connection.accounts_label || "Account details syncing"} · {connection.statement_months.length} statement month{connection.statement_months.length === 1 ? "" : "s"}
                  </span>
                </div>
                <CellChip tone={connection.status === "active" ? "ok" : "warn"}>
                  {connection.status}
                </CellChip>
                {connection.is_primary_operating ? (
                  <CellChip tone="acc">Main operating bank</CellChip>
                ) : (
                  <Btn disabled={busy} onClick={() => setPrimary(connection.id)}>
                    Make main
                  </Btn>
                )}
              </div>
            ))}
          </div>
        ) : null}
        {environment === "sandbox" ? (
          <WarnLine className="mt">
            Test mode: this connection currently reaches Plaid&apos;s test institutions only.
          </WarnLine>
        ) : null}
        {!consentGranted ? (
          <>
            {/* `.consent` is the sheet's consent-capture surface: body-size text
                (never shrunk to fit) and a 20px checkbox. The disclosure and the
                box that accepts it are one object, which is what the stored
                proof actually is. */}
            <div className={cx("consent", "mt", agreed && "on")}>
              <p
                className="ctext mb"
                // Server-owned wording, rendered verbatim: its own line breaks
                // are part of the text.
                style={{ whiteSpace: "pre-line" }}
              >
                {disclosure}
              </p>
              <label>
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                />
                <span className="ctext">I have read and agree to the above.</span>
              </label>
            </div>
            {/* Bespoke measure: a name field has no business running the full
                width of a desktop panel. */}
            <div className="mt" style={{ maxWidth: 320 }}>
              <Field label="Your full name">
                <Input
                  value={signer}
                  onChange={(e) => setSigner(e.target.value)}
                  placeholder="Your full name"
                  autoComplete="name"
                />
              </Field>
            </div>
            <div className="mt">
              {/* `.btn:disabled` carries the dimmed state the inline opacity did. */}
              <Btn
                variant="pri"
                disabled={!agreed || !signer.trim() || busy}
                onClick={authorize}
              >
                {busy ? "Recording…" : "Authorize and continue"}
              </Btn>
            </div>
          </>
        ) : (
          <div className="mt">
            <Btn variant="pri" disabled={busy} onClick={start}>
              {busy ? "Opening…" : connections.length ? "Connect another bank" : "Connect bank securely"}
            </Btn>
          </div>
        )}
        {done ? <StatusLine tone="ok" className="mt">{done}</StatusLine> : null}
        {error ? <StatusLine tone="bad" className="mt">{error}</StatusLine> : null}
      </div>
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
        <section className="panel mb">
          <div className="panel-h">
            <h2>Agreements to sign</h2>
          </div>
          <div className="panel-b">
            <p className="sub mb">
              Prepared for you by your representative. Review the full agreement, then sign on
              this device — a copy is emailed to you the moment it executes.
            </p>
            {contractsPending.map((c) => (
              <div key={c.id} className="filerow">
                <b className="grow">{c.title}</b>
                <Btn variant="pri" onClick={() => setSigningContract(c)}>
                  Review and sign
                </Btn>
              </div>
            ))}
            {contractsSigned.map((c) => (
              <div key={c.id} className="filerow">
                <b className="grow">{c.title}</b>
                <CellChip tone="ok">Signed</CellChip>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {features.bank_connect_available ? (
        <BankConnect
          token={token}
          passcode={passcode}
          environment={features.plaid_environment}
          consentGranted={features.bank_consent_granted}
          disclosure={features.bank_consent_disclosure}
          connections={features.bank_connections ?? []}
          onConnected={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}

      {pending.length > 0 || signed.length > 0 ? (
        <section className="panel mb">
          <div className="panel-h">
            <h2>Signatures needed</h2>
          </div>
          <div className="panel-b">
            <p className="sub mb">
              Review each document in full and sign on this device. You will receive a copy of
              everything you sign by email.
            </p>
            {pending.map((d) => (
              <div key={d.id} className="filerow">
                <b className="grow">{d.name}</b>
                <Btn
                  variant="pri"
                  onClick={() => {
                    setSigning(d);
                    setSignError(null);
                  }}
                >
                  Review and sign
                </Btn>
              </div>
            ))}
            {signed.map((d) => (
              <div key={d.id} className="filerow">
                <b className="grow">{d.name}</b>
                <CellChip tone="ok">Signed</CellChip>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {signing ? (
        <section className="panel mb">
          <div className="panel-b">
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
          </div>
        </section>
      ) : null}
    </>
  );
}
