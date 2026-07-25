"use client";

// Admin "Credit" workspace tab on an AI Underwriter Lead — request the
// client's signed credit-authorization, then run the bureau soft pull once
// signed. Identical component for dealer and real-estate leads: the only
// per-vertical difference (which document text/template the client sees) is
// admin-supplied data on the request, not branching UI.

import { useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
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
  const { t } = useTheme();
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
      <Card pad={20}>
        <SectionLabel>Credit</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading credit status…</span>
      </Card>
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
    <div style={{ display: "grid", gap: 14 }}>
      <Card pad={20}>
        <SectionLabel
          action={
            <Pill
              bg={authorizationSigned ? t.profitBg : authorizationRequested ? t.warnBg : t.surface2}
              color={authorizationSigned ? t.profit : authorizationRequested ? t.warn : t.ink3}
            >
              {authorizationSigned ? "Signed" : authorizationRequested ? "Awaiting signature" : "Not requested"}
            </Pill>
          }
        >
          Credit report authorization
        </SectionLabel>

        {!authorizationRequested ? (
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
              Send a signature request to the client via their intake link. Real estate leads default to a
              built-in FCRA-style disclosure. For a dealer-specific document, optionally upload a template
              below — the client will see and sign that exact file instead.
            </p>
            <label style={{ display: "block" }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                Custom disclosure text (optional — leave blank to use the default)
              </div>
              <textarea
                value={documentText}
                onChange={(e) => setDocumentText(e.target.value)}
                rows={4}
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13, fontFamily: "inherit" }}
              />
            </label>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                Template document (optional)
              </div>
              {templateFile ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: t.ink2 }}>
                  <span>{templateFile.name}</span>
                  <button type="button" style={qcBtn(t)} onClick={() => setTemplateFile(null)}>Remove</button>
                </div>
              ) : (
                <FileDropzone key={fileInputKey.current} multiple={false} onFiles={(files) => setTemplateFile(files[0] ?? null)} title="Upload a signable template (PDF)" />
              )}
            </div>
            {error ? <div style={{ color: t.danger, fontSize: 12.5 }}>{error}</div> : null}
            <div>
              <button style={qcBtnPrimary(t)} onClick={onRequestAuthorization} disabled={pending}>
                {pending ? "Requesting…" : "Request credit authorization"}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
              {authorizationSigned
                ? "The client has signed the credit authorization — you can run the soft pull below."
                : "Waiting on the client to sign the authorization form via their intake link."}
            </p>
          </div>
        )}
      </Card>

      {authorizationRequested ? (
        <Card pad={20}>
          <SectionLabel
            action={
              data?.fico != null ? (
                <Pill bg={t.profitBg} color={t.profit}>FICO {data.fico}</Pill>
              ) : null
            }
          >
            Run credit pull
          </SectionLabel>
          <div style={{ display: "grid", gap: 10 }}>
            <p style={{ margin: 0, color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
              Runs the bureau soft pull using the identity the client entered when signing. No card on file is
              required — the signed authorization is the consent record.
            </p>
            <label style={{ display: "block", maxWidth: 220 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
                SSN (only if a first attempt returns no-hit)
              </div>
              <input
                value={ssn}
                onChange={(e) => setSsn(e.target.value.replace(/\D/g, "").slice(0, 9))}
                placeholder="9 digits, no dashes"
                type="password"
                style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13 }}
              />
            </label>
            {error ? <div style={{ color: t.danger, fontSize: 12.5 }}>{error}</div> : null}
            <div>
              <button style={qcBtnPrimary(t)} onClick={onRunPull} disabled={!authorizationSigned || pending}>
                {runPull.isPending ? "Pulling…" : data?.pull_id ? "Re-run credit pull" : "Run credit pull"}
              </button>
            </div>
            {data?.pulled_at ? (
              <span style={{ color: t.ink3, fontSize: 12 }}>
                Last pulled {new Date(data.pulled_at).toLocaleString()}
                {data.expires_at ? ` · valid through ${new Date(data.expires_at).toLocaleDateString()}` : ""}
              </span>
            ) : null}
          </div>
        </Card>
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
