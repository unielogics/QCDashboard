"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { metricAmountLabel } from "@/lib/financialMetrics";
import { addOperatingCandidate, addOperatingGroup, DEFAULT_OPERATING_ESSENTIALS, operatingCandidateKey, operatingChangeExplanation, operatingRatioChangeExplanation, operatingRecurringSubtotal, unansweredOperatingCategories, updateOperatingExpense, type OperatingGuidance, type OperatingGuidanceEvidence } from "@/lib/operatingGuidance";
import { OPERATING_CADENCES, OPERATING_CATEGORIES, operatingLabel, type OperatingEvaluation, type OperatingExpense, type OperatingPlanBody } from "@/lib/operatingPlan";
import styles from "./OperatingPlanGuide.module.css";
import { OperatingAmountInput } from "./OperatingAmountInput";
import { NoiGovernanceSummary } from "@/components/file/cockpit/NoiGovernanceSummary";
import { OperatingUnitReadout, OperatingVolumeBehavior } from "./OperatingUnitPlanning";
import { invalidateOperatingUnitVolume, operatingUnitsUsed } from "@/lib/operatingUnitPlanning";
import { OperatingPlanItemization } from "./OperatingPlanItemization";
import { OperatingPlanCommands } from "./OperatingPlanCommands";
import { OperatingPlanChanges } from "./OperatingPlanChanges";
import { StableOperatingPreview } from "./StableOperatingPreview";

const STEPS = ["Confirm source", "Itemize current costs", "Plan changes", "Review and save"];
const active = <T extends { excluded?: boolean; duplicate_of?: string | null }>(rows: T[] = []) => rows.filter(row => !row.excluded && !row.duplicate_of);
const uid = () => crypto.randomUUID();

export function OperatingPlanGuide({ value, onChange, guidance, evidence, evaluation, layoutEvaluation, evaluating, disabled = false, onPreviewSource, detailedImpact, reviewControls, stepRequest, onAdvancedAction, onEditUnits = () => {}, stepIndex, onStepChange, sourceAnnualRevenue, onReviewRevenue, unitProposal, onAddUnitPlan = () => {}, sourceTools, sourceMessage, unitControls, allocationControls, onConfirmSource, onSaveVersion, saveVersionDisabled, saveVersionBusy, saveVersionLabel = "Save version" }: {
  value: OperatingPlanBody; onChange: (body: OperatingPlanBody) => void;
  guidance?: OperatingGuidance | null; evidence?: OperatingGuidanceEvidence | null;
  evaluation?: OperatingEvaluation | null; evaluating?: boolean; disabled?: boolean;
  layoutEvaluation?: OperatingEvaluation | null;
  onPreviewSource?: (id: string) => void; detailedImpact?: ReactNode; reviewControls?: ReactNode;
  stepRequest?: { index: number; key: number } | null; onEditUnits?: () => void; onAdvancedAction?: (id: string) => void; sourceAnnualRevenue?: number | null; onReviewRevenue?: () => void; unitProposal?: ReactNode; onAddUnitPlan?: () => void; stepIndex?: number; onStepChange?: (step: number) => void; sourceTools?: ReactNode; sourceMessage?: ReactNode; unitControls?: ReactNode; allocationControls?: ReactNode; onConfirmSource?: () => void; onSaveVersion?: () => void | Promise<void>; saveVersionDisabled?: boolean; saveVersionBusy?: boolean; saveVersionLabel?: string;
}) {
  const [localStep, setLocalStep] = useState(0);
  const step = stepIndex ?? localStep;
  const setStep = onStepChange ?? setLocalStep;
  const guideElement = useRef<HTMLElement>(null), navigationFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(navigationFrame.current), []);
  const go = (next: number) => { setStep(next); cancelAnimationFrame(navigationFrame.current); navigationFrame.current = requestAnimationFrame(() => { guideElement.current?.querySelector<HTMLElement>("[data-operating-step-heading]")?.focus({ preventScroll: true }); guideElement.current?.scrollIntoView({ block: "start", behavior: "smooth" }); }); };
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
  const categoryKeys = [...new Set([...essentials.map(row => row.category), ...expenses.map(row => row.category || "other")])];
  return <section ref={guideElement} className={styles.guide} aria-label="Guided operating expenses and earnings plan">
    <header><p>Confirm the source, itemize current costs, plan changes, then review and save.</p></header>
    <nav className={styles.steps} aria-label="Guided operating plan steps">{STEPS.map((label, index) => <button key={label} type="button" aria-current={step === index ? "step" : undefined} onClick={() => go(index)}><span>{index + 1}</span>{label}</button>)}</nav>
    <h4 data-operating-step-heading tabIndex={-1}>Step {step + 1}: {STEPS[step]}</h4>
    {sourceMessage}
    {step === 0 ? <>
      {sourceTools ? <div>{sourceTools}</div> : <section className={styles.card} aria-label="Selected reporting source"><h4>Selected tax / P&amp;L source</h4><strong>{evidence?.files?.find(file => file.file_id === guidance?.reporting.source_file_id)?.file_name || guidance?.reporting.source_label || "No reporting source selected"}</strong><p>{guidance?.reporting.period_start || "Start unconfirmed"} to {guidance?.reporting.period_end || "End unconfirmed"} · {guidance?.reporting.currency || "Currency unconfirmed"} · {guidance?.reporting.basis || "Basis unconfirmed"}</p><p>Source figures are read-only. Confirm the source to draft its known current cost groups; unknown amounts stay blank.</p>{guidance?.reporting.source_file_id ? <button type="button" onClick={() => onPreviewSource?.(guidance.reporting.source_file_id!)}>View source (new tab)</button> : <p>You can enter current costs manually, or ask your team to add a reporting source.</p>}</section>}
      <details><summary>Reporting details and source groups</summary>
      <div className={styles.notice}><strong>{guidance?.business.name || value.business_name || "Your business"}</strong><p>{[guidance?.business.industry, guidance?.business.naics_code ? `NAICS ${guidance.business.naics_code}` : null].filter(Boolean).join(" · ")}</p><p>Source: {guidance?.reporting.source_label || "No supported reporting source is available yet"} · {guidance?.reporting.period_start || "Start unconfirmed"} – {guidance?.reporting.period_end || "End unconfirmed"} · {guidance?.reporting.currency || "Currency unconfirmed"} · {guidance?.reporting.basis || "Basis unconfirmed"}</p>{guidance?.reporting.source_label && !disabled ? <button type="button" onClick={() => change({ business_name: value.business_name || guidance.business.name || "", period_start: guidance.reporting.period_start || value.period_start, period_end: guidance.reporting.period_end || value.period_end, currency: guidance.reporting.currency || value.currency, basis: ["cash", "accrual"].includes(guidance.reporting.basis || "") ? guidance.reporting.basis as "cash" | "accrual" : value.basis })}>Use these reporting details</button> : null}</div>
      <div className={styles.fields}><label>Business name<input value={value.business_name || ""} disabled={disabled} onChange={event => change({ business_name: event.target.value })} /></label><label>Period starts<input aria-label="Operating reporting period start" type="date" value={value.period_start || ""} disabled={disabled} onChange={event => change({ period_start: event.target.value })} /></label><label>Period ends<input type="date" value={value.period_end || ""} disabled={disabled} onChange={event => change({ period_end: event.target.value })} /></label><label>Plan currency<input maxLength={3} value={value.currency || ""} disabled={disabled} onChange={event => change({ currency: event.target.value.toUpperCase() })} /></label><label>Accounting basis<select value={value.basis || "unknown"} disabled={disabled} onChange={event => change({ basis: event.target.value as OperatingPlanBody["basis"] })}><option value="unknown">Unconfirmed</option><option value="cash">Cash</option><option value="accrual">Accrual</option></select></label></div>
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
      <OperatingPlanItemization value={value} onChange={onChange} guidance={guidance} evaluation={evaluation} evaluating={evaluating} disabled={disabled} unitControls={unitControls} onPreviewSource={onPreviewSource} />
    </> : step === 2 ? <>
      <OperatingPlanCommands value={value} onChange={onChange} guidance={guidance} evidence={evidence} evaluation={evaluation} evaluating={evaluating} disabled={disabled} onPreviewSource={onPreviewSource} onAdvancedAction={onAdvancedAction} onEditUnits={onEditUnits} baseline={evaluation?.baseline ?? layoutEvaluation?.baseline} sourceAnnualRevenue={sourceAnnualRevenue} onReviewRevenue={onReviewRevenue} unitProposal={unitProposal} onAddUnitPlan={onAddUnitPlan} />

    </> : <>
      {unanswered.length ? <div className={styles.notice} aria-label="Unanswered expense categories"><strong>Current expense answers still needed</strong><ul>{unanswered.map(question => <li key={question.category}>{question.label}: confirm current costs, choose not applicable, or request help.</li>)}</ul><button type="button" onClick={() => go(1)}>Return to current expense questions</button></div> : null}
      <StableOperatingPreview pending={Boolean(evaluating || !evaluation)}><OperatingGuidedComparison evaluation={evaluation} evaluating={evaluating} /></StableOperatingPreview>
      {detailedImpact ? <details><summary>Detailed calculation and review notes</summary>{detailedImpact}</details> : null}
      {allocationControls}
      <label className={styles.check}><input type="checkbox" disabled={disabled} checked={value.client_attestation === true} onChange={event => change({ client_attestation: event.target.checked })} />I confirm these disclosures and proposals</label>
      <label>Plan and handoff notes<textarea value={value.notes || ""} disabled={disabled} onChange={event => change({ notes: event.target.value })} /></label>
      <section className={styles.card} aria-label="Tax preparer handoff"><h4>Tax preparer handoff</h4><p>Keep historical source corrections separate from future plans. Save this version and share its PDF with your tax preparer for review. This does not file or amend a tax return.</p>{value.historical_corrections?.map(correction => <article key={correction.source_group_key}><strong>{guidance?.expense_groups?.find(group => group.key === correction.source_group_key)?.label || "Historical source difference"} · unresolved preparer review</strong><p>{correction.reason || "Reason still needed"}</p><p>{correction.evidence_note || (correction.source_file_ids?.length ? "Supporting documents linked for review." : "Evidence or reference still needed")}</p><button type="button" onClick={() => go(1)}>Review historical correction</button></article>)}{evaluation?.expense_changes?.source_reconciliation_issues?.map(issue => <p className={styles.warning} key={issue}>{issue}</p>)}</section>
      {reviewControls ? <details><summary>Staff review and reconciliation</summary>{reviewControls}</details> : null}
    </>}
    <footer className={styles.navigation}><button type="button" disabled={step === 0} onClick={() => go(step - 1)}>Back</button><span>Step {step + 1} of {STEPS.length}</span>{step < STEPS.length - 1 ? <button type="button" onClick={() => { if (step === 0 && !disabled) onConfirmSource?.(); go(step + 1); }}>Continue</button> : <button type="button" disabled={disabled || saveVersionDisabled || !onSaveVersion} onClick={() => void onSaveVersion?.()}>{saveVersionBusy ? "Saving version…" : saveVersionLabel}</button>}</footer>
  </section>;
}

export function OperatingGuidedComparison({ evaluation, evaluating }: { evaluation?: OperatingEvaluation | null; evaluating?: boolean }) {
  if (!evaluation) return <section aria-label="Guided before and after"><h4>Current results and proposed changes</h4><p role="status">{evaluating ? "Updating the financial preview…" : "The financial preview is not available yet. Your entries are retained; your team can help confirm the source and missing inputs."}</p></section>;
  const before = evaluation.baseline; const proposed = evaluation.projection.proposed; const reviewed = evaluation.projection.approved;
  const rows = [
    { label: "Annual NOI · run-rate", current: before.noi, proposed: proposed.noi, reviewed: reviewed.noi, currency: before.noi_governance ? before.noi_governance.currency : before.currency, ratio: false },
    { label: "First-year NOI · timing and implementation", current: before.noi, proposed: proposed.first_year_noi, reviewed: reviewed.first_year_noi, currency: before.noi_governance ? before.noi_governance.currency : before.currency, ratio: false },
    { label: "First-year DSCR · current debt", current: before.dscr, proposed: proposed.first_year_dscr_current, reviewed: reviewed.first_year_dscr_current, ratio: true },
    { label: "First-year DSCR · with saved refinance", current: before.dscr, proposed: proposed.first_year_dscr_with_refinance, reviewed: reviewed.first_year_dscr_with_refinance, ratio: true },
  ];
  const awaitingReview = reviewed.noi_status === "awaiting_review" || evaluation.actions.some(action => action.status === "proposed") && !evaluation.actions.some(action => action.included_in_approved_projection);
  return <section className={styles.guide} aria-label="Guided before and after"><h4>Current results, proposed changes and reviewed projections</h4>{before.noi_governance ? <NoiGovernanceSummary baseline={before.noi_governance} /> : null}<p>Current NOI stays on its source period and currency. Proposed results are illustrations. Staff-reviewed results use reconciled actions and are still projections.</p>{evaluating ? <p role="status">Updating preview; earlier proposed figures are hidden.</p> : null}<div className={styles.cards}>{rows.map(row => {
    const format = (value: number | null | undefined) => row.ratio ? value == null ? "Unknown" : `${value.toFixed(2)}x` : metricAmountLabel(value, row.currency);
    const change = row.ratio ? operatingRatioChangeExplanation(row.current, evaluating ? null : row.proposed) : operatingChangeExplanation(row.current, evaluating ? null : row.proposed);
    return <article className={styles.card} key={row.label}><h5>{row.label}</h5><div className={styles.comparison}>{[["Current", row.current], ["Proposed · illustration", evaluating ? null : row.proposed], ["Staff reviewed · projection", evaluating || awaitingReview ? null : row.reviewed]].map(([label, number]) => <div key={String(label)}><span>{label}</span><strong className={typeof number === "number" ? number < (row.ratio ? 1 : 0) ? styles.negative : styles.positive : undefined}>{label === "Staff reviewed · projection" && awaitingReview && !evaluating ? "Awaiting review" : format(number as number | null | undefined)}</strong></div>)}</div><p className={styles[change.tone]}>{change.text}{!row.ratio ? ` · ${operatingLabel(proposed.noi_status || "unavailable")}` : ""}</p>{row.ratio ? <p>Below 1.00x means the illustrated earnings do not cover the stated debt service. Lender requirements can be higher.</p> : null}</article>;
  })}</div><p className={styles.warning}>A change from negative to positive in this illustration is not a profit guarantee or financing approval. Sales, margins, timing and costs still need evidence and review.</p>{[...(evaluation.missing || []), ...(evaluation.risk_flags || [])].length ? <div className={styles.notice}><h5>What still needs attention</h5><ul>{[...(evaluation.missing || []), ...(evaluation.risk_flags || [])].map((note, index) => <li key={`${index}:${note}`}>{note}</li>)}</ul></div> : null}</section>;
}
