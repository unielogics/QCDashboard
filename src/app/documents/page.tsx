"use client";

import { useState, useMemo } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useLoans, useClients } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { DocRequestModal } from "./components/DocRequestModal";
import { DocUploadButton } from "./components/DocUploadButton";

export default function DocumentsPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { data: docs = [] } = useDocuments();
  const { data: loans = [] } = useLoans();
  const { data: clients = [] } = useClients();
  const [q, setQ] = useState("");
  const [hideClosed, setHideClosed] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  const canRequest = profile.role !== "client";

  const loansById = Object.fromEntries(loans.map((l) => [l.id, l]));
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const loan = loansById[d.loan_id];
      if (!loan) return false;
      if (hideClosed && loan.stage === "funded") return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q.toLowerCase()) || loan.address.toLowerCase().includes(q.toLowerCase());
    });
  }, [docs, q, hideClosed, loansById]);

  // Group by client
  const byClient: Record<string, typeof filtered> = {};
  for (const d of filtered) {
    const loan = loansById[d.loan_id];
    if (!loan) continue;
    (byClient[loan.client_id] ||= []).push(d);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Documents</h1>
        <Pill>{filtered.length} of {docs.length}</Pill>
        <Pill bg={t.brandSoft} color={t.brand}>Funding</Pill>
        <span style={{ fontSize: 11, color: t.ink3 }}>
          Transaction docs (Agent-requested) join here in P1.
        </span>
        <div style={{ flex: 1 }} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search documents…" style={{
          padding: "8px 12px", borderRadius: 8, background: t.surface, border: `1px solid ${t.line}`, fontSize: 13, color: t.ink, width: 280,
        }} />
        <label style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 12, color: t.ink2 }}>
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          Hide funded
        </label>
        {canRequest && (
          <button
            onClick={() => setRequestOpen(true)}
            style={{
              padding: "8px 14px",
              borderRadius: 10,
              background: t.brand,
              color: t.inverse,
              fontSize: 13,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              border: "none",
            }}
          >
            <Icon name="plus" size={14} /> Request doc
          </button>
        )}
      </div>

      <DocRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />

      {Object.entries(byClient).map(([clientId, items]) => {
        const client = clientsById[clientId];
        return (
          <Card key={clientId} pad={16}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase", marginBottom: 8 }}>
              {client?.name ?? "Unknown client"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {items.map((d) => {
                const loan = loansById[d.loan_id];
                const showUpload = canRequest && (d.status === "requested" || d.status === "pending" || d.status === "flagged");
                return (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}` }}>
                    <Icon name="doc" size={16} style={{ color: t.ink3 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{d.name}</div>
                      <div style={{ fontSize: 11.5, color: t.ink3 }}>{loan?.deal_id} — {loan?.address}</div>
                    </div>
                    {/* Source label per Architecture decision #6. Every row in this
                        Document table is lender/funding-side. Agent-requested
                        transaction docs (Purchase Agreement, Inspection, etc.)
                        live in the future agent_document_request table and will
                        render alongside with a "Transaction" pill — P1. */}
                    <Pill bg={t.brandSoft} color={t.brand}>Funding</Pill>
                    <Pill bg={
                      d.status === "verified" ? t.profitBg : d.status === "received" ? t.brandSoft : d.status === "flagged" ? t.dangerBg : t.warnBg
                    } color={
                      d.status === "verified" ? t.profit : d.status === "received" ? t.brand : d.status === "flagged" ? t.danger : t.warn
                    }>{d.status}</Pill>
                    {showUpload && (
                      <DocUploadButton
                        loanId={d.loan_id}
                        category={d.category ?? undefined}
                        compact
                        label="Upload"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
