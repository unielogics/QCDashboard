"use client";

import { useState } from "react";
import { Btn, Callout, Sub } from "@/components/ds";
import { useDebtScheduleWorkspace } from "@/hooks/useDebtScheduleReview";
import { FinancialWorkspace } from "./FinancialWorkspace";
import { DebtScheduleReadback } from "./DebtScheduleReadback";

/** The requirement shows the draft directly; edits use the one shared workspace. */
export type DebtScheduleEditorTarget = { view: "form" | "pdf" | "history"; rowId?: string };
export function DebtScheduleReviewPanel({ profileId, compact = false, inDrawer = false, onSaved, onClose, onOpenEditor }: {
  profileId: string; compact?: boolean; inDrawer?: boolean; onSaved?: () => void; onClose?: () => void;
  onOpenEditor?: (target: DebtScheduleEditorTarget) => void;
}) {
  const workspace = useDebtScheduleWorkspace(profileId, !inDrawer);
  const [editor, setEditor] = useState<DebtScheduleEditorTarget | null>(null);
  const openEditor = (target: DebtScheduleEditorTarget) => onOpenEditor ? onOpenEditor(target) : setEditor(target);
  const closeEditor = () => { setEditor(null); void workspace.refetch(); onSaved?.(); };
  if (inDrawer) return <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" initialView="form" onClose={onClose ?? (() => undefined)} onPublished={onSaved} />;
  return <div className={compact ? "grid g8" : "grid g12"}>
    {workspace.isLoading ? <Sub>Loading the working debt schedule…</Sub> : workspace.error || !workspace.data ? <Callout tone="warn">The debt schedule could not be loaded. <Btn size="sm" onClick={() => void workspace.refetch()}>Retry</Btn></Callout> : <DebtScheduleReadback
      workspace={workspace.data}
      onEdit={(rowId) => openEditor({ view: "form", rowId })}
      onFiles={(rowId) => openEditor({ view: "pdf", rowId })}
      onHistory={() => openEditor({ view: "history" })}
    />}
    {editor ? <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" initialView={editor.view} initialDebtId={editor.rowId} onClose={closeEditor} onPublished={async () => { await workspace.refetch(); onSaved?.(); }} /> : null}
  </div>;
}
