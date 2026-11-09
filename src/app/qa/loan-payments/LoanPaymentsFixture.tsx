"use client";

import { useState } from "react";
import { IconBtn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ClientTermsDrawer } from "@/components/file/cockpit/ClientTermsStrip";
import type { ClientTermsWorkingDraft } from "@/components/application/ApplicationClientTermsPanel";
import { LoanPaymentPhases } from "@/components/application/LoanPaymentPhases";
import { RefinanceSelectionSummary } from "@/components/file/cockpit/RefinanceSelectionSummary";
import { repaymentPreview } from "@/lib/repaymentConfig";
import type { SyncedLoan } from "@/lib/loanTermsSync";

const initial: SyncedLoan = { amount: 89934, ratePct: 29.99, termMonths: 24, structure: "amortizing", structureExplicit: true, interestOnlyMonths: 6, repaymentConfig: { amortization_months: 60 }, paymentsPerYear: 12 };

export default function LoanPaymentsFixture() {
  const [loan, setLoan] = useState<SyncedLoan>(initial);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClientTermsWorkingDraft | null>(null);
  const schedule = repaymentPreview(loan.amount, loan.ratePct, loan.termMonths, { structure: loan.structure, interestOnlyMonths: loan.interestOnlyMonths, periodsPerYear: loan.paymentsPerYear ?? 12, repaymentConfig: loan.repaymentConfig }).schedule;
  const regular = schedule?.payment_after_monthly ?? schedule?.payment_io_monthly ?? null;
  const io = schedule?.payment_after != null ? schedule.payment_io_monthly : null;
  return <main className="content content--wide" style={{ padding: 24, maxWidth: 1400, margin: "0 auto", display: "grid", gap: 18 }}>
    <header className="row"><h1>Loan payment QA</h1><IconBtn aria-label="Expand full loan terms" title="Expand full loan terms" onClick={() => setOpen(true)}><Icon name="maximize" size={16} /></IconBtn></header>
    <p>Fictional fixture: $89,934 · 29.99% · 24-month maturity · 6 months interest-only · 60-month amortization after IO.</p>
    {schedule ? <LoanPaymentPhases schedule={schedule} /> : null}
    <RefinanceSelectionSummary totals={{ selectedCount: 4, payoffTotal: 89934, payoffUnknown: 0, monthlyRemoved: 14943.13, monthlyUnknown: 0, remainingMonthly: 2635.5, monthlyAdded: regular, monthlyAddedIo: io, netMonthly: regular == null ? null : regular - 14943.13, netMonthlyIo: io == null ? null : io - 14943.13, monthlyAfter: regular == null ? null : 2635.5 + regular, monthlyAfterIo: io == null ? null : 2635.5 + io, stressMonthlyAdded: schedule?.coverage_payment_monthly ?? null, stressMonthlyAfter: schedule ? 2635.5 + schedule.coverage_payment_monthly : null, stressNetMonthly: schedule ? schedule.coverage_payment_monthly - 14943.13 : null, basisAdjusted: false, needsReview: false }} interestOnlyMonths={schedule?.interest_only_months} hasRepayment={schedule?.payment_after != null} coverageEquivalent />
    <ClientTermsDrawer open={open} onClose={() => setOpen(false)} profileId="loan-payments-qa" prefillLoan={loan} workingDraft={draft} onWorkingDraftChange={setDraft} onApplyLoan={(next) => { setLoan(next); setOpen(false); }} canEdit />
  </main>;
}
