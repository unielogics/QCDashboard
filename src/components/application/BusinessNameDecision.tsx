"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, CellChip, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import type { DocumentAssociationAction } from "@/lib/documentAssociation";
import { businessNameAction, businessNameState, type BusinessNameChoice } from "@/lib/evidenceReviewDecision";
import { DocumentIdentityReview } from "./DocumentIdentityReview";
import styles from "./EvidenceDecisionBar.module.css";

type Review = Omit<Parameters<typeof DocumentIdentityReview>[0], "layout" | "initialAction" | "initiallyOpen" | "onDone" | "onCancel">;

const SAVED: Record<DocumentAssociationAction, string> = {
  accept: "Saved: this document belongs to this file's business.",
  deny: "Saved: this document belongs to a different business.",
  reset: "Saved: the business name is back on the automatic check.",
};

/**
 * Whether a document belongs to this file's business, asked as a plain question.
 *
 * The row shows only when there is something to answer or an answer on record:
 * the document's name, the file's name, and Yes / No. The answer and its reason
 * are taken in a dialog, so the strip above the document stays slim.
 */
export function BusinessNameDecision({ review, reasonCode, decision, fileName, openRequest = 0, showMatched = false, onNotice }: {
  review: Review;
  /** The file's decision, for a name warning recorded without an association. */
  reasonCode?: string | null;
  decision?: string | null;
  fileName?: string;
  /** Raise it to open the panel from somewhere else on the page. */
  openRequest?: number;
  /** Keep a quiet row for a name that matched on its own, where nothing else on the screen opens the panel. */
  showMatched?: boolean;
  onNotice?: (message: string) => void;
}) {
  const state = businessNameState(review.initialRecord, { reasonCode, decision, canAnswer: review.canEdit, includeMatched: showMatched });
  const [panel, setPanel] = useState<{ action: DocumentAssociationAction | null } | null>(null);
  const busy = Boolean(review.externallyBusy);
  // Another file under the same screen: an open panel was about the earlier one.
  useEffect(() => { setPanel(null); }, [review.profileId, review.fileId]);
  const seenRequest = useRef(openRequest);
  useEffect(() => {
    if (openRequest === seenRequest.current) return;
    seenRequest.current = openRequest;
    setPanel({ action: null });
  }, [openRequest]);
  const open = (choice: BusinessNameChoice) => setPanel({ action: businessNameAction(choice) });
  return <>
    {state ? <div className={cx(styles.row, state.open && styles.asks)} role="group" aria-label="Business name on this document">
      <div className={styles.text}>
        <div className={styles.lead}><CellChip tone={state.tone}>{state.chip}</CellChip><p className={styles.sentence}>{state.sentence}</p></div>
        {state.note ? <p className={styles.note}>{state.note}</p> : null}
      </div>
      <div className={styles.actions}>
        {state.choices.includes("same") ? <Btn variant="pri" disabled={busy} onClick={() => open("same")}>Yes, same business</Btn> : null}
        {state.choices.includes("different") ? <Btn disabled={busy} onClick={() => open("different")}>No, different business</Btn> : null}
        {state.choices.includes("change") ? <Btn size="sm" disabled={busy} onClick={() => open("change")}>{review.initialRecord?.current_decision ? "Change answer" : "Change"}</Btn> : null}
        {state.choices.includes("view") ? <Btn size="sm" disabled={busy} onClick={() => open("view")}>See details</Btn> : null}
      </div>
    </div> : null}
    <Drawer open={Boolean(panel)} onClose={() => { if (!busy) setPanel(null); }} width="md" title="Business name on this document" sub={fileName}>
      {panel ? <DocumentIdentityReview
        key={`${review.profileId}:${review.fileId}`}
        {...review}
        layout="panel"
        initialAction={panel.action}
        onCancel={() => setPanel(null)}
        onDone={(action) => { setPanel(null); onNotice?.(SAVED[action]); }}
      /> : null}
    </Drawer>
  </>;
}
