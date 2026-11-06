"use client";

import Link from "next/link";
import { useEffect, useId, useState, type ReactNode } from "react";
import { Btn, Callout, CellChip, Field, Input, Panel, Select } from "@/components/ds";
import { useAttentionQueue, useSendRoomReminder } from "@/hooks/useApi";
import type { AttentionItem, AttentionItemKind, AttentionQueue } from "@/lib/types";
import styles from "./DeskAttentionQueue.module.css";

const LABELS: Record<AttentionItemKind, string> = {
  intake_no_files: "Client has not uploaded",
  no_client_entry: "Client has no way in",
  request_overdue: "Checklist aged out",
  action_items_stale: "AI suggestions unanswered",
};
const identity = (item: AttentionItem) => JSON.stringify([item.kind, item.intake_id, item.bucket_id, item.profile_id, item.href]);
const normalize = (text: string) => text.trim().replace(/\s+/g, " ");
const dateTime = (value: string) => { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }); };

/** A bounded view of the global work queue. Filtering never changes the global open count. */
export function DeskAttentionQueue({ children }: { children?: ReactNode }) {
  const [limit, setLimit] = useState(5);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [kind, setKind] = useState<AttentionItemKind | "">("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [summary, setSummary] = useState<Pick<AttentionQueue, "total" | "counts"> | null>(null);
  const [sentFor, setSentFor] = useState<Record<string, string>>({});
  const disclosureId = useId().replace(/:/g, "");
  const query = useAttentionQueue(true, { limit, offset, kind: kind || undefined, q: debouncedSearch });
  const remind = useSendRoomReminder();
  const queue = query.data;
  const total = queue?.total ?? summary?.total;
  const counts = queue?.counts ?? summary?.counts ?? {};
  const filtered = queue?.filtered_total ?? 0;
  const items = queue?.items ?? [];
  const searching = normalize(search) !== debouncedSearch;
  const adjusting = Boolean(queue && offset > 0 && offset >= filtered);
  const changing = query.isLoading || query.isFetching || searching || adjusting;
  const pageCount = Math.max(1, Math.ceil(filtered / limit));
  const page = Math.min(pageCount, Math.floor(offset / limit) + 1);
  const sendingProfile = remind.isPending ? remind.variables?.profileId : null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(normalize(search)), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => { if (queue) setSummary({ total: queue.total, counts: queue.counts }); }, [queue]);
  useEffect(() => {
    if (queue && offset > 0 && offset >= queue.filtered_total) setOffset(Math.max(0, Math.ceil(queue.filtered_total / limit) - 1) * limit);
  }, [limit, offset, queue]);

  function clearFilters() { setSearch(""); setKind(""); setOffset(0); }
  async function resend(item: AttentionItem) {
    if (!item.profile_id) return;
    try {
      const result = await remind.mutateAsync({ profileId: item.profile_id });
      setSentFor((current) => ({ ...current, [item.profile_id!]: result.overall_status === "failed" ? "Could not send" : "Link sent" }));
    } catch { setSentFor((current) => ({ ...current, [item.profile_id!]: "Could not send" })); }
  }

  return <Panel title="Needs attention today" actions={<div className={styles.headingActions}><CellChip tone={total == null ? "mut" : total ? "bad" : "ok"}>{total == null ? query.isError ? "Unavailable" : "Loading…" : `${total} open`}</CellChip><Btn size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>{query.isFetching && !query.isLoading ? "Refreshing…" : "Refresh"}</Btn></div>}>
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <Field label="Search"><Input type="search" aria-label="Search attention files and details" placeholder="Find a file or issue" maxLength={200} value={search} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} /></Field>
        <Field label="Issue"><Select aria-label="Attention issue type" value={kind} onChange={(event) => { setKind(event.target.value as AttentionItemKind | ""); setOffset(0); }}><option value="">All issues</option>{(Object.keys(LABELS) as AttentionItemKind[]).map((value) => <option value={value} key={value}>{LABELS[value]}{counts[value] == null ? "" : ` (${counts[value]})`}</option>)}</Select></Field>
        <Field label="Rows"><Select aria-label="Attention rows per page" value={limit} onChange={(event) => { setLimit(Number(event.target.value)); setOffset(0); }}>{[5, 10, 25].map((value) => <option value={value} key={value}>{value}</option>)}</Select></Field>
        {search || kind ? <Btn size="sm" onClick={clearFilters}>Clear filters</Btn> : null}
      </div>

      {query.isError ? <Callout tone="bad"><div className={styles.error}><span>{items.length ? "The queue could not refresh. These are the last loaded rows." : "The attention queue could not be loaded."}</span><Btn size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>Retry</Btn></div></Callout> : null}
      <div className={styles.list} aria-label="Attention queue" aria-busy={query.isFetching || searching}>
        {query.isLoading ? <div className={styles.loading} role="status" aria-label="Loading the work queue">{[0, 1, 2].map((row) => <span key={row} className="skeleton" />)}</div> : null}
        {!query.isLoading && !query.isError && !items.length ? <div className={styles.empty}>{adjusting ? "Adjusting the page after the queue changed…" : total === 0 ? "Nothing needs attention. Every collecting file has documents, a live link, and a current checklist." : "No attention items match these filters."}{!adjusting && (search || kind) ? <Btn size="sm" onClick={clearFilters}>Clear filters</Btn> : null}</div> : null}
        {items.map((item, index) => {
          const key = identity(item); const open = Boolean(expanded[key]); const detailsId = `${disclosureId}-${index}`;
          return <article className={styles.item} key={key}>
            <div className={styles.row}>
              <span className={styles.ordinal}>{(queue?.offset ?? offset) + index + 1}</span>
              <button type="button" className={styles.disclosure} title={item.title} aria-expanded={open} aria-controls={detailsId} onClick={() => setExpanded((current) => ({ ...current, [key]: !current[key] }))}><span className={styles.title}>{item.title}</span><span className={styles.issue}>{LABELS[item.kind]}</span><span className={styles.toggle} aria-hidden="true">{open ? "−" : "+"}</span></button>
              <CellChip tone={item.severity}>{item.age_days}d</CellChip>
              <div className={styles.actions}>{item.actions.includes("resend_link") && item.profile_id ? <Btn size="sm" disabled={remind.isPending} onClick={() => void resend(item)}>{sendingProfile === item.profile_id ? "Sending…" : sentFor[item.profile_id] ?? "Resend link"}</Btn> : null}<Link href={item.href} className="btn sm pri" aria-label={`Open ${item.title}`}>Open</Link></div>
            </div>
            {open ? <div className={styles.details} id={detailsId}><strong>{item.title}</strong><p>{item.detail}</p><div><span>{item.age_days} day{item.age_days === 1 ? "" : "s"} open{item.count > 1 ? ` · ${item.count} items` : ""}</span>{item.actions.includes("resend_link") ? <span>{item.link_last_sent_at ? `Last link sent ${dateTime(item.link_last_sent_at)}` : "No link send recorded"}</span> : null}</div></div> : null}
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
