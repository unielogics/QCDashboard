"use client";

// Documents tab — toggles between the agent's document collection
// (realtor-side: listing agreement, comps, photos, pre-approval, etc.)
// and the funding team's documents on the linked Loan. The funding
// view is hidden until the deal is promoted (no loan_id yet).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useDocumentsForClient, useDocumentsAnalysis, type DocAnalysisResponse } from "@/hooks/useApi";

type DocsScope = "agent" | "funding";

export function DocumentsTab({
  clientId,
  loanId,
}: {
  clientId: string;
  loanId: string | null;
}) {
  const { t } = useTheme();
  const fundingAvailable = Boolean(loanId);
  // Default to funding when promoted (that's the active surface); agent
  // pre-promotion has no other option.
  const [scope, setScope] = useState<DocsScope>(fundingAvailable ? "funding" : "agent");

  const { data: clientDocs = [], isLoading: clientLoading } = useDocumentsForClient(clientId);
  const { data: loanDocs = [], isLoading: loanLoading } = useDocuments(
    fundingAvailable ? loanId ?? undefined : undefined,
  );

  // Agent docs = client-stage documents (loan_id NULL) — what the
  // agent collected before/around the deal. Funding docs = strictly
  // the linked loan's documents.
  const agentDocs = clientDocs.filter((d) => !d.loan_id);
  const visible = scope === "funding" ? loanDocs : agentDocs;
  const loading = scope === "funding" ? loanLoading : clientLoading;

  const { data: analysis } = useDocumentsAnalysis(
    scope === "funding" && fundingAvailable
      ? { loanId: loanId ?? undefined }
      : { clientId },
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>Documents · {visible.length}</SectionLabel>
        <div
          style={{
            display: "inline-flex",
            background: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            padding: 2,
            gap: 2,
          }}
        >
          <ScopeBtn t={t} active={scope === "agent"} onClick={() => setScope("agent")}>
            <Icon name="user" size={11} /> Agent
          </ScopeBtn>
          <ScopeBtn
            t={t}
            active={scope === "funding"}
            onClick={() => fundingAvailable && setScope("funding")}
            disabled={!fundingAvailable}
            title={fundingAvailable ? undefined : "Available once the file is promoted to funding"}
          >
            <Icon name="file" size={11} /> Funding
            {!fundingAvailable ? (
              <span style={{ marginLeft: 4, fontSize: 9, opacity: 0.7 }}>(locked)</span>
            ) : null}
          </ScopeBtn>
        </div>
        {scope === "funding" && fundingAvailable ? (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: t.brand, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Loan documents
          </span>
        ) : null}
      </div>

      {analysis ? <UnderwritingSummary t={t} data={analysis} /> : null}

      <Card pad={16}>
        {loading ? (
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3 }}>
            {scope === "funding"
              ? "No funding documents on file yet. Items the funding team is chasing appear here as the borrower uploads them."
              : "No agent documents yet. Listing agreements, photos, comps, and pre-approval letters land here as you collect them."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {visible.map((d) => (
              <div
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                }}
              >
                <Icon name="doc" size={14} />
                <div style={{ flex: 1, fontSize: 13, color: t.ink, fontWeight: 600 }}>{d.name}</div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 6px",
                    borderRadius: 4,
                    background: t.chip,
                    color: t.ink2,
                    textTransform: "uppercase",
                  }}
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function ScopeBtn({
  t,
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: "5px 10px",
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 6,
        border: "none",
        background: active ? t.brandSoft : "transparent",
        color: active ? t.brand : disabled ? t.ink4 : t.ink2,
        cursor: disabled ? "not-allowed" : "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function UnderwritingSummary({
  t,
  data,
}: {
  t: ReturnType<typeof useTheme>["t"];
  data: DocAnalysisResponse;
}) {
  const { summary, documents } = data;
  const tone =
    summary.verdict === "clean"
      ? { bg: t.profitBg, fg: t.profit, icon: "check" as const }
      : summary.verdict === "needs_review"
        ? { bg: t.warnBg, fg: t.warn, icon: "alert" as const }
        : { bg: t.surface2, fg: t.ink3, icon: "refresh" as const };
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <SectionLabel>AI underwriting summary</SectionLabel>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "3px 9px",
            borderRadius: 999,
            background: tone.bg,
            color: tone.fg,
            fontSize: 11,
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          <Icon name={tone.icon} size={11} />
          {summary.verdict === "needs_review" ? "Needs review" : summary.verdict}
        </span>
      </div>
      <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.5 }}>{summary.headline}</div>
      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>
        {summary.reviewed}/{summary.total} reviewed · {summary.flagged} flagged ·{" "}
        {summary.conflicts} cross-document conflict(s)
      </div>
      {documents.length ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {documents.map((d) => {
            const hasIssues = (d.issues?.length ?? 0) > 0 || d.status === "flagged";
            return (
              <div
                key={d.document_id}
                style={{
                  padding: "8px 10px",
                  borderRadius: 9,
                  border: `1px solid ${hasIssues ? t.warn + "55" : t.line}`,
                  background: hasIssues ? t.warnBg : t.surface,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: t.ink }}>
                    {d.name}
                  </span>
                  {d.detected_type ? (
                    <span style={{ fontSize: 11, color: t.ink3 }}>
                      {d.detected_type}
                      {d.confidence != null ? ` · ${Math.round(d.confidence * 100)}%` : ""}
                    </span>
                  ) : (
                    <span style={{ fontSize: 11, color: t.ink4 }}>
                      {d.ai_scan_status === "scanned" ? "—" : "review pending"}
                    </span>
                  )}
                </div>
                {d.ai_notes ? (
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4, lineHeight: 1.45 }}>
                    {d.ai_notes}
                  </div>
                ) : null}
                {(d.issues ?? []).map((iss, idx) => (
                  <div key={idx} style={{ fontSize: 11.5, color: t.warn, marginTop: 4, fontWeight: 600 }}>
                    ⚠ {String(iss.field ?? iss.type ?? "Conflict")}
                    {iss.severity ? ` (${String(iss.severity)})` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}
