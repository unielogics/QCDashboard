"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Textarea, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { associationDraftIsStale, documentAssociationLabel, readDocumentAssociations, saveDocumentAssociation, type DocumentAssociation, type DocumentAssociationAction, type DocumentAssociationDraft } from "@/lib/documentAssociation";
import { BUSINESS_NAME_REASONS, MIN_REASON_LENGTH, reasonLongEnough } from "@/lib/evidenceReviewDecision";
import { QuickReasons } from "./QuickReasons";
import styles from "./DocumentIdentityReview.module.css";

const localTime = (at: string) => Number.isNaN(new Date(at).valueOf()) ? at : new Date(at).toLocaleString();
const actionLabel = (action: DocumentAssociationAction) => action === "accept" ? "Confirmed this document belongs to the business" : action === "deny" ? "Denied this document's business association" : "Restored automatic business association";

/**
 * Whether one document belongs to this file's business.
 *
 * `inline` is the collapsed block inside an evidence or financial workspace.
 * `panel` is the same review as the body of a dialog: always open, in plain
 * words, with the answer the reviewer clicked already chosen and one-click
 * reasons, so a yes or no takes a moment instead of a hunt.
 */
export function DocumentIdentityReview({ profileId, fileId, canEdit, expectedContentHash, initialRecord, initiallyOpen = false, onSaved, onPending, onPreview, externallyBusy = false, requirePreviewBinding = false, layout = "inline", initialAction = null, onDone, onCancel }: { profileId: string; fileId: string; canEdit: boolean; expectedContentHash?: string | null; initialRecord?: DocumentAssociation | null; initiallyOpen?: boolean; onSaved?: () => Promise<unknown> | void; onPending?: (pending: boolean) => void; onPreview?: () => void; externallyBusy?: boolean; requirePreviewBinding?: boolean; layout?: "inline" | "panel"; /** The answer the reviewer clicked to get here. */ initialAction?: DocumentAssociationAction | null; /** The answer was saved. */ onDone?: (action: DocumentAssociationAction) => void; onCancel?: () => void }) {
  const api = useAuthedApi(), devUser = useDevUser(), queryClient = useQueryClient(), id = useId();
  const identity = JSON.stringify([profileId, fileId, expectedContentHash ?? null]);
  const active = useRef({ identity, sourceStamp: "" });
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const panel = layout === "panel";
  const [expanded, setExpanded] = useState(initiallyOpen || panel);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const locked = busy || externallyBusy;
  const draftKey = ["document-association-draft", profileId, fileId] as const;
  const sharedDraft = useQuery<DocumentAssociationDraft | null>({ queryKey: draftKey, queryFn: async () => null, enabled: false, initialData: null, staleTime: Infinity });
  const storedDraft = sharedDraft.data;
  const draft = storedDraft?.profileId === profileId && storedDraft.fileId === fileId ? storedDraft : null;
  const setDraft = (next: DocumentAssociationDraft | null) => { queryClient.setQueryData(draftKey, next); };
  useEffect(() => { setError(""); setNotice(""); setBusy(false); setExpanded(initiallyOpen || panel); }, [profileId, fileId, initiallyOpen, panel]);
  const query = useQuery({ queryKey: ["document-associations", profileId, devUser], queryFn: () => readDocumentAssociations(api, profileId), enabled: expanded, staleTime: 0, refetchOnWindowFocus: false });
  const record = query.data ? query.data.documents.find((item) => item.file_id === fileId) : initialRecord?.file_id === fileId ? initialRecord : undefined;
  active.current = { identity, sourceStamp: record?.source_stamp ?? "" };
  const stale = !!draft && associationDraftIsStale(draft, profileId, record, query.data?.revision ?? -1);
  const differentBytes = !!expectedContentHash && !!record && expectedContentHash.toLowerCase() !== record.content_hash?.toLowerCase();
  const missingPreviewBinding = requirePreviewBinding && !expectedContentHash;
  const editable = canEdit && record?.can_review === true && !!record.content_hash && /^[a-f0-9]{64}$/i.test(record.content_hash) && !!query.data && query.data.profile_id === profileId && !query.isFetching && !query.error && !differentBytes && !missingPreviewBinding;
  const change = (patch: Partial<Pick<DocumentAssociationDraft, "action" | "reason">>) => {
    if (!record || !query.data || !editable || locked) return;
    setDraft({ ...(draft ?? { profileId, fileId, sourceStamp: record.source_stamp, revision: query.data.revision, action: null, reason: "", idempotencyKey: "" }), ...patch, idempotencyKey: crypto.randomUUID() }); setError(""); setNotice("");
  };
  // The reviewer already answered with the button that opened the panel. A
  // different answer than an earlier draft, or a draft written against an
  // earlier reading of the document, starts again from the clicked answer.
  const chosen = useRef("");
  useEffect(() => {
    if (!initialAction || !editable || locked || !record || !query.data) return;
    const request = `${identity}:${initialAction}:${record.source_stamp}`;
    if (chosen.current === request) return;
    chosen.current = request;
    if (draft?.action === initialAction && !stale) return;
    setDraft({ profileId, fileId, sourceStamp: record.source_stamp, revision: query.data.revision, action: initialAction, reason: "", idempotencyKey: crypto.randomUUID() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per answer and source; the draft it writes must not re-trigger it
  }, [initialAction, editable, locked, identity, record?.source_stamp, query.data?.revision]);
  const save = async () => {
    if (!draft || !draft.action || !record || !query.data || !editable || stale || locked || draft.reason.trim().length < 8 || draft.reason.trim().length > 2000) return;
    setBusy(true); onPending?.(true); setError(""); setNotice("");
    try {
      const next = await saveDocumentAssociation(api, profileId, record, query.data.revision, draft);
      queryClient.setQueriesData({ queryKey: ["document-associations", profileId] }, (current: typeof next | undefined) => { const currentSource = current?.documents.find((item) => item.file_id === fileId); return currentSource && currentSource.source_stamp !== draft.sourceStamp ? current : next; });
      const stillCurrent = () => mounted.current && active.current.identity === identity && active.current.sourceStamp === draft.sourceStamp && queryClient.getQueryData<typeof next>(["document-associations", profileId, devUser])?.documents.find((item) => item.file_id === fileId)?.source_stamp === draft.sourceStamp;
      if (stillCurrent()) setDraft(null);
      const keys = ["financial-metrics", "financial-cockpit", "application-evidence-workspace", "application-program-readiness", "application-profile", "application-profile-audit", "application-intelligence", "application-assessment", "lead-program-fit"];
      await Promise.allSettled(keys.map((key) => queryClient.invalidateQueries({ queryKey: [key, profileId] })));
      if (!stillCurrent()) return;
      setNotice(`${actionLabel(draft.action)}. Financials and the checklist have been refreshed.`);
      try { await onSaved?.(); } catch { setNotice("Business association saved. Refresh other file sections to read their updated state."); }
      onDone?.(draft.action);
    } catch (reason) {
      if (!mounted.current || active.current.identity !== identity) return;
      setError(reason instanceof Error ? reason.message : "The business association could not be saved. Your review is retained for retry.");
      if (reason && typeof reason === "object" && "status" in reason && reason.status === 409) await query.refetch();
    } finally { if (mounted.current && active.current.identity === identity) setBusy(false); onPending?.(false); }
  };
  const status = record?.status;
  const ready = !!draft?.action && reasonLongEnough(draft.reason) && draft.reason.trim().length <= 2000;
  if (panel) return <section className={cx(styles.review, styles.panel)} aria-label="Business name on this document">
    {query.isFetching && !record ? <p role="status">Reading the business name on this document…</p> : null}
    {query.error ? <Callout tone="warn">The business name on this document could not be loaded. <Btn size="sm" onClick={() => void query.refetch()}>Try again</Btn></Callout> : null}
    {!query.isFetching && query.data && !record ? <Callout tone="warn">This document is no longer part of this file. Close this and reopen it from the file&apos;s documents.</Callout> : null}
    {record ? <>
      <dl className={styles.facts}><div><dt>This file&apos;s business</dt><dd>{record.expected_entity || query.data?.expected_entity || "Not set on this file"}</dd></div><div><dt>Name on the document</dt><dd>{record.observed_entities.length ? record.observed_entities.join("; ") : "No business name could be read"}</dd></div></dl>
      {record.current_decision ? <p><b>{actionLabel(record.current_decision.action)}</b> · {record.current_decision.actor_name || "Staff"} · {localTime(record.current_decision.at)}<br />{record.current_decision.reason}</p> : null}
      {record.status === "stale" ? <Callout tone="warn">An earlier answer was given for a different reading of this document or a different business name on the file. It stays in the history and does not cover what is here now.</Callout> : null}
      {differentBytes ? <Callout tone="warn">This is not the current version of the document. Close this, refresh the file&apos;s documents and open the current version before answering.</Callout> : null}
      {missingPreviewBinding ? <Callout tone="warn">The exact version of the document on screen could not be confirmed. Close this, refresh the file&apos;s documents and reopen the document before answering.</Callout> : null}
      {canEdit && record.can_review ? <>
        <fieldset className={styles.choices} disabled={!editable || locked}><legend>Is it the same business?</legend>{([ ["accept", "Yes, it belongs to this business"], ["deny", "No, it belongs to a different business"], ...(record.current_decision ? [["reset", "Clear the answer and use the automatic check"] as const] : []) ] as const).map(([action, label]) => <label key={action}><input type="radio" name={`${id}-decision`} value={action} checked={draft?.action === action} onChange={() => change({ action })} />{label}</label>)}</fieldset>
        <div className={styles.reason}><label htmlFor={`${id}-reason`}>Why? This is kept in the file&apos;s history.</label>{draft?.action ? <QuickReasons reasons={BUSINESS_NAME_REASONS[draft.action]} value={draft.reason} disabled={!editable || locked} onPick={(reason) => change({ reason })} /> : null}<Textarea id={`${id}-reason`} rows={3} value={draft?.reason ?? ""} disabled={!editable || locked} maxLength={2000} placeholder="Pick a reason above or write your own" onChange={(event) => change({ reason: event.target.value })} />{draft?.action && !reasonLongEnough(draft.reason) ? <small className={styles.hint}>Pick a reason above, or write one of at least {MIN_REASON_LENGTH} characters.</small> : null}</div>
        <p className={styles.hint}>A yes lets this document&apos;s figures count toward this file&apos;s numbers. Approving or rejecting the document for the checklist is a separate decision.</p>
        {stale ? <Callout tone="warn">The document or another review on this file changed while you were answering. <Btn size="sm" disabled={locked || !query.data} onClick={() => { setDraft(null); setError(""); setNotice(""); }}>Start again</Btn></Callout> : null}
        {error ? <Callout tone="bad">{error}</Callout> : null}
        <div className={styles.actions}><Btn variant="pri" disabled={!editable || locked || stale || !ready} onClick={() => void save()}>{busy ? "Saving…" : "Save answer"}</Btn>{onCancel ? <Btn disabled={locked} onClick={onCancel}>Cancel</Btn> : null}</div>
      </> : <><p>Only underwriting staff can answer this.</p>{error ? <Callout tone="bad">{error}</Callout> : null}</>}
      {record.history.length ? <details><summary>Earlier answers ({record.history.length})</summary><ol className={styles.history}>{[...record.history].reverse().map((event) => <li key={event.id}><b>{actionLabel(event.action)}</b>{event.stale ? " · Earlier source" : ""}<br />{event.actor_name || "Staff"} · {localTime(event.at)}<br />{event.reason}</li>)}</ol></details> : null}
    </> : error ? <Callout tone="bad">{error}</Callout> : null}
    {notice ? <p role="status">{notice}</p> : null}
  </section>;
  return <section className={styles.review} aria-label="Document business association review">
    <button type="button" className={styles.toggle} aria-expanded={expanded} aria-controls={`${id}-body`} disabled={locked} onClick={() => setExpanded((value) => !value)}><span>Review business association</span>{status ? <CellChip tone={status === "accepted" || status === "matched" ? "ok" : status === "denied" ? "bad" : "warn"}>{documentAssociationLabel(status)}</CellChip> : null}<Icon name={expanded ? "chevU" : "chevD"} size={14} /></button>
    <div className={styles.body} id={`${id}-body`} hidden={!expanded}>
      {query.isFetching ? <p role="status">Reading the current document association…</p> : null}
      {query.error ? <Callout tone="warn">The current business association could not be loaded. <Btn size="sm" onClick={() => void query.refetch()}>Retry association review</Btn></Callout> : null}
      {!query.isFetching && query.data && !record ? <Callout tone="warn">This document is no longer available in the current application. Reopen it from the file's evidence list.</Callout> : null}
      {record ? <><dl className={styles.facts}><div><dt>Application business</dt><dd>{record.expected_entity || query.data?.expected_entity || "Not established"}</dd></div><div><dt>Business names read from the document</dt><dd>{record.observed_entities.length ? record.observed_entities.join("; ") : "No business name established"}</dd></div><div><dt>Document / content version</dt><dd>{record.file_name}<br />{record.document_version_number != null ? `Version ${record.document_version_number} · ` : ""}{record.content_hash ? `Content ${record.content_hash.slice(0, 12)}…` : "Content hash not supplied"}</dd></div><div><dt>Current use</dt><dd>{record.allows_financial_use ? "Business association permits consideration; financial eligibility is reviewed separately" : "Business association is unconfirmed or excluded; inspect the current status"}<br />{record.document_accepted ? "Document acceptance recorded separately" : "Checklist acceptance is separate and is not established here"}</dd></div></dl>
        <p>This decision links the document to this business. It does not verify financial figures, readability, document type, reporting period, or checklist acceptance.</p>
        {record.current_decision ? <p><b>{actionLabel(record.current_decision.action)}</b> · {record.current_decision.actor_name || "Staff"} · {localTime(record.current_decision.at)}<br />{record.current_decision.reason}</p> : null}
        {record.status === "stale" ? <Callout tone="warn">An earlier review applies to a different document reading or business identity. It remains in history and does not confirm the current source.</Callout> : null}
        {differentBytes ? <Callout tone="warn">This source reference belongs to a different content version. Open the current document from Evidence before reviewing its association.</Callout> : null}
        {missingPreviewBinding ? <Callout tone="warn">The visible document's exact content version is not established. Close this reader, refresh Evidence, and reopen the current document before saving an association.</Callout> : null}
        {canEdit && record.can_review ? <><fieldset className={styles.choices} disabled={!editable || locked}><legend>Reviewed business association</legend>{([ ["accept", "Belongs to this business"], ["deny", "Does not belong to this business"], ["reset", "Reset to automatic association rules"] ] as const).map(([action, label]) => <label key={action}><input type="radio" name={`${id}-decision`} value={action} checked={draft?.action === action} onChange={() => change({ action })} />{label}</label>)}</fieldset><label className={styles.reason}>Review reason<Textarea aria-label="Business association review reason" rows={3} value={draft?.reason ?? ""} disabled={!editable || locked} maxLength={2000} placeholder="Explain why this document belongs, does not belong, or should return to automatic rules" onChange={(event) => change({ reason: event.target.value })} /></label>{stale ? <Callout tone="warn">The source or another financial review changed. Your draft is retained. Start a new review against the current source before saving.</Callout> : null}<div className={styles.actions}>{onPreview ? <Btn size="sm" disabled={locked} onClick={onPreview}>Inspect document</Btn> : null}<Btn size="sm" disabled={locked || !query.data} onClick={() => { setDraft(null); setError(""); setNotice(""); }}>Start a new review</Btn><Btn variant="pri" size="sm" disabled={!editable || locked || stale || !draft || !draft.action || draft.reason.trim().length < 8 || draft.reason.trim().length > 2000} onClick={() => void save()}>{busy ? "Saving association…" : "Save business association"}</Btn></div></> : <p>Business-association decisions can be changed by underwriting staff.</p>}
        {record.history.length ? <details><summary>Business association history ({record.history.length})</summary><ol className={styles.history}>{[...record.history].reverse().map((event) => <li key={event.id}><b>{actionLabel(event.action)}</b>{event.stale ? " · Earlier source" : ""}<br />{event.actor_name || "Staff"} · {localTime(event.at)} · revision {event.revision}<br />{event.reason}</li>)}</ol></details> : null}
      </> : null}
      {error ? <Callout tone="bad">{error}</Callout> : null}{notice ? <p role="status">{notice}</p> : null}
    </div>
  </section>;
}
