"use client";

// Documents tab — toggles between the agent's document collection
// (realtor-side: listing agreement, comps, photos, pre-approval, etc.)
// and the funding team's documents on the linked Loan. The funding
// view is hidden until the deal is promoted (no loan_id yet).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useDocumentsForClient } from "@/hooks/useApi";

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
