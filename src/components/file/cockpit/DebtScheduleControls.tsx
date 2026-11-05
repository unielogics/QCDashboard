"use client";

import { useState } from "react";
import { Btn, StatusLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { errorMessage } from "@/components/marketplace/shared";
import { useRequestDebtSchedule, useVoidDebtSchedule } from "@/hooks/useApi";
import { DebtScheduleReviewButton } from "@/components/application/DebtScheduleReviewDrawer";
import { useEmailDebtScheduleLink } from "@/hooks/useDebtScheduleReview";
import { ApiError } from "@/lib/api";
import type { FinancialCockpit } from "@/lib/financialCockpit";

export const OPEN_DEBT_SCHEDULE_EVENT = "qc:open-debt-schedule";

/** What the desk can do when a file has no debt schedule yet: confirm the business is debt free, ask the
 *  borrower for the schedule, upload it, enter it, or fill in the table the uploaded schedule was read into (take off
 *  what is not a loan, answer the rate, original amount and balance) before they become the schedule.
 *  The same controls serve the coverage card's empty state and the debt card. */
export function DebtScheduleControls({ cockpit, profileId, canEdit, onOpenEvidence, compact = false }: { cockpit: FinancialCockpit; profileId: string; canEdit: boolean; onOpenEvidence?: () => void; compact?: boolean }) {
  const schedule = cockpit.debt.schedule;
  const rows = cockpit.debt.rows ?? [];
  const uploaded = cockpit.debt.document?.debts?.filter((d) => d && d.lender) ?? [];
  const voided = schedule?.voided ?? null;
  const voidIt = useVoidDebtSchedule(profileId);
  const requestIt = useRequestDebtSchedule(profileId);
  const emailIt = useEmailDebtScheduleLink(profileId);
  const confirmAction = useConfirmAction();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!canEdit || !schedule) return null;
  // Asking again is allowed while nothing has come back: the link can be re-sent (the server will
  // not mail the client twice inside two minutes).
  const canRequest = !voided && !["rows", "document", "received"].includes(schedule.status);
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
    const again = Boolean(schedule.requested_at);
    const confirmed = await confirmAction({
      title: again ? "Email the client the link again?" : "Email the client a link to fill in the debt schedule?",
      body: "They get one email with a link that needs no sign-in, and the secure room as a way to upload a PDF or an Excel file instead. It goes to the client's verified address, and the debt schedule goes on their checklist if it is not there. Sending again within two minutes does not email them twice.",
      confirmLabel: again ? "Email the link again" : "Email the link",
    });
    if (!confirmed) return;
    setError(null);
    setNotice(null);
    try {
      const receipt = await emailIt.mutateAsync();
      if (receipt.provider_accepted) setNotice(`Link emailed to ${receipt.recipient_masked ?? "the client"}.`);
      else setError(`The link is recorded for ${receipt.recipient_masked ?? "the client"} but the email did not go out${receipt.detail ? `: ${receipt.detail}` : "."}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // No verified client email (or the client opted out of email): the checklist request is
        // all that can be done, so do that and say so.
        try {
          await requestIt.mutateAsync();
          setNotice(`${e.message}. The debt schedule is on the client's checklist instead.`);
        } catch (fallback) {
          setError(errorMessage(fallback, "The request could not be sent."));
        }
        return;
      }
      setError(errorMessage(e, "The link could not be emailed."));
    }
  };
  const enter = () => window.dispatchEvent(new CustomEvent(OPEN_DEBT_SCHEDULE_EVENT));

  return (
    <div className="fc-schedule-controls">
      <div className="fc-schedule-controls-row">
        {(uploaded.length > 0 || rows.length > 0) && !voided ? <DebtScheduleReviewButton profileId={profileId} variant="button" primary={canAdopt} label={canAdopt ? `Fill in the table: ${uploaded.length} line${uploaded.length === 1 ? "" : "s"} read` : "Fill in the table"} /> : null}
        {schedule.can_void ? <Btn variant={canAdopt ? undefined : "pri"} size="sm" onClick={() => void declareNoDebt()} disabled={voidIt.isPending}><Icon name="check" size={14} />{voidIt.isPending ? "Saving…" : "Debt free: no debt reported"}</Btn> : null}
        {!voided ? <Btn size="sm" onClick={enter}><Icon name="pencil" size={14} />{rows.length ? "Edit the schedule" : "Enter the schedule"}</Btn> : null}
        {onOpenEvidence && !voided ? <Btn size="sm" onClick={onOpenEvidence}><Icon name="upload" size={14} />Upload the schedule</Btn> : null}
        {canRequest ? <Btn size="sm" onClick={() => void ask()} disabled={emailIt.isPending || requestIt.isPending}><Icon name="mail" size={14} />{emailIt.isPending || requestIt.isPending ? "Sending…" : schedule.requested_at ? "Email the link again" : "Email the client the link"}</Btn> : null}
      </div>
      {!compact ? <span className="sub">{voided ? "The business reports no debt; undo it on the debt schedule card if that changes." : canAdopt ? "The uploaded schedule was read into a table: fill in what it did not say, take off what is not a loan, and save." : schedule.requested_at ? "The borrower has been asked for the schedule; you can email the link again." : "Every file carries a debt schedule: confirm the business is debt free, or get the schedule on the file."}</span> : null}
      {error ? <StatusLine tone="bad">{error}</StatusLine> : notice ? <StatusLine tone="ok">{notice}</StatusLine> : null}
    </div>
  );
}
