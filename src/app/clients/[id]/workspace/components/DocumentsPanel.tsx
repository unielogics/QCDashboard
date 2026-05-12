"use client";

// Documents tab — extracted from the original inline implementation
// in workspace/page.tsx.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocumentsForClient } from "@/hooks/useApi";

export function DocumentsPanel({ clientId }: { clientId: string }) {
  const { t } = useTheme();
  const { data: docs = [], isLoading } = useDocumentsForClient(clientId);

  return (
    <Card pad={16}>
      <SectionLabel>Client documents</SectionLabel>
      {isLoading ? (
        <div style={{ marginTop: 10, color: t.ink3 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>
          No documents on file yet. Documents the borrower uploads in chat will appear here.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
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
