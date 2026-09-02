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
import { stashApplicationRoomHandoff, stashRoomHandoff } from "@/lib/roomPlaidHandoff";
import { apiBase } from "@/lib/api";
import { Btn, CellChip, Field, Input, StatusLine, WarnLine, cx } from "@/components/ds";
import {
  SignRequestedDocument,
  type SignableDoc,
  type SignRequestedDocumentPayload,
} from "@/components/intake/SignRequestedDocument";
import { ContractSigner, type RoomContract } from "@/components/room/ContractSigner";
import { EnvelopeSigner, type RoomEnvelope } from "@/components/room/EnvelopeSigner";

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
  environment: string;
  error: string | null;
  update_mode_reason: string | null;
  update_mode_account_selection: boolean;
  is_primary_operating: boolean;
  last_pulled_at: string | null;
  statement_months: string[];
  products: string[];
  consented_products: string[];
  billed_products: string[];
  unavailable_products: string[];
  pending_products: string[];
  authorization_state: string;
};

type Features = {
  business_name: string;
  bank_connect_available: boolean;
  plaid_environment: string;
  bank_consent_granted: boolean;
  /** Server-owned wording. Shown verbatim; never edited or echoed back. */
  bank_consent_disclosure: string;
  bank_connections: BankConnection[];
  plaid_assets_enabled: boolean;
  plaid_statements_enabled: boolean;
  plaid_selected_products: string[];
  plaid_available_products: string[];
  signable: Signable[];
  contracts: RoomContract[];
  envelopes: RoomEnvelope[];
};
type RoomKind = "dealer" | "application";

function bankUpdateMessage(connection: BankConnection): string {
  if (connection.update_mode_reason === "new_accounts_available") return "New business accounts are available to add.";
  if (connection.update_mode_reason === "pending_expiration") return "This authorization is expiring and needs renewal.";
  if (connection.update_mode_reason === "pending_disconnect") return "This connection is scheduled to disconnect unless renewed.";
  return connection.error || "Your bank needs you to confirm or repair this connection.";
}

function BankConnect({
  token,
  passcode,
  environment,
  consentGranted: initialConsent,
  disclosure,
  connections,
  selectedProducts,
  roomKind,
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
  selectedProducts: string[];
  roomKind: RoomKind;
  onConnected: () => void;
}) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"initial" | "update">("initial");
  const [linkItemId, setLinkItemId] = useState<string | null>(null);
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
      if ((linkMode === "initial" && !publicToken) || (linkMode === "update" && !linkItemId)) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(
          roomKind === "application"
            ? linkMode === "update" && linkItemId
              ? `${apiBase}/api/v1/application-profiles/public/room/${token}/plaid/${linkItemId}/update-complete`
              : `${apiBase}/api/v1/application-profiles/public/room/${token}/plaid/exchange`
            : linkMode === "update" && linkItemId
              ? `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/${linkItemId}/update-complete`
              : `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/exchange`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              linkMode === "update"
                ? { passcode }
                : {
                    passcode,
                    public_token: publicToken,
                    institution_name: metadata?.institution?.name ?? null,
                    is_primary_operating: connections.length === 0,
                  },
            ),
          },
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { detail?: string } | null;
          throw new Error(body?.detail || "The connection could not be completed.");
        }
        const out = (await res.json()) as { message?: string };
        setDone(
          out.message ||
            (linkMode === "update"
              ? "Accounts updated. Verified bank evidence is refreshing now."
              : "Bank connected. Verified bank evidence is refreshing now."),
        );
        onConnected();
      } catch (e) {
        setError(e instanceof Error ? e.message : "The connection could not be completed.");
      } finally {
        setBusy(false);
        setLinkToken(null);
      }
    },
    [token, passcode, onConnected, connections.length, linkItemId, linkMode, roomKind],
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
    setConsentGranted(initialConsent);
    if (!initialConsent) setAgreed(false);
  }, [initialConsent]);

  async function setPrimary(itemId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        roomKind === "application"
          ? `${apiBase}/api/v1/application-profiles/public/room/${token}/plaid/${itemId}/primary`
          : `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/${itemId}/primary`,
        {
          method: roomKind === "application" ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode, ...(roomKind === "application" ? { is_primary_operating: true } : {}) }),
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
      const res = await fetch(`${apiBase}/api/v1/${roomKind === "application" ? "application-profiles" : "dealer-os"}/public/room/${token}/bank-consent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The disclosure text is deliberately not sent — the server records the
        // wording it served, which is what makes the stored proof meaningful.
        body: JSON.stringify({ passcode, consenter_name: signer.trim(), method: "self_web", granted: true }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "That authorization could not be recorded.");
      }
      setConsentGranted(true);
      onConnected();
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
      const res = await fetch(`${apiBase}/api/v1/${roomKind === "application" ? "application-profiles" : "dealer-os"}/public/room/${token}/plaid/link-token`, {
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
      const handoff = {
        linkToken: out.link_token,
        token,
        passcode,
        returnTo: window.location.href,
        mode: "initial",
        isPrimaryOperating: connections.length === 0,
      } as const;
      if (roomKind === "application") stashApplicationRoomHandoff(handoff);
      else stashRoomHandoff(handoff);
      setLinkMode("initial");
      setLinkItemId(null);
      setLinkToken(out.link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bank connection is not available right now.");
    } finally {
      setBusy(false);
    }
  }

  async function startUpdate(connection: BankConnection, accountSelectionEnabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        roomKind === "application"
          ? `${apiBase}/api/v1/application-profiles/public/room/${token}/plaid/${connection.id}/update-link-token`
          : `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/${connection.id}/update-link-token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passcode,
            account_selection_enabled:
              accountSelectionEnabled || connection.update_mode_account_selection,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The bank connection could not be updated.");
      }
      const out = (await res.json()) as { link_token: string };
      const handoff = {
        linkToken: out.link_token,
        token,
        passcode,
        returnTo: window.location.href,
        mode: "update",
        itemId: connection.id,
      } as const;
      if (roomKind === "application") stashApplicationRoomHandoff(handoff);
      else stashRoomHandoff(handoff);
      setLinkMode("update");
      setLinkItemId(connection.id);
      setLinkToken(out.link_token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bank connection could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect(connection: BankConnection) {
    if (!window.confirm("Disconnect this bank? Previously imported statement evidence will remain on the file.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        roomKind === "application"
          ? `${apiBase}/api/v1/application-profiles/public/room/${token}/plaid/${connection.id}`
          : `${apiBase}/api/v1/dealer-os/public/room/${token}/plaid/${connection.id}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passcode }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The bank could not be disconnected.");
      }
      setDone("Bank disconnected. Previously imported evidence remains available.");
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The bank could not be disconnected.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel mb">
      <div className="panel-h">
        <h2>Connect business accounts</h2>
      </div>
      <div className="panel-b">
        <p className="sub">
          Connect every business operating account you want considered. {selectedProducts.includes("assets") && selectedProducts.includes("statements")
            ? "Plaid provides read-only balances and transaction history plus bank-produced statement PDFs."
            : selectedProducts.includes("statements")
              ? "Plaid retrieves bank-produced statement PDFs for the selected date range."
              : "Plaid provides read-only balances and transaction history for underwriting."} No credentials pass through Qualified Commercial, and nothing can be moved or charged.
        </p>
        <div className="row mt" style={{ gap: 7, flexWrap: "wrap" }}>
          {selectedProducts.map((product) => <CellChip key={product} tone="acc">{product === "assets" ? "Assets" : "Statement PDFs"}</CellChip>)}
        </div>
        {connections.length > 0 ? (
          <div className="mt" style={{ display: "grid", gap: 8 }}>
            {connections.map((connection) => (
              <div key={connection.id} className="filerow room-bank-row">
                <div className="grow">
                  <b>{connection.institution_name || "Connected institution"}</b>
                  <span className="sub" style={{ display: "block", marginTop: 3 }}>
                    {connection.accounts_label || "Account details syncing"} · {connection.statement_months.length ? `${connection.statement_months.length} statement month${connection.statement_months.length === 1 ? "" : "s"}` : "evidence syncing"}
                  </span>
                  {connection.unavailable_products.length ? <span className="sub" style={{ display: "block", marginTop: 3 }}>This institution cannot provide Statement PDFs through Plaid. Upload the requested bank PDFs instead; Assets will continue when selected.</span> : connection.pending_products.length ? <span className="sub" style={{ display: "block", marginTop: 3 }}>Authorize {connection.pending_products.map((product) => product === "assets" ? "Assets" : "Statement PDFs").join(" and ")} for this bank.</span> : connection.update_mode_reason ? <span className="sub" style={{ display: "block", marginTop: 3 }}>{bankUpdateMessage(connection)}</span> : null}
                </div>
                <CellChip tone={connection.authorization_state === "authorized" ? "ok" : "warn"}>
                  {connection.authorization_state === "client_authorization_required" ? "Authorization needed" : connection.authorization_state === "fallback_required" ? "PDF upload needed" : connection.status}
                </CellChip>
                {connection.is_primary_operating ? (
                  <CellChip tone="acc">Main operating bank</CellChip>
                ) : (
                  <Btn disabled={busy} onClick={() => setPrimary(connection.id)}>
                    Make main
                  </Btn>
                )}
                {consentGranted && connection.pending_products.length ? (
                  <Btn variant="pri" disabled={busy} onClick={() => startUpdate(connection, false)}>
                    {connection.pending_products.length === 1
                      ? `Enable ${connection.pending_products[0] === "assets" ? "Assets" : "Statement PDFs"}`
                      : "Authorize products"}
                  </Btn>
                ) : consentGranted && connection.update_mode_reason && !connection.update_mode_account_selection ? (
                  <Btn variant="pri" disabled={busy} onClick={() => startUpdate(connection, false)}>
                    Repair connection
                  </Btn>
                ) : null}
                <Btn
                  variant={connection.update_mode_account_selection ? "pri" : undefined}
                  disabled={busy || !consentGranted}
                  onClick={() => startUpdate(connection, true)}
                >
                  {connection.update_mode_account_selection ? "Review new accounts" : "Add accounts"}
                </Btn>
                <Btn disabled={busy} onClick={() => disconnect(connection)}>Disconnect</Btn>
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
                disabled={!agreed || signer.trim().length < 2 || busy}
                onClick={authorize}
              >
                {busy ? "Recording…" : "Authorize and continue"}
              </Btn>
            </div>
          </>
        ) : (
          <div className="mt">
            <Btn variant="pri" disabled={busy} onClick={start}>
              {busy ? "Opening…" : connections.length ? "Add another institution" : "Connect bank securely"}
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
  view = "all",
}: {
  token: string;
  passcode: string;
  /** Called after a connection or signature lands so the page can refresh its checklist. */
  onChanged: () => void;
  view?: "all" | "banking" | "agreements";
}) {
  const [features, setFeatures] = useState<Features | null>(null);
  const [roomKind, setRoomKind] = useState<RoomKind>("dealer");
  const [signing, setSigning] = useState<Signable | null>(null);
  const [signingContract, setSigningContract] = useState<RoomContract | null>(null);
  const [signingEnvelope, setSigningEnvelope] = useState<RoomEnvelope | null>(null);
  const [signBusy, setSignBusy] = useState(false);
  const [signError, setSignError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/dealer-os/public/room/${token}/features`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) {
        setRoomKind("dealer");
        setFeatures((await res.json()) as Features);
        return;
      }
      const application = await fetch(`${apiBase}/api/v1/application-profiles/public/room/${token}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (!application.ok) return;
      const state = (await application.json()) as {
        business_name: string;
        signable: Signable[];
        banking: {
          enabled: boolean;
          environment: string;
          consent_granted: boolean;
          disclosure_text: string;
          items: BankConnection[];
          assets_enabled: boolean;
          statements_enabled: boolean;
          selected_products: string[];
          available_products: string[];
        };
      };
      setRoomKind("application");
      setFeatures({
        business_name: state.business_name,
        bank_connect_available: state.banking.enabled,
        plaid_environment: state.banking.environment,
        bank_consent_granted: state.banking.consent_granted,
        bank_consent_disclosure: state.banking.disclosure_text,
        bank_connections: state.banking.items,
        plaid_assets_enabled: state.banking.assets_enabled,
        plaid_statements_enabled: state.banking.statements_enabled,
        plaid_selected_products: state.banking.selected_products,
        plaid_available_products: state.banking.available_products,
        signable: state.signable ?? [],
        contracts: [],
        envelopes: [],
      });
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
      const res = await fetch(
        roomKind === "application"
          ? `${apiBase}/api/v1/application-profiles/public/room/${token}/sign`
          : `${apiBase}/api/v1/dealer-os/public/room/${token}/sign`, {
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
  const envelopesPending = (features.envelopes ?? []).filter((envelope) => envelope.status === "out_for_signature");
  const envelopesSigned = (features.envelopes ?? []).filter((envelope) => envelope.status === "executed");

  return (
    <>
      {signingEnvelope ? (
        <EnvelopeSigner
          token={token}
          passcode={passcode}
          initialEnvelope={signingEnvelope}
          onClose={() => setSigningEnvelope(null)}
          onDone={() => { void load(); onChanged(); }}
        />
      ) : null}

      {(view === "all" || view === "agreements") && !signingEnvelope && (envelopesPending.length > 0 || envelopesSigned.length > 0) ? (
        <section className="panel mb">
          <div className="panel-h"><h2>Application package</h2></div>
          <div className="panel-b">
            <p className="sub mb">Review every required program form in sequence. You will draw one signature and affirm that it applies to the complete listed package.</p>
            {envelopesPending.map((envelope) => <div key={envelope.id} className="filerow"><b className="grow">{envelope.title}</b><CellChip tone="warn">{envelope.documents.length} document{envelope.documents.length === 1 ? "" : "s"}</CellChip><Btn variant="pri" onClick={() => setSigningEnvelope(envelope)}>Review package</Btn></div>)}
            {envelopesSigned.map((envelope) => <div key={envelope.id} className="filerow"><b className="grow">{envelope.title}</b><CellChip tone="ok">Signed</CellChip>{envelope.bundle_download_url && <a className="btn" href={envelope.bundle_download_url} download>Download</a>}</div>)}
          </div>
        </section>
      ) : null}

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

      {(view === "all" || view === "agreements") && !signingContract && (contractsPending.length > 0 || contractsSigned.length > 0) ? (
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
      {(view === "all" || view === "banking") && features.bank_connect_available ? (
        <BankConnect
          token={token}
          passcode={passcode}
          environment={features.plaid_environment}
          consentGranted={features.bank_consent_granted}
          disclosure={features.bank_consent_disclosure}
          connections={features.bank_connections ?? []}
          selectedProducts={features.plaid_selected_products ?? ["assets"]}
          roomKind={roomKind}
          onConnected={() => {
            void load();
            onChanged();
          }}
        />
      ) : null}

      {(view === "all" || view === "agreements") && (pending.length > 0 || signed.length > 0) ? (
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

      {view === "agreements" && !signing && !signingContract && !signingEnvelope && pending.length === 0 && signed.length === 0 && contractsPending.length === 0 && contractsSigned.length === 0 && envelopesPending.length === 0 && envelopesSigned.length === 0 ? (
        <div className="application-room-empty">There are no agreements waiting for signature.</div>
      ) : null}

      {(view === "all" || view === "agreements") && signing ? (
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
