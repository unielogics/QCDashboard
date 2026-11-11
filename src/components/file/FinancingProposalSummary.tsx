"use client";
import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";

import { Btn, CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { money, multiple } from "@/lib/financialCockpit";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import type { ApplicationUnderwritingState } from "@/lib/applicationProfile";
import { liveFinancingPreview } from "@/lib/liveFinancingPreview";

export function FinancingProposalSummary({ value, saved, terms, onEdit, onCoverage, requestedAmount }: {
  value: WorkingFinancing | null;
  saved?: ApplicationUnderwritingState["financing"];
  terms?: Parameters<typeof liveFinancingPreview>[1];
  onEdit: () => void;
  onCoverage?: () => void;
  requestedAmount?: number | null;
}) {
  const fileWorkspace = useFileWorkspace();
  const loaded = Boolean(value || saved);
  const live = liveFinancingPreview(value, terms);
  const amount = value ? live.amount : saved?.proposed_amount;
  const label = !loaded ? "Reading proposal…" : value && live.pending ? "Calculating proposal…" : value?.dirty ? "Working plan · unsaved" : amount == null ? "No proposed loan" : "Saved plan";
  return <section className="grid g8" aria-label="Shared financing proposal">
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div className="row" style={{ gap: 8 }}><strong>Financing proposal</strong><CellChip tone={value?.dirty ? "warn" : "mut"}>{label}</CellChip></div>
      <div className="row" style={{ gap: 8 }}>{fileWorkspace && !fileWorkspace.pageMode ? <FileWorkspaceLink tool="terms">Structure loan</FileWorkspaceLink> : <Btn size="sm" onClick={onEdit}><Icon name="pencil" size={14} />Structure loan</Btn>}{onCoverage ? fileWorkspace && !fileWorkspace.pageMode ? <FileWorkspaceLink tool="coverage">Coverage plan</FileWorkspaceLink> : <Btn size="sm" onClick={onCoverage}>Coverage plan</Btn> : null}</div>
    </div>
    <div className="fldgrid two">
      {requestedAmount !== undefined ? <div><span className="sub">Client requested</span><div><strong>{money(requestedAmount)}</strong></div></div> : null}
      <div><span className="sub">Proposed loan amount</span><div><strong>{value && live.pending ? "Calculating…" : money(amount)}</strong></div></div>
      <div><span className="sub">Current DSCR → with proposed loan</span><div><strong>{multiple(value ? value.currentDscr : saved?.current_dscr)} → {value && live.pending ? "Calculating…" : multiple(value ? live.coverageAfter : saved?.with_plan_dscr)}</strong></div></div>
      <div><span className="sub">Proposed debt service / year</span><div><strong>{value && live.pending ? "Calculating…" : money(value ? live.debtServiceAnnual : saved?.with_plan_annual_debt_service)}</strong></div></div>
    </div>
    <p className="sub">{value?.source || saved?.source || "Reading the financial evidence…"} · Same loan and payoff selections as Financials. Save plan or save terms to record changes. Approval, client acceptance and funding are recorded separately.</p>
  </section>;
}
