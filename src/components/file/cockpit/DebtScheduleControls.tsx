"use client";

import { useState } from "react";
import { Btn, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { errorMessage } from "@/components/marketplace/shared";
import { useAdoptUploadedDebtSchedule, useRequestDebtSchedule, useVoidDebtSchedule } from "@/hooks/useApi";
import type { FinancialCockpit } from "@/lib/financialCockpit";

export const OPEN_DEBT_SCHEDULE_EVENT = "qc:open-debt-schedule";

/** What the desk can do when a file has no debt schedule yet: confirm the business is debt free, ask the
 *  borrower for the schedule, upload it, enter it, or adopt the lines read off an uploaded one. The same
 *  controls serve the coverage card's empty state and the debt card. */
export function DebtScheduleControls({ cockpit, profileId, canEdit, onOpenEvidence, compact = false }: { cockpit: FinancialCockpit; profileId: string; canEdit: boolean; onOpenEvidence?: () => void; compact?: boolean }) {
  const schedule = cockpit.debt.schedule;
  const rows = cockpit.debt.rows ?? [];
  const uploaded = cockpit.debt.document?.debts?.filter((d) => d && d.lender) ?? [];
  const voided = schedule?.voided ?? null;
  const voidIt = useVoidDebtSchedule(profileId);
  const requestIt = useRequestDebtSchedule(profileId);
  const adopt = useAdoptUploadedDebtSchedule(profileId);
  const confirmAction = useConfirmAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit || !schedule) return null;
  const canRequest = !voided && !schedule.requested_at && !["rows", "document", "received"].includes(schedule.status);
  const canAdopt = uploaded.length > 0 && rows.length === 0 && !voided;

  const declareNoDebt = async () => {
    const confirmed = await confirmAction({
      title: "Confirm the business is debt free?",
      body: "This records that the business reports no debt. The schedule stops being asked for, the debt service becomes zero and the coverage reads the proposed payment alone. Your name and the date go on the file. It can be undone.",
      confirmLabel: "Debt free: no debt reported",
      tone: "danger",
      reversible: true,
    });
    if (!confirmed) return;
    setError(null);
    try { await voidIt.mutateAsync({ reason: "No debt reported: the business is debt free" }); setNotice("Recorded: the business reports no debt."); } catch (e) { setError(errorMessage(e, "The declaration could not be saved.")); }
  };
  const ask = async () => {
    setError(null);
    try { const r = await requestIt.mutateAsync(); setNotice(r.already ? "The borrower was already asked for the debt schedule." : "The debt schedule is on the borrower's checklist now."); } catch (e) { setError(errorMessage(e, "The request could not be sent.")); }
  };
  const adoptIt = async () => {
    const confirmed = await confirmAction({
      title: `Adopt the ${uploaded.length} line${uploaded.length === 1 ? "" : "s"} from the uploaded schedule?`,
      body: "They become the file's own schedule rows, which the coverage, the plan and the package read; you can edit them afterwards.",
      confirmLabel: "Adopt as the schedule",
      reversible: true,
    });
    if (!confirmed) return;
    setError(null);
    try { await adopt.mutateAsync(); setNotice("The uploaded schedule is now the file's schedule."); } catch (e) { setError(errorMessage(e, "The lines could not be adopted.")); }
  };
  const enter = () => window.dispatchEvent(new CustomEvent(OPEN_DEBT_SCHEDULE_EVENT));

  return (
    <div className="fc-schedule-controls">
      <div className="fc-schedule-controls-row">
        {canAdopt ? <Btn variant="pri" size="sm" onClick={() => void adoptIt()} disabled={adopt.isPending}><Icon name="docCheck" size={14} />{adopt.isPending ? "Adopting…" : `Adopt the ${uploaded.length} uploaded line${uploaded.length === 1 ? "" : "s"} as the schedule`}</Btn> : null}
        {schedule.can_void ? <Btn variant={canAdopt ? undefined : "pri"} size="sm" onClick={() => void declareNoDebt()} disabled={voidIt.isPending}><Icon name="check" size={14} />{voidIt.isPending ? "Saving…" : "Debt free: no debt reported"}</Btn> : null}
        {!voided ? <Btn size="sm" onClick={enter}><Icon name="pencil" size={14} />{rows.length ? "Edit the schedule" : "Enter the schedule"}</Btn> : null}
        {onOpenEvidence && !voided ? <Btn size="sm" onClick={onOpenEvidence}><Icon name="upload" size={14} />Upload the schedule</Btn> : null}
        {canRequest ? <Btn size="sm" onClick={() => void ask()} disabled={requestIt.isPending}><Icon name="mail" size={14} />{requestIt.isPending ? "Requesting…" : "Request from the borrower"}</Btn> : null}
      </div>
      {!compact ? <span className="sub">{voided ? "The business reports no debt; undo it on the debt schedule card if that changes." : canAdopt ? "The uploaded schedule was read; adopt its lines so the file carries them as its own rows." : schedule.requested_at ? "The borrower has been asked for the schedule." : "Every file carries a debt schedule: confirm the business is debt free, or get the schedule on the file."}</span> : null}
      {error ? <StatusLine tone="bad">{error}</StatusLine> : notice ? <StatusLine tone="ok">{notice}</StatusLine> : null}
    </div>
  );
}
