"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Btn, Callout, Field, Input, Select, Textarea } from "@/components/ds";
import { useAttentionQueue } from "@/hooks/useApi";
import type { AttentionItem, AttentionQueueAction, AttentionQueueActionWrite } from "@/lib/types";
import styles from "./DeskAttentionQueue.module.css";

const sourceLabel = (item: AttentionItem) => item.intake_id ? `Intake ${item.intake_id.slice(0, 8)}` : item.bucket_id ? `Room ${item.bucket_id.slice(0, 8)}` : item.profile_id ? `File ${item.profile_id.slice(0, 8)}` : "File reference unavailable";
const normalize = (value: string) => value.trim().replace(/\s+/g, " ");

/** One explicit issue-level change; no company-name matching or bulk cleanup. */
export function AttentionQueueRowActions({ item, issueLabel, pending, onCancel, onSubmit }: {
  item: AttentionItem; issueLabel: string; pending: boolean; onCancel: () => void;
  onSubmit: (body: AttentionQueueActionWrite) => Promise<void>;
}) {
  const [action, setAction] = useState<Exclude<AttentionQueueAction, "restore">>("archive");
  const [reason, setReason] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [offset, setOffset] = useState(0);
  const [survivor, setSurvivor] = useState<AttentionItem | null>(null);
  const [error, setError] = useState("");
  const requestKey = useRef<string | null>(null);
  useEffect(() => { requestKey.current = null; }, [item.queue_revision]);
  const choices = useAttentionQueue(action === "duplicate", { view: "active", kind: item.kind, q: debounced, limit: 10, offset });
  const candidates = (choices.data?.items ?? []).filter((candidate) => candidate.item_key !== item.item_key && candidate.queue_status === "active");
  const updating = choices.isFetching || normalize(search) !== debounced;
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(normalize(search)), 300); return () => window.clearTimeout(timer); }, [search]);
  useEffect(() => { if (choices.data && offset > 0 && offset >= choices.data.filtered_total) setOffset(Math.max(0, Math.ceil(choices.data.filtered_total / 10) - 1) * 10); }, [choices.data, offset]);
  const edit = () => { requestKey.current = null; setError(""); };
  const submit = async () => {
    if (pending || action === "duplicate" && !survivor) return;
    requestKey.current ??= crypto.randomUUID(); setError("");
    try { await onSubmit({ item_key: item.item_key, action, expected_revision: item.queue_revision, idempotency_key: requestKey.current, ...(reason.trim() ? { reason: reason.trim() } : {}), ...(action === "duplicate" && survivor ? { duplicate_of_key: survivor.item_key } : {}) }); }
    catch (failure) { setError(failure instanceof Error ? failure.message : "This item could not be updated. Your choices are retained; retry the action."); }
  };
  return <section className={styles.controls} aria-label={`Queue actions for ${item.title}`}>
    <div className={styles.controlHeading}><div><strong>{item.title}</strong><p>Hides this issue for the file until it is restored. The underlying file stays available. Other issues for this file remain independent.</p></div><Btn size="sm" disabled={pending} onClick={onCancel}>Cancel</Btn></div>
    <Field label="Action"><Select aria-label="Attention item action" disabled={pending} value={action} onChange={(event) => { setAction(event.target.value as Exclude<AttentionQueueAction, "restore">); edit(); }}><option value="archive">Archive this attention item</option><option value="dismiss">Dismiss this attention item</option><option value="duplicate">Mark as duplicate of another item</option></Select></Field>
    {action === "duplicate" ? <div className={styles.duplicatePicker}>
      <p>Choose the active <b>{issueLabel}</b> item to keep. This item will be hidden as its duplicate.</p>
      <Input type="search" aria-label="Search duplicate survivor" placeholder="Find the file to keep" maxLength={200} value={search} disabled={pending} onChange={(event) => { setSearch(event.target.value); setOffset(0); }} />
      {choices.isError ? <Callout tone="bad"><div className={styles.error}><span>Surviving items could not be loaded.</span><Btn size="sm" disabled={choices.isFetching} onClick={() => void choices.refetch()}>Retry choices</Btn></div></Callout> : choices.isLoading || updating ? <p role="status">Loading matching items…</p> : !candidates.length ? <p>No other active items match. Search for another file or choose Archive or Dismiss.</p> : null}
      <div className={styles.candidates}>{candidates.map((candidate) => <article key={candidate.item_key} className={survivor?.item_key === candidate.item_key ? styles.selectedCandidate : ""}><label><input type="radio" name={`survivor-${item.item_key}`} checked={survivor?.item_key === candidate.item_key} disabled={pending || updating} onChange={() => { setSurvivor(candidate); edit(); }} /><span><strong>{candidate.title}</strong><small>{issueLabel} · {sourceLabel(candidate)} · {candidate.age_days}d</small><span>{candidate.detail}</span></span></label><Link className="linky" href={candidate.href} target="_blank" rel="noreferrer" aria-label={`Inspect surviving file ${candidate.title}`}>Inspect file ↗</Link></article>)}</div>
      <div className={styles.candidatePages}><Btn size="sm" disabled={pending || updating || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 10))}>Previous choices</Btn><span>Page {Math.floor(offset / 10) + 1}</span><Btn size="sm" disabled={pending || updating || !choices.data || offset + 10 >= choices.data.filtered_total} onClick={() => setOffset((value) => value + 10)}>More choices</Btn></div>
      {survivor ? <div className={styles.survivor}><strong>Keep: {survivor.title}</strong><span>{issueLabel} · {sourceLabel(survivor)}</span><Link href={survivor.href} target="_blank" rel="noreferrer">Inspect selected file ↗</Link></div> : null}
    </div> : null}
    <Field label="Reason (optional)"><Textarea aria-label="Attention queue action reason" maxLength={1000} value={reason} disabled={pending} onChange={(event) => { setReason(event.target.value); edit(); }} placeholder="Add context for other staff." /></Field>
    {error ? <Callout tone="bad">{error}</Callout> : null}
    <div className={styles.controlFooter}><small>This changes one attention item.</small><Btn variant="pri" disabled={pending || action === "duplicate" && (!survivor || updating || choices.isError)} onClick={() => void submit()}>{pending ? "Saving…" : error ? "Retry action" : action === "archive" ? "Archive item" : action === "dismiss" ? "Dismiss item" : "Mark duplicate"}</Btn></div>
  </section>;
}
