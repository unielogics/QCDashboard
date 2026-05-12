"use client";

// Funding tab — read-only view for the agent showing the linked
// loan's progress. Renders only when deal.promoted_loan_id is set
// (the parent page hides this tab pre-promotion). Mirrors the
// summary blocks an agent would see on /loans/[id] without giving
// them underwriting controls.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments } from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

export function FundingTab({ loan, clientId: _clientId }: { loan: Loan; clientId: string }) {
  const { t } = useTheme();
  const { data: docs = [] } = useDocuments(loan.id);
  const missing = docs.filter((d) => d.status === "pending" || d.status === "requested");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <SectionLabel>Funding file</SectionLabel>
          <Pill>{loan.stage}</Pill>
          <Link
            href={`/loans/${loan.id}`}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Open funding workbench <Icon name="chevR" size={11} />
          </Link>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginBottom: 8 }}>
          {loan.address || loan.deal_id}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <KPI label="Loan ID" value={loan.deal_id} />
          <KPI label="Stage" value={loan.stage} />
          <KPI label="Type" value={loan.type.replace(/_/g, " ")} />
          {loan.amount ? (
            <KPI label="Amount" value={`$${Number(loan.amount).toLocaleString()}`} />
          ) : null}
          {loan.final_rate ? <KPI label="Rate" value={`${(Number(loan.final_rate) * 100).toFixed(3)}%`} /> : null}
          {loan.ltv ? <KPI label="LTV" value={`${(Number(loan.ltv) * 100).toFixed(1)}%`} /> : null}
          {loan.dscr ? <KPI label="DSCR" value={Number(loan.dscr).toFixed(2)} /> : null}
        </div>
      </Card>

      {missing.length > 0 ? (
        <Card pad={16}>
          <SectionLabel>Outstanding documents · {missing.length}</SectionLabel>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 4, marginBottom: 8 }}>
            Items the funding team is still chasing. Drives the AI Secretary follow-up cadence.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {missing.map((d) => (
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
                    background: t.warnBg,
                    color: t.warn,
                    textTransform: "uppercase",
                  }}
                >
                  {d.status}
                </span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {loan.handoff_summary ? (
        <Card pad={16}>
          <SectionLabel>Handoff summary</SectionLabel>
          <div style={{ marginTop: 6, fontSize: 13, color: t.ink2, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
            {loan.handoff_summary}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
