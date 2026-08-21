"use client";

// Documents tab — toggles between the agent's document collection
// (realtor-side: listing agreement, comps, photos, pre-approval, etc.)
// and the funding team's documents on the linked Loan. The funding
// view is hidden until the deal is promoted (no loan_id yet).

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { CellChip, ItemRow, Panel, Sub, Tag } from "@/components/ds";
import { useDocuments, useDocumentsForClient, useDocumentsAnalysis, type DocAnalysisResponse } from "@/hooks/useApi";

type DocsScope = "agent" | "funding";

export function DocumentsTab({
  clientId,
  loanId,
}: {
  clientId: string;
  loanId: string | null;
}) {
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
    <div className="grid">
      {analysis ? <UnderwritingSummary data={analysis} /> : null}

      <Panel
        title="Documents"
        actions={
          <>
            <Tag>{visible.length}</Tag>
            {/* Not a ds/Seg: one of the two segments can be unavailable, and a
                disabled segment inside a tablist announces as a tab you cannot
                reach rather than a capability you have not unlocked yet. */}
            <div className="seg" role="group" aria-label="Document scope">
              <button
                type="button"
                className={scope === "agent" ? "on" : ""}
                aria-pressed={scope === "agent"}
                onClick={() => setScope("agent")}
              >
                <Icon name="user" size={11} /> Agent
              </button>
              <button
                type="button"
                className={scope === "funding" ? "on" : ""}
                aria-pressed={scope === "funding"}
                disabled={!fundingAvailable}
                title={fundingAvailable ? undefined : "Available once the file is promoted to funding"}
                onClick={() => fundingAvailable && setScope("funding")}
              >
                <Icon name="file" size={11} /> Funding
                {!fundingAvailable ? " (locked)" : ""}
              </button>
            </div>
          </>
        }
      >
        {loading ? (
          <Sub>Loading…</Sub>
        ) : visible.length === 0 ? (
          <Sub>
            {scope === "funding"
              ? "No funding documents on file yet. Items the funding team is chasing appear here as the borrower uploads them."
              : "No agent documents yet. Listing agreements, photos, comps, and pre-approval letters land here as you collect them."}
          </Sub>
        ) : (
          <div>
            {visible.map((d) => (
              <ItemRow
                key={d.id}
                icon={<Icon name="doc" size={15} />}
                right={<CellChip tone={d.status === "verified" ? "ok" : "mut"}>{d.status}</CellChip>}
              >
                <b style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</b>
              </ItemRow>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function UnderwritingSummary({ data }: { data: DocAnalysisResponse }) {
  const { summary, documents } = data;
  const tone =
    summary.verdict === "clean"
      ? { chip: "ok" as const, icon: "check" as const }
      : summary.verdict === "needs_review"
        ? { chip: "warn" as const, icon: "alert" as const }
        : { chip: "mut" as const, icon: "refresh" as const };
  return (
    <Panel
      title="AI underwriting summary"
      actions={
        <CellChip tone={tone.chip}>
          <Icon name={tone.icon} size={11} />
          {summary.verdict === "needs_review" ? "Needs review" : summary.verdict}
        </CellChip>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>{summary.headline}</div>
      <Sub>
        {summary.reviewed}/{summary.total} reviewed · {summary.flagged} flagged ·{" "}
        {summary.conflicts} cross-document conflict(s)
      </Sub>
      {documents.length ? (
        <div className="grid g8" style={{ marginTop: 12 }}>
          {documents.map((d) => {
            const hasIssues = (d.issues?.length ?? 0) > 0 || d.status === "flagged";
            return (
              <div key={d.document_id} className={hasIssues ? "itemrow flagged" : "itemrow"} style={{ display: "block" }}>
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <b style={{ flex: 1, minWidth: 0, fontSize: 12.5 }}>{d.name}</b>
                  {d.detected_type ? (
                    <span className="sub">
                      {d.detected_type}
                      {d.confidence != null ? ` · ${Math.round(d.confidence * 100)}%` : ""}
                    </span>
                  ) : (
                    <span className="sub">
                      {d.ai_scan_status === "scanned" ? "—" : "review pending"}
                    </span>
                  )}
                </div>
                {d.ai_notes ? <Sub>{d.ai_notes}</Sub> : null}
                {(d.issues ?? []).map((iss, idx) => (
                  <div
                    key={idx}
                    style={{ fontSize: 11.5, color: "var(--warn)", marginTop: 4, fontWeight: 600 }}
                  >
                    ⚠ {String(iss.field ?? iss.type ?? "Conflict")}
                    {iss.severity ? ` (${String(iss.severity)})` : ""}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}
    </Panel>
  );
}
