"use client";

// The debt schedule table in a drawer, and the ways into it.
//
// The table itself is `DebtScheduleReviewPanel`, which any row can embed. This is
// the thin wrapper that opens it over the page, the button that opens the wrapper
// from anywhere a debt schedule shows up, and the nudge a row can show while lines
// read from a file are not on the schedule yet.

import { useState } from "react";
import { Btn } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { FinancialWorkspace } from "./FinancialWorkspace";
import { Icon } from "@/components/design-system/Icon";
import { Toast, useToast } from "@/components/design-system/primitives";
import { useCurrentUser } from "@/hooks/useApi";
import { useDebtScheduleReviewSummary } from "@/hooks/useDebtScheduleReview";
import { Role } from "@/lib/enums.generated";
import styles from "./DebtScheduleReviewDrawer.module.css";

export function DebtScheduleReviewDrawer({
  profileId,
  open,
  onClose,
  onSaved,
}: {
  profileId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return <FinancialWorkspace open={open} profileId={profileId} initialKind="debt_schedule" initialView="worksheet" onClose={onClose} onPublished={onSaved} />;
}

/** The way into the table from anywhere a debt schedule shows up: one icon (or a
 *  small button), its own open state, its own drawer. Only the roles that may
 *  change the schedule see it. */
export function DebtScheduleReviewButton({
  profileId,
  onChanged,
  variant = "icon",
  label,
  primary = false,
}: {
  profileId: string | null | undefined;
  onChanged?: () => void;
  variant?: "icon" | "button";
  label?: string;
  /** The button as the main action of its row. */
  primary?: boolean;
}) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const canReview = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  if (!profileId || !canReview) return null;
  const words = label ?? "Fill in the debt schedule table: take off what is not a loan and answer the rate, original amount and balance";
  return (
    <>
      {variant === "icon" ? (
        <ActionIcon icon="scan" label={words} onClick={() => setOpen(true)} />
      ) : (
        <span title={words}>
          <Btn size="sm" variant={primary ? "pri" : "default"} onClick={() => setOpen(true)}><Icon name="scan" size={14} />{label ?? "Fill in the table"}</Btn>
        </span>
      )}
      <DebtScheduleReviewDrawer
        profileId={profileId}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          toast.show("Dated debt schedule version saved.");
          onChanged?.();
        }}
      />
      <Toast msg={toast.msg} />
    </>
  );
}

/** "7 lines read · 38 answers missing: Fill in the table." Shows itself while
 *  lines from an uploaded schedule are not on the schedule yet, or answers are
 *  missing, and is gone once the table is filled in. */
export function DebtScheduleReviewNudge({ profileId, enabled = true, alwaysShow = false }: { profileId: string | null | undefined; enabled?: boolean; alwaysShow?: boolean }) {
  const { data: user } = useCurrentUser();
  const canReview = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const summary = useDebtScheduleReviewSummary(profileId, enabled && canReview);
  if (!profileId || !canReview || summary.loading) return null;
  const todo = summary.read > 0 || summary.missingAnswers > 0;
  if (!todo && !(alwaysShow && summary.onSchedule > 0)) return null;
  const lines = summary.read > 0 ? `${summary.read} line${summary.read === 1 ? "" : "s"} read from the uploaded schedule` : `${summary.onSchedule} line${summary.onSchedule === 1 ? "" : "s"} on the schedule`;
  const missing = summary.missingAnswers > 0 ? ` · ${summary.missingAnswers} answer${summary.missingAnswers === 1 ? "" : "s"} missing` : " · every answer is in";
  return (
    <div className={styles.nudge} data-calm={todo ? undefined : "true"}>
      <Icon name="docCheck" size={16} />
      <span className="grow"><b>{lines}</b>{missing}. {todo ? "Fill in the table to put them on the file's schedule." : "Open the table to change them."}</span>
      <DebtScheduleReviewButton profileId={profileId} variant="button" primary={todo} label="Fill in the table" />
    </div>
  );
}
