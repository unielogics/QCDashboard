"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RequestFilesDialog } from "@/components/application/RequestFilesDialog";
import { FileWorkspaceBackLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { FinancialEditorSurface } from "@/components/file/FinancialEditorSurface";
import { isPlanConflict } from "@/lib/earningsPlan/api";
import type { FileRequestItem } from "@/lib/fileRequestsApi";
import { EarningsPlanWorkspace, type PlanTools } from "./EarningsPlanWorkspace";
import { useStaffPlanTransport } from "./useStaffPlanTransport";
import styles from "./EarningsPlan.module.css";

/** What the file's other screens read from the plan; refreshed when a version is saved. */
const PLAN_READERS = ["financial-workspace-summary", "operating-plan-summary", "financial-cockpit", "application-evidence-workspace", "application-collection-tasks", "form-answers"];

const planRequest = (businessName: string): FileRequestItem => ({
  document_type: "operating_plan", name: "Operating expenses and earnings plan", quantity: 1, unit: "files", subject: businessName.trim() || "business", period: "current",
  instructions: "Confirm the costs on your return, describe how your revenue is made, and propose any price, volume or cost changes with amounts, timing and the reason each will work.",
});

/**
 * The Earnings Plan for staff: on its own page from the file (inline), or over
 * the file in a full-screen panel. Signs requests as the console user and tells
 * the file's other screens when a version is saved.
 */
export function StaffEarningsPlan({ profileId, businessName, inline = false, open = true, onClose, onPublished, onOpenForms }: {
  profileId: string; businessName?: string; inline?: boolean; open?: boolean;
  onClose?: () => void; onPublished?: () => void | Promise<void>;
  /** Leave for the other financial forms (debt schedule, statements). */
  onOpenForms?: () => void;
}) {
  const transport = useStaffPlanTransport(profileId);
  const queryClient = useQueryClient();
  const fileWorkspace = useFileWorkspace();
  const [requestOpen, setRequestOpen] = useState<{ name: string; familyId: string | null } | null>(null);
  const [notice, setNotice] = useState("");

  const flushDraft = useRef<(() => Promise<void>) | null>(null);
  // Leaving waits for the draft to save. A plan that was changed somewhere else cannot be saved from here at all,
  // so that alone never keeps someone on the page.
  const ready = useCallback((flush: () => Promise<void>) => {
    flushDraft.current = () => flush().catch(error => { if (!isPlanConflict(error)) throw error; });
  }, []);
  const registerExit = fileWorkspace?.registerExit;
  useEffect(() => (inline ? registerExit?.(async () => { await flushDraft.current?.(); }) : undefined), [inline, registerExit]);

  const saved = fileWorkspace?.saved;
  const published = useCallback(() => {
    saved?.();
    for (const key of PLAN_READERS) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    void onPublished?.();
  }, [onPublished, profileId, queryClient, saved]);

  const leave = (then?: () => void) => { void (flushDraft.current?.() ?? Promise.resolve()).then(() => then?.()).catch(() => setNotice("The draft could not be saved, so this plan was kept open. Try again once it saves.")); };
  const tools = (state: PlanTools) => (
    <>
      {onOpenForms ? <button type="button" className={styles.ghost} disabled={state.busy} onClick={() => leave(onOpenForms)}>Other financial forms</button> : null}
      <button type="button" className={styles.btn} disabled={state.busy} onClick={() => {
        if (!state.goalSet) { setNotice("Set the annual NOI goal in step 1 before requesting the plan from the client."); return; }
        setNotice("");
        void state.flush().then(() => setRequestOpen({ name: state.businessName, familyId: state.familyId })).catch(() => setNotice("Save the draft before requesting the plan from the client."));
      }}>Request client plan</button>
    </>
  );
  // On its own page the way back is the file's link; in a panel the panel has its own close.
  const lead = fileWorkspace?.pageMode ? <FileWorkspaceBackLink /> : inline && onClose ? <button type="button" className={styles.btn} onClick={() => leave(onClose)}>Back to file</button> : null;
  const content = !transport ? <div className={styles.plan}><div className={styles.state} role="status"><p>Opening the earnings plan…</p></div></div> : (
    <>
      {notice ? <div className={styles.plan} style={{ marginBottom: 12 }}><div className={`${styles.notice} ${styles.notice_warn}`} role="status"><span>{notice}</span><button type="button" className={styles.ghost} onClick={() => setNotice("")}>Dismiss</button></div></div> : null}
      <EarningsPlanWorkspace transport={transport} businessName={businessName} lead={lead} tools={tools} onVersionSaved={published} onReady={ready} />
    </>
  );
  return (
    <>
      {inline ? content : (
        // The panel's own body scrolls and pads; the plan fills its width.
        <FinancialEditorSurface open={open} onClose={() => leave(onClose)} fullscreen width="xl" closeOnBackdrop={false} title="Earnings plan" sub={businessName} ariaLabel="Earnings plan">
          {content}
        </FinancialEditorSurface>
      )}
      {requestOpen ? (
        <RequestFilesDialog profileId={profileId} open prefill={planRequest(requestOpen.name)} prefillKey={`operating-plan:${requestOpen.familyId ?? profileId}`}
          onClose={() => setRequestOpen(null)} onRequested={() => { void onPublished?.(); }} />
      ) : null}
    </>
  );
}
