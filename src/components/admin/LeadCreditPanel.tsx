"use client";

// Admin "Credit" workspace tab on an AI Underwriter Lead — request the
// client's signed credit-authorization, then run the bureau soft pull once
// signed. Identical component for dealer and real-estate leads: the only
// per-vertical difference (which document text/template the client sees) is
// admin-supplied data on the request, not branching UI.

import { useRef, useState } from "react";
import { Btn, CellChip, Field, Input, Panel, StatusLine, Sub, Textarea } from "@/components/ds";
import { FileDropzone } from "@/components/design-system/FileDropzone";
import {
  useCreditSummary,
  useLeadCreditStatus,
  useRequestLeadCreditAuthorization,
  useRunLeadCreditPull,
  useUploadLeadCreditTemplate,
} from "@/hooks/useApi";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { ApiError } from "@/lib/api";

export function LeadCreditPanel({ intakeId }: { intakeId: string }) {
  const status = useLeadCreditStatus(intakeId);
  const requestAuth = useRequestLeadCreditAuthorization(intakeId);
  const uploadTemplate = useUploadLeadCreditTemplate(intakeId);
  const runPull = useRunLeadCreditPull(intakeId);
  const summary = useCreditSummary(status.data?.pull_id);
  const [documentText, setDocumentText] = useState("");
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [ssn, setSsn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fileInputKey = useRef(0);

  if (status.isLoading) {
    return (
      <Panel title="Credit">
        <Sub>Loading credit status…</Sub>
      </Panel>
    );
  }

  const data = status.data;
  const authorizationRequested = Boolean(data?.authorization_requested);
  const authorizationSigned = Boolean(data?.authorization_signed);

  async function onRequestAuthorization() {
    setError(null);
    try {
      let template_file_id: string | null = null;
      if (templateFile) {
        template_file_id = await uploadTemplate.mutateAsync(templateFile);
      }
      await requestAuth.mutateAsync({
        template_file_id,
        document_text: documentText.trim() || null,
      });
      setTemplateFile(null);
      setDocumentText("");
      fileInputKey.current += 1;
    } catch (err) {
      setError(readErrorMessage(err));
    }
  }

  async function onRunPull() {
    setError(null);
    try {
      await runPull.mutateAsync({ ssn: ssn.length === 9 ? ssn : undefined });
      setSsn("");
    } catch (err) {
      setError(readErrorMessage(err));
    }
  }

  const pending = requestAuth.isPending || uploadTemplate.isPending || runPull.isPending;

  return (
    // Grid, not flex-column: `.panel` is overflow:hidden, and as a flex child
    // that zeroes its automatic minimum size and clips the form inside it.
    <div className="grid">
      <Panel
        title="Credit report authorization"
        actions={
          <CellChip tone={authorizationSigned ? "ok" : authorizationRequested ? "warn" : "mut"}>
            {authorizationSigned ? "Signed" : authorizationRequested ? "Awaiting signature" : "Not requested"}
          </CellChip>
        }
      >
        {!authorizationRequested ? (
          <div className="grid g10">
            <p className="sub">
              Send a signature request to the client via their intake link. Real estate leads default to a
              built-in FCRA-style disclosure. For a dealer-specific document, optionally upload a template
              below — the client will see and sign that exact file instead.
            </p>
            <Field label="Custom disclosure text (optional — leave blank to use the default)">
              {/* aria-label because `Field` renders a <span class="lbl">, not a
                  <label for>: the old markup wrapped the control in a <label>,
                  so the control had an accessible name and this keeps it. */}
              <Textarea
                aria-label="Custom disclosure text (optional — leave blank to use the default)"
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                rows={4}
              />
            </Field>
            <div className="fldsec">
              <div className="lbl">Template document (optional)</div>
              {templateFile ? (
                <div className="row">
                  <span>{templateFile.name}</span>
                  <Btn onClick={() => setTemplateFile(null)}>Remove</Btn>
                </div>
              ) : (
                <FileDropzone key={fileInputKey.current} multiple={false} onFiles={(files) => setTemplateFile(files[0] ?? null)} title="Upload a signable template (PDF)" />
              )}
            </div>
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
            <div>
              <Btn variant="pri" onClick={onRequestAuthorization} disabled={pending}>
                {pending ? "Requesting…" : "Request credit authorization"}
              </Btn>
            </div>
          </div>
        ) : (
          <div className="grid g8">
            <p className="sub">
              {authorizationSigned
                ? "The client has signed the credit authorization — you can run the soft pull below."
                : "Waiting on the client to sign the authorization form via their intake link."}
            </p>
          </div>
        )}
      </Panel>

      {authorizationRequested ? (
        <Panel
          title="Run credit pull"
          actions={data?.fico != null ? <CellChip tone="ok">FICO {data.fico}</CellChip> : null}
        >
          <div className="grid g10">
            <p className="sub">
              Runs the bureau soft pull using the identity the client entered when signing. No card on file is
              required — the signed authorization is the consent record.
            </p>
            {/* Bespoke width (rule 3): a 9-digit field should not span the panel. */}
            <div style={{ maxWidth: 220 }}>
              <Field label="SSN (only if a first attempt returns no-hit)">
                <Input
                  aria-label="SSN (only if a first attempt returns no-hit)"
                  value={ssn}
                  onChange={(e) => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="9 digits, no dashes"
                  type="password"
                />
              </Field>
            </div>
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
            <div>
              <Btn variant="pri" onClick={onRunPull} disabled={!authorizationSigned || pending}>
                {runPull.isPending ? "Pulling…" : data?.pull_id ? "Re-run credit pull" : "Run credit pull"}
              </Btn>
            </div>
            {data?.pulled_at ? (
              <Sub>
                Last pulled {new Date(data.pulled_at).toLocaleString()}
                {data.expires_at ? ` · valid through ${new Date(data.expires_at).toLocaleDateString()}` : ""}
              </Sub>
            ) : null}
          </div>
        </Panel>
      ) : null}

      {data?.pull_id ? <CreditSummaryCard summary={summary.data} loading={summary.isLoading} /> : null}
    </div>
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
