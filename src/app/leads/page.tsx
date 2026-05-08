"use client";

// Leads — Agent's lead funnel. Lists the Agent's own Leads grouped by status
// (new / contacted / qualified / converted / lost). For P0A this is a simple
// list view; P1 may upgrade to a kanban with drag-to-advance.

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { useLeads } from "@/hooks/useApi";
import { AddLeadPanel } from "@/components/AddLeadPanel";
import type { Lead, LeadStatus } from "@/lib/types";

const STATUS_ORDER: LeadStatus[] = ["new", "contacted", "qualified", "converted", "lost"];

const STATUS_LABEL: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  qualified: "Qualified",
  converted: "Converted",
  lost: "Lost",
};

export default function LeadsPage() {
  const { t } = useTheme();
  const { data: leads = [], isLoading, isError } = useLeads("mine");
  const [panelOpen, setPanelOpen] = useState(false);

  const grouped = useMemo(() => {
    const out: Record<LeadStatus, Lead[]> = {
      new: [], contacted: [], qualified: [], converted: [], lost: [],
    };
    for (const l of leads) out[l.status]?.push(l);
    return out;
  }, [leads]);

  const totalActive = leads.filter((l) => l.status !== "converted" && l.status !== "lost").length;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Leads
        </h1>
        <span style={{ color: t.ink3, fontSize: 14 }}>
          · {totalActive} active
        </span>
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setPanelOpen(true)} style={qcBtnPrimary(t)}>
            <Icon name="plus" size={13} /> Add Lead
          </button>
        </div>
      </div>

      {isError && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
            <Icon name="alert" size={14} />
            The Leads endpoint isn&apos;t live yet. The funnel will populate once
            backend ships <code style={{ background: t.chip, padding: "1px 4px", borderRadius: 4 }}>GET /leads</code>.
          </div>
        </Card>
      )}

      {!isError && !isLoading && leads.length === 0 && (
        <Card>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: 24, textAlign: "center" }}>
            <Icon name="user" size={28} stroke={1.5} />
            <div style={{ fontSize: 16, fontWeight: 700, color: t.ink }}>No leads yet</div>
            <div style={{ fontSize: 13, color: t.ink3, maxWidth: 480 }}>
              Add your first lead to start the funnel. Leads can be invited to complete
              Smart Intake; on completion they convert into a Borrower with their lead_id
              preserved so credit, ownership, and attribution all roll up to the original
              source.
            </div>
            <button onClick={() => setPanelOpen(true)} style={qcBtnPrimary(t)}>
              <Icon name="plus" size={13} /> Add your first Lead
            </button>
          </div>
        </Card>
      )}

      {leads.length > 0 && (
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
                  {bucket.map((lead, i) => (
                    <Link
                      key={lead.id}
                      href={`/leads/${lead.id}`}
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
                        <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{lead.name}</div>
                        <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
                          {[lead.email, lead.phone].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </div>
                      <Pill bg={t.chip} color={t.ink2}>{lead.source.replace(/_/g, " ")}</Pill>
                    </Link>
                  ))}
                </Card>
              </div>
            );
          })}
        </div>
      )}

      <AddLeadPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
