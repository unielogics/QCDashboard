"use client";

// Admin-only "prepare banker submission" modal on a dealer AI Underwriter
// Lead — the final step before an admin hands a normalized JSON payload to
// the banker's own intake system. Collects SSN / personal Tax ID
// transiently: neither field, nor the resulting payload (which echoes them
// back once under sensitive_identifiers), is ever carried across a reopen —
// mirrors CreditPullModal's "never carry SSN across reopens" convention,
// extended here to personal_tax_id and to the previous run's generated
// payload. There is no outbound call to the banker yet (that integration's
// API spec doesn't exist) — this only assembles and displays the payload for
// copy/download.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Modal } from "@/components/design-system/Modal";
import { Pill } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { usePrepareBankerSubmission } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { BankerSubmissionPayload } from "@/lib/types";

export function BankerSubmissionModal({
  open,
  onClose,
  intakeId,
}: {
  open: boolean;
  onClose: () => void;
  intakeId: string;
}) {
  const { t } = useTheme();
  const prepare = usePrepareBankerSubmission(intakeId);
  const [ssn, setSsn] = useState("");
  const [personalTaxId, setPersonalTaxId] = useState("");
  const [payload, setPayload] = useState<BankerSubmissionPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset everything every time the modal reopens — never carry SSN,
  // personal Tax ID, or a previously-generated payload (which itself
  // contains sensitive_identifiers) across reopens.
  useEffect(() => {
    if (open) {
      setSsn("");
      setPersonalTaxId("");
      setPayload(null);
      setError(null);
      setCopied(false);
    }
  }, [open]);

  async function onGenerate() {
    setError(null);
    setCopied(false);
    try {
      const identifiers: { ssn?: string; personal_tax_id?: string } = {};
      if (ssn.length === 9) identifiers.ssn = ssn;
      if (personalTaxId.length === 9) identifiers.personal_tax_id = personalTaxId;
      const result = await prepare.mutateAsync({ identifiers });
      setPayload(result.payload);
    } catch (err) {
      setError(readErrorMessage(err));
    }
  }

  async function onCopy() {
    if (!payload) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
    } catch {
      setError("Copy failed.");
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Prepare banker submission"
      size="lg"
      footer={
        <>
          <button type="button" style={qcBtn(t)} onClick={onClose}>Close</button>
          <button type="button" style={qcBtnPrimary(t)} onClick={onGenerate} disabled={prepare.isPending}>
            {prepare.isPending ? <><Spinner /> Generating…</> : payload ? "Regenerate payload" : "Generate payload"}
          </button>
        </>
      }
    >
      <div style={{ padding: 18, display: "grid", gap: 14 }}>
        <p style={{ margin: 0, color: t.ink2, fontSize: 12.5, lineHeight: 1.5 }}>
          SSN and personal Tax ID are sent once to assemble this payload and are never stored on our servers or
          in this lead's record — re-enter them each time you prepare a submission. Both fields are optional;
          fill in either, neither, or both depending on what the banker's program requires.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              SSN (optional)
            </div>
            <input
              value={ssn}
              onChange={(e) => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="9 digits, no dashes"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13 }}
            />
          </label>
          <label style={{ display: "block" }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
              Personal Tax ID / ITIN (optional)
            </div>
            <input
              value={personalTaxId}
              onChange={(e) => setPersonalTaxId(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="9 digits, no dashes"
              type="password"
              autoComplete="off"
              inputMode="numeric"
              style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13 }}
            />
          </label>
        </div>

        {error ? <div style={{ color: t.danger, fontSize: 12.5 }}>{error}</div> : null}

        {payload ? (
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Assembled payload
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {copied ? <Pill bg={t.profitBg} color={t.profit}>Copied</Pill> : null}
                <button type="button" style={qcBtn(t)} onClick={onCopy}>Copy JSON</button>
              </div>
            </div>
            <pre
              style={{
                margin: 0,
                maxHeight: 420,
                overflow: "auto",
                padding: 12,
                borderRadius: 10,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
                fontSize: 12,
                lineHeight: 1.5,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {JSON.stringify(payload, null, 2)}
            </pre>
          </div>
        ) : (
          <span style={{ color: t.ink3, fontSize: 13 }}>
            Generate the payload to review borrower, entity, key-metrics, and program-fit data assembled for the
            banker before handing it off.
          </span>
        )}
      </div>
    </Modal>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: 999,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: 6,
        animation: "qc-banker-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes qc-banker-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}

function readErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | undefined;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === "string") return msg;
    }
  }
  return err instanceof Error ? err.message : "Request failed. Please retry.";
}
