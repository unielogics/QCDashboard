"use client";

// Deals tab. Phase 3 wires Deal CRUD + DealCard with mark-ready CTA.
// In Phase 2 this renders the data shape that's already returned
// (currently always empty) plus a placeholder so the tab is
// non-empty when the user clicks it.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import type { WorkspaceData } from "@/lib/types";

export function DealsPanel({ data }: { data: WorkspaceData }) {
  const { t } = useTheme();
  if (data.deals.length === 0) {
    return (
      <Card pad={20}>
        <SectionLabel>Deals</SectionLabel>
        <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
          No active deals yet. A client can carry multiple deal paths simultaneously —
          buyer search, seller listing, investor purchase, refinance — each handed off
          to the funding team as its own loan when ready.
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
          Deal creation lands in Phase 3.
        </div>
      </Card>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionLabel>Deals · {data.deals.length}</SectionLabel>
      {data.deals.map((d) => (
        <Card key={d.id} pad={16}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>{d.title}</div>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
            {d.deal_type} · {d.status} · handoff: {d.handoff_status}
          </div>
        </Card>
      ))}
    </div>
  );
}
