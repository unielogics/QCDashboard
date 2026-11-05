"use client";

// The headline the debt schedule table wears inside a requirement row.
//
// A row already says what the requirement is and what to do next, so the table
// does not repeat itself above its own cells. This is one line: which file the
// lines were read from (and what the file says about itself), and where the
// counts stand. At most one short sentence says what to do. The drawer keeps its
// larger header; this is only for the row.

import { CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import type { ReviewSource, ReviewSummary } from "@/lib/debtReview";
import styles from "./DebtScheduleReviewDrawer.module.css";

export const day = (value: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const plural = (count: number, one: string): string => `${count} ${count === 1 ? one : `${one}s`}`;

/** Who uploaded the file, when, what the schedule is dated and how many lines it gave. */
export function sourceMeta(source: ReviewSource): string {
  return [
    source.uploaded_by ? `uploaded by ${source.uploaded_by}` : "",
    day(source.uploaded_at),
    source.schedule_date ? `schedule dated ${source.schedule_date}` : "",
    plural(source.line_count, "line"),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** The one sentence a row's table says, or none when there is nothing to do. */
export function compactHelper(summary: Pick<ReviewSummary, "missing" | "read">): string | null {
  if (summary.missing > 0) return "Fill the amber cells, take off anything that is not a loan, then save.";
  if (summary.read > 0) return "Every answer is in. Take off anything that is not a loan, then save.";
  return null;
}

export function DebtReviewHeadline({ sources, summary }: { sources: readonly ReviewSource[]; summary: ReviewSummary }) {
  const only = sources.length === 1 ? sources[0] : null;
  const name = only ? only.file_name : sources.length ? `${sources.length} files` : "Debt schedule";
  const helper = compactHelper(summary);
  return (
    <header className={`${styles.summary} ${styles.compactSummary}`} role="status" aria-live="polite">
      <div className={styles.compactHead}>
        <div className={styles.fileTag} title={only ? sourceMeta(only) : undefined}>
          {sources.length ? <Icon name="file" size={14} /> : null}
          <b>{name}</b>
          {only?.status_note ? <CellChip tone="warn" title="What the file itself says about this schedule.">{only.status_note}</CellChip> : null}
        </div>
        <span className={styles.counts}>
          <CellChip tone="mut">{plural(summary.keeping, "line")}</CellChip>
          <CellChip tone={summary.missing ? "warn" : "ok"}>{plural(summary.missing, "answer")} missing</CellChip>
          <CellChip tone="mut">{summary.removing} taken off</CellChip>
        </span>
      </div>
      {helper ? <p className={styles.helper}>{helper}</p> : null}
    </header>
  );
}
