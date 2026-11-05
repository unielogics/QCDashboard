"use client";

import { useState } from "react";
import { Btn, CellChip, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDebtScheduleReviewSummary } from "@/hooks/useDebtScheduleReview";
import { FinancialWorkspace } from "./FinancialWorkspace";

/** An embedded requirement stays a summary; every edit opens the shared workspace. */
export function DebtScheduleReviewPanel({ profileId, compact = false, inDrawer = false, onSaved, onClose }: {
  profileId: string; compact?: boolean; inDrawer?: boolean; onSaved?: () => void; onClose?: () => void;
}) {
  const summary = useDebtScheduleReviewSummary(profileId);
  const [open, setOpen] = useState(false);
  if (inDrawer) return <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" initialView="worksheet" onClose={onClose ?? (() => undefined)} onPublished={onSaved} />;
  return <div className={compact ? "grid g8" : "grid g12"}>
    <div className="row"><Icon name="calc" size={17} /><b>Business debt schedule</b>{summary.loading ? <CellChip tone="mut">Loading</CellChip> : <CellChip tone={summary.missingAnswers ? "warn" : "mut"}>{summary.onSchedule || summary.read} obligations{summary.missingAnswers ? ` · ${summary.missingAnswers} answers needed` : ""}</CellChip>}<span className="sp" /><Btn size="sm" onClick={() => setOpen(true)}>Open financial workspace</Btn></div>
    <Sub>Review the form, worksheet, linked loan documents and dated PDF versions together.</Sub>
    {open ? <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" initialView="worksheet" onClose={() => setOpen(false)} onPublished={onSaved} /> : null}
  </div>;
}
