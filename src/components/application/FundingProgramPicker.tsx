"use client";

import { useState } from "react";
import { Modal } from "@/components/design-system/Modal";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea, cx } from "@/components/ds";
import type { ApplicationProgramSelection, ProgramFitCandidate } from "@/lib/applicationProfile";
import styles from "./FundingProgramPicker.module.css";

export type ProgramPickerFilter = "all" | "selected" | ProgramFitCandidate["recommendation_status"];

export function filterProgramCandidates(candidates: ProgramFitCandidate[], query: string, filter: ProgramPickerFilter, selectedKeys: string[]) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return candidates.filter((candidate) => {
    const text = `${candidate.program_name} ${candidate.program_key} ${candidate.reasons.join(" ")}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term))
      && (filter === "all" || (filter === "selected" ? selectedKeys.includes(candidate.program_key) : candidate.recommendation_status === filter));
  }).sort((a, b) => {
    const order = { recommended: 0, needs_information: 1, criteria_unavailable: 2, not_eligible: 3 };
    return order[a.recommendation_status] - order[b.recommendation_status]
      || (b.preference_score ?? 0) - (a.preference_score ?? 0)
      || b.fit_score - a.fit_score
      || b.priority - a.priority
      || a.program_name.localeCompare(b.program_name);
  });
}

function candidateLabel(candidate: ProgramFitCandidate) {
  if (candidate.recommendation_status === "recommended") return "Recommended";
  if (candidate.recommendation_status === "needs_information") return "Needs information";
  if (candidate.recommendation_status === "criteria_unavailable") return "Criteria unavailable";
  return "Not eligible";
}

function candidateTone(candidate: ProgramFitCandidate): "ok" | "warn" | "bad" | "mut" {
  if (candidate.recommendation_status === "recommended") return "ok";
  if (candidate.recommendation_status === "needs_information") return "warn";
  if (candidate.recommendation_status === "not_eligible") return "bad";
  return "mut";
}

export function FundingProgramPicker({
  candidates, selections, selectedKeys, onSelectionChange, reason, onReasonChange,
  requiresOverride, changed, busy, error, onClose, onApply,
}: {
  candidates: ProgramFitCandidate[];
  selections: ApplicationProgramSelection[];
  selectedKeys: string[];
  onSelectionChange: (keys: string[]) => void;
  reason: string;
  onReasonChange: (reason: string) => void;
  requiresOverride: boolean;
  changed: boolean;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onApply: () => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ProgramPickerFilter>("all");
  const visible = filterProgramCandidates(candidates, query, filter, selectedKeys);
  const historicalSelections = selections.filter((selection) => !candidates.some((candidate) => candidate.program_key === selection.program_key));
  const toggle = (key: string) => onSelectionChange(selectedKeys.includes(key) ? selectedKeys.filter((item) => item !== key) : [...selectedKeys, key]);

  return <Modal open title="Choose funding programs" size="lg" onClose={onClose} closeOnBackdrop={!busy} footer={
    <div className={styles.footer}>
      <span className={styles.footerCount} aria-live="polite">{selectedKeys.length} selected{changed ? " · Unsaved changes" : ""}</span>
      <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
      <Btn variant="pri" disabled={busy || !changed || (requiresOverride && reason.trim().length < 8)} onClick={onApply}>{busy ? "Applying…" : "Apply selection"}</Btn>
    </div>
  }>
    <div className={styles.layout}>
      <p className={styles.hint}>Choose programs for this file. Applying your selection updates its evidence requirements. AI fit is advisory; selecting a program outside its criteria requires a review reason.</p>
      {error ? <Callout tone="warn">{error}</Callout> : null}
      <div className={styles.toolbar}>
        <Field label="Find a program"><Input autoFocus aria-label="Find a program" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search programs or fit reasons" /></Field>
        <Field label="Show"><Select aria-label="Filter funding programs" value={filter} onChange={(event) => setFilter(event.target.value as ProgramPickerFilter)}>
          <option value="all">All programs</option><option value="selected">Selected</option><option value="recommended">Recommended</option><option value="needs_information">Needs information</option><option value="criteria_unavailable">Criteria unavailable</option><option value="not_eligible">Not eligible</option>
        </Select></Field>
      </div>
      {historicalSelections.length ? <div className={styles.results}>
        <p className={styles.hint}>Previously selected programs outside the current list remain selected unless you remove them.</p>
        {historicalSelections.map((selection) => <label key={selection.program_key} className={cx(styles.choice, styles.candidate)}>
          <input type="checkbox" checked={selectedKeys.includes(selection.program_key)} disabled={busy} onChange={() => toggle(selection.program_key)} />
          <span className={styles.candidateCopy}><strong>{selection.program_name}</strong><small>Previously selected · criteria v{selection.playbook_version}</small></span>
        </label>)}
      </div> : null}
      <p className={styles.hint} role="status">{visible.length} of {candidates.length} programs shown</p>
      <div className={styles.results}>
        {visible.map((candidate) => <div key={candidate.program_key} className={cx(styles.candidate, selectedKeys.includes(candidate.program_key) && styles.selected)}>
          <label className={styles.choice}>
            <input type="checkbox" checked={selectedKeys.includes(candidate.program_key)} disabled={busy || (!candidate.playbook_id && !selectedKeys.includes(candidate.program_key))} onChange={() => toggle(candidate.program_key)} />
            <span className={styles.candidateCopy}>
              <span className={styles.candidateTitle}><strong>{candidate.program_name}</strong><CellChip tone={candidateTone(candidate)}>{candidateLabel(candidate)}</CellChip></span>
              <small>{candidate.playbook_version ? `Criteria v${candidate.playbook_version}${candidate.recommendation_status === "recommended" ? ` · ${Math.round(candidate.fit_score)}% fit` : ""}` : "Publish criteria in Funding programs settings before selecting this program."}</small>
              {candidate.reasons[0] ? <small>{candidate.reasons[0]}</small> : null}
              {candidate.preference_reasons?.length ? <small>QC preference: {candidate.preference_reasons.join(" · ")} — recommendation only, not approval.</small> : null}
            </span>
          </label>
          {candidate.reasons.length > 1 ? <details className={styles.reasons}><summary>View all fit reasons ({candidate.reasons.length})</summary><ul>{candidate.reasons.map((item, index) => <li key={index}>{item}</li>)}</ul></details> : null}
        </div>)}
        {!visible.length ? <p className="empty">No programs match these filters. Try another search or choose All programs.</p> : null}
      </div>
      {requiresOverride ? <Field label="Required review reason"><Textarea aria-label="Required review reason" rows={2} value={reason} disabled={busy} onChange={(event) => onReasonChange(event.target.value)} placeholder="Explain why the reviewed facts support the selected program (at least 8 characters)" /></Field> : null}
    </div>
  </Modal>;
}
