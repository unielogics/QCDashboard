"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FileWorkspaceLink, useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { OperatingPlanStatus } from "./OperatingPlanStatus";
import { operatingWorkingFeedback, operatingFeedbackLabel, type OperatingDraftSaveStatus, type OperatingCalculationStatus } from "@/lib/operatingPlanFeedback";
import { operatingSourceReviewInUse } from "@/lib/operatingSourceReview";
import { documentedHistoricalCorrection } from "@/lib/recognizablePlan";
import { operatingPlannerIssues, operatingPrerequisiteIssues, type OperatingPlannerIssue } from "@/lib/operatingPlannerIssues";
import { metricAmountLabel } from "@/lib/financialMetrics";
import { addOperatingCandidate, addOperatingGroup, DEFAULT_OPERATING_ESSENTIALS, operatingCandidateKey, operatingChangeExplanation, operatingRatioChangeExplanation, operatingRecurringSubtotal, unansweredOperatingCategories, updateOperatingExpense, type OperatingGuidance, type OperatingGuidanceEvidence } from "@/lib/operatingGuidance";
import { OPERATING_CADENCES, OPERATING_CATEGORIES, operatingLabel, type OperatingEvaluation, type OperatingExpense, type OperatingPlanBody } from "@/lib/operatingPlan";
import styles from "./OperatingPlanGuide.module.css";
import { OperatingAmountInput } from "./OperatingAmountInput";
import { NoiGovernanceSummary } from "@/components/file/cockpit/NoiGovernanceSummary";
import { OperatingUnitReadout, OperatingVolumeBehavior } from "./OperatingUnitPlanning";
import { invalidateOperatingUnitVolume, operatingUnitsUsed } from "@/lib/operatingUnitPlanning";
import { OperatingGoalSummary } from "./OperatingGoalSummary";
import type { OperatingSuggestionClient } from "@/lib/operatingSuggestions";
import type { OperatingGoalRead } from "@/lib/operatingGoal";
import { OperatingPlanSourceReview } from "./OperatingPlanSourceReview";
import { OperatingPlanImpact } from "./OperatingPlanImpact";
import { OperatingPlanIssueRail } from "./OperatingPlanIssueRail";
import type { OperatingConfigurationRequest } from "./OperatingChangeConfiguration";
import { OperatingPlanItemization } from "./OperatingPlanItemization";
import { OperatingPlanCommands } from "./OperatingPlanCommands";
import { OperatingPlanChanges } from "./OperatingPlanChanges";
import { StableOperatingPreview } from "./StableOperatingPreview";

const STEPS = ["Confirm source", "Confirm current costs", "Plan changes", "Review and save"];
const active = <T extends { excluded?: boolean; duplicate_of?: string | null }>(rows: T[] = []) => rows.filter(row => !row.excluded && !row.duplicate_of);
const uid = () => crypto.randomUUID();

export function OperatingPlanGuide({ value, onChange, guidance, evidence, evaluation, layoutEvaluation, evaluating, disabled = false, onPreviewSource, detailedImpact, reviewControls, reportControls, stepRequest, onAdvancedAction, onEditUnits = () => {}, stepIndex, onStepChange, sourceAnnualRevenue, onReviewRevenue, unitProposal, onAddUnitPlan = () => {}, sourceTools, sourceMessage, unitControls, allocationControls, onConfirmSource, onSaveVersion, saveVersionDisabled, saveVersionBusy, saveVersionLabel = "Save version", goal, goalControls, suggestionClient, onReviewExpense, saveStatus, calculationStatus, onFixFeedback, growthRequest, fundingSummary, configurationRequest }: {
  reportControls?: ReactNode;
  fundingSummary?: ReactNode; configurationRequest?: OperatingConfigurationRequest;
  growthRequest?: number; saveStatus?: OperatingDraftSaveStatus; calculationStatus?: OperatingCalculationStatus; onFixFeedback?: (id?: string, field?: string) => void;
  onReviewExpense?: (id: string) => void; suggestionClient?: OperatingSuggestionClient;
  goal?: OperatingGoalRead | null; goalControls?: ReactNode;
  value: OperatingPlanBody; onChange: (body: OperatingPlanBody) => void;
  guidance?: OperatingGuidance | null; evidence?: OperatingGuidanceEvidence | null;
  evaluation?: OperatingEvaluation | null; evaluating?: boolean; disabled?: boolean;
  layoutEvaluation?: OperatingEvaluation | null;
  onPreviewSource?: (id: string) => void; detailedImpact?: ReactNode; reviewControls?: ReactNode;
  stepRequest?: { index: number; key: number } | null; onEditUnits?: () => void; onAdvancedAction?: (id: string) => void; sourceAnnualRevenue?: number | null; onReviewRevenue?: () => void; unitProposal?: ReactNode; onAddUnitPlan?: () => void; stepIndex?: number; onStepChange?: (step: number) => void; sourceTools?: ReactNode; sourceMessage?: ReactNode; unitControls?: ReactNode; allocationControls?: ReactNode; onConfirmSource?: () => void; onSaveVersion?: () => void | Promise<void>; saveVersionDisabled?: boolean; saveVersionBusy?: boolean; saveVersionLabel?: string;
}) {
  const fileWorkspace = useFileWorkspace();
  const [localStep, setLocalStep] = useState(0);
  const step = stepIndex ?? localStep;
  const setStep = onStepChange ?? setLocalStep;
  const guideElement = useRef<HTMLElement>(null), navigationFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(navigationFrame.current), []);
  const [navigationNotice, setNavigationNotice] = useState("");
  const [handoffMode, setHandoffMode] = useState(false);
  const [sourceReviewRequest, setSourceReviewRequest] = useState<{ key: number; sourceGroupKey: string; field: string }>();
  const issues = operatingPlannerIssues(value, evaluation ?? layoutEvaluation, guidance, { serverCurrent: !evaluating && Boolean(evaluation) });
  const prerequisiteIssues = operatingPrerequisiteIssues(issues);
  const reveal = (issue: OperatingPlannerIssue) => {
    setHandoffMode(false); setStep(issue.step); setNavigationNotice("");
    if (issue.step === 1 && issue.sourceGroupKey) { setSourceReviewRequest({ key: Date.now(), sourceGroupKey: issue.sourceGroupKey, field: issue.field }); return; }
    cancelAnimationFrame(navigationFrame.current); navigationFrame.current = requestAnimationFrame(() => {
      if (issue.category && issue.field.startsWith("category_confirmations.")) {
        const target = [...(guideElement.current?.querySelectorAll<HTMLElement>("[data-operating-category]") || [])].find(node => node.dataset.operatingCategory === issue.category);
        const details = target?.closest("details"); if (details) details.open = true; target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center", behavior: "smooth" }); return;
      }
      if (issue.step === 0) { const target = guideElement.current?.querySelector<HTMLElement>(`[data-operating-source-field="${issue.field}"]`) || guideElement.current?.querySelector<HTMLElement>("[data-operating-source-repair]"); const details = target?.closest("details"); if (details) details.open = true; target?.focus({ preventScroll: true }); target?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
      onFixFeedback?.(issue.actionId, issue.field);
    });
  };
  const go = (next: number) => {
    if (next > 0 && step === 0 && (evaluation?.baseline.noi == null || evaluation?.baseline.noi_governance?.status === "stale" || evaluation?.baseline.noi_governance?.status === "unavailable")) { const sourceIssue = prerequisiteIssues.find(issue => issue.step === 0); if (sourceIssue) { reveal(sourceIssue); return; } }
    if (next >= 2 && prerequisiteIssues.length) { reveal(prerequisiteIssues[0]); return; }
    if (next >= 2 && evaluating) { setNavigationNotice("Checking your current answers before continuing…"); return; }
    setNavigationNotice(""); setHandoffMode(false); setStep(next); cancelAnimationFrame(navigationFrame.current); navigationFrame.current = requestAnimationFrame(() => { guideElement.current?.querySelector<HTMLElement>("[data-operating-step-heading]")?.focus({ preventScroll: true }); guideElement.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
  useEffect(() => { if (stepRequest) setStep(stepRequest.index); }, [stepRequest, setStep]);
  const expenses = active(value.expenses);
  const unitsUsed = operatingUnitsUsed(value);
  const units = !evaluating ? evaluation?.unit_economics : null;
  const currency = value.currency || guidance?.reporting.currency;
  const money = (amount: number | null | undefined, sourceCurrency = currency) => metricAmountLabel(amount, sourceCurrency);
  const change = (patch: Partial<OperatingPlanBody>) => onChange({ ...value, schema_version: "operating-plan-v1", ...patch });
  const changeExpense = (id: string, patch: Partial<OperatingExpense>) => onChange(invalidateOperatingUnitVolume(updateOperatingExpense(value, id, patch)));
  const amount = (label: string, current: unknown, commit: (value: string) => void, locked = false) => <label>{label}<OperatingAmountInput label={label} value={current} disabled={disabled || locked} onCommit={commit} /></label>;
  const frequency = (label: string, current: OperatingExpense["cadence"], commit: (value: OperatingExpense["cadence"]) => void) => <label>{label}<select aria-label={label} value={current ?? "monthly"} disabled={disabled} onChange={event => commit(event.target.value as OperatingExpense["cadence"])}>{OPERATING_CADENCES.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>;
  const files = (ids: string[]) => ids.map(id => <button key={id} type="button" disabled={!onPreviewSource} onClick={() => onPreviewSource?.(id)}>View {evidence?.files?.find(file => file.file_id === id)?.file_name || "source document"}</button>);
  const addExpense = (category = "other", sourceGroupKey = "") => onChange(addOperatingCandidate(value, { category, label: "", current_amount: null, cadence: "monthly", source_group_key: sourceGroupKey }, uid()));
  const essentials = guidance?.essentials?.length ? guidance.essentials : DEFAULT_OPERATING_ESSENTIALS;
  const unanswered = unansweredOperatingCategories(value, guidance);
  const handoffEligible = Boolean(value.historical_corrections?.some(row => documentedHistoricalCorrection(value, row.source_group_key)));
  const categoryKeys = [...new Set([...essentials.map(row => row.category), ...expenses.map(row => row.category || "other")])];
  const sourceReview = operatingSourceReviewInUse(value, evaluation?.source_review ?? layoutEvaluation?.source_review, guidance) ? <OperatingPlanSourceReview onHandoff={() => { setHandoffMode(true); setStep(3); }} request={sourceReviewRequest} issues={issues} value={value} onChange={onChange} guidance={guidance} review={evaluation?.source_review ?? layoutEvaluation?.source_review} disabled={disabled} onPreviewSource={onPreviewSource} onReviewLegacy={() => { setStep(2); }} /> : null;
  return <section ref={guideElement} className={styles.guide} aria-label="Guided operating expenses and earnings plan">
    <OperatingPlanStatus requiredCount={issues.length} save={saveStatus} calculation={calculationStatus} feedback={evaluation?.draft_feedback} onReview={() => { if (issues[0]) reveal(issues[0]); else onFixFeedback?.(undefined, calculationStatus?.invalid?.[0]); }} />
    <nav className={styles.steps} aria-label="Guided operating plan steps">{STEPS.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} onClick={() => go(index)}><span>{index + 1}</span>{label}{(index === 3 ? issues.length : issues.filter(issue => issue.step === index).length) ? <small className={styles.issueBadge} aria-label={`${(index === 3 ? issues.length : issues.filter(issue => issue.step === index).length)} items to finish`}>{(index === 3 ? issues.length : issues.filter(issue => issue.step === index).length)}</small> : null}</button>)}</nav>
    <div className={styles.workspace}>
    <aside className={styles.sidebar} aria-label="Plan metrics and required items">
      <OperatingPlanImpact evaluation={evaluation} baselineEvaluation={layoutEvaluation} pending={evaluating} />
    {goal || fundingSummary ? <OperatingGoalSummary fundingSummary={fundingSummary} workingStep={step >= 2} onFix={() => { const issue = issues[0]; if (issue) reveal(issue); else { setStep(0); } }} goal={goal} control={goalControls} feedback={evaluation} progress={evaluation?.goal_progress} baseline={layoutEvaluation?.goal_progress} pending={evaluating} hasChanges={Boolean(value.adjustments?.some(row => !row.excluded && row.status !== "rejected"))} /> : null}
      <OperatingPlanIssueRail issues={issues} onFix={reveal} />
    </aside>
    <div className={styles.stepContent}>
    <h4 data-operating-step-heading tabIndex={-1}>Step {step + 1}: {STEPS[step]}</h4>
    {sourceMessage}
    {navigationNotice ? <small role="status" className={styles.warning}>{navigationNotice}</small> : null}
    {step === 0 ? <>
      {issues.some(issue => issue.step === 0) ? <section className={`${styles.requiredItems} ${styles.attention}`} data-operating-source-repair tabIndex={-1} aria-label="Current income source required"><strong>{issues.filter(issue => issue.step === 0).every(issue => issue.field === "loan_source") ? "Confirm the saved loan inputs" : "Confirm current source inputs first"}</strong>{issues.filter(issue => issue.step === 0).map(issue => <small key={issue.id}>{issue.label}</small>)}<small>Source figures stay read-only. Planning starts after the current annual operating income, reporting period and currency are confirmed.</small>{fileWorkspace ? <>{issues.some(issue => issue.step === 0 && issue.field !== "loan_source") ? <a href={`/files/${encodeURIComponent(fileWorkspace.intakeId)}?section=financials`} target="_blank" rel="noopener noreferrer">Review current income source ↗</a> : null}{issues.some(issue => issue.field === "loan_source") ? <FileWorkspaceLink tool="coverage">Review saved loan plan ↗</FileWorkspaceLink> : null}</> : <small>Ask your team to confirm these saved source inputs, then check this plan again.</small>}</section> : null}
      {sourceTools ? <div>{sourceTools}</div> : <section className={styles.card} aria-label="Selected reporting source"><h4>Selected tax / P&amp;L source</h4><strong>{evidence?.files?.find(file => file.file_id === guidance?.reporting.source_file_id)?.file_name || guidance?.reporting.source_label || "No reporting source selected"}</strong><p>{guidance?.reporting.period_start || "Start unconfirmed"} to {guidance?.reporting.period_end || "End unconfirmed"} · {guidance?.reporting.currency || "Currency unconfirmed"} · {guidance?.reporting.basis || "Basis unconfirmed"}</p><p>Source figures are read-only. Confirm the source to draft its known current cost groups; unknown amounts stay blank.</p>{guidance?.reporting.source_file_id ? <button type="button" onClick={() => onPreviewSource?.(guidance.reporting.source_file_id!)}>View source (new tab)</button> : <p>You can enter current costs manually, or ask your team to add a reporting source.</p>}</section>}
      {sourceReview}
      {evaluation?.released_cash_flow?.source?.updated_at ? <section className={styles.card} aria-label="Loan terms on file">
        <div className={styles.heading}><h4>Loan terms on file</h4>{fileWorkspace ? <FileWorkspaceLink tool="coverage">Open loan terms</FileWorkspaceLink> : null}</div>
        <div className={styles.comparison}>
          <div><span>Current payments / month</span><strong>{money(evaluation.released_cash_flow.source.before_monthly, "USD")}</strong></div>
          <div><span>With saved terms / month</span><strong>{money(evaluation.released_cash_flow.source.after_monthly, "USD")}</strong></div>
          <div><span>Net cash change / month</span><strong>{money(evaluation.comparison?.loan_cash_monthly ?? evaluation.cash_bridge?.net_loan_cash_change_monthly, "USD")}</strong></div>
        </div>
      </section> : null}
      <details><summary>Reporting details and source groups</summary>
      <div className={styles.notice}><strong>{guidance?.business.name || value.business_name || "Your business"}</strong><p>{[guidance?.business.industry, guidance?.business.naics_code ? `NAICS ${guidance.business.naics_code}` : null].filter(Boolean).join(" · ")}</p><p>Source: {guidance?.reporting.source_label || "No supported reporting source is available yet"} · {guidance?.reporting.period_start || "Start unconfirmed"} – {guidance?.reporting.period_end || "End unconfirmed"} · {guidance?.reporting.currency || "Currency unconfirmed"} · {guidance?.reporting.basis || "Basis unconfirmed"}</p>{guidance?.reporting.source_label && !disabled ? <button type="button" onClick={() => change({ business_name: value.business_name || guidance.business.name || "", period_start: guidance.reporting.period_start || value.period_start, period_end: guidance.reporting.period_end || value.period_end, currency: guidance.reporting.currency || value.currency, basis: ["cash", "accrual"].includes(guidance.reporting.basis || "") ? guidance.reporting.basis as "cash" | "accrual" : value.basis })}>Use these reporting details</button> : null}</div>
      <div className={styles.fields}><label>Business name<input value={value.business_name || ""} disabled={disabled} onChange={event => change({ business_name: event.target.value })} /></label><label>Period starts<input data-operating-source-field="period_start" aria-label="Operating reporting period start" type="date" value={value.period_start || ""} disabled={disabled} onChange={event => change({ period_start: event.target.value })} /></label><label>Period ends<input type="date" value={value.period_end || ""} disabled={disabled} onChange={event => change({ period_end: event.target.value })} /></label><label>Plan currency<input data-operating-source-field="currency" aria-label="Operating plan currency" maxLength={3} value={value.currency || ""} disabled={disabled} onChange={event => change({ currency: event.target.value.toUpperCase() })} /></label><label>Accounting basis<select value={value.basis || "unknown"} disabled={disabled} onChange={event => change({ basis: event.target.value as OperatingPlanBody["basis"] })}><option value="unknown">Unconfirmed</option><option value="cash">Cash</option><option value="accrual">Accrual</option></select></label></div>
      {value.currency && guidance?.reporting.currency && value.currency !== guidance.reporting.currency ? <p className={styles.warning}>The plan currency differs from the source currency. No conversion has been applied. Confirm the currency and amounts with your team.</p> : null}
      <h4>Expense groups from your tax return or P&amp;L</h4><p>These are reporting-period amounts from one selected source. Add a group explicitly, then confirm or split its current costs in the next step. Adding costs does not replace current NOI.</p>
      <div className={styles.cards}>{guidance?.expense_groups?.map(group => {
        const exists = expenses.some(row => row.source_group_key === group.key);
        return <article key={group.key} className={styles.card}><h5>{group.label}</h5><strong>{money(group.baseline_annual_amount, group.currency)} / year</strong><p>{group.source_label} · {group.year || "Year unconfirmed"} · {group.currency || "Currency unconfirmed"} · {group.basis || "Basis unconfirmed"}</p>{group.notes.map(note => <p key={note}>{note}</p>)}<div className={styles.actions}>{files(group.source_file_ids)}<button type="button" disabled={disabled || exists} onClick={() => onChange(addOperatingGroup(value, group, uid()))}>{exists ? "Group added" : `Add ${group.label} for review`}</button></div></article>;
      })}</div>
      {!guidance?.expense_groups?.length ? <p className={styles.notice}>No source expense groups are available. You can still disclose your costs in the next step or ask your team to review your documents.</p> : null}
      <details><summary>Suggestions from supporting documents</summary><p>Tax and P&amp;L suggestions may repeat an expense group already added. Bank-statement payments can include transfers, financing, or operating costs. A suggestion is not a confirmed expense. Review its category, frequency, amount and source before adding it.</p><div className={styles.cards}>{evidence?.expense_candidates?.map((candidate, index) => {
        const key = operatingCandidateKey(candidate); const exists = key && expenses.some(row => row.source_candidate_key === key || candidate.bank_vendor_key && row.bank_vendor_key === candidate.bank_vendor_key || candidate.source_group_key && row.source_group_key === candidate.source_group_key);
        return <article className={styles.card} key={key || index}><h5>{candidate.label || candidate.payee || "Statement payment"}</h5><p>{metricAmountLabel(candidate.current_amount == null ? null : Number(candidate.current_amount), candidate.currency || currency)} · {candidate.cadence || "Frequency unconfirmed"}{candidate.year ? ` · ${candidate.year}` : ""}</p><p>{candidate.source_note}</p>{candidate.warning ? <p className={styles.warning}>{candidate.warning}</p> : null}<div className={styles.actions}>{files(candidate.source_file_ids || [])}<button type="button" disabled={disabled || Boolean(exists)} onClick={() => onChange(addOperatingCandidate(value, candidate, uid()))}>{exists ? "Already added" : "Add statement suggestion"}</button></div></article>;
      })}</div>{!evidence?.expense_candidates?.length ? <p>No recurring statement suggestions are available. You can enter costs yourself.</p> : null}</details>
      {[...(guidance?.warnings ?? []), ...(evidence?.warnings ?? [])].map((note, index) => <p key={`${index}:${note}`} className={styles.warning}>{note}</p>)}
      </details>
    </> : step === 1 ? <>
      {handoffEligible ? <button type="button" className={styles.handoffAction} disabled={disabled || evaluating} onClick={() => { setHandoffMode(true); setStep(3); }}>Save for preparer review</button> : null}
      {sourceReview ? <>{sourceReview}{unitControls ? <details><summary>Revenue model and business units</summary>{unitControls}</details> : null}</>
        : <OperatingPlanItemization value={value} onChange={onChange} guidance={guidance} evaluation={evaluation} evaluating={evaluating} disabled={disabled} unitControls={unitControls} onPreviewSource={onPreviewSource} />}
    </> : step === 2 ? <>
      {prerequisiteIssues.length ? <section className={styles.requiredItems}><strong>Finish current answers before comparing the plan</strong><button type="button" onClick={() => reveal(prerequisiteIssues[0])}>{prerequisiteIssues[0].label}</button></section> : null}
      <OperatingPlanCommands configurationRequest={configurationRequest} growthRequest={growthRequest} issues={issues} onFixFeedback={onFixFeedback} onReviewExpense={onReviewExpense} suggestionClient={suggestionClient} goalRevision={goal?.revision} hasGoal={Boolean(goal)} value={value} onChange={onChange} guidance={guidance} evidence={evidence} evaluation={evaluation} evaluating={evaluating} disabled={disabled} onPreviewSource={onPreviewSource} onAdvancedAction={onAdvancedAction} onEditUnits={onEditUnits} baseline={evaluation?.baseline ?? layoutEvaluation?.baseline} sourceAnnualRevenue={sourceAnnualRevenue} onReviewRevenue={onReviewRevenue} unitProposal={unitProposal} onAddUnitPlan={onAddUnitPlan} />

      <details data-operating-current-details><summary>Current item details and business units</summary><OperatingPlanItemization value={value} onChange={onChange} guidance={guidance} evaluation={evaluation} evaluating={evaluating} disabled={disabled} unitControls={unitControls} onPreviewSource={onPreviewSource} /></details>
    </> : <>

      {handoffMode ? <section className={styles.requiredItems}><strong>Historical difference awaiting preparer review</strong><small>This version records the disclosed items and supporting explanation. It does not confirm changed historical income or approve the plan.</small></section> : <StableOperatingPreview pending={Boolean(evaluating || !evaluation)}><OperatingGuidedComparison onFix={onFixFeedback} evaluation={evaluation} baselineEvaluation={layoutEvaluation} evaluating={evaluating} /></StableOperatingPreview>}
      {reportControls}
      {detailedImpact ? <details><summary>Detailed calculation and review notes</summary>{detailedImpact}</details> : null}
      <label className={styles.check}><input type="checkbox" disabled={disabled} checked={value.client_attestation === true} onChange={event => change({ client_attestation: event.target.checked })} />I confirm these disclosures and proposals</label>
      <label className={styles.shortNotes}>Plan and handoff notes<textarea value={value.notes || ""} disabled={disabled} onChange={event => change({ notes: event.target.value })} /></label>
      <details aria-label="Tax preparer handoff"><summary>Tax preparer handoff{value.historical_corrections?.length ? ` · ${value.historical_corrections.length} historical difference(s)` : ""}</summary><p>Keep historical source corrections separate from future plans. Save this version and share its PDF with your tax preparer for review. This does not file or amend a tax return.</p>{value.historical_corrections?.map(correction => <article key={correction.source_group_key}><strong>{guidance?.expense_groups?.find(group => group.key === correction.source_group_key)?.label || "Historical source difference"} · unresolved preparer review</strong><p>{correction.reason || "Reason still needed"}</p><p>{correction.evidence_note || (correction.source_file_ids?.length ? "Supporting documents linked for review." : "Evidence or reference still needed")}</p><button type="button" onClick={() => go(1)}>Review historical correction</button></article>)}{evaluation?.expense_changes?.source_reconciliation_issues?.map(issue => <p className={styles.warning} key={issue}>{issue}</p>)}</details>
      {reviewControls ? <details><summary>Staff review and reconciliation</summary>{reviewControls}</details> : null}
    </>}
    <footer className={styles.navigation}><button type="button" disabled={step === 0} onClick={() => go(step - 1)}>Back</button><span>Step {step + 1} of {STEPS.length}</span>{step < STEPS.length - 1 ? <button type="button" onClick={() => { if (step === 0 && !disabled && evaluation?.baseline.noi != null && !["stale", "unavailable"].includes(evaluation?.baseline.noi_governance?.status || "")) onConfirmSource?.(); go(step + 1); }}>Continue</button> : <button type="button" disabled={disabled || saveVersionDisabled || !onSaveVersion} onClick={() => { if (!handoffMode && issues.length) { reveal(issues[0]); return; } void onSaveVersion?.(); }}>{saveVersionBusy ? "Saving version…" : handoffMode ? "Save for preparer review" : issues.length ? "Complete required items" : saveVersionLabel}</button>}</footer>
    </div>
    </div>
  </section>;
}

export function OperatingGuidedComparison({ evaluation, baselineEvaluation, evaluating, onFix }: { evaluation?: OperatingEvaluation | null; baselineEvaluation?: OperatingEvaluation | null; evaluating?: boolean; onFix?: (id?: string, field?: string) => void }) {
  const fileWorkspace = useFileWorkspace();
  const before = evaluation?.baseline ?? baselineEvaluation?.baseline, working = !evaluating ? operatingWorkingFeedback(evaluation) : null;
  const baselineCurrency = before?.noi_governance ? before.noi_governance.currency : before && "noi_currency" in before ? before.noi_currency : before?.currency;
  const currency = working?.currency === undefined ? baselineCurrency : working.currency;
  const baselineSummary = baselineEvaluation?.draft_feedback?.summary;
  const summary = evaluation?.draft_feedback?.summary, qualified = working?.basis === "qualified" || working?.basis === "after_setup";
  const earningsLabel = working?.earningsKind?.toLowerCase().includes("ebitda") ? "Annual EBITDA" : working?.earningsKind?.toLowerCase().includes("tax") ? "Annual earnings (tax estimate)" : "Annual earnings estimate";
  const rows = [
    { label: "Annual NOI", before: working ? working.current : before?.noi, after: working?.after, delta: working?.delta, ratio: false },
    { label: "Cash after debt / year (illustration)", before: working?.working?.cash_after_debt_before_annual, after: working?.working?.cash_after_debt_after_annual, delta: working?.working?.cash_after_debt_delta_annual, ratio: false, currency: working?.earningsCurrency },
    { label: earningsLabel, before: working?.earningsCurrent, after: working?.earningsAfter, delta: working?.earningsDelta, ratio: false, currency: working?.earningsCurrency },
    { label: "First-year earnings", before: working?.earningsCurrent, after: working?.firstYearEarningsAfter, delta: working?.firstYearEarningsDelta, ratio: false, currency: working?.earningsCurrency },
    { label: "First-year NOI", before: working ? working.current : before?.noi, after: working?.firstYearAfter, delta: working?.firstYearDelta, ratio: false },
    { label: `DSCR · current debt${working?.dscrBasis === "draft" ? " · before setup/timing" : ""}`, before: working ? working.dscrBefore : baselineSummary?.dscr_current_debt_before, after: working?.dscrAfter, delta: working?.dscrDelta, ratio: true },
    { label: "DSCR · saved refinance", before: working?.dscrBefore, after: working?.working?.dscr_with_refinance_after, delta: working?.working?.dscr_with_refinance_delta, ratio: true },
    { label: "First-year DSCR · current debt", before: working ? working.dscrBefore : baselineSummary?.dscr_current_debt_before, after: working?.firstYearDscrAfter, delta: working?.firstYearDscrDelta, ratio: true },
  ].filter(row => row.label === "Annual NOI" || row.after != null || row.delta != null);
  const format = (value: number | null | undefined, ratio: boolean, sourceCurrency = currency) => value == null ? "Unknown" : ratio ? `${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")}x` : metricAmountLabel(value, sourceCurrency);
  return <section aria-label="Guided before and after" className={styles.compactComparison}><small>{working?.basis === "after_setup" ? "Working plan · after setup, before timing; subject to review" : qualified ? "Working plan · inputs supplied; subject to review" : "Draft—before setup/timing"}. Cash after debt uses confirmed earnings, loan payments and modeled cash changes; it is not a bank balance. Assignments do not change NOI.</small>{working?.dscrBasis === "qualified" && !qualified ? <small>DSCR · current debt uses net run-rate after recurring setup costs.</small> : null}<div className={styles.tableScroll}><table><thead><tr><th>Metric</th><th>Current</th><th>Working plan</th><th>Change (Δ)</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th>{row.label}</th><td>{row.ratio && row.before == null ? before?.annual_debt_service === 0 ? "Not applicable · no current debt" : fileWorkspace ? <FileWorkspaceLink tool="coverage">Confirm current debt inputs ↗</FileWorkspaceLink> : "Confirm current debt inputs with your team" : format(row.before, row.ratio, "currency" in row ? row.currency : currency)}</td><td>{evaluating ? "Calculating…" : row.after == null ? <button type="button" onClick={() => { const read = evaluation?.draft_feedback?.actions.find(item => item.math_missing.length || item.qualification_missing.length || item.source_issues.length); onFix?.(read?.action_id, read?.math_missing[0] || read?.qualification_missing[0] || read?.source_issues[0] || "baseline.noi"); }}>Finish the planned inputs</button> : format(row.after, row.ratio, "currency" in row ? row.currency : currency)}</td><td className={row.delta == null ? undefined : row.delta < 0 ? styles.negative : row.delta > 0 ? styles.positive : undefined}>{evaluating ? "Calculating…" : `${row.delta != null && row.delta > 0 ? "+" : ""}${row.delta == null ? "—" : format(row.delta, row.ratio, "currency" in row ? row.currency : currency)}`}</td></tr>)}</tbody></table></div>
    {working?.working?.dscr_with_refinance_after != null ? <small>Saved-refinance DSCR uses the loan plan’s coverage window and maturity stress, after new loan operating charges; it is separate from regular payment relief.</small> : null}
    {!evaluating && working && working.firstYearDelta == null && evaluation?.draft_feedback?.actions.length ? <button type="button" onClick={() => onFix?.(undefined, "projection_start")}>Optional: choose a plan start for first-year results</button> : null}
    {!evaluating && working && working.dscrAfter == null && before?.annual_debt_service !== 0 ? <small>Debt coverage will appear after the saved loan payment inputs are confirmed. Review the loan source in Cash flow and reinvestment.</small> : null}
    {!evaluating && working && !working.complete ? <small>{working.knownSubtotal != null ? `Known annual subtotal (partial): ${metricAmountLabel(working.knownSubtotal, working.mathCurrency)}. ` : ""}Finish the highlighted changes to calculate the whole plan.</small> : null}
    {!evaluating && (summary?.missing.length || summary?.source_issues?.length) ? <div>{(summary.source_issues?.length ? summary.source_issues : summary.missing).slice(0, 3).map(field => <span key={field}>{/annual_debt_service|debt_service_currency/.test(field) ? fileWorkspace ? <FileWorkspaceLink tool="coverage">Review saved debt payments ↗</FileWorkspaceLink> : <small>Debt coverage needs confirmed saved debt payments and currency. Ask your team to review the loan plan.</small> : <button type="button" onClick={() => onFix?.(evaluation?.draft_feedback?.actions.find(row => [...row.math_missing, ...row.qualification_missing, ...row.source_issues].includes(field))?.action_id, field)}>{operatingFeedbackLabel(field)}</button>}</span>)}</div> : null}
    <details><summary>Reviewed results, source and assumptions</summary>{before?.noi_governance ? <NoiGovernanceSummary baseline={before.noi_governance} /> : null}<p>{evaluation?.projection.approved.noi == null ? "Awaiting staff review." : `Staff-reviewed annual NOI: ${metricAmountLabel(evaluation.projection.approved.noi, baselineCurrency)}.`} Historical figures stay separate from future plans.</p><p>A projection is not a profit guarantee or financing approval. Below 1.00x means illustrated earnings do not cover stated debt service.</p>{summary?.notes?.map(note => <p key={note}>{note}</p>)}{evaluation?.draft_feedback?.actions.flatMap(row => row.qualification_missing.map(field => <button type="button" key={`${row.action_id}:${field}`} onClick={() => onFix?.(row.action_id, field)}>{operatingFeedbackLabel(field)}</button>))}</details></section>;
}
