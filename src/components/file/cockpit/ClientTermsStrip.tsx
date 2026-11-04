"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { ApplicationClientTermsPanel, draftFromTerms, payloadFromDraft } from "@/components/application/ApplicationClientTermsPanel";
import { useAuthedApi, useClientTermsSummary } from "@/hooks/useApi";
import { errorMessage } from "@/components/marketplace/shared";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";
import type { LoanStructure } from "@/lib/loanSchedule";
import { money } from "@/lib/financialCockpit";

/** The loan typed under the DSCR modifications, as the client terms: a line that says what is on file and
 *  whether it matches, one button to save the plan's loan as the terms, and the full editor in a drawer
 *  for the rest (funder, timing, co-branding, conditions) and the PDF. */
export function ClientTermsStrip({ profileId, loan, linkSummary, linkState, canEdit }: {
  profileId: string;
  loan: { amount: number | null; ratePct: number | null; termMonths: number | null; structure: LoanStructure; interestOnlyMonths: number | null };
  linkSummary: string | null;
  linkState: string | null;
  canEdit: boolean;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const query = useClientTermsSummary(profileId);
  const [open, setOpen] = useState(false);
  const terms = query.data ?? null;
  const onFile = Boolean(terms?.version);
  const planHasLoan = Boolean(loan.amount && loan.ratePct != null && (loan.termMonths || loan.structure === "interest_only"));
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["application-client-terms", profileId] });
    void queryClient.invalidateQueries({ queryKey: ["financial-cockpit", profileId] });
  };
  const saveFromPlan = useMutation({
    mutationFn: async () => {
      if (!terms) throw new Error("The client terms could not be read.");
      const draft = draftFromTerms(terms);
      draft.amount = String(loan.amount ?? "");
      draft.apr_pct = loan.ratePct == null ? "" : String(loan.ratePct);
      draft.term_months = loan.termMonths == null ? "" : String(loan.termMonths);
      draft.loan_structure = loan.structure;
      draft.interest_only_months = loan.structure === "interest_only" || !loan.interestOnlyMonths ? "" : String(loan.interestOnlyMonths);
      if (!draft.funder_type) draft.funder_type = "other";
      if (!draft.loan_type) draft.loan_type = terms.loan_type_options[0]?.value ?? "";
      return api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`, { method: "PUT", body: JSON.stringify(payloadFromDraft(draft, terms.version)) });
    },
    onSuccess: refresh,
  });
  const mirrored = linkState === "mirrored";
  const summary = onFile && terms
    ? `${terms.status === "issued" ? "Issued" : "Draft"} v${terms.version}: ${money(terms.amount ?? null)}${terms.apr_pct != null ? ` at ${terms.apr_pct}%` : ""}${terms.term_months ? ` over ${terms.term_months} months` : ""}${terms.calculation?.structure_label ? ` · ${terms.calculation.structure_label.toLowerCase()}${terms.interest_only_months ? `, ${terms.interest_only_months} interest-only months first` : ""}` : ""}${terms.calculation?.periodic_payment != null ? ` · ${money(terms.calculation.periodic_payment)} per payment` : ""}`
    : "No client terms on file yet.";
  return (
    <div className="fc-client-terms" aria-label="Client terms">
      <div className="fc-client-terms-row">
        <CellChip tone={!onFile ? "mut" : mirrored ? "ok" : linkState === "differs" ? "warn" : terms?.status === "issued" ? "ok" : "acc"}>{!onFile ? "Client terms: none yet" : mirrored ? "Client terms in sync with the plan" : linkState === "differs" ? "Client terms differ from the plan" : `Client terms ${terms?.status === "issued" ? "issued" : "draft"} v${terms?.version}`}</CellChip>
        <span className="sub">{query.isLoading ? "Reading the client terms…" : summary}{linkSummary && onFile && !mirrored ? ` ${linkSummary}` : ""}</span>
      </div>
      <div className="fc-client-terms-actions">
        {canEdit && planHasLoan && !mirrored ? (
          <Btn variant="pri" size="sm" onClick={() => saveFromPlan.mutate()} disabled={saveFromPlan.isPending || !terms}>
            <Icon name="docCheck" size={14} />{saveFromPlan.isPending ? "Saving…" : onFile ? "Update the client terms from this loan" : "Save this loan as the client terms"}
          </Btn>
        ) : null}
        <Btn size="sm" onClick={() => setOpen(true)}><Icon name="pencil" size={14} />{onFile ? "Open the full terms and the PDF" : "Open the full terms"}</Btn>
        {planHasLoan && !mirrored ? <span className="sub">The loan above goes into the editor as unsaved edits.</span> : null}
        {saveFromPlan.error ? <span className="sub">{errorMessage(saveFromPlan.error, "The client terms could not be saved.")}</span> : saveFromPlan.isSuccess ? <span className="sub">Saved; the plan reads the terms.</span> : !planHasLoan && !onFile ? <span className="sub">Enter the loan above, then save it as the client terms.</span> : null}
      </div>
      <Drawer open={open} onClose={() => setOpen(false)} title="Client terms" sub="The full record behind the loan in the plan: funder, repayment, timing, co-branding and conditions; the report is the client's PDF." width="xl" closeOnBackdrop={false} ariaLabel="Client terms editor">
        {open ? <ApplicationClientTermsPanel key={`${profileId}-drawer`} profileId={profileId} onSaved={refresh} prefillLoan={planHasLoan && !mirrored ? { amount: loan.amount, aprPct: loan.ratePct, termMonths: loan.termMonths, structure: loan.structure, interestOnlyMonths: loan.interestOnlyMonths } : null} /> : null}
      </Drawer>
    </div>
  );
}
