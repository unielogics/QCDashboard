"use client";

import { useCallback, useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { ApplicationClientTermsPanel, draftFromTerms, draftWithScenarioLoan, payloadFromDraft, type ClientTermsWorkingDraft } from "@/components/application/ApplicationClientTermsPanel";
import { useAuthedApi, useClientTermsSummary } from "@/hooks/useApi";
import { errorMessage } from "@/components/marketplace/shared";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";
import { applyWorkingLoan, clientDraftLoanFields, loanFromClientDraft, type LoanRefinanceContext, type LoanScenarioPreviewer, type SyncedLoan } from "@/lib/loanTermsSync";
import type { FinancialPlanRead, FinancialPlanWrite } from "@/lib/financialCockpit";
import { repaymentConfigLabel } from "@/lib/repaymentConfig";
import { money } from "@/lib/financialCockpit";

/** The loan typed under the DSCR modifications, as the client terms: a line that says what is on file and
 *  whether it matches, one button to save the plan's loan as the terms, and the full editor in a drawer
 *  for the rest (funder, timing, co-branding, conditions) and the PDF. */
export function ClientTermsStrip({ profileId, loan, linkSummary, linkState, canEdit, onOpenEditor, financialPlanDraft, refinanceContext, workingDraft, onSaved }: {
  profileId: string;
  loan: SyncedLoan | null;
  linkSummary: string | null;
  linkState: string | null;
  canEdit: boolean;
  onOpenEditor?: () => void;
  financialPlanDraft?: FinancialPlanWrite;
  refinanceContext?: LoanRefinanceContext | null;
  workingDraft?: ClientTermsWorkingDraft | null;
  onSaved?: (terms: ApplicationClientTerms, plan?: FinancialPlanRead) => void;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const query = useClientTermsSummary(profileId);
  const [open, setOpen] = useState(false);
  const terms = query.data ?? null;
  const onFile = Boolean(terms?.version);
  const planHasLoan = Boolean(loan && loan.amount != null && loan.amount > 0 && loan.ratePct != null && (loan.termMonths || loan.structure === "interest_only"));
  const pendingEditor = !!workingDraft && JSON.stringify(workingDraft.draft) !== workingDraft.savedFingerprint;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["application-client-terms", profileId] });
    void queryClient.invalidateQueries({ queryKey: ["financial-cockpit", profileId] });
  };
  const saveFromPlan = useMutation({
    mutationFn: async () => {
      if (!terms) throw new Error("The client terms could not be read.");
      if (!loan) throw new Error("Enter the scenario loan first.");
      const draft = draftWithScenarioLoan(draftFromTerms(terms), loan, refinanceContext);
      if (!draft.funder_type) draft.funder_type = "other";
      if (!draft.loan_type) draft.loan_type = terms.loan_type_options[0]?.value ?? "";
      const payload = payloadFromDraft(draft, terms.version);
      if (financialPlanDraft) payload.financial_plan = { ...applyWorkingLoan(financialPlanDraft, loan), expected_updated_at: financialPlanDraft.expected_updated_at ?? null };
      return api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: (data) => { queryClient.setQueryData(["application-client-terms", profileId], data); refresh(); onSaved?.(data, data.financial_plan); },
  });
  const mirrored = !!loan && !!terms && JSON.stringify(clientDraftLoanFields(loan)) === JSON.stringify(clientDraftLoanFields(loanFromClientDraft(draftFromTerms(terms))));
  const differs = !!loan && onFile && !mirrored;
  const summary = onFile && terms
    ? `${terms.status === "issued" ? "Issued" : "Draft"} v${terms.version}: ${money(terms.amount ?? null)}${terms.apr_pct != null ? ` at ${terms.apr_pct}%` : ""}${terms.term_months ? ` over ${terms.term_months} months` : ""}${terms.calculation?.structure_label ? ` · ${terms.calculation.structure_label.toLowerCase()}${terms.interest_only_months ? `, ${terms.interest_only_months} interest-only months first` : ""}` : ""}${terms.calculation?.periodic_payment != null ? ` · ${money(terms.calculation.periodic_payment)} per payment` : ""}`
    : "No client terms on file yet.";
  return (
    <div className="fc-client-terms" aria-label="Client terms">
      <div className="fc-client-terms-row">
        <CellChip tone={!onFile ? "mut" : mirrored ? "ok" : differs ? "warn" : terms?.status === "issued" ? "ok" : "acc"}>{!onFile ? "Client terms: none yet" : mirrored ? "Saved client terms match this loan" : differs ? "Working loan differs from saved client terms" : `Client terms ${terms?.status === "issued" ? "issued" : "draft"} v${terms?.version}`}</CellChip>
        <span className="sub">{query.isLoading ? "Reading the client terms…" : summary}{terms?.repayment_config ? ` · ${repaymentConfigLabel(terms.repayment_config)}` : ""}{linkSummary && onFile && !loan && linkState !== "mirrored" ? ` ${linkSummary}` : ""}</span>
      </div>
      <div className="fc-client-terms-actions">
        {canEdit && planHasLoan && !mirrored && !pendingEditor ? (
          <Btn variant="pri" size="sm" onClick={() => saveFromPlan.mutate()} disabled={saveFromPlan.isPending || !terms}>
            <Icon name="docCheck" size={14} />{saveFromPlan.isPending ? "Saving…" : onFile ? "Update the client terms from this loan" : "Save this loan as the client terms"}
          </Btn>
        ) : null}
        <Btn size="sm" onClick={() => onOpenEditor ? onOpenEditor() : setOpen(true)}><Icon name="pencil" size={14} />{onFile ? "Open the full terms and the PDF" : "Open the full terms"}</Btn>
        {loan ? <span className="sub">The current scenario loan opens as a working draft; Apply or Save version returns changes to the scenario.</span> : null}
        {pendingEditor ? <span className="sub">An unsaved editor draft is kept. Open the full terms to review it before saving.</span> : null}
        {saveFromPlan.error ? <span className="sub">{errorMessage(saveFromPlan.error, "The client terms could not be saved.")}</span> : saveFromPlan.isSuccess ? <span className="sub">Saved; the plan reads the terms.</span> : !planHasLoan && !onFile ? <span className="sub">Enter the loan above, then save it as the client terms.</span> : null}
      </div>
      {!onOpenEditor ? <ClientTermsDrawer open={open} onClose={() => setOpen(false)} profileId={profileId} onSaved={(data, plan) => { refresh(); onSaved?.(data, plan); }} prefillLoan={loan} financialPlanDraft={financialPlanDraft} refinanceContext={refinanceContext} canEdit={canEdit} /> : null}
    </div>
  );
}

export function ClientTermsDrawer({ open, onClose, profileId, onSaved, prefillLoan, financialPlanDraft, refinanceContext, workingDraft, onWorkingDraftChange, onApplyLoan, canEdit = true, scenarioPaymentOnly = false, previewScenario }: {
  open: boolean; onClose: () => void; profileId: string; onSaved?: (terms: ApplicationClientTerms, plan?: FinancialPlanRead) => void;
  prefillLoan: SyncedLoan | null;
  financialPlanDraft?: FinancialPlanWrite; refinanceContext?: LoanRefinanceContext | null;
  workingDraft?: ClientTermsWorkingDraft | null; onWorkingDraftChange?: (draft: ClientTermsWorkingDraft) => void;
  onApplyLoan?: (loan: SyncedLoan) => void; canEdit?: boolean; scenarioPaymentOnly?: boolean;
  previewScenario?: LoanScenarioPreviewer;
}) {
  const [cached, setCached] = useState<ClientTermsWorkingDraft | null>(null);
  const [pending, setPending] = useState(false);
  useEffect(() => { setCached(null); setPending(false); }, [profileId]);
  const remember = useCallback((next: ClientTermsWorkingDraft) => { setCached(next); onWorkingDraftChange?.(next); }, [onWorkingDraftChange]);
  return <Drawer open={open} onClose={() => { if (!pending) onClose(); }} title="Client terms" sub="The full record behind the loan in the plan: funder, repayment, timing, co-branding and conditions; the report is the client's PDF." width="xl" closeOnBackdrop={false} ariaLabel="Client terms editor">
    {open ? <ApplicationClientTermsPanel key={`${profileId}-drawer`} profileId={profileId} onSaved={onSaved} prefillLoan={prefillLoan} financialPlanDraft={financialPlanDraft} refinanceContext={refinanceContext} workingDraft={workingDraft === undefined ? cached : workingDraft} onWorkingDraftChange={remember} onApplyLoan={onApplyLoan} onPending={setPending} canEdit={canEdit} scenarioPaymentOnly={scenarioPaymentOnly} previewScenario={previewScenario} /> : null}
  </Drawer>;
}
