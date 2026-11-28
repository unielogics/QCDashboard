"use client";

import type { ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Select, cx } from "@/components/ds";
import type { ReviewChoice, ReviewDecisionState } from "@/lib/evidenceReviewDecision";
import styles from "./EvidenceDecisionBar.module.css";

/**
 * Approve or reject, in words.
 *
 * The first row is the file's decision for one checklist item: what is true now,
 * and labelled buttons for what the reviewer can do. Anything else the screen
 * asks about the file (its business name, the details the AI read) is passed in
 * and drawn as further rows of the same strip.
 */
export function EvidenceDecisionBar({ state, requirementKey, requirements = [], onSelectRequirement, busy = false, onChoice, extraChip, error, children }: {
  state: ReviewDecisionState;
  requirementKey?: string;
  /** Every checklist item the file is attached to; a choice shows when there are several. */
  requirements?: { key: string; label: string }[];
  onSelectRequirement?: (key: string) => void;
  busy?: boolean;
  onChoice: (choice: ReviewChoice) => void;
  /** A second fact worth a chip beside the decision, such as a security hold. */
  extraChip?: ReactNode;
  /** Why the last change did not save. */
  error?: string;
  children?: ReactNode;
}) {
  const has = (choice: ReviewChoice) => state.choices.includes(choice);
  return <div className={styles.bar}>
    <div className={cx(styles.row, state.open && styles.asks)} role="group" aria-label="Checklist decision">
      <div className={styles.text}>
        <div className={styles.lead}>
          <CellChip tone={state.tone}>{state.chip}</CellChip>
          {extraChip}
          {/* The sentence names the checklist item; a choice shows only when the file is on several. */}
          {requirements.length > 1 && onSelectRequirement ? <label className={styles.item}>On {requirements.length} checklist items. Showing<Select aria-label="Checklist item this decision is for" value={requirementKey ?? ""} disabled={busy} onChange={(event) => onSelectRequirement(event.target.value)}>{requirements.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</Select></label> : null}
          <p className={styles.sentence}>{state.sentence}</p>
        </div>
        {state.reason ? <p className={styles.note}>{state.reason}</p> : null}
      </div>
      <div className={styles.actions}>
        {has("retry") ? <Btn disabled={busy} onClick={() => onChoice("retry")}><Icon name="refresh" size={14} />Read it again</Btn> : null}
        {has("approve") ? <Btn variant="pri" disabled={busy} onClick={() => onChoice("approve")}><Icon name="check" size={14} />Approve</Btn> : null}
        {has("approve_anyway") ? <Btn variant={state.open ? "pri" : "default"} disabled={busy} onClick={() => onChoice("approve_anyway")}><Icon name="check" size={14} />Approve anyway</Btn> : null}
        {has("reject") ? <Btn className="danger" disabled={busy} onClick={() => onChoice("reject")}><Icon name="thumbsDown" size={14} />Reject</Btn> : null}
        {has("attach") ? <Btn variant="pri" disabled={busy} onClick={() => onChoice("attach")}>Attach to a checklist item</Btn> : null}
      </div>
    </div>
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {children}
  </div>;
}
