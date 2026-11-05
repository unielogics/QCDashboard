"use client";

// The debt schedule review as a fillable table.
//
// One row per line the file gave, one column per cell of the schedule. Every
// value the file gave is already in its column; every cell it did not give is
// empty and says "needed". The person fills the cells in place, takes a line
// off with "Not a loan", and watches the totals follow.
//
// The keyboard works the way a sheet does: Tab and Shift+Tab walk across and
// down (every cell is one control, in reading order), Enter moves down the
// column and Shift+Enter up, the arrow keys move between cells where they do
// not fight the box (Up and Down in a text box; Left and Right at its ends),
// and a number or date is tidied when the cell is left.

import { memo, useEffect, useRef, type KeyboardEvent } from "react";
import { Btn, CellChip } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { Icon } from "@/components/design-system/Icon";
import { DEBT_TYPES, debtTypeLabel } from "@/lib/debtTypes";
import {
  CADENCES,
  COLUMN_BY_KEY,
  REMOVE_REASONS,
  canResetRow,
  cellApplies,
  cellMood,
  cellTitle,
  columnOf,
  draftErrors,
  editedFields,
  fieldOf,
  isAdvanceDraft,
  isNewLine,
  looksUnconfirmed,
  monthlyOf,
  neededFields,
  paymentSentence,
  rateHeader,
  resetRow,
  scrollToClear,
  tidyCell,
  totals,
  type CellMood,
  type ColumnKey,
  type ColumnSpec,
  type FieldKey,
  type LineDraft,
  type RemoveReason,
} from "@/lib/debtReview";
import styles from "./DebtScheduleReviewDrawer.module.css";

export type FocusRequest = { row: string; col: ColumnKey; n: number };

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");
const quote = (value: string) => value.replace(/["\\]/g, "\\$&");

type Change = (key: string, change: Partial<LineDraft>) => void;

/** The pinned row-actions column: two small icons. */
const ACTIONS_WIDTH = 92;

const MAX_LENGTH: Partial<Record<FieldKey, number>> = { lender: 180, mcaNote: 1000, collateral: 500, note: 2000 };

/** Whether this column's cell is a typed box (as opposed to a pick list). */
const typed = (spec: ColumnSpec) => spec.kind === "text" || spec.kind === "money" || spec.kind === "rate" || spec.kind === "date";

function unitOf(spec: ColumnSpec, draft: LineDraft): string | undefined {
  if (spec.kind === "money") return "$";
  if (spec.kind === "rate") return isAdvanceDraft(draft) ? "×" : "%";
  return undefined;
}

function labelOf(spec: ColumnSpec, draft: LineDraft): string {
  if (spec.key === "rate") return isAdvanceDraft(draft) ? "Factor rate" : "Interest rate";
  return spec.label;
}

function Cell({
  draft,
  spec,
  field,
  mood,
  title,
  onField,
}: {
  draft: LineDraft;
  spec: ColumnSpec;
  field: FieldKey;
  mood: CellMood;
  title: string;
  onField: (field: FieldKey, value: string) => void;
}) {
  const lender = draft.lender.trim() || "this line";
  const needed = mood === "needed";
  const aria = `${labelOf(spec, draft)} for ${lender}${needed ? ", needed" : ""}`;
  const value = draft[field];
  const common = { "data-rk": draft.key, "data-ck": spec.key, "aria-label": aria, "aria-invalid": mood === "invalid" || undefined, className: styles.control } as const;
  let control;
  if (typed(spec)) {
    control = (
      <input
        {...common}
        className={cx(styles.control, (spec.kind === "money" || spec.kind === "rate") && styles.num)}
        type="text"
        inputMode={spec.kind === "money" || spec.kind === "rate" ? "decimal" : "text"}
        autoComplete="off"
        maxLength={MAX_LENGTH[field]}
        placeholder={needed ? "needed" : spec.kind === "date" ? "mm/dd/yyyy" : ""}
        value={value}
        onChange={(event) => onField(field, event.target.value)}
        onBlur={(event) => {
          const next = tidyCell(field, event.target.value);
          if (next !== event.target.value) onField(field, next);
        }}
      />
    );
  } else {
    const empty = needed ? "needed" : "—";
    let options: Array<[string, string]> = [];
    if (spec.kind === "type") options = DEBT_TYPES.map((type) => [type.value, type.label]);
    if (spec.kind === "cadence") options = CADENCES.map((cadence) => [cadence.value, cadence.label]);
    if (spec.kind === "status") options = [["current", "Current"], ["delinquent", "Delinquent"]];
    if (spec.kind === "yesno") options = [["yes", "Yes"], ["no", "No"]];
    if (spec.kind === "secured") options = [["secured", "Secured"], ["unsecured", "Unsecured"]];
    const known = options.some(([option]) => option === value);
    control = (
      <select {...common} value={value} onChange={(event) => onField(field, event.target.value)}>
        <option value="">{empty}</option>
        {!known && value ? <option value={value}>{spec.kind === "type" ? debtTypeLabel(value) || value : value}</option> : null}
        {options.map(([option, label]) => <option key={option} value={option}>{label}</option>)}
      </select>
    );
  }
  return (
    <td className={styles.cell} data-label={labelOf(spec, draft)} data-mood={mood} title={title || undefined}>
      <div className={styles.cellBox} data-unit={unitOf(spec, draft)}>
        {control}
        {mood === "edited" ? <span className={styles.dot} aria-hidden="true" /> : null}
      </div>
    </td>
  );
}

function FromFile({ draft }: { draft: LineDraft }) {
  const said = draft.file;
  const notes = [said?.notes.balance, said?.notes.paymentAmount, ...draft.fileNotes].filter(Boolean) as string[];
  return (
    <div className={styles.fromFile}>
      {looksUnconfirmed(notes) ? <span><CellChip tone="warn" title="The file itself says this line is not confirmed.">Not confirmed in the file</CellChip></span> : null}
      {said?.notes.balance ? <small><b>Balance:</b> {said.notes.balance}</small> : null}
      {said?.notes.paymentAmount ? <small><b>Payment:</b> {said.notes.paymentAmount}</small> : null}
      {draft.fileNotes.map((note) => <small key={note}>{note}</small>)}
      {!said ? <small>Not named in the file. {draft.originLabel}.</small> : null}
      {said && !notes.length ? <small>Nothing to add.</small> : null}
    </div>
  );
}

const DataRow = memo(function DataRow({ draft, columns, onChange, onReplace, onDelete }: { draft: LineDraft; columns: ColumnKey[]; onChange: Change; onReplace: (key: string, next: LineDraft) => void; onDelete: (key: string) => void }) {
  const needed = neededFields(draft);
  const errors = draftErrors(draft);
  const edited = editedFields(draft);
  const lender = draft.lender.trim() || "this line";
  const onField = (field: FieldKey, value: string) => onChange(draft.key, { [field]: value } as Partial<LineDraft>);
  const month = monthlyOf(draft);

  const cells = columns.map((column) => {
    const spec = COLUMN_BY_KEY[column];
    if (column === "lender") {
      const mood = cellMood(draft, "lender", edited, needed, errors);
      return (
        <td key={column} className={cx(styles.cell, styles.lenderCol)} data-pin="left" data-label={spec.label} data-mood={mood} title={cellTitle(draft, "lender", mood, errors) || undefined}>
          <div className={styles.lenderBox}>
            <div className={styles.cellBox}>
              <input
                className={styles.control}
                data-rk={draft.key}
                data-ck="lender"
                type="text"
                autoComplete="off"
                maxLength={180}
                placeholder={needed.includes("lender") ? "needed" : "Lender"}
                aria-label={`Lender${needed.includes("lender") ? ", needed" : ""}`}
                aria-invalid={Boolean(errors.lender) || undefined}
                value={draft.lender}
                onChange={(event) => onField("lender", event.target.value)}
              />
              {mood === "edited" ? <span className={styles.dot} aria-hidden="true" /> : null}
            </div>
            {draft.hint || draft.state !== "read" ? (
              <div className={styles.chips}>
                {draft.state !== "read" ? <CellChip tone="mut">{draft.originLabel}</CellChip> : null}
                {draft.hint ? <CellChip tone="warn" title={draft.hint.reason}>Looks like {draft.hint.label.toLowerCase()}, probably not a loan</CellChip> : null}
              </div>
            ) : null}
          </div>
        </td>
      );
    }
    if (column === "monthly") {
      const sentence = paymentSentence(draft, usd);
      const filed = draft.file?.monthly;
      return (
        <td key={column} className={styles.cell} data-label={spec.label} title={sentence || (filed != null && draft.file?.monthlyDerived ? "Worked out by us from the file's payment and how often." : undefined)}>
          <span className={styles.computed} data-empty={month == null || undefined}>{month == null ? "—" : usd(month)}</span>
        </td>
      );
    }
    if (column === "fromFile") {
      return (
        <td key={column} className={styles.cell} data-label={spec.label}>
          <FromFile draft={draft} />
        </td>
      );
    }
    if (!cellApplies(draft, column)) {
      return (
        <td key={column} className={styles.cell} data-label={labelOf(spec, draft)}>
          <span className={styles.notApplicable} title={column === "mcaNote" ? "Asked only when the advance was modified." : "Asked of an advance only."}>—</span>
        </td>
      );
    }
    const field = fieldOf(draft, column) as FieldKey;
    const mood = cellMood(draft, field, edited, needed, errors);
    return <Cell key={column} draft={draft} spec={spec} field={field} mood={mood} title={cellTitle(draft, field, mood, errors)} onField={onField} />;
  });

  return (
    <tr className={styles.dataRow} data-row={draft.key}>
      {cells}
      <td className={cx(styles.cell, styles.actionsCol)} data-pin="right" data-label="Not a loan?">
        <div className={styles.actions}>
          {isNewLine(draft) ? (
            <ActionIcon icon="x" label={`Remove the line ${lender} you added. Nothing was saved, so nothing is kept.`} onClick={() => onDelete(draft.key)} />
          ) : (
            <ActionIcon icon="x" label={`Not a loan: take ${lender} off the schedule. It is kept as history and can be put back.`} onClick={() => onChange(draft.key, { keep: false })} />
          )}
          {canResetRow(draft) ? <ActionIcon icon="refresh" label={`Put every cell on ${lender} back to what the file said.`} onClick={() => onReplace(draft.key, resetRow(draft))} /> : null}
        </div>
      </td>
    </tr>
  );
});

function RemovedRow({ draft, span, onChange }: { draft: LineDraft; span: number; onChange: Change }) {
  const lender = draft.lender.trim() || "this line";
  return (
    <tr className={styles.removedRow}>
      <td colSpan={span} className={styles.fullRow}>
        <div className={styles.removedInner}>
          <b>{draft.lender}</b>
          <span>taken off:</span>
          <select className={styles.control} aria-label={`Why ${lender} is not on the schedule`} value={draft.reason} onChange={(event) => onChange(draft.key, { reason: event.target.value as RemoveReason })}>
            {REMOVE_REASONS.map((reason) => <option key={reason.value} value={reason.value}>{reason.label}</option>)}
          </select>
          <Btn size="sm" onClick={() => onChange(draft.key, { keep: true })}><Icon name="arrowL" size={13} />Put back</Btn>
        </div>
      </td>
    </tr>
  );
}

export function DebtScheduleReviewTable({
  drafts,
  columns,
  onChange,
  onReplace,
  onDelete,
  focusRequest,
  visibleKeys,
}: {
  drafts: LineDraft[];
  columns: ColumnKey[];
  onChange: Change;
  onReplace: (key: string, next: LineDraft) => void;
  /** Remove a line the desk added by hand (it was never saved, so nothing is kept). */
  onDelete: (key: string) => void;
  focusRequest: FocusRequest | null;
  /** Show only these lines (the "needs answers" view, frozen when it was chosen so
   *  a line does not vanish from under the person who has just finished it). Null shows all. */
  visibleKeys: ReadonlySet<string> | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const pointerDown = useRef(false);
  const sum = totals(drafts);

  // A mouse click that moved the table under the pointer would land its release on a
  // different cell and lose the click, so only focus that did not come from a pointer
  // is brought clear by hand (the keyboard, and "Next needed").
  useEffect(() => {
    const release = () => { pointerDown.current = false; };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
    };
  }, []);

  const rows = visibleKeys ? drafts.filter((draft) => visibleKeys.has(draft.key)) : drafts;
  const rowKeys = rows.filter((draft) => draft.keep).map((draft) => draft.key);

  // How many cells each column still needs, for the header.
  const needCounts: Partial<Record<ColumnKey, number>> = {};
  for (const draft of drafts) {
    if (!draft.keep) continue;
    for (const field of neededFields(draft)) needCounts[columnOf(field)] = (needCounts[columnOf(field)] ?? 0) + 1;
  }

  const find = (row: string, column: ColumnKey): HTMLElement | null =>
    wrap.current?.querySelector<HTMLElement>(`[data-rk="${quote(row)}"][data-ck="${column}"]`) ?? null;

  // The sticky Lender column, the row actions, the header and the totals cover the
  // box's edges, and the browser's own scrolling (including the scroll a Tab causes)
  // counts the whole box as visible: a cell under a sticky part is "in view". So after
  // any focus, bring the cell clear of them by hand. Pinned cells only need it
  // vertically, and a phone (every line a card, no scroll box) needs nothing.
  const keepClear = (element: HTMLElement) => {
    const box = wrap.current;
    if (!box || (box.scrollWidth <= box.clientWidth && box.scrollHeight <= box.clientHeight)) return;
    const cell = element.closest("td") ?? element;
    const frame = box.getBoundingClientRect();
    const size = (selector: string, axis: "width" | "height") => box.querySelector<HTMLElement>(selector)?.getBoundingClientRect()[axis] ?? 0;
    const band = {
      left: frame.left + box.clientLeft + size('thead th[data-pin="left"]', "width"),
      right: frame.left + box.clientLeft + box.clientWidth - size('thead th[data-pin="right"]', "width"),
      top: frame.top + box.clientTop + size("thead", "height"),
      bottom: frame.top + box.clientTop + box.clientHeight - size("tfoot", "height"),
    };
    const { dx, dy } = scrollToClear(cell.getBoundingClientRect(), band);
    // A pinned cell is always in view sideways, and a strip that spans every column
    // (a line taken off) keeps its own content pinned: neither needs a sideways move.
    const spans = cell instanceof HTMLTableCellElement && cell.colSpan > 1;
    const left = cell.hasAttribute("data-pin") || spans ? 0 : dx;
    if (left || dy) box.scrollBy({ left, top: dy });
  };

  const focusCell = (element: HTMLElement | null, how: ScrollLogicalPosition = "nearest"): boolean => {
    if (!element) return false;
    element.focus({ preventScroll: true });
    if (element instanceof HTMLInputElement) element.select();
    element.scrollIntoView({ block: how, inline: how });
    keepClear(element);
    return true;
  };

  // "Next needed" asks for a cell by row and column.
  useEffect(() => {
    if (!focusRequest) return;
    focusCell(find(focusRequest.row, focusRequest.col), "center");
    // The request number is the trigger; the cell lookup reads the live DOM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.n]);

  const onKeyDown = (event: KeyboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLElement;
    const row = target.getAttribute("data-rk");
    const column = target.getAttribute("data-ck") as ColumnKey | null;
    if (!row || !column || event.altKey || event.ctrlKey || event.metaKey) return;
    const input = target instanceof HTMLInputElement ? target : null;
    const rowAt = rowKeys.indexOf(row);
    const columnAt = columns.indexOf(column);
    const vertical = (step: 1 | -1): boolean => {
      for (let at = rowAt + step; at >= 0 && at < rowKeys.length; at += step) if (focusCell(find(rowKeys[at], column))) return true;
      return false;
    };
    const horizontal = (step: 1 | -1): boolean => {
      for (let at = columnAt + step; at >= 0 && at < columns.length; at += step) if (focusCell(find(row, columns[at]))) return true;
      return false;
    };
    if (event.key === "Enter") {
      event.preventDefault();
      vertical(event.shiftKey ? -1 : 1);
    } else if (event.key === "ArrowDown" && input) {
      if (vertical(1)) event.preventDefault();
    } else if (event.key === "ArrowUp" && input) {
      if (vertical(-1)) event.preventDefault();
    } else if (event.key === "ArrowRight" && input && input.selectionStart === input.value.length && input.selectionEnd === input.value.length) {
      if (horizontal(1)) event.preventDefault();
    } else if (event.key === "ArrowLeft" && input && input.selectionStart === 0 && input.selectionEnd === 0) {
      if (horizontal(-1)) event.preventDefault();
    }
  };

  const span = columns.length + 1;
  return (
    <div className={styles.gridWrap} ref={wrap}>
      <table className={styles.grid} aria-label="Debt schedule lines" onKeyDown={onKeyDown} onPointerDown={() => { pointerDown.current = true; }} onFocus={(event) => { if (!pointerDown.current) keepClear(event.target as HTMLElement); }}>
        <colgroup>
          {columns.map((column) => <col key={column} style={{ width: COLUMN_BY_KEY[column].width }} />)}
          <col style={{ width: ACTIONS_WIDTH }} />
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => {
              const spec = COLUMN_BY_KEY[column];
              const count = needCounts[column];
              return (
                <th key={column} scope="col" title={spec.help} data-pin={column === "lender" ? "left" : undefined} className={cx(column === "lender" && styles.lenderCol, spec.group === "three" && styles.three, spec.group === "advance" && styles.advance)}>
                  {column === "rate" ? rateHeader(drafts) : spec.label}
                  {count ? <span className={styles.need} aria-label={`${count} needed`}>{count} needed</span> : null}
                </th>
              );
            })}
            <th scope="col" data-pin="right" className={styles.actionsCol} title="Not a loan? Take the line off the schedule (it is kept as history and can be put back), or put it back to what the file said.">Take off</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((draft) => (draft.keep ? <DataRow key={draft.key} draft={draft} columns={columns} onChange={onChange} onReplace={onReplace} onDelete={onDelete} /> : <RemovedRow key={draft.key} draft={draft} span={span} onChange={onChange} />))}
          {!rows.length ? (
            <tr>
              <td colSpan={span} className={styles.empty}>{visibleKeys ? "Nothing needs an answer. Every cell is filled." : "There are no lines to show."}</td>
            </tr>
          ) : null}
        </tbody>
        <tfoot>
          <tr>
            {columns.map((column) => {
              const spec = COLUMN_BY_KEY[column];
              if (column === "lender") {
                return (
                  <td key={column} className={styles.lenderCol} data-pin="left" data-label="Totals">
                    <div className={styles.totalLabel}>
                      <span>Totals</span>
                      <small>{sum.rows} line{sum.rows === 1 ? "" : "s"} · {sum.needed} answer{sum.needed === 1 ? "" : "s"} still missing</small>
                    </div>
                  </td>
                );
              }
              if (column === "originalAmount") return <td key={column} className={styles.totalFigure} data-label={spec.label}>{sum.original == null ? "—" : usd(sum.original)}</td>;
              if (column === "balance") return <td key={column} className={styles.totalFigure} data-label="Total balance">{sum.balance == null ? "—" : usd(sum.balance)}</td>;
              if (column === "monthly") {
                return (
                  <td key={column} className={styles.totalFigure} data-label="Monthly debt service" title="The payments of the lines that stay, as a month, which is what the debt service counts. A card is not counted.">
                    {sum.monthly == null ? "—" : usd(sum.monthly)}
                    {sum.withoutMonthly ? <small>{sum.withoutMonthly} not priced yet</small> : null}
                  </td>
                );
              }
              return <td key={column} data-label={spec.label} aria-hidden="true" />;
            })}
            <td className={styles.actionsCol} data-pin="right" aria-hidden="true" />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
