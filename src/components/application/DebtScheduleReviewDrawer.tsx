"use client";

// Review the lines of a debt schedule.
//
// A client's own schedule arrives with lines that are not loans (an ACH debit
// somebody guessed was a funder, a vendor) and without what a lender asks of
// every line: the interest rate, the amount originally approved and what is
// still owed. This is the step before the lines become the file's schedule:
// take off what is not a debt, answer the three questions on the rest, save.
// Nothing is deleted. A line that comes off is kept as history and can be put
// back, and a blank answer stays unknown rather than becoming a nought.

import { useEffect, useMemo, useRef, useState } from "react";
import { Callout, CellChip, Btn, Field, Input, Select, Sub } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { Toast, useToast } from "@/components/design-system/primitives";
import { errorMessage } from "@/components/marketplace/shared";
import { useCurrentUser } from "@/hooks/useApi";
import { useApplyDebtScheduleReview, useDebtScheduleReview } from "@/hooks/useDebtScheduleReview";
import {
  answersMissing,
  CADENCES,
  draftErrors,
  draftFromLine,
  isAdvanceDraft,
  isHistory,
  looksUnconfirmed,
  paymentSentence,
  REMOVE_REASONS,
  reviewBody,
  savedSentence,
  summarize,
  type Cadence,
  type LineDraft,
  type PaymentStatus,
  type RemoveReason,
  type ReviewResult,
  type ReviewSource,
} from "@/lib/debtReview";
import { debtTypeLabel, DEBT_TYPES } from "@/lib/debtTypes";
import { Role } from "@/lib/enums.generated";
import styles from "./DebtScheduleReviewDrawer.module.css";

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

const day = (value: string | null): string => {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

function SourceCard({ source }: { source: ReviewSource }) {
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
      {source.scope_note ? <p className={styles.sourceMeta} title={source.source_basis ?? undefined}>{source.scope_note}</p> : null}
    </div>
  );
}

function Needed({ show }: { show: boolean }) {
  return show ? <span className={styles.neededTag}>needed</span> : null;
}

function LineCard({ draft, onChange }: { draft: LineDraft; onChange: (change: Partial<LineDraft>) => void }) {
  const advance = isAdvanceDraft(draft);
  const errors = draftErrors(draft);
  const missing = new Set(answersMissing(draft));
  const month = paymentSentence(draft, usd);
  const typeKnown = DEBT_TYPES.some((type) => type.value === draft.debtType);
  const lender = draft.lender.trim() || "this line";

  if (!draft.keep) {
    return (
      <div className={styles.removed} role="group" aria-label={`${lender}: taken off the schedule`}>
        <b>{draft.lender}</b>
        <Select aria-label={`Why ${lender} is not on the schedule`} value={draft.reason} onChange={(event) => onChange({ reason: event.target.value as RemoveReason })}>
          {REMOVE_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
        </Select>
        <Btn size="sm" onClick={() => onChange({ keep: true })}><Icon name="arrowL" size={13} />Put back</Btn>
      </div>
    );
  }

  return (
    <article className={styles.card} data-hint={draft.hint ? "true" : undefined} aria-label={lender}>
      <header className={styles.head}>
        <Field className={errors.lender ? styles.invalid : undefined} error={errors.lender}>
          <Input aria-label="Lender" value={draft.lender} placeholder="Lender" autoComplete="off" onChange={(event) => onChange({ lender: event.target.value })} />
        </Field>
        <Select aria-label={`Type of debt for ${lender}`} value={draft.debtType} onChange={(event) => onChange({ debtType: event.target.value })}>
          <option value="">Type of debt…</option>
          {!typeKnown && draft.debtType ? <option value={draft.debtType}>{debtTypeLabel(draft.debtType)}</option> : null}
          {DEBT_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
        </Select>
        <span title="Not a loan or debt: take it off the schedule. It is kept as history and can be put back.">
          <Btn size="sm" onClick={() => onChange({ keep: false })}><Icon name="x" size={13} />Not a loan</Btn>
        </span>
      </header>

      <div className={styles.chips}>
        <CellChip tone="mut">{draft.originLabel}</CellChip>
        {draft.hint ? <CellChip tone="warn" title={draft.hint.reason}>Looks like {draft.hint.label.toLowerCase()}, probably not a loan</CellChip> : null}
        {looksUnconfirmed([draft.balanceNote, draft.paymentNote, ...draft.notes]) ? <CellChip tone="warn" title="The file itself says this line is not confirmed.">Not confirmed in the file</CellChip> : null}
      </div>

      <div className={styles.questions}>
        <div className={`${styles.question} ${missing.has(advance ? "factorRate" : "rate") ? styles.needed : ""} ${errors.rate || errors.factorRate ? styles.invalid : ""}`}>
          <Field
            label={<>{advance ? "Factor rate (e.g. 1.35)" : "Interest rate (% a year)"}<Needed show={missing.has(advance ? "factorRate" : "rate")} /></>}
            error={errors.rate ?? errors.factorRate}
            hint={advance ? "An advance is priced with a factor, not an interest rate." : undefined}
          >
            <Input
              aria-label={`${advance ? "Factor rate" : "Interest rate"} for ${lender}`}
              inputMode="decimal"
              autoComplete="off"
              placeholder={advance ? "e.g. 1.35" : "e.g. 7.25"}
              value={advance ? draft.factorRate : draft.rate}
              onChange={(event) => onChange(advance ? { factorRate: event.target.value } : { rate: event.target.value })}
            />
          </Field>
        </div>
        <div className={`${styles.question} ${missing.has("originalAmount") ? styles.needed : ""} ${errors.originalAmount ? styles.invalid : ""}`}>
          <Field label={<>Original amount approved<Needed show={missing.has("originalAmount")} /></>} error={errors.originalAmount}>
            <Input aria-label={`Original amount approved for ${lender}`} inputMode="decimal" autoComplete="off" placeholder="e.g. 50,000" value={draft.originalAmount} onChange={(event) => onChange({ originalAmount: event.target.value })} />
          </Field>
        </div>
        <div className={`${styles.question} ${missing.has("balance") ? styles.needed : ""} ${errors.balance ? styles.invalid : ""}`}>
          <Field
            label={<>Current balance<Needed show={missing.has("balance")} /></>}
            error={errors.balance}
            hint={draft.balanceNote ? `From the file: ${draft.balanceNote}` : undefined}
          >
            <Input aria-label={`Current balance for ${lender}`} inputMode="decimal" autoComplete="off" placeholder="e.g. 13,665.71" value={draft.balance} onChange={(event) => onChange({ balance: event.target.value })} />
          </Field>
        </div>
      </div>

      <div className={styles.payment}>
        <div className={errors.payment ? styles.invalid : undefined}>
          <Field label="Payment" error={errors.payment} hint={draft.paymentNote ? `From the file: ${draft.paymentNote}` : undefined}>
            <div className={styles.paymentRow}>
              <Input aria-label={`Payment amount for ${lender}`} inputMode="decimal" autoComplete="off" placeholder="e.g. 359.62" value={draft.paymentAmount} onChange={(event) => onChange({ paymentAmount: event.target.value })} />
              <span>per</span>
              <Select aria-label={`How often ${lender} is paid`} value={draft.paymentCadence} onChange={(event) => onChange({ paymentCadence: event.target.value as Cadence | "" })}>
                <option value="">how often…</option>
                {CADENCES.map((cadence) => <option key={cadence.value} value={cadence.value}>{cadence.label}</option>)}
              </Select>
            </div>
          </Field>
        </div>
        <Field label="Paid">
          <Select aria-label={`Whether ${lender} is current`} value={draft.paymentStatus} onChange={(event) => onChange({ paymentStatus: event.target.value as PaymentStatus | "" })}>
            <option value="">Not stated</option>
            <option value="current">Current</option>
            <option value="delinquent">Delinquent</option>
          </Select>
        </Field>
      </div>
      {month ? <p className={styles.sentence}>{month}</p> : null}

      {draft.notes.length ? (
        <div className={styles.fromFile}>
          {draft.notes.map((note) => <small key={note}>From the file: {note}</small>)}
        </div>
      ) : null}
    </article>
  );
}

export function DebtScheduleReviewDrawer({
  profileId,
  open,
  onClose,
  onSaved,
}: {
  profileId: string;
  open: boolean;
  onClose: () => void;
  onSaved?: (result: ReviewResult, missing: number) => void;
}) {
  const review = useDebtScheduleReview(profileId, open);
  const apply = useApplyDebtScheduleReview(profileId);
  const [drafts, setDrafts] = useState<LineDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const seeded = useRef<number | null>(null);

  // Seed the drafts once per reading and never again underneath someone typing.
  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    const data = review.data;
    if (!data || review.isFetching || seeded.current === review.dataUpdatedAt) return;
    seeded.current = review.dataUpdatedAt;
    setDrafts([...data.lines.map((line) => draftFromLine(line)), ...data.removed.map((line) => draftFromLine(line, true))]);
    setError(null);
  }, [open, review.data, review.dataUpdatedAt, review.isFetching]);

  const summary = useMemo(() => summarize(drafts), [drafts]);
  const listed = drafts.filter((draft) => !isHistory(draft));
  const fromFile = listed.filter((draft) => draft.state === "read");
  const onSchedule = listed.filter((draft) => draft.state !== "read");
  const history = drafts.filter(isHistory);
  const sources = review.data?.sources ?? [];
  const patch = (key: string, change: Partial<LineDraft>) => setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, ...change } : draft)));
  const loading = review.isLoading || (review.isFetching && seeded.current === null);

  const save = async () => {
    setError(null);
    try {
      const result = await apply.mutateAsync(reviewBody(drafts));
      onSaved?.(result, result.review.counts.missing_answers ?? 0);
      onClose();
    } catch (reason) {
      setError(errorMessage(reason, "The review could not be saved."));
    }
  };

  const group = (title: string, items: LineDraft[]) => (
    <>
      {fromFile.length && onSchedule.length ? <h3 className={`lbl ${styles.groupHead}`}>{title} ({items.length})</h3> : null}
      <div className={styles.cards}>{items.map((draft) => <LineCard key={draft.key} draft={draft} onChange={(change) => patch(draft.key, change)} />)}</div>
    </>
  );

  const sub = sources.length
    ? `Read from ${sources.map((source) => source.file_name).join(", ")}`
    : "The rows on this file's debt schedule";
  const label = summary.keeping > 0 ? `Save ${summary.keeping} line${summary.keeping === 1 ? "" : "s"} to the schedule` : "Save the review";

  return (
    <Drawer
      open={open}
      onClose={() => { if (!apply.isPending) onClose(); }}
      title="Debt schedule · review the lines"
      sub={sub}
      width="lg"
      closeOnBackdrop={false}
      ariaLabel="Debt schedule: review the lines"
      footer={
        <>
          <Btn onClick={onClose} disabled={apply.isPending}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={() => void save()} disabled={loading || apply.isPending || !summary.changed || summary.invalid > 0}>
            {apply.isPending ? "Saving…" : label}
          </Btn>
        </>
      }
    >
      <div className={styles.layout}>
        {loading ? <div className="empty"><span className="spinner solo" />Reading the schedule…</div> : null}
        {review.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>The schedule lines could not be read. Close this and try again.</Callout> : null}
        {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}

        {!loading && review.data ? (
          <>
            <div className={styles.summary} role="status" aria-live="polite">
              {sources.length ? <span className={styles.stat}><b>{summary.read}</b> read from the file</span> : null}
              <span className={styles.stat}><b>{summary.keeping}</b> keeping</span>
              <span className={`${styles.stat} ${summary.removing ? styles.statOff : ""}`}><b>{summary.removing}</b> taken off</span>
              <span className={`${styles.stat} ${summary.missing ? styles.statNeed : ""}`}><b>{summary.missing}</b> answer{summary.missing === 1 ? "" : "s"} still missing</span>
            </div>

            {sources.length ? <div className={styles.sources}>{sources.map((source) => <SourceCard key={source.file_id} source={source} />)}</div> : null}

            {!listed.length && !history.length ? (
              <Callout tone="mut" icon={<Icon name="note" size={16} />}>
                There are no lines to review yet. Upload a debt schedule (a PDF or an Excel file) or enter the schedule from the Financials tab.
              </Callout>
            ) : null}

            {fromFile.length ? group("Read from the file, not on the schedule yet", fromFile) : null}
            {onSchedule.length ? group("On the schedule", onSchedule) : null}

            {history.length ? (
              <details className={styles.history}>
                <summary>Taken off earlier ({history.length})</summary>
                <div className={styles.historyList}>
                  {history.map((draft) => (
                    <div key={draft.key} className={styles.removed}>
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
          </>
        ) : null}
      </div>
    </Drawer>
  );
}

/** The way into the review from anywhere a debt schedule shows up: one icon (or
 *  a small button), its own open state, its own drawer. Only the roles that may
 *  change the schedule see it. */
export function DebtScheduleReviewButton({
  profileId,
  onChanged,
  variant = "icon",
  label,
  primary = false,
}: {
  profileId: string | null | undefined;
  onChanged?: () => void;
  variant?: "icon" | "button";
  label?: string;
  /** The button as the main action of its row (the review is how an uploaded schedule becomes the schedule). */
  primary?: boolean;
}) {
  const { data: user } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const toast = useToast();
  const canReview = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  if (!profileId || !canReview) return null;
  const words = label ?? "Review the debt lines: take off what is not a loan and answer the rate, original amount and balance";
  return (
    <>
      {variant === "icon" ? (
        <ActionIcon icon="scan" label={words} onClick={() => setOpen(true)} />
      ) : (
        <span title={words}>
          <Btn size="sm" variant={primary ? "pri" : "default"} onClick={() => setOpen(true)}><Icon name="scan" size={14} />{label ?? "Review the lines"}</Btn>
        </span>
      )}
      <DebtScheduleReviewDrawer
        profileId={profileId}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={(result, missing) => {
          toast.show(savedSentence(result.saved, missing));
          onChanged?.();
        }}
      />
      <Toast msg={toast.msg} />
    </>
  );
}
