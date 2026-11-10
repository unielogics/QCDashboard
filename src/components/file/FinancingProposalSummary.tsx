"use client";

import { Btn, CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { money, multiple } from "@/lib/financialCockpit";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import type { ApplicationUnderwritingState } from "@/lib/applicationProfile";

export function FinancingProposalSummary({ value, saved, onEdit, onCoverage, requestedAmount }: {
  value: WorkingFinancing | null;
  saved?: ApplicationUnderwritingState["financing"];
  onEdit: () => void;
  onCoverage?: () => void;
  requestedAmount?: number | null;
}) {
  const loaded = Boolean(value || saved);
  const amount = value ? value.plan.new_loan_amount : saved?.proposed_amount;
  const label = !loaded ? "Reading proposal…" : value?.dirty ? "Working plan · unsaved" : amount == null ? "No proposed loan" : "Saved plan";
  return <section className="grid g8" aria-label="Shared financing proposal">
    <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
      <div className="row" style={{ gap: 8 }}><strong>Financing proposal</strong><CellChip tone={value?.dirty ? "warn" : "mut"}>{label}</CellChip></div>
      <div className="row" style={{ gap: 8 }}><Btn size="sm" onClick={onEdit}><Icon name="pencil" size={14} />Structure loan</Btn>{onCoverage ? <Btn size="sm" onClick={onCoverage}>Coverage plan</Btn> : null}</div>
    </div>
    <div className="fldgrid two">
      {requestedAmount !== undefined ? <div><span className="sub">Client requested</span><div><strong>{money(requestedAmount)}</strong></div></div> : null}
      <div><span className="sub">Proposed loan amount</span><div><strong>{money(amount)}</strong></div></div>
      <div><span className="sub">Current DSCR → with proposed loan</span><div><strong>{multiple(value ? value.currentDscr : saved?.current_dscr)} → {multiple(value ? value.projectedDscr : saved?.with_plan_dscr)}</strong></div></div>
      <div><span className="sub">Proposed debt service / year</span><div><strong>{money(value ? value.projectedDebtServiceAnnual : saved?.with_plan_annual_debt_service)}</strong></div></div>
    </div>
    <p className="sub">{value?.source || saved?.source || "Reading the financial evidence…"} · Same loan and payoff selections as Financials. Save plan or save terms to record changes. Approval, client acceptance and funding are recorded separately.</p>
  </section>;
}
