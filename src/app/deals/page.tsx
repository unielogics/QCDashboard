"use client";

// Deals — Agent's deal pipeline, grouped by status. P0A is a list view; P1
// may upgrade to kanban with drag-to-advance.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { useDeals } from "@/hooks/useApi";
import { AddDealPanel } from "@/components/AddDealPanel";
import type { Deal, DealStatus } from "@/lib/types";

const STATUS_ORDER: DealStatus[] = [
  "exploring",
  "intake",
  "prequalified",
  "under_contract",
  "submitted",
  "in_uw",
  "clear_to_close",
  "funded",
  "lost",
];

const STATUS_LABEL: Record<DealStatus, string> = {
  exploring: "Exploring",
  intake: "Intake",
  prequalified: "Prequalified",
  under_contract: "Under Contract",
  submitted: "Submitted",
  in_uw: "In UW",
  clear_to_close: "Clear to Close",
  funded: "Funded",
  lost: "Lost",
};

const TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  refi: "Refinance",
  bridge: "Bridge",
  fix_flip: "Fix & Flip",
  ground_up: "Ground Up",
  dscr_purchase: "DSCR Purchase",
  dscr_refi: "DSCR Refinance",
};

export default function DealsPage() {
  const { t } = useTheme();
  const { data: deals = [], isLoading } = useDeals("mine");
  const [panelOpen, setPanelOpen] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<DealStatus, Deal[]> = {
      exploring: [], intake: [], prequalified: [], under_contract: [],
      submitted: [], in_uw: [], clear_to_close: [], funded: [], lost: [],
    };
    for (const d of deals) out[d.status]?.push(d);
    return out;
  }, [deals]);

  const totalActive = deals.filter((d) => d.status !== "funded" && d.status !== "lost").length;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Deals
        </h1>
        <span style={{ color: t.ink3, fontSize: 14 }}>· {totalActive} active</span>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setPanelOpen(true)} style={qcBtnPrimary(t)}>
            <Icon name="plus" size={13} /> New Deal
          </button>
        </div>
      </div>

      {!isLoading && deals.length === 0 && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 24, textAlign: "center" }}>
            <Icon name="key" size={28} stroke={1.5} />
            <div style={{ fontSize: 16, fontWeight: 700, color: t.ink }}>No deals yet</div>
            <div style={{ fontSize: 13, color: t.ink3, maxWidth: 480 }}>
              A Deal is your working file. Quotes, Loans, Documents, Messages, and AI
              tasks all attach to a Deal. Link it to a Lead, a Borrower, or both —
              backend enforces that at least one is set.
            </div>
            <button onClick={() => setPanelOpen(true)} style={qcBtnPrimary(t)}>
              <Icon name="plus" size={13} /> Create your first Deal
            </button>
          </div>
        </Card>
      )}

      {deals.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {STATUS_ORDER.map((status) => {
            const bucket = grouped[status];
            if (bucket.length === 0) return null;
            return (
              <div key={status}>
                <SectionLabel>
                  {STATUS_LABEL[status]} · {bucket.length}
                </SectionLabel>
                <Card pad={0}>
                  {bucket.map((deal, i) => (
                    <Link
                      key={deal.id}
                      href={`/deals/${deal.id}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 12,
                        padding: "14px 16px",
                        borderBottom: i === bucket.length - 1 ? "none" : `1px solid ${t.line}`,
                        textDecoration: "none",
                        color: t.ink,
                      }}
                    >
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {deal.property_address || <span style={{ color: t.ink3 }}>Property TBD</span>}
                        </div>
                        <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
                          {TYPE_LABEL[deal.type] ?? deal.type}
                          {deal.last_movement_at && ` · last update ${new Date(deal.last_movement_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <Pill bg={t.chip} color={t.ink2}>
                          DRS {deal.deal_readiness_score ?? "—"}
                        </Pill>
                        <Pill bg={t.chip} color={t.ink2}>
                          FFR {deal.funding_file_readiness_score ?? "—"}
                        </Pill>
                      </div>
                    </Link>
                  ))}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <AddDealPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
