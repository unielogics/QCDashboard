"use client";

// Extraction review and AI blockers, folded away until they have something to
// say.
//
// These two blocks are reference material most of the time. Once the facts are
// reviewed and the blocker list is stale, they are several hundred pixels of
// "nothing to do here" sitting between the evidence browser and the financial
// forms — which is the part of the tab the desk actually works in.
//
// So the section collapses, and the default is decided by its own contents
// rather than by a preference: open when something needs a person, shut when it
// does not. The summary line carries the counts either way, so collapsed never
// means hidden — the desk can see there are four blockers without opening it,
// which is the whole point of a summary.

import { useEffect, useState, type ReactNode } from "react";
import { CellChip } from "@/components/ds";

export function EvidenceReviewBlock({
  attention,
  summary,
  children,
}: {
  /** Something in here needs a person. Decides the initial state. */
  attention: boolean;
  /** Counts for the header, shown whether it is open or shut. */
  summary: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(attention);

  // Follow the data until the desk overrides it. A blocker list that arrives
  // after the first render — the review runs in the background — should open
  // the section, and a desk that has deliberately shut it should stay shut.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setOpen(attention);
  }, [attention, touched]);

  return (
    <section className={open ? "evrev is-open" : "evrev"}>
      <button
        type="button"
        className="evrev-head"
        aria-expanded={open}
        onClick={() => {
          setTouched(true);
          setOpen((value) => !value);
        }}
      >
        <span className="evrev-caret" aria-hidden="true" />
        <strong>Extraction review and blockers</strong>
        <span className="evrev-summary">{summary}</span>
        {attention ? <CellChip tone="warn">Needs review</CellChip> : <CellChip tone="ok">Clear</CellChip>}
        <span className="evrev-toggle">{open ? "Hide" : "Show"}</span>
      </button>
      {/* Unmounted rather than hidden: ExtractedFactsReview runs its own
          queries, and a collapsed panel should not be polling draft status. */}
      {open ? <div className="evrev-body">{children}</div> : null}
    </section>
  );
}
