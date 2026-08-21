"use client";

// Funding tab — read-only view for the agent showing the linked
// loan's progress. Renders only when deal.promoted_loan_id is set
// (the parent page hides this tab pre-promotion). Mirrors the
// summary blocks an agent would see on /loans/[id] without giving
// them underwriting controls.

import { Icon } from "@/components/design-system/Icon";
import { BtnLink, CellChip, ItemRow, Kpi, KpiRow, Panel, Tag } from "@/components/ds";
import { useDocuments } from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

export function FundingTab({ loan, clientId: _clientId }: { loan: Loan; clientId: string }) {
  const { data: docs = [] } = useDocuments(loan.id);
  const missing = docs.filter((d) => d.status === "pending" || d.status === "requested");

  return (
    <div className="grid">
      <Panel
        title="Funding file"
        actions={
          <>
            <Tag>{loan.stage}</Tag>
            <BtnLink href={`/loans/${loan.id}`} size="sm">
              Open funding workbench <Icon name="chevR" size={11} />
            </BtnLink>
          </>
        }
      >
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {loan.address || loan.deal_id}
        </div>
        <KpiRow>
          <Kpi label="Loan ID" value={loan.deal_id} />
          <Kpi label="Stage" value={loan.stage} />
          <Kpi label="Type" value={loan.type.replace(/_/g, " ")} />
          {loan.amount ? (
            <Kpi label="Amount" value={`$${Number(loan.amount).toLocaleString()}`} />
          ) : null}
          {loan.final_rate ? (
            <Kpi label="Rate" value={`${(Number(loan.final_rate) * 100).toFixed(3)}%`} />
          ) : null}
          {loan.ltv ? <Kpi label="LTV" value={`${(Number(loan.ltv) * 100).toFixed(1)}%`} /> : null}
          {loan.dscr ? <Kpi label="DSCR" value={Number(loan.dscr).toFixed(2)} /> : null}
        </KpiRow>
      </Panel>

      {missing.length > 0 ? (
        <Panel
          title="Outstanding documents"
          actions={<Tag>{missing.length}</Tag>}
          sub="Items the funding team is still chasing. Drives Elara follow-up cadence."
        >
          {missing.map((d) => (
            <ItemRow
              key={d.id}
              icon={<Icon name="doc" size={15} />}
              right={<CellChip tone="warn">{d.status}</CellChip>}
            >
              <b style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</b>
            </ItemRow>
          ))}
        </Panel>
      ) : null}

      {loan.handoff_summary ? (
        <Panel title="Handoff summary">
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.55, fontSize: 13.5 }}>
            {loan.handoff_summary}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
