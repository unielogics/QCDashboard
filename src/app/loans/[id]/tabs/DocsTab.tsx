"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { DocRequestModal } from "@/app/documents/components/DocRequestModal";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { useDocuments } from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

export function DocsTab({ loan, canRequest }: { loan: Loan; canRequest: boolean }) {
  const { t } = useTheme();
  const { data: docs = [] } = useDocuments(loan.id);
  const [requestOpen, setRequestOpen] = useState(false);

  const counts = {
    received: docs.filter((d) => d.status === "received" || d.status === "verified").length,
    requested: docs.filter((d) => d.status === "requested").length,
    pending: docs.filter((d) => d.status === "pending").length,
    flagged: docs.filter((d) => d.status === "flagged").length,
  };

  return (
    <Card pad={0}>
      <div style={{ padding: 16, borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <SectionLabel>Document Vault · {docs.length} items</SectionLabel>
          <Counter label="Received" count={counts.received} color={t.profit} t={t} />
          <Counter label="Requested" count={counts.requested} color={t.brand} t={t} />
          <Counter label="Pending" count={counts.pending} color={t.warn} t={t} />
          <Counter label="Flagged" count={counts.flagged} color={t.danger} t={t} />
        </div>
        {canRequest && (
          <button
            onClick={() => setRequestOpen(true)}
            style={{
              padding: "8px 12px", borderRadius: 9, background: t.brand, color: t.inverse,
              fontSize: 13, fontWeight: 700, border: "none",
              display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
            }}
          >
            <Icon name="plus" size={13} /> Request doc
          </button>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16 }}>
        {docs.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No documents on file yet.</div>}
        {docs.map((d) => {
          const showUpload = canRequest && (d.status === "requested" || d.status === "pending" || d.status === "flagged");
          return (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}` }}>
              <Icon name="doc" size={16} style={{ color: t.ink3 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{d.name}</div>
                <div style={{ fontSize: 11.5, color: t.ink3 }}>
                  {d.category ?? "uncategorized"}
                  {d.requested_on && ` · requested ${new Date(d.requested_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                  {d.received_on && ` · received ${new Date(d.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`}
                </div>
              </div>
              <Pill bg={
                d.status === "verified" ? t.profitBg : d.status === "received" ? t.brandSoft : d.status === "flagged" ? t.dangerBg : t.warnBg
              } color={
                d.status === "verified" ? t.profit : d.status === "received" ? t.brand : d.status === "flagged" ? t.danger : t.warn
              }>
                {d.status}
              </Pill>
              {showUpload && (
                <DocUploadButton loanId={loan.id} category={d.category ?? undefined} compact label="Upload" />
              )}
            </div>
          );
        })}
      </div>
      <DocRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} defaultLoanId={loan.id} />
    </Card>
  );
}

function Counter({ t, label, count, color }: { t: ReturnType<typeof useTheme>["t"]; label: string; count: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span style={{ width: 8, height: 8, borderRadius: 999, background: color }} />
      <span style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{count}</span>
    </div>
  );
}
