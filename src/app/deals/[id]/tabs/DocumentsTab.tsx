"use client";

// Documents tab — agent-side document collection for this deal.
// Pre-promotion uses the client-scoped documents endpoint; once a
// loan exists, pulls loan-scoped docs too.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useDocumentsForClient } from "@/hooks/useApi";

export function DocumentsTab({
  clientId,
  loanId,
}: {
  clientId: string;
  loanId: string | null;
}) {
  const { t } = useTheme();
  const { data: clientDocs = [], isLoading: clientLoading } = useDocumentsForClient(clientId);
  const { data: loanDocs = [], isLoading: loanLoading } = useDocuments(loanId ?? undefined);
  const isLoading = clientLoading || (loanId && loanLoading);

  // Combine without duplicates (loan docs supersede client-stage docs).
  const seen = new Set<string>();
  const docs = [...loanDocs, ...clientDocs].filter((d) => {
    if (seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <SectionLabel>Documents · {docs.length}</SectionLabel>
        {loanId ? (
          <span style={{ fontSize: 10.5, fontWeight: 700, color: t.brand, letterSpacing: 0.4, textTransform: "uppercase" }}>
            Funding active
          </span>
        ) : null}
      </div>
      {isLoading ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No documents yet. Uploads from the client portal or operator pages will appear here.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map((d) => (
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
  );
}
