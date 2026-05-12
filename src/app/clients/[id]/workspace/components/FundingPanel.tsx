"use client";

// Funding tab. Lists every Loan attached to this client as a
// FundingFile card. Phase 2 wires basic display; Phase 4 adds the
// handoff baseline + mark-ready promotion.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type { FundingFileSummary, WorkspaceData } from "@/lib/types";

export function FundingPanel({ data, onSelect }: { data: WorkspaceData; onSelect?: (fundingFileId: string) => void }) {
  const { t } = useTheme();
  const files = data.funding_files;
  if (files.length === 0) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No funding files yet. Once the agent fires <strong>Ready for Lending</strong> from a deal,
          the resulting loan appears here as a funding file.
        </div>
      </Card>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionLabel>Funding files · {files.length}</SectionLabel>
      {files.map((f) => (
        <FundingFileCard key={f.id} f={f} onSelect={onSelect} />
      ))}
    </div>
  );
}

function FundingFileCard({ f, onSelect }: { f: FundingFileSummary; onSelect?: (id: string) => void }) {
  const { t } = useTheme();
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <Icon name="file" size={16} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>
            {f.address || f.deal_id || "(unnamed loan)"}
          </div>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
            {f.funding_file_kind ?? "Funding file"} · {f.stage}
            {f.amount ? ` · $${Number(f.amount).toLocaleString()}` : ""}
          </div>
        </div>
        <Pill>{f.stage}</Pill>
        {onSelect ? (
          <button
            onClick={() => onSelect(f.id)}
            style={{
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              cursor: "pointer",
            }}
          >
            Select
          </button>
        ) : null}
        <Link
          href={`/loans/${f.id}?tab=workspace`}
          style={{
            padding: "6px 10px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          Advanced workbench <Icon name="chevR" size={11} />
        </Link>
      </div>
      {f.handoff_summary ? (
        <div
          style={{
            marginTop: 6,
            padding: 10,
            borderRadius: 6,
            background: t.surface2,
            fontSize: 12,
            color: t.ink2,
            whiteSpace: "pre-wrap",
          }}
        >
          {f.handoff_summary}
        </div>
      ) : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8, marginTop: 10 }}>
        <KPI label="Source deal" value={f.source_deal_id ? "Linked" : "—"} />
        <KPI label="Side" value={f.side ?? "—"} />
        <KPI label="Created" value={new Date(f.created_at).toLocaleDateString()} />
      </div>
    </Card>
  );
}
