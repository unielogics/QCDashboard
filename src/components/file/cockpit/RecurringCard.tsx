"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, CellChip, Input, StatusLine, cx } from "@/components/ds";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useAuthedApi, useRereadStatements } from "@/hooks/useApi";
import { isFinancialDraftConflict, meaningfulFinancialDebts } from "@/lib/financialWorkspaceApi";
import { actOnFinancialDebtCandidate, candidateDecisionLabel, readFinancialDebtReview, recurringReviewRows, reviewPage, type CandidateAction, type FinancialDebtCandidate } from "@/lib/financialDebtReview";
import { cadenceLabel, compactMoney, money, monthShort, payeeKindTone, type FinancialCockpit as Cockpit, type RecurringPayee } from "@/lib/financialCockpit";
import styles from "./FinancialReview.module.css";

type Filter = "all" | "candidates" | "included" | "disabled";
export type RecurringReviewView = { side: "debits" | "credits"; view: "payees" | "months"; filter: Filter; search: string; page: number; inspectedKey: string | null };
export function RecurringCard({ profileId, cockpit, canEdit, onRefresh, accountLabel, accountScope, onOpenDebt, onPreviewSource, compact = false, initialReviewView, onReviewView }: {
  profileId: string; cockpit: Cockpit; canEdit: boolean; onRefresh: () => Promise<unknown> | void;
  accountLabel: string | null; accountScope?: string; onOpenDebt?: (rowId?: string) => void;
  onPreviewSource?: (fileId: string, page?: number) => void; compact?: boolean;
  initialReviewView?: RecurringReviewView; onReviewView?: (value: RecurringReviewView) => void;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const reviewQuery = useQuery({ queryKey: ["financial-debt-review", profileId], queryFn: () => readFinancialDebtReview(api, profileId), staleTime: 0, refetchOnWindowFocus: false });
  const review = reviewQuery.data ?? cockpit.debt.review;
  const [side, setSide] = useState<"debits" | "credits">(initialReviewView?.side ?? "debits");
  const [view, setView] = useState<"payees" | "months">(initialReviewView?.view ?? "payees");
  const [filter, setFilter] = useState<Filter>(initialReviewView?.filter ?? "all");
  const [search, setSearch] = useState(initialReviewView?.search ?? "");
  const [page, setPage] = useState(initialReviewView?.page ?? 0);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [queued, setQueued] = useState<number | null>(null);
  const [inspectedKey, setInspectedKey] = useState<string | null>(initialReviewView?.inspectedKey ?? null);
  const [targetRow, setTargetRow] = useState("");
  const inspectorHeading = useRef<HTMLHeadingElement>(null);
  const inspectorOrigin = useRef<HTMLElement | null>(null);
  const inspect = (key: string) => { inspectorOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setInspectedKey(key); };
  const closeInspector = () => { setInspectedKey(null); requestAnimationFrame(() => { if (inspectorOrigin.current?.isConnected) inspectorOrigin.current.focus(); }); };
  const intent = useRef<{ key: string; action: CandidateAction; id: string; target?: string } | null>(null);
  const reread = useRereadStatements(profileId);
  const needReread = cockpit.coverage.statements_need_reread;
  const data = side === "debits" ? cockpit.bank.recurring : cockpit.bank.recurring_credits;
  const candidates = useMemo(() => review?.candidates ?? [], [review]);
  const countedLabels = cockpit.bank.accounts.filter((account) => account.counted).map((account) => account.label);
  const inScope = (accounts: string[], candidate?: FinancialDebtCandidate | null) => accountLabel ? accounts.includes(accountLabel) : accountScope === "counted" ? accounts.some((label) => countedLabels.includes(label)) || cockpit.bank.accounts.some((account) => account.counted && account.key === candidate?.account_key) : true;
  const scopedCandidates = candidates.filter((candidate) => inScope(candidate.accounts, candidate));
  const observedAmounts = scopedCandidates.map((candidate) => candidate.monthly_average).filter((value): value is number => value != null && Number.isFinite(value));
  const observedTotal = observedAmounts.length ? observedAmounts.reduce((total, value) => total + value, 0) : scopedCandidates.length ? null : 0;
  const observedPartial = observedAmounts.length < scopedCandidates.length;
  const inspected = candidates.find((candidate) => candidate.key === inspectedKey);
  const existingRows = review ? meaningfulFinancialDebts(review.workspace.body) : [];
  useEffect(() => { if (inspectedKey) { setTargetRow(""); inspectorHeading.current?.focus(); } }, [inspectedKey]);
  const combined = useMemo(() => side === "debits" ? recurringReviewRows(data.payees, candidates) : data.payees.map((payee) => ({ key: payee.key, payee, candidate: null })), [side, data.payees, candidates]);
  const rows = combined.filter(({ payee, candidate }) => inScope(payee.accounts, candidate)
    && (!search.trim() || `${payee.payee} ${payee.accounts.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()))
    && (filter === "all" || filter === "candidates" && candidate?.status === "unreviewed" || filter === "included" && candidate?.status === "included" || filter === "disabled" && candidate?.status === "disabled"));
  const displayed = reviewPage(rows, page, 8);
  const months = data.months_read;
  const resetKey = JSON.stringify([accountLabel, side, filter, search]);
  const previousResetKey = useRef(resetKey);
  useEffect(() => { if (previousResetKey.current !== resetKey) { previousResetKey.current = resetKey; setPage(0); } }, [resetKey]);
  useEffect(() => { onReviewView?.({ side, view, filter, search, page, inspectedKey }); }, [side, view, filter, search, page, inspectedKey, onReviewView]);
  useEffect(() => {
    if (queued == null || !needReread) return;
    let tries = 0;
    const timer = window.setInterval(() => { void onRefresh(); if (++tries >= 12) window.clearInterval(timer); }, 20_000);
    return () => window.clearInterval(timer);
  }, [queued, needReread, onRefresh]);

  const act = async (candidate: FinancialDebtCandidate, action: CandidateAction, target?: string) => {
    if (!review || busyKey || !canEdit) return;
    setError(null); setNotice(null); setBusyKey(candidate.key);
    if (intent.current?.key !== candidate.key || intent.current.action !== action || intent.current.target !== target) intent.current = { key: candidate.key, action, id: crypto.randomUUID(), target };
    try {
      const next = await actOnFinancialDebtCandidate(api, profileId, review, candidate.key, action, intent.current.id, target);
      queryClient.setQueryData(["financial-debt-review", profileId], next);
      queryClient.setQueryData(["financial-workspace-summary", profileId], next.workspace);
      intent.current = null;
      setNotice(action === "include" ? `${candidate.payee} was added to the working schedule. Review its balance and terms, then Save version to publish.`
        : action === "link_existing" ? "Statement evidence linked to the existing obligation. Its financial values were kept; Save version publishes the reviewed association."
        : action === "disable" ? "Candidate disabled. Existing declared obligations remain on the schedule. Save version publishes any draft changes."
          : "Candidate restored for review. Add it explicitly if it is an obligation.");
      await onRefresh();
    } catch (reason) {
      if (isFinancialDraftConflict(reason)) { intent.current = null; await reviewQuery.refetch(); }
      setError(errorMessage(reason, "The candidate decision could not be saved."));
    } finally { setBusyKey(null); }
  };
  const candidateActions = (candidate: FinancialDebtCandidate) => [
    { label: "Review source and schedule link", onSelect: () => inspect(candidate.key) },
    { label: "Link to an existing obligation…", hidden: candidate.status !== "unreviewed" || !existingRows.length, onSelect: () => inspect(candidate.key) },
    { label: "Add as a separate obligation", hidden: candidate.status !== "unreviewed" || !candidate.eligible, onSelect: () => void act(candidate, "include") },
    { label: "Open linked schedule row", hidden: !candidate.row_id, onSelect: () => onOpenDebt?.(candidate.row_id ?? undefined) },
    { label: candidate.status === "included" && candidate.binding === "created" ? "Exclude candidate-created draft row" : "Disable this debt candidate", hidden: candidate.status === "disabled", onSelect: () => void act(candidate, "disable") },
    { label: "Restore candidate for review", hidden: candidate.status !== "disabled", onSelect: () => void act(candidate, "restore") },
  ];
  const openRowMenu = (event: React.MouseEvent<HTMLTableRowElement>, candidate: FinancialDebtCandidate | null) => {
    if (!candidate || !canEdit || busyKey) return;
    event.preventDefault();
    event.currentTarget.querySelector<HTMLButtonElement>("[data-candidate-actions] button")?.click();
  };
  const rowEvidence = (candidate: FinancialDebtCandidate | null, payee: RecurringPayee) => {
    const source = candidate?.source_refs.find((item) => item.file_id);
    const fileId = source?.file_id || payee.file_ids[0];
    return fileId && onPreviewSource ? <button type="button" className={styles.textAction} onClick={() => onPreviewSource(fileId, source?.page ?? undefined)}>Source statement{source?.page ? ` · p${source.page}` : ""}</button> : null;
  };
  const queue = async () => { setError(null); try { const result = await reread.mutateAsync(); setQueued(result.queued); } catch (reason) { setError(errorMessage(reason, "The statements could not be queued.")); } };

  return <section className={cx(compact ? styles.section : "fc-card fc-wide")} aria-label="Statement payment review">
    <div className={styles.sectionHead}>
      <div><h4>Statement payments</h4><p className="sub">Observed activity stays separate from the debt schedule. Add or disable candidates explicitly; Save version publishes schedule changes.</p></div>
      {onOpenDebt ? <Btn size="sm" onClick={() => onOpenDebt()}>Edit debt schedule</Btn> : null}
    </div>
    {review ? <div className={styles.summaryStrip}>
      <span><small>Saved debt service</small><strong>{review.published.complete ? `${money(review.published.monthly)} / month` : "No completed saved schedule"}</strong></span>
      <span><small>Working schedule</small><strong>{review.working.active_rows} obligations · {review.working.complete ? "complete" : "needs review"}</strong></span>
      <span><small>Observed recurring withdrawals</small><strong>{observedPartial ? "At least " : ""}{money(observedTotal)} / month{observedPartial ? " · partial amounts" : ""}</strong></span>
    </div> : null}
    <div className={styles.toolbar}>
      <div className="fc-toggle" role="tablist" aria-label="Statement direction">{(["debits", "credits"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={side === value} className={side === value ? "on" : undefined} onClick={() => { setSide(value); setFilter("all"); }}>{value === "debits" ? "Payments out" : "Money in"}</button>)}</div>
      <div className="fc-toggle" role="tablist" aria-label="Statement payment view">{(["payees", "months"] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={view === value} className={view === value ? "on" : undefined} onClick={() => setView(value)}>{value === "payees" ? "By payee" : "By month"}</button>)}</div>
      <label className={styles.search}>Search<Input aria-label="Search statement payments" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      {side === "debits" ? <label>Decision<select aria-label="Statement candidate decision" value={filter} onChange={(event) => setFilter(event.target.value as Filter)}><option value="all">All payments</option><option value="candidates">Unreviewed candidates</option><option value="included">Linked schedule rows</option><option value="disabled">Disabled candidates</option></select></label> : null}
      {needReread > 0 && canEdit ? <Btn size="sm" disabled={reread.isPending || queued != null} onClick={() => void queue()}><Icon name="refresh" size={13} />{queued == null ? `Re-read ${needReread} statements` : `Queued ${queued}`}</Btn> : null}
    </div>
    <p className={styles.note}>{accountLabel || "All selected accounts"} · {months.length} statement months. {side === "debits" && canEdit ? "Right-click a candidate or use its visible Actions menu." : "Deposits are source observations and cannot be added as debt payments."}</p>
    {reviewQuery.isLoading && side === "debits" ? <StatusLine tone="mut">Loading candidate decisions…</StatusLine> : null}
    {reviewQuery.error && side === "debits" ? <StatusLine tone="warn">Review controls could not be refreshed. <button type="button" className={styles.textAction} onClick={() => void reviewQuery.refetch()}>Retry</button></StatusLine> : null}
    {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
    {notice ? <StatusLine tone="acc">{notice}</StatusLine> : null}
    <div className={inspected ? styles.statementSplit : undefined}><div>
    <div className={styles.boundedTable} tabIndex={0} role="region" aria-label="Recurring statement payment rows">
      <table className="tbl"><caption>{side === "debits" ? "Recurring withdrawals and staff debt decisions" : "Recurring deposits"}. Observations alone are not confirmed obligations.</caption>
        <thead><tr><th>{side === "debits" ? "Payee / account" : "Payer / account"}</th><th>Classification</th>{view === "payees" ? <><th>Cadence</th><th className="r">Typical amount</th><th className="r">Per month</th></> : months.map((month) => <th key={month} className="r">{monthShort(month)}</th>)}{side === "debits" ? <><th>Schedule decision</th><th>Actions</th></> : null}</tr></thead>
        <tbody>{displayed.items.map(({ key, payee, candidate }) => <tr key={key} onContextMenu={(event) => openRowMenu(event, candidate)} className={candidate?.status === "disabled" ? "is-muted" : undefined}>
          <td><strong>{payee.payee}</strong><small className={styles.subline}>{payee.accounts.join(", ") || "Account not identified"}</small><small className={styles.subline}>{payee.occurrences > 0 ? `${payee.occurrences} payments · ${payee.months_seen} statement months` : "Observed in statements · review before adding"}</small>{rowEvidence(candidate, payee)}</td>
          <td><CellChip tone={payeeKindTone(payee.kind)}>{payee.kind_label}</CellChip></td>
          {view === "payees" ? <><td>{cadenceLabel(payee.cadence)}</td><td className="r num">{money(payee.average_amount)}</td><td className="r num"><strong>{money(payee.monthly_average)}</strong></td></> : months.map((month) => <td key={month} className="r num">{payee.monthly[month] == null ? "—" : compactMoney(payee.monthly[month])}</td>)}
          {side === "debits" ? <><td><CellChip tone={candidate?.status === "included" ? "acc" : "mut"}>{candidateDecisionLabel(candidate)}</CellChip>{candidate?.status === "unreviewed" && candidate.possible_row_ids?.length ? <small className={styles.subline}>Possible existing obligation — review before adding.</small> : null}{candidate?.status === "included" ? <small className={styles.subline}>Published figures change only after Save version.</small> : null}</td><td>{canEdit && candidate ? <div className={styles.rowActions}>
            {candidate.status === "unreviewed" && candidate.eligible ? candidate.possible_row_ids?.length ? <Btn size="sm" disabled={Boolean(busyKey)} onClick={() => inspect(candidate.key)}>Review match</Btn> : <Btn size="sm" disabled={Boolean(busyKey)} onClick={() => void act(candidate, "include")}>{busyKey === candidate.key ? "Saving…" : "Add to draft"}</Btn> : candidate.status === "included" && candidate.row_id && onOpenDebt ? <Btn size="sm" onClick={() => onOpenDebt(candidate.row_id ?? undefined)}>Open row</Btn> : candidate.status === "disabled" ? <Btn size="sm" disabled={Boolean(busyKey)} onClick={() => void act(candidate, "restore")}>Restore</Btn> : null}
            {!busyKey ? <span data-candidate-actions><PageActionMenu label={`Actions for ${payee.payee} ${payee.accounts.join(" ")}`} items={candidateActions(candidate)} /></span> : null}
          </div> : <span className="sub">{candidate ? "Review only" : reviewQuery.isLoading ? "Loading…" : "Observed only"}</span>}</td></> : null}
        </tr>)}</tbody>
      </table>
      {!rows.length ? <div className="fc-empty">No recurring payments match this selection.</div> : null}
    </div>
    <div className={styles.pagination}><span role="status">{rows.length ? `${displayed.page * 8 + 1}–${Math.min((displayed.page + 1) * 8, rows.length)} of ${rows.length}` : "0 rows"}</span><Btn size="sm" disabled={!displayed.page} onClick={() => setPage(displayed.page - 1)}>Previous</Btn><Btn size="sm" disabled={displayed.page + 1 >= displayed.pages} onClick={() => setPage(displayed.page + 1)}>Next</Btn></div>
    </div>{inspected ? <aside className={styles.candidateInspector} aria-label="Statement candidate inspector">
      <div className={styles.sectionHead}><h5 ref={inspectorHeading} tabIndex={-1}>{inspected.payee}</h5><Btn size="sm" onClick={closeInspector}>Close details</Btn></div>
      <CellChip tone="mut">{candidateDecisionLabel(inspected)}</CellChip>
      <p className={styles.note}>{inspected.reason}</p><p className={styles.note}>{inspected.accounts.join(", ") || "Account not identified"} · observed {money(inspected.monthly_average)} / month</p>
      {inspected.related_rows?.length ? <div><strong>Related schedule rows</strong><ul className={styles.relatedRows}>{inspected.related_rows.slice(0, 5).map((row) => <li key={row.row_id}>{row.lender} · {row.status}</li>)}</ul><p className={styles.note}>A similar name is a suggestion; it does not confirm the same loan.</p></div> : null}
      {inspected.status === "unreviewed" && existingRows.length > 0 && canEdit ? <div className={styles.linkExisting}>
        <label>Existing obligation<select aria-label="Existing obligation for statement candidate" value={targetRow} onChange={(event) => setTargetRow(event.target.value)}><option value="">Choose an obligation…</option>{existingRows.map((row) => <option key={row.id} value={row.id}>{String(row.lender || "Unnamed obligation")}{inspected.possible_row_ids?.includes(row.id) ? " · possible match" : ""}</option>)}</select></label>
        <Btn size="sm" disabled={!targetRow || Boolean(busyKey)} onClick={() => void act(inspected, "link_existing", targetRow)}>Link existing obligation</Btn>
        <p className={styles.note}>Financial values on the existing row are kept. Several account observations can support one obligation.</p>
      </div> : null}
      {inspected.status === "unreviewed" && inspected.eligible && canEdit ? <Btn size="sm" disabled={Boolean(busyKey)} onClick={() => void act(inspected, "include")}>Add as a separate obligation</Btn> : null}
      {inspected.status === "included" && inspected.row_id && onOpenDebt ? <Btn size="sm" onClick={() => onOpenDebt(inspected.row_id ?? undefined)}>Open linked schedule row</Btn> : null}
      <div className={styles.candidateSources}><strong>Source evidence</strong>{inspected.source_refs.slice(0, 6).map((source, index) => source.file_id && onPreviewSource ? <button type="button" className={styles.textAction} key={`${source.file_id}:${source.page}:${index}`} onClick={() => onPreviewSource(source.file_id!, source.page ?? undefined)}>{source.file_name || `Statement ${index + 1}`}{source.month ? ` · ${monthShort(source.month)}` : ""}{source.page ? ` · p${source.page}` : ""}</button> : null)}</div>
    </aside> : null}</div>
  </section>;
}
