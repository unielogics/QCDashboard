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
import { Btn, CellChip, Field, Input, Lbl, StatusLine, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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
    <Drawer
      open={open}
      onClose={onClose}
      title="Prepare banker submission"
      width="lg"
      footer={
        <>
          {/* `.drawer-f` is a left-aligned flex row; the old Modal footer was
              right-aligned, so this keeps the actions where they were. */}
          <span className="grow" />
          <Btn onClick={onClose}>Close</Btn>
          <Btn variant="pri" onClick={onGenerate} disabled={prepare.isPending}>
            {prepare.isPending ? (
              <>
                <Spinner /> Generating…
              </>
            ) : payload ? (
              "Regenerate payload"
            ) : (
              "Generate payload"
            )}
          </Btn>
        </>
      }
    >
      <div className="grid">
        <p className="sub">
          SSN and personal Tax ID are sent once to assemble this payload and are never stored on our servers or
          in this lead&apos;s record — re-enter them each time you prepare a submission. Both fields are
          optional; fill in either, neither, or both depending on what the banker&apos;s program requires.
        </p>

        <div className="fldgrid two">
          <Field label="SSN (optional)">
            {/* aria-label because `Field` renders a <span class="lbl">, not a
                <label for>; the old markup wrapped the control in a <label>. */}
            <Input
              aria-label="SSN (optional)"
              value={ssn}
              onChange={(e) => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="9 digits, no dashes"
              type="password"
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>
          <Field label="Personal Tax ID / ITIN (optional)">
            <Input
              aria-label="Personal Tax ID / ITIN (optional)"
              value={personalTaxId}
              onChange={(e) => setPersonalTaxId(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="9 digits, no dashes"
              type="password"
              autoComplete="off"
              inputMode="numeric"
            />
          </Field>
        </div>

        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

        {payload ? (
          <div className="grid g8">
            <div className="row">
              <Lbl className="grow">Assembled payload</Lbl>
              {copied ? <CellChip tone="ok">Copied</CellChip> : null}
              <Btn onClick={onCopy}>Copy JSON</Btn>
            </div>
            {/* Bespoke surface (rule 3): a scrolling JSON preview. The
                vocabulary has no code-block word, and every property here is
                specific to reading raw JSON in a fixed-height well. */}
            <pre
              style={{
                margin: 0,
                maxHeight: 420,
                overflow: "auto",
                padding: 12,
                borderRadius: 10,
                border: "1px solid var(--line)",
                background: "var(--sunken2)",
                color: "var(--ink)",
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
          <Sub>
            Generate the payload to review borrower, entity, key-metrics, and program-fit data assembled for the
            banker before handing it off.
          </Sub>
        )}
      </div>
    </Drawer>
  );
}

function Spinner() {
  return <span className="spinner" />;
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
