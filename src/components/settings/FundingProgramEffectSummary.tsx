"use client";

import { CellChip } from "@/components/ds";
import { PROGRAM_EFFECT_SAFEGUARDS, PROGRAM_VERSION_EFFECT, requestedAmountEffect, type ProgramEffectSummary, type SummaryRule } from "./fundingProgramSummaryModel";
import styles from "./FundingProgramSummary.module.css";

function RuleSummary({ rule }: { rule: SummaryRule }) {
  return <li><span>{rule.text}</span>{rule.children?.length ? <ul>{rule.children.map((child, index) => <RuleSummary key={index} rule={child} />)}</ul> : null}</li>;
}

export function FundingProgramEffectSummary({
  effects, title, note, expanded = false,
}: { effects: ProgramEffectSummary; title: string; note?: string; expanded?: boolean }) {
  return <details className={styles.summary} open={expanded || undefined}>
    <summary><span><strong>{title}</strong><small>{effects.routes.length} {effects.routes.length === 1 ? "workspace route" : "workspace routes"} · {effects.checkCount} eligibility {effects.checkCount === 1 ? "check" : "checks"} · {effects.documents.length} {effects.documents.length === 1 ? "document" : "documents"}{effects.preferences.length ? ` · ${effects.preferences.length} ranking ${effects.preferences.length === 1 ? "preference" : "preferences"}` : ""}</small></span><span className={styles.toggle} aria-hidden="true">Details</span></summary>
    <div className={styles.content}>
      {note ? <p className={styles.note}>{note}</p> : null}
      {effects.warnings.length ? <ul className={styles.warnings}>{effects.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
      <section aria-label="Program availability summary"><h4>Where the program appears</h4>
        {effects.routes.length ? <><p className={styles.muted}>A business must match one route in its workspace. Restrictions within a route apply together; prohibited industries take priority.</p><ul className={styles.routes}>{effects.routes.map((route, index) => <li key={index}><strong>{route.label}</strong>{route.restrictions.length ? <ul>{route.restrictions.map((restriction) => <li key={restriction}>{restriction}</li>)}</ul> : <p>No additional route restrictions.</p>}<p>{route.exclusions.length ? `Prohibited NAICS prefixes: ${route.exclusions.join(", ")}` : "No prohibited industries configured for this workspace."}</p></li>)}</ul></> : <p>No workspace selected.</p>}
      </section>
      <section aria-label="Eligibility effect summary"><h4>Eligibility checks</h4>{effects.fit ? <ul className={styles.rules}><RuleSummary rule={effects.fit} /></ul> : <p>No eligibility checks configured. This cannot be enabled yet.</p>}{effects.requestedAmountMaximum ? <p className={styles.note}>{requestedAmountEffect(effects.requestedAmountMaximum)}</p> : null}{effects.priority !== null ? <p className={styles.muted}>Configured matching priority: {effects.priority}. This affects ranking, not eligibility.</p> : null}</section>
      {effects.preferences.length ? <section aria-label="Recommendation preference summary"><h4>Recommendation preferences · not eligibility</h4><p className={styles.muted}>Only eligible programs earn ranking points. Missing information earns no preference. Manual and existing program selections are not replaced.</p><ul>{effects.preferences.map((preference, index) => <li key={index}><strong>{preference.label}</strong><p>{preference.score === null ? "Set ranking points before saving." : `Add ${preference.score} ranking points when:`}</p><ul className={styles.rules}><RuleSummary rule={preference.condition} /></ul></li>)}</ul></section> : null}
      <section aria-label="Document effect summary"><h4>Documents and AI review</h4>
        {effects.documents.length ? <div className={styles.documents}>{effects.documents.map((document, index) => <details key={index} className={styles.document}>
          <summary><span><strong>{document.name}</strong><small>{document.importance}{document.staffVerification ? " · Staff verification required" : ""}{document.checks.length ? ` · ${document.checks.length} review ${document.checks.length === 1 ? "condition" : "conditions"}` : ""}</small></span><span className={styles.toggle} aria-hidden="true">Review</span></summary>
          <div className={styles.documentBody}>
            <p className={styles.binding}>These instructions apply only to files assigned to this document requirement.</p>
            {document.appliesWhen ? <div><strong>Collect only when</strong><ul className={styles.rules}><RuleSummary rule={document.appliesWhen} /></ul></div> : null}
            <div><strong>What the AI should look for</strong><p className={styles.prose}>{document.instructions || "No additional AI instructions configured."}</p></div>
            {document.objective ? <div><strong>Review objective</strong><p className={styles.prose}>{document.objective}</p></div> : null}
            {document.checks.length ? <div><strong>Flag for review / Do not accept</strong><ul className={styles.checks}>{document.checks.map((check, checkIndex) => <li key={checkIndex}><div><strong>{check.label}</strong><CellChip tone="warn">{check.policy}</CellChip></div><p className={styles.prose}>{check.instructions || "Instructions still need to be entered."}</p></li>)}</ul><p className={styles.muted}>AI highlights these conditions. Staff must resolve them before accepting the document. These settings do not automatically reject an upload.</p></div> : null}
            <p><strong>{document.completion}.</strong></p>
            {document.details.length ? <ul className={styles.metadata}>{document.details.map((detail, detailIndex) => <li key={detailIndex}>{detail}</li>)}</ul> : null}
          </div>
        </details>)}</div> : <p>No documents are required by this criteria version.</p>}
      </section>
      <footer><p>{PROGRAM_VERSION_EFFECT}</p><p>{PROGRAM_EFFECT_SAFEGUARDS}</p></footer>
    </div>
  </details>;
}
