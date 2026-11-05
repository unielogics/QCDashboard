"use client";

// The debt schedule as a table the desk fills in.
//
// A client's own schedule (a PDF, an Excel file) arrives with lines that are
// not loans and without what a lender asks of every line. This reads the file
// into a table: what the file gave is already in its column (marked as coming
// from the file), what it did not give is empty and says "needed", a line that
// is not a loan comes off, and one save puts the rest on the file's schedule.
// Nothing is deleted: a line taken off is kept as history and can be put back,
// and a blank stays unknown rather than 0. What the person has typed is kept on
// this browser until it is saved, so closing it loses nothing.
//
// It stands on its own so any row can embed it; the drawer is a thin wrapper.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, Callout, CellChip, Seg, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useApplyDebtScheduleReview, useDebtScheduleReview } from "@/hooks/useDebtScheduleReview";
import {
  applyStored,
  clearStored,
  columnOf,
  COLUMN_BY_KEY,
  draftErrors,
  draftFromLine,
  isDirty,
  isHistory,
  loadStored,
  neededCells,
  neededFields,
  nextNeeded,
  readingSignature,
  REMOVE_REASONS,
  reviewBody,
  saveStored,
  savedSentence,
  summarize,
  visibleColumns,
  type CellRef,
  type ColumnKey,
  type FieldKey,
  type LineDraft,
  type ReviewResult,
  type ReviewSource,
  type StorageLike,
} from "@/lib/debtReview";
import { DebtScheduleReviewTable, type FocusRequest } from "./DebtScheduleReviewTable";
import styles from "./DebtScheduleReviewDrawer.module.css";

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

const day = (value: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const time = (value: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
};

/** This browser's session storage, or nothing where it is blocked. */
function sessionStore(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function SourceCard({ source, compact }: { source: ReviewSource; compact: boolean }) {
  const meta = [source.uploaded_by ? `uploaded by ${source.uploaded_by}` : "", day(source.uploaded_at), source.schedule_date ? `schedule dated ${source.schedule_date}` : "", `${source.line_count} line${source.line_count === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className={styles.source}>
      <div className={styles.sourceTitle}>
        <Icon name="file" size={14} />
        <b>{source.file_name}</b>
        {source.status_note ? <CellChip tone="warn">{source.status_note}</CellChip> : null}
      </div>
      <p className={styles.sourceMeta}>{meta}</p>
      {!compact && source.scope_note ? <p className={styles.sourceMeta} title={source.source_basis ?? undefined}>{source.scope_note}</p> : null}
    </div>
  );
}

export function DebtScheduleReviewPanel({
  profileId,
  compact = false,
  inDrawer = false,
  onSaved,
  onClose,
}: {
  profileId: string;
  /** Denser, for a row that embeds it. */
  compact?: boolean;
  /** The drawer's wrapper sets this so the summary and the actions can stick to the drawer's edges. */
  inDrawer?: boolean;
  onSaved?: (result: ReviewResult, missing: number) => void;
  /** When given, the panel offers a Close (the drawer's, or the row's collapse). */
  onClose?: () => void;
}) {
  const review = useDebtScheduleReview(profileId, true);
  const apply = useApplyDebtScheduleReview(profileId);
  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [fresh, setFresh] = useState<LineDraft[]>([]);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "needed">("all");
  const [pinned, setPinned] = useState<ReadonlySet<string> | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [focusRequest, setFocusRequest] = useState<FocusRequest | null>(null);
  const seeded = useRef<number | null>(null);
  const reseed = useRef(false);
  const readingKey = useRef("");
  const lastCell = useRef<CellRef | null>(null);
  const latest = useRef({ drafts, fresh });
  latest.current = { drafts, fresh };

  // Seed the table once per reading and never again underneath someone typing.
  // A draft the person left on this browser comes back over the same reading.
  useEffect(() => {
    const data = review.data;
    if (!data || review.isFetching || seeded.current === review.dataUpdatedAt) return;
    const { drafts: current, fresh: baseline } = latest.current;
    if (!reseed.current && seeded.current !== null && current.length && isDirty(current, baseline)) {
      // The schedule changed somewhere else while this person was typing: keep their work.
      seeded.current = review.dataUpdatedAt;
      return;
    }
    seeded.current = review.dataUpdatedAt;
    reseed.current = false;
    const next = [...data.lines.map((line) => draftFromLine(line)), ...data.removed.map((line) => draftFromLine(line, true))];
    const key = readingSignature(data);
    readingKey.current = key;
    const stored = loadStored(sessionStore(), profileId, key);
    const restored = stored ? applyStored(next, stored) : null;
    setFresh(next);
    if (stored && restored && isDirty(restored, next)) {
      setDrafts(restored);
      setRestoredAt(stored.at);
    } else {
      setDrafts(next);
      setRestoredAt(null);
    }
    setError(null);
    setFilter("all");
    setPinned(null);
    lastCell.current = null;
  }, [profileId, review.data, review.dataUpdatedAt, review.isFetching]);

  const persist = useCallback(() => {
    const { drafts: current, fresh: baseline } = latest.current;
    if (!readingKey.current || !current.length) return;
    if (isDirty(current, baseline)) saveStored(sessionStore(), profileId, readingKey.current, current);
    else clearStored(sessionStore(), profileId);
  }, [profileId]);

  // Keep the person's work as they type, a moment after they stop, and once more as this goes away.
  useEffect(() => {
    if (seeded.current === null) return;
    const handle = window.setTimeout(persist, 400);
    return () => window.clearTimeout(handle);
  }, [drafts, persist]);
  useEffect(() => persist, [persist]);

  const patch = useCallback((key: string, change: Partial<LineDraft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft))), []);
  const replace = useCallback((key: string, next: LineDraft) => setDrafts((current) => current.map((draft) => (draft.key === key ? next : draft))), []);

  const summary = useMemo(() => summarize(drafts), [drafts]);
  const listed = useMemo(() => drafts.filter((draft) => !isHistory(draft)), [drafts]);
  const history = useMemo(() => drafts.filter(isHistory), [drafts]);
  const columns = useMemo(() => visibleColumns(listed, showDetails), [listed, showDetails]);
  const sources = review.data?.sources ?? [];
  const dirty = useMemo(() => isDirty(drafts, fresh), [drafts, fresh]);
  const loading = review.isLoading || (review.isFetching && seeded.current === null) || (Boolean(review.data) && seeded.current === null);

  const problems = useMemo(() => {
    const found: string[] = [];
    for (const draft of listed) {
      for (const [field, message] of Object.entries(draftErrors(draft))) {
        found.push(`${draft.lender.trim() || "A line"}, ${COLUMN_BY_KEY[columnOf(field as FieldKey)].label}: ${message}`);
      }
    }
    return found;
  }, [listed]);

  const discard = () => {
    clearStored(sessionStore(), profileId);
    setDrafts(fresh);
    setRestoredAt(null);
    setPinned(null);
    setFilter("all");
  };

  const chooseFilter = (next: "all" | "needed") => {
    setFilter(next);
    // The needs-answers view is the lines that need one right now, and stays
    // those lines while the person fills them in.
    setPinned(next === "needed" ? new Set(listed.filter((draft) => draft.keep && (neededFields(draft).length > 0 || Object.keys(draftErrors(draft)).length > 0)).map((draft) => draft.key)) : null);
  };

  const goToNext = () => {
    const next = nextNeeded(neededCells(listed, columns), lastCell.current);
    if (next) setFocusRequest({ ...next, n: Date.now() });
  };

  const save = async () => {
    setError(null);
    setSaved(null);
    reseed.current = true; // the saved schedule is what the table shows next
    try {
      const result = await apply.mutateAsync(reviewBody(drafts));
      clearStored(sessionStore(), profileId);
      const missing = result.review.counts.missing_answers ?? 0;
      setSaved(savedSentence(result.saved, missing));
      onSaved?.(result, missing);
      onClose?.();
    } catch (reason) {
      reseed.current = false;
      setError(errorMessage(reason, "The schedule could not be saved. What you typed is still here."));
    }
  };

  const firstRun = summary.read > 0;
  const fileLabel = sources.length === 1 ? sources[0].file_name : `${sources.length} files`;
  const headline = sources.length
    ? firstRun
      ? `We read ${summary.read} line${summary.read === 1 ? "" : "s"} from ${fileLabel}`
      : `${summary.keeping} line${summary.keeping === 1 ? "" : "s"} on the schedule, from ${fileLabel}`
    : `${summary.keeping} line${summary.keeping === 1 ? "" : "s"} on the schedule`;
  const keeping = summary.keeping;
  const label = keeping > 0 ? `Save ${keeping} line${keeping === 1 ? "" : "s"} to the schedule` : "Save the review";

  return (
    <section className={cx(styles.panel, compact && styles.compactPanel, inDrawer && styles.inDrawer)} aria-label="Debt schedule table">
      {loading ? <div className="empty"><span className="spinner solo" />Reading the schedule…</div> : null}
      {review.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>The schedule lines could not be read. Close this and try again.</Callout> : null}
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}

      {!loading && review.data ? (
        <div className={styles.layout}>
          <header className={styles.summary} role="status" aria-live="polite">
            <div className={styles.headline}>
              <strong>{headline}</strong>
              <span className={styles.lead}>
                {firstRun
                  ? "Everything the file gave is already in its column. The amber cells are what it did not say: fill them in, take off anything that is not a loan, then save."
                  : "These are the lines on the file's debt schedule. Change a cell and save."}
              </span>
            </div>
            <div className={styles.stats}>
              <span className={styles.stat}><b>{summary.keeping}</b> keeping</span>
              <span className={`${styles.stat} ${summary.removing ? styles.statOff : ""}`}><b>{summary.removing}</b> taken off</span>
              <span className={`${styles.stat} ${summary.missing ? styles.statNeed : ""}`}><b>{summary.missing}</b> answer{summary.missing === 1 ? "" : "s"} missing</span>
            </div>
          </header>

          {sources.length ? <div className={styles.sources}>{sources.map((source) => <SourceCard key={source.file_id} source={source} compact={compact} />)}</div> : null}

          {saved ? (
            <div className={styles.notice} role="status">
              <Icon name="check" size={14} />
              <span className="grow">Saved: {saved}</span>
            </div>
          ) : null}

          {restoredAt ? (
            <div className={styles.notice} role="status">
              <Icon name="refresh" size={14} />
              <span className="grow">Your unsaved edits from {day(restoredAt)} {time(restoredAt)} are back.</span>
              <Btn size="sm" onClick={discard}>Start over</Btn>
            </div>
          ) : null}

          {summary.unsavedPayments ? (
            <div className={styles.notice} role="status">
              <Icon name="alert" size={14} />
              <span className="grow">
                {summary.unsavedPayments} payment{summary.unsavedPayments === 1 ? "" : "s"} {summary.unsavedPayments === 1 ? "has" : "have"} no &ldquo;how often&rdquo; yet, so {summary.unsavedPayments === 1 ? "it is" : "they are"} not saved. The file still has {summary.unsavedPayments === 1 ? "it" : "them"}; pick how often to keep {summary.unsavedPayments === 1 ? "it" : "them"}.
              </span>
            </div>
          ) : null}

          {problems.length ? (
            <ul className={styles.errors} role="alert">
              {problems.slice(0, 4).map((problem) => <li key={problem}>{problem}</li>)}
              {problems.length > 4 ? <li>and {problems.length - 4} more</li> : null}
            </ul>
          ) : null}

          {!listed.length && !history.length ? (
            <Callout tone="mut" icon={<Icon name="note" size={16} />}>
              There are no lines to fill in yet. Upload a debt schedule (a PDF or an Excel file) or enter the schedule from the Financials tab.
            </Callout>
          ) : (
            <>
              <div className={styles.toolbar}>
                <Seg
                  as="filter"
                  ariaLabel="Which lines to show"
                  value={filter}
                  onChange={chooseFilter}
                  options={[
                    { value: "all", label: `All lines (${listed.length})` },
                    { value: "needed", label: `Needs answers (${summary.missing})` },
                  ]}
                />
                <ul className={styles.legend} aria-label="What the cell colours mean">
                  <li><i className={styles.swFile} aria-hidden="true" />from the file</li>
                  <li><i className={styles.swNeeded} aria-hidden="true" />needed: the file did not say</li>
                  <li><i className={styles.swEdited} aria-hidden="true" />edited by you</li>
                </ul>
                <span className="grow" />
                <label className={styles.toggle}>
                  <input type="checkbox" checked={showDetails} onChange={(event) => setShowDetails(event.target.checked)} />
                  More columns
                </label>
                <Btn size="sm" onClick={goToNext} disabled={!summary.missing}><Icon name="arrowR" size={13} />Next needed</Btn>
              </div>

              <div
                onFocusCapture={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.dataset.rk && target.dataset.ck) lastCell.current = { row: target.dataset.rk, col: target.dataset.ck as ColumnKey };
                }}
              >
                <DebtScheduleReviewTable drafts={listed} columns={columns} onChange={patch} onReplace={replace} focusRequest={focusRequest} visibleKeys={pinned} />
              </div>
            </>
          )}

          {history.length ? (
            <details className={styles.history}>
              <summary>Taken off earlier ({history.length})</summary>
              <div className={styles.historyList}>
                {history.map((draft) => (
                  <div key={draft.key} className={styles.historyRow}>
                    <b>{draft.lender}</b>
                    <span className={styles.removedWhy}>
                      {REMOVE_REASONS.find((reason) => reason.value === draft.reason)?.label}
                      {draft.removedBy ? ` · ${draft.removedBy}` : ""}
                      {draft.removedAt ? ` · ${day(draft.removedAt)}` : ""}
                    </span>
                    <Btn size="sm" onClick={() => patch(draft.key, { keep: true })}><Icon name="arrowL" size={13} />Put back</Btn>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <p className={styles.unlink}>
            <Sub>Not right? Unlink the file from the request and upload a PDF or Excel file instead; the lines here follow the file.</Sub>
          </p>

          <footer className={styles.actionsBar}>
            {onClose ? <Btn onClick={onClose} disabled={apply.isPending}>Close</Btn> : null}
            {dirty ? <Btn onClick={discard} disabled={apply.isPending}>Discard my edits</Btn> : null}
            <span className="grow" />
            {dirty ? <Sub>Your edits are kept on this browser until you save.</Sub> : null}
            <Btn variant="pri" onClick={() => void save()} disabled={apply.isPending || !summary.changed || summary.invalid > 0}>
              {apply.isPending ? "Saving…" : label}
            </Btn>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
