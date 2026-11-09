"use client";

import { useState } from "react";
import { Btn, CellChip } from "@/components/ds";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { operatingMoney, operatingPlanRequest, type OperatingEvaluation } from "@/lib/operatingPlan";

/** Compact entry beside coverage; editing stays in the shared financial workspace. */
export function OperatingPlanEntry({ profileId, businessName, evaluation, version, canEdit, onRefresh, onRequested }: {
  profileId: string; businessName: string; evaluation?: OperatingEvaluation | null; version?: number;
  canEdit?: boolean; onRefresh: () => void | Promise<unknown>; onRequested: () => void;
}) {
  const [open, setOpen] = useState(false); const [request, setRequest] = useState<string | null>(null);
  const reviewed = evaluation?.totals.approved;
  return <>
    <section className="fc-card fc-wide"><div className="fc-card-h"><div><h4>Operating expenses and earnings plan</h4><div className="sub">Disclose operating costs, document earnings changes, and compare their effect on NOI, EBITDA and coverage.</div></div><div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{version ? <CellChip tone="mut">v{version}</CellChip> : null}<Btn size="sm" onClick={() => setOpen(true)}>Open earnings plan</Btn>{canEdit ? <Btn size="sm" onClick={() => setRequest(crypto.randomUUID())}>Request client plan</Btn> : null}</div></div>
      {evaluation ? <div className="row sub" style={{ gap: 18, flexWrap: "wrap", marginTop: 8 }}><span>Disclosed operating costs <strong>{operatingMoney(evaluation.disclosure.operating_monthly, evaluation.baseline.currency ?? "USD")} / month</strong></span><span>Reviewed earnings change <strong>{operatingMoney(reviewed?.annual_impact, evaluation.baseline.currency ?? "USD")} / year</strong></span><span>{evaluation.all_actions_reviewed ? "Actions reviewed" : "Proposals awaiting review"}</span></div> : null}
    </section>
    {open ? <FinancialWorkspace open profileId={profileId} initialKind="operating_plan" initialView="form" onClose={() => { setOpen(false); void onRefresh(); }} onPublished={async () => { await onRefresh(); }} /> : null}
    {request ? <RequestFilesDialog open profileId={profileId} prefill={operatingPlanRequest(businessName)} prefillKey={request} onClose={() => setRequest(null)} onRequested={onRequested} /> : null}
  </>;
}
