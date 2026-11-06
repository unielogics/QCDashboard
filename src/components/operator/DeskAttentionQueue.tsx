"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Btn, Callout, CellChip, Field, Input, Panel, Select } from "@/components/ds";
import { useAttentionQueue, useSendRoomReminder, useUpdateAttentionItem } from "@/hooks/useApi";
import type { AttentionItem, AttentionItemKind, AttentionQueue, AttentionQueueActionWrite } from "@/lib/types";
import { AttentionQueueRowActions } from "./AttentionQueueRowActions";
import styles from "./DeskAttentionQueue.module.css";

const LABELS: Record<AttentionItemKind, string> = {
  intake_no_files: "Client has not uploaded",
  no_client_entry: "Client has no way in",
  request_overdue: "Checklist aged out",
  action_items_stale: "AI suggestions unanswered",
};
const identity = (item: AttentionItem) => item.item_key || JSON.stringify([item.kind, item.intake_id, item.bucket_id, item.profile_id, item.href]);
const STATUS_LABELS = { archived: "Archived", dismissed: "Dismissed", duplicate: "Duplicate", active: "Active" };
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const dateTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };

/** A bounded view of the global work queue. Filtering never changes the global open count. */
export function DeskAttentionQueue({ children }: { children?: ReactNode }) {
  const [limit, setLimit] = useState(5);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kind, setKind] = useState<AttentionItemKind | "">("");
  const [view, setView] = useState<"active" | "hidden">("active");
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; hidden?: boolean } | null>(null);
  const [restoreError, setRestoreError] = useState<{ item: AttentionItem; text: string } | null>(null);
  const restoreKeys = useRef<Record<string, { revision: number; id: string }>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<Pick<AttentionQueue, "total" | "counts" | "hidden_total"> | null>(null);
  const [sentFor, setSentFor] = useState<Record<string, string>>({});
  const disclosureId = useId().replace(/:/g, "");
  const query = useAttentionQueue(true, { limit, offset, kind: kind || undefined, q: debouncedSearch, view });
  const remind = useSendRoomReminder();
  const updateItem = useUpdateAttentionItem();
  const queue = query.data;
  const total = queue?.total ?? summary?.total;
  const counts = queue?.counts ?? summary?.counts ?? {};
  const hiddenTotal = queue?.hidden_total ?? summary?.hidden_total;
  const filtered = queue?.filtered_total ?? 0;
  const items = queue?.items ?? [];
  const searching = normalize(search) !== debouncedSearch;
  const adjusting = Boolean(queue && offset > 0 && offset >= filtered);
  const changing = query.isLoading || query.isFetching || searching || adjusting || updateItem.isPending;
  const pageCount = Math.max(1, Math.ceil(filtered / limit));
  const page = Math.min(pageCount, Math.floor(offset / limit) + 1);
  const sendingProfile = remind.isPending ? remind.variables?.profileId : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(normalize(search)), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { if (queue) setSummary({ total: queue.total, counts: queue.counts, hidden_total: queue.hidden_total }); }, [queue]);
  useEffect(() => {
    if (queue && offset > 0 && offset >= queue.filtered_total) setOffset(Math.max(0, Math.ceil(queue.filtered_total / limit) - 1) * limit);
  }, [limit, offset, queue]);

  function clearFilters() { setSearch(""); setKind(""); setOffset(0); }
  function switchView(next: "active" | "hidden") { setView(next); setOffset(0); setEditing(null); setRestoreError(null); }
  async function changeItem(body: AttentionQueueActionWrite) {
    const result = await updateItem.mutateAsync(body);
    setEditing(null); setRestoreError(null);
    const status = result.item.queue_status;
    setNotice({ text: result.replayed ? result.message : status === "duplicate" ? "Attention item marked as a duplicate. The surviving item remains active and the file stays available." : status === "dismissed" ? "Attention item dismissed. The file stays available." : status === "archived" ? "Attention item archived. The file stays available." : result.message, hidden: status !== "active" });
    return result;
  }
  async function restore(item: AttentionItem) {
    const key = identity(item);
    const currentItem = queue?.items.find((row) => identity(row) === key) ?? item;
    if (restoreKeys.current[key]?.revision !== currentItem.queue_revision) restoreKeys.current[key] = { revision: currentItem.queue_revision, id: crypto.randomUUID() };
    setRestoreError(null);
    try {
      const result = await updateItem.mutateAsync({ item_key: currentItem.item_key, action: "restore", expected_revision: currentItem.queue_revision, idempotency_key: restoreKeys.current[key].id });
      delete restoreKeys.current[key];
      setNotice({ text: result.replayed || result.item.queue_status !== "active" ? result.message : result.current_source_active ? "Attention item restored to Active." : "The hidden status was removed. This issue has already resolved, so there is no active attention item to show.", hidden: result.item.queue_status !== "active" });
    } catch (failure) { setRestoreError({ item, text: failure instanceof Error ? failure.message : "This item could not be restored. Retry the action." }); }
  }
  async function resend(item: AttentionItem) {
    if (!item.profile_id) return;
    try {
      const result = await remind.mutateAsync({ profileId: item.profile_id });
      setSentFor((current) => ({ ...current, [item.profile_id!]: result.overall_status === "failed" ? "Could not send" : "Link sent" }));
    } catch { setSentFor((current) => ({ ...current, [item.profile_id!]: "Could not send" })); }
  }

  return <Panel title="Needs attention today" actions={<div className={styles.headingActions}><CellChip tone={total == null ? "mut" : total ? "bad" : "ok"}>{total == null ? query.isError ? "Unavailable" : "Loading…" : `${total} open`}</CellChip><Btn size="sm" disabled={query.isFetching || updateItem.isPending} onClick={() => void query.refetch()}>{query.isFetching && !query.isLoading ? "Refreshing…" : "Refresh"}</Btn></div>}>
    <div className={styles.root}>
      <div className={styles.viewBar}><div className={styles.views} role="tablist" aria-label="Attention item visibility"><button type="button" role="tab" aria-selected={view === "active"} disabled={updateItem.isPending} onClick={() => switchView("active")}>Active{total == null ? "" : ` (${total})`}</button><button type="button" role="tab" aria-selected={view === "hidden"} disabled={updateItem.isPending} onClick={() => switchView("hidden")}>Hidden{hiddenTotal == null ? "" : ` (${hiddenTotal})`}</button></div><span>Hide individual issues here; files stay available.</span></div>
      <div className={styles.toolbar}>
        <Field label="Search"><Input type="search" disabled={updateItem.isPending} aria-label="Search attention files and details" placeholder="Find a file or issue" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); setEditing(null); }} /></Field>
        <Field label="Issue"><Select disabled={updateItem.isPending} aria-label="Attention issue type" value={kind} onChange={(event) => { setKind(event.target.value as AttentionItemKind | ""); setOffset(0); setEditing(null); }}><option value="">All issues</option>{(Object.keys(LABELS) as AttentionItemKind[]).map((value) => <option value={value} key={value}>{LABELS[value]}{view === "hidden" || counts[value] == null ? "" : ` (${counts[value]})`}</option>)}</Select></Field>
        <Field label="Rows"><Select disabled={updateItem.isPending} aria-label="Attention rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setOffset(0); setEditing(null); }}>{[5, 10, 25].map((value) => <option value={value} key={value}>{value}</option>)}</Select></Field>
        {search || kind ? <Btn size="sm" disabled={updateItem.isPending} onClick={clearFilters}>Clear filters</Btn> : null}
      </div>

      {notice ? <Callout tone="ok"><div className={styles.error}><span role="status">{notice.text}</span><div className={styles.noticeActions}>{notice.hidden ? <Btn size="sm" disabled={updateItem.isPending} onClick={() => switchView("hidden")}>View Hidden</Btn> : null}<Btn size="sm" onClick={() => setNotice(null)}>Dismiss message</Btn></div></div></Callout> : null}
      {restoreError ? <Callout tone="bad"><div className={styles.error}><span>{restoreError.text}</span><Btn size="sm" disabled={updateItem.isPending} onClick={() => void restore(restoreError.item)}>Retry restore</Btn></div></Callout> : null}
      {query.isError ? <Callout tone="bad"><div className={styles.error}><span>{items.length ? "The queue could not refresh. These are the last loaded rows." : "The attention queue could not be loaded."}</span><Btn size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Btn></div></Callout> : null}
      <div className={styles.list} aria-label="Attention queue" aria-busy={query.isFetching || searching}>
        {query.isLoading ? <div className={styles.loading} role="status" aria-label="Loading the work queue">{[0, 1, 2].map((row) => <span key={row} className="skeleton" />)}</div> : null}
        {!query.isLoading && !query.isError && !items.length ? <div className={styles.empty}>{adjusting ? "Adjusting the page after the queue changed…" : search || kind ? "No attention items match these filters." : view === "hidden" ? "No hidden attention items." : "No active attention items."}{!adjusting && (search || kind) ? <Btn size="sm" onClick={clearFilters}>Clear filters</Btn> : !adjusting && view === "active" && Boolean(hiddenTotal) ? <Btn size="sm" onClick={() => switchView("hidden")}>View Hidden ({hiddenTotal})</Btn> : null}</div> : null}
        {items.map((item, index) => {
          const key = identity(item); const open = Boolean(expanded[key]); const detailsId = `${disclosureId}-${index}`;
          return <article className={styles.item} key={key}>
            <div className={styles.row}>
              <span className={styles.ordinal}>{(queue?.offset ?? offset) + index + 1}</span>
              <button type="button" className={styles.disclosure} title={item.title} aria-expanded={open} aria-controls={detailsId} onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}><span className={styles.title}>{item.title}</span><span className={styles.issue}>{LABELS[item.kind]}</span><span className={styles.toggle} aria-hidden="true">{open ? "−" : "+"}</span></button>
              <CellChip tone={view === "hidden" ? "mut" : item.severity}>{view === "hidden" ? STATUS_LABELS[item.queue_status] : `${item.age_days}d`}</CellChip>
              <div className={styles.actions}>{view === "active" && item.actions.includes("resend_link") && item.profile_id ? <Btn size="sm" disabled={remind.isPending || updateItem.isPending} onClick={() => void resend(item)}>{sendingProfile === item.profile_id ? "Sending…" : sentFor[item.profile_id] ?? "Resend link"}</Btn> : null}<Link href={item.href} className="btn sm pri" aria-label={`Open ${item.title}`}>Open</Link>{view === "hidden" ? <Btn size="sm" disabled={updateItem.isPending || changing} onClick={() => void restore(item)}>{updateItem.isPending && updateItem.variables?.item_key === item.item_key ? "Restoring…" : "Restore"}</Btn> : <Btn size="sm" aria-expanded={editing === key} disabled={changing || !item.item_key} onClick={() => { setEditing(editing === key ? null : key); setNotice(null); }}>More actions</Btn>}</div>
            </div>
            {view === "hidden" ? <div className={styles.hiddenMeta}><span>{item.queue_updated_at ? dateTime(item.queue_updated_at) : "Date unavailable"} · {item.queue_actor_name || "Staff member"}</span>{item.queue_reason ? <p>{item.queue_reason}</p> : null}{item.duplicate_of ? <div>Duplicate of <Link href={item.duplicate_of.href} className="linky">{item.duplicate_of.title}</Link><span> · {LABELS[item.duplicate_of.kind]}{!item.duplicate_of.current_source_active ? " · original issue resolved" : ""}</span></div> : null}{!item.current_source_active ? <span>The original issue has resolved.</span> : null}</div> : null}
            {open ? <div className={styles.details} id={detailsId}><strong>{item.title}</strong><p>{item.detail}</p><div><span>{view === "hidden" ? "Issue age: " : ""}{item.age_days} day{item.age_days === 1 ? "" : "s"}{view === "active" ? " open" : ""}{item.count > 1 ? ` · ${item.count} items` : ""}</span>{item.actions.includes("resend_link") ? <span>{item.link_last_sent_at ? `Last link sent ${dateTime(item.link_last_sent_at)}` : "No link send recorded"}</span> : null}</div></div> : null}
            {view === "active" && editing === key ? <AttentionQueueRowActions key={key} item={item} issueLabel={LABELS[item.kind]} pending={updateItem.isPending} onCancel={() => setEditing(null)} onSubmit={async (body) => { await changeItem(body); }} /> : null}
          </article>;
        })}
      </div>

      <div className={styles.pagination}>
        <span aria-live="polite">{searching ? "Searching…" : query.isLoading ? "Loading…" : adjusting ? "Updating page…" : queue ? filtered ? `${offset + 1}–${Math.min(offset + items.length, filtered)} of ${filtered}${debouncedSearch || kind ? " matching" : ""}` : "0 results" : "Queue unavailable"}</span>
        <nav aria-label="Attention queue pages"><Btn size="sm" disabled={changing || offset === 0} onClick={() => setOffset((current) => Math.max(0, current - limit))}>Previous</Btn><span>Page {page} of {pageCount}</span><Btn size="sm" disabled={changing || !queue || offset + limit >= filtered} onClick={() => setOffset((current) => current + limit)}>Next</Btn></nav>
      </div>
    </div>
    {children}
  </Panel>;
}
