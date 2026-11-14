"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { isPlanConflict, type PlanError, type PlanTransport } from "@/lib/earningsPlan/api";
import { stamp } from "@/lib/earningsPlan/format";
import { STEP_TITLES, planNotices, saveLabel, stepCounts, type StepIndex } from "@/lib/earningsPlan/issues";
import { debtBasis, stepSubtitles } from "@/lib/earningsPlan/view";
import type { PlanVersion, PlanView, ToFinishItem } from "@/lib/earningsPlan/types";
import { PlanAside } from "./PlanAside";
import { StepChanges } from "./StepChanges";
import { StepModel } from "./StepModel";
import { StepReview } from "./StepReview";
import { StepSource } from "./StepSource";
import { cx } from "./parts";
import { useEarningsPlan, type PlanFacts, type SaveStatus } from "./useEarningsPlan";
import styles from "./EarningsPlan.module.css";

export type PlanTools = {
  /** Save the draft now; resolves once the API holds what is on screen. */
  flush: () => Promise<void>;
  goalSet: boolean;
  businessName: string;
  familyId: string | null;
  busy: boolean;
};

function saveText(save: SaveStatus, facts: PlanFacts): { text: string; bad: boolean } {
  if (save.state === "saving") return { text: "Saving draft…", bad: false };
  if (save.state === "unsaved") return { text: "Unsaved changes", bad: false };
  if (save.state === "error") return { text: "Not saved", bad: true };
  if (save.state === "conflict") return { text: "Changed somewhere else", bad: true };
  const current = facts.versions.find(version => version.id === facts.currentVersionId);
  if (facts.draft && !facts.draft.dirty && current) return { text: `Saved as v${current.version_number}`, bad: false };
  if (save.state === "saved") return { text: save.at ? `Draft saved ${save.at}` : "Draft saved", bad: false };
  if (!facts.canEdit) return { text: "View only", bad: false };
  return { text: facts.origin === "saved" ? "Draft saved" : "Nothing saved yet", bad: false };
}

/**
 * The four-step Earnings Plan: confirm the source, describe the revenue model
 * and costs, propose changes, review and save. The same screens serve staff and
 * the business; `transport` says who is looking and how the plan is reached.
 */
export function EarningsPlanWorkspace({ transport, businessName, lead, tools, onVersionSaved, onReady, renderError }: {
  transport: PlanTransport;
  businessName?: string;
  /** Leading header controls, such as the way back to the file. */
  lead?: ReactNode;
  /** Extra header actions, such as requesting the plan from the client. */
  tools?: (state: PlanTools) => ReactNode;
  onVersionSaved?: (version: PlanVersion | null) => void;
  /** Hands the owner a way to save the draft before it navigates away. */
  onReady?: (flush: () => Promise<void>) => void;
  /** A wrapper may answer some load failures itself (an expired link, a goal not set yet). */
  renderError?: (error: PlanError, retry: () => void) => ReactNode | null;
}) {
  const plan = useEarningsPlan(transport);
  const { body, facts, result, save, busy, edit } = plan;
  const staff = transport.viewer === "staff";
  const [step, setStep] = useState<StepIndex>(0);
  const [view, setView] = useState<PlanView>("proposed");
  const [applyTerms, setApplyTerms] = useState(true);
  const [openItem, setOpenItem] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ selector: string; at: number } | null>(null);
  const [saved, setSaved] = useState<PlanVersion | null>(null);
  const [problem, setProblem] = useState("");
  const root = useRef<HTMLDivElement | null>(null);
  const flush = plan.flush;

  useEffect(() => { onReady?.(() => flush()); }, [flush, onReady]);
  useEffect(() => { setStep(0); setOpenItem(null); setSaved(null); setProblem(""); setView("proposed"); setApplyTerms(true); }, [transport.scope]);
  useEffect(() => {
    if (!focus) return;
    const target = root.current?.querySelector<HTMLElement>(focus.selector);
    target?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus, step]);

  const go = useCallback((next: StepIndex) => {
    setStep(next); setFocus(null);
    const top = root.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) root.current?.scrollIntoView({ block: "start" });
  }, []);
  const goIssue = useCallback((item: ToFinishItem) => {
    setStep(item.step);
    setOpenItem(item.item_id ?? null);
    const selector = item.item_id ? `[data-item="${item.item_id}"]` : item.code === "confirm_source" && item.key ? `[data-group="${item.key}"]`
      : item.code === "answer_category" && item.key ? `[data-category="${item.key}"]` : null;
    setFocus(selector ? { selector, at: Date.now() } : null);
  }, []);

  if (plan.status === "loading") return <div className={styles.plan}><div className={styles.state} role="status" aria-live="polite"><p>Opening the earnings plan…</p></div></div>;
  if (plan.status === "error" || !body || !facts || !result) {
    const error = plan.loadError;
    const custom = error && renderError ? renderError(error, () => void plan.reload().catch(() => undefined)) : null;
    if (custom) return <>{custom}</>;
    return (
      <div className={styles.plan}>
        <div className={styles.state} role="alert">
          <h2>The earnings plan could not be opened</h2>
          <p>{error?.message || "Something went wrong while loading the plan."}</p>
          <button type="button" className={styles.btn} onClick={() => void plan.reload().catch(() => undefined)}>Try again</button>
        </div>
      </div>
    );
  }

  const { baseline } = facts;
  const basis = debtBasis(baseline, applyTerms);
  const issues = result.to_finish;
  const counts = stepCounts(issues);
  const subtitles = stepSubtitles(body, baseline, result, view, basis);
  const name = businessName || body.business_name || "This business";
  const canEdit = facts.canEdit && save.state !== "conflict";
  const disabled = !canEdit || busy === "reload" || busy === "resync" || busy === "review";
  const status = saveText(save, facts);
  const unsavedInReport = !facts.draft || facts.draft.dirty || save.state === "unsaved" || save.state === "saving" || save.state === "error";
  const notices = planNotices({
    body, baseline, result, sourceChanged: facts.sourceChanged, staleReviews: facts.staleReviews, origin: facts.origin,
    submitted: !staff && facts.completed && !unsavedInReport && !saved,
  });

  const act = (work: () => Promise<unknown>) => { setProblem(""); work().catch(error => { if (!isPlanConflict(error)) setProblem(error instanceof Error ? error.message : "That did not go through. Try again."); }); };
  const saveVersion = () => {
    if (issues.length) { goIssue(issues[0]); return; }
    setSaved(null);
    act(async () => {
      const version = await plan.saveVersion();
      if (version === undefined) return;
      setSaved(version);
      onVersionSaved?.(version);
    });
  };
  const reload = () => {
    if (save.state !== "conflict" && !window.confirm("Reload the saved plan and replace what is in this window?")) return;
    act(plan.reload);
  };
  const common = { body, facts, disabled, staff, edit };

  return (
    <div className={styles.plan} ref={root} data-earnings-plan={transport.viewer}>
      <header className={styles.header}>
        <div className={styles.headerLead}>
          <div className={styles.headerContext}>
            {lead}
            <span>{name}</span>
            <span className={cx(styles.tag, styles.tag_mut)}>{staff ? "Staff view" : facts.canEdit ? "Client view" : "View only"}</span>
          </div>
          <h1>Operating expenses and earnings plan</h1>
        </div>
        <div className={styles.headerActions}>
          <span className={cx(styles.saveText, styles.num, status.bad && styles.bad)} aria-live="polite" data-save-state={save.state}>{status.text}</span>
          {tools?.({ flush: () => flush(), goalSet: facts.goal?.status === "set", businessName: name, familyId: facts.familyId, busy: Boolean(busy) })}
          {facts.canEdit ? (
            <button type="button" className={cx(styles.btn, styles.primary)} disabled={Boolean(busy) || save.state === "conflict"} onClick={saveVersion}>
              {busy === "version" ? "Saving version…" : saveLabel(issues, !staff)}
            </button>
          ) : null}
        </div>
      </header>

      {save.state === "conflict" ? (
        <div className={cx(styles.notice, styles.notice_bad)} role="alert">
          <span>{save.error} What you typed here since your last save will be replaced.</span>
          <button type="button" className={styles.btn} disabled={busy === "reload"} onClick={reload}>{busy === "reload" ? "Reloading…" : "Reload plan"}</button>
        </div>
      ) : null}
      {save.state === "error" ? (
        <div className={cx(styles.notice, styles.notice_warn)} role="alert">
          <span>The draft is not saved yet: {save.error} Everything you typed is still here.</span>
          <button type="button" className={styles.btn} onClick={() => act(() => flush())}>Try again</button>
        </div>
      ) : null}
      {problem ? <div className={cx(styles.notice, styles.notice_bad)} role="alert"><span>{problem}</span><button type="button" className={styles.ghost} onClick={() => setProblem("")}>Dismiss</button></div> : null}
      {saved ? (
        <div className={cx(styles.notice, styles.notice_ok)} role="status">
          <span>
            {staff
              ? `Version ${saved.version_number} saved · ${stamp(saved.created_at)}. The file's figures and the plan PDF now use it.`
              : `Thank you. Version ${saved.version_number} was sent to your team for review. You can close this window, or keep editing and submit again.`}
          </span>
          {saved.pdf_file_id || saved.pdf_url ? <button type="button" className={styles.btn} onClick={() => act(() => transport.openPdf(saved))}>Open PDF</button> : null}
        </div>
      ) : null}
      {notices.map(notice => (
        <div className={cx(styles.notice, notice.tone !== "acc" && styles[`notice_${notice.tone}`])} key={notice.code} role="status">
          <span>{notice.message}</span>
          {notice.code === "source_changed" && facts.canEdit ? <button type="button" className={styles.btn} disabled={disabled} onClick={() => act(plan.resync)}>{busy === "resync" ? "Updating…" : "Update to current figures"}</button> : null}
          {notice.step != null && notice.step !== step && notice.code !== "source_changed" ? <button type="button" className={styles.ghost} onClick={() => go(notice.step!)}>Go to step {notice.step + 1}</button> : null}
        </div>
      ))}

      <nav className={styles.steps} aria-label="Plan steps">
        {STEP_TITLES.map((title, index) => (
          <button type="button" key={title} className={cx(styles.step, step === index && styles.on)} aria-current={step === index ? "step" : undefined} onClick={() => go(index as StepIndex)}>
            <span className={cx(styles.stepDot, styles.num)}>{index + 1}</span>
            <span className={styles.stepText}><b>{title}</b><small className={styles.num}>{subtitles[index]}</small></span>
            {counts[index] ? <span className={cx(styles.tag, styles.tag_warn, styles.num)} aria-label={`${counts[index]} to finish`}>{counts[index]}</span> : null}
          </button>
        ))}
      </nav>

      <div className={styles.columns}>
        <div className={styles.main}>
          {step === 0 ? (
            <StepSource {...common} basis={basis} applyTerms={applyTerms} onApplyTerms={setApplyTerms} busy={busy} onResync={() => act(plan.resync)}
              onSetGoal={staff && transport.setGoal ? plan.setGoal : undefined} onOpenSource={transport.openSource ? fileId => act(() => transport.openSource!(fileId)) : undefined} />
          ) : null}
          {step === 1 ? <StepModel {...common} result={result} /> : null}
          {step === 2 ? <StepChanges {...common} result={result} basis={basis} open={openItem} onOpen={setOpenItem} /> : null}
          {step === 3 ? (
            <StepReview {...common} result={result} view={view} basis={basis} busy={busy} unsavedInReport={unsavedInReport} businessName={name}
              onOpenPdf={version => transport.openPdf(version)} onReview={staff && transport.review ? plan.review : undefined} />
          ) : null}
          <div className={styles.footer}>
            <button type="button" className={styles.ghost} disabled={step === 0} onClick={() => go((step - 1) as StepIndex)}>Back</button>
            <span className={styles.num}>Step {step + 1} of 4</span>
            {step < 3
              ? <button type="button" className={styles.btn} onClick={() => go((step + 1) as StepIndex)}>Continue to {STEP_TITLES[step + 1].toLowerCase()}</button>
              : facts.canEdit ? <button type="button" className={styles.btn} disabled={Boolean(busy) || save.state === "conflict"} onClick={saveVersion}>{issues.length ? "Complete required items" : staff ? "Save version" : "Submit plan"}</button> : <span />}
          </div>
        </div>
        <PlanAside baseline={baseline} result={result} view={view} basis={basis} staff={staff} onView={setView} onIssue={goIssue} />
      </div>
    </div>
  );
}
