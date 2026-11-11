"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, CellChip, Input, Textarea } from "@/components/ds";
import { useMarketplacePpm } from "@/hooks/useMarketplacePpm";
import { useMarketplaceDocumentLink } from "@/hooks/useMarketplaceDocumentLink";
import type { CpListing } from "@/hooks/useCapitalPartners";
import { ppmApplyEditsToLatest, ppmCanReview, ppmConflict, ppmContentKey, ppmDirty, ppmEdit, ppmEditableVersion, ppmIsLegacy, ppmLegalId, ppmMissingIssue, ppmMissingLegalKey, ppmNeedsRefresh, type MarketplacePpm, type PpmEdit, type PpmGenerate, type PpmReview, type PpmSave, type PpmVersion } from "@/lib/marketplacePpm";
import type { MarketplaceIssue } from "@/lib/marketplaceIssues";
import styles from "./MarketplacePpmWorkspace.module.css";

type Action = "generate" | "draft" | "review";
type Payload = PpmGenerate | PpmSave | PpmReview;
type Attempt = { action: Action; payload: Payload; submitted?: PpmEdit | null; localAtStart?: PpmEdit | null };
const sameWords = (a: PpmEdit | null, b: PpmEdit | null) => ppmContentKey(a) === ppmContentKey(b);
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

function SavedPreview({ version }: { version: PpmVersion }) {
  return <details className={styles.preview}><summary>Saved PPM preview · v{version.version}</summary><p className={styles.note}>This preview and the PDF use the saved version. Save your edits to include them.</p>{version.document?.sections?.map(section => <section key={section.key} className={styles.section}><h4>{section.title}</h4>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.facts.length ? <dl className={styles.facts}>{section.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.note ? <small>{fact.note}</small> : null}</dd></div>)}</dl> : null}{section.table ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${section.title} saved facts`}><table><thead><tr>{section.table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}</section>)}</details>;
}

export function MarketplacePpmWorkspace({ listing, active, onFix, onApproved }: { listing: CpListing; active: boolean; onFix: (issue: MarketplaceIssue) => void; onApproved: () => void }) {
  const ppm = useMarketplacePpm(listing.id, active), state = ppm.data, version = ppmEditableVersion(state);
  const links = useMarketplaceDocumentLink(`ppm:${listing.id}`);
  const [base, setBase] = useState<PpmEdit | null>(null), [edit, setEdit] = useState<PpmEdit | null>(null);
  const baseRef = useRef(base), editRef = useRef(edit), dirtyRef = useRef(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState(false);
  const [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false);
  const [action, setAction] = useState<Action | null>(null), [failed, setFailed] = useState<Attempt | null>(null);
  const operation = useRef(false), keys = useRef(new Map<string, string>()), autoTried = useRef(new Set<string>());
  const live = useRef(true); useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const canEdit = ppm.allowed && !["repaid", "withdrawn"].includes(listing.status);
  const dirty = ppmDirty(edit, base), conflict = ppmConflict(edit, state);
  dirtyRef.current = dirty; baseRef.current = base; editRef.current = edit;
  const adopt = (next: MarketplacePpm) => {
    const current = ppmEditableVersion(next), copy = current ? ppmEdit(current) : null;
    baseRef.current = copy; editRef.current = copy; dirtyRef.current = false;
    setBase(copy); setEdit(copy); setConfirmed(false);
  };
  const adoptRef = useRef(adopt); adoptRef.current = adopt;
  useEffect(() => { if (state && !dirtyRef.current) adoptRef.current(state); }, [state]);
  const lastInput = useRef(listing.updated_at), wasActive = useRef(false);
  const refetchPpm = ppm.refetch;
  useEffect(() => {
    if (active && wasActive.current && lastInput.current !== listing.updated_at) void refetchPpm();
    lastInput.current = listing.updated_at; wasActive.current = active;
  }, [active, listing.updated_at, refetchPpm]);
  const patchEdit = (kind: "legalInputs" | "narrativeSections", key: string, value?: string) => {
    const current = editRef.current;
    if (!current || !canEdit || ppm.busy && action !== "generate") return;
    const fields = { ...current[kind] }; if (value === undefined) delete fields[key]; else fields[key] = value;
    const next = { ...current, [kind]: fields }; editRef.current = next; dirtyRef.current = ppmDirty(next, baseRef.current); setEdit(next); setConfirmed(false); setNotice("");
  };
  const payload = <T extends Record<string, unknown>>(actionName: Action, values: T) => {
    const signature = JSON.stringify({ actionName, values });
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    return { ...values, idempotency_key: keys.current.get(signature)! };
  };
  const perform = async (attempt: Attempt) => {
    if (operation.current || !canEdit) return;
    operation.current = true; setAction(attempt.action); setError(""); setNotice(""); setFailed(null); setRefreshWarning(false);
    try {
      const next = await ppm.mutate(attempt.action, attempt.payload);
      if (!next || !live.current) return;
      for (const [signature, key] of keys.current) if (key === attempt.payload.idempotency_key) keys.current.delete(signature);
      const originalEdits = attempt.localAtStart ?? attempt.submitted;
      if (attempt.action === "draft" && originalEdits && editRef.current && !sameWords(editRef.current, originalEdits)) {
        const saved = ppmEditableVersion(next);
        if (saved) { const freshBase = ppmEdit(saved), kept = ppmApplyEditsToLatest(originalEdits, editRef.current, saved); baseRef.current = freshBase; editRef.current = kept; dirtyRef.current = ppmDirty(kept, freshBase); setBase(freshBase); setEdit(kept); }
        setNotice("The submitted draft was saved. Your newer wording is retained and still needs Save draft.");
      } else if (attempt.action !== "generate" || !dirtyRef.current) adopt(next);
      if (attempt.action === "review") { setReason(""); setConfirmed(false); onApproved(); setNotice("The current PPM was reviewed and approved. Publish offer remains a separate action."); }
      else if (attempt.action === "draft") setNotice(current => current || "PPM draft saved. Review this saved version before approval.");
      else setNotice(next.generation_status === "ai_draft" ? "AI-assisted draft prepared. Complete and review it before approval." : "Source-based draft prepared. Complete and review it before approval.");
      try { await ppm.refreshListing(); }
      catch { if (live.current) setRefreshWarning(true); }
    } catch (error) {
      if (!live.current) return;
      setError(error instanceof Error ? error.message : "The PPM operation could not be completed. Your edits are retained."); setFailed(attempt);
      void ppm.refetch();
    } finally { operation.current = false; if (live.current) setAction(null); }
  };
  const generate = (force = false) => {
    if (!state || !canEdit || force && dirtyRef.current) return;
    autoTried.current.add(state.source_fingerprint);
    void perform({ action: "generate", payload: payload("generate", { expected_source_fingerprint: state.source_fingerprint, force, auto_refresh: true }) });
  };
  const generateRef = useRef(generate); generateRef.current = generate;
  useEffect(() => {
    if (active && canEdit && state && !ppm.busy && !ppm.isFetching && !ppm.isError && ppmNeedsRefresh(state) && !autoTried.current.has(state.source_fingerprint)) generateRef.current();
  }, [active, canEdit, state, ppm.busy, ppm.isFetching, ppm.isError]);
  const save = (applyToLatest = false) => {
    if (!editRef.current || !state || !version || !canEdit) return;
    const submitted = applyToLatest && baseRef.current ? ppmApplyEditsToLatest(baseRef.current, editRef.current, version) : editRef.current;
    void perform({ action: "draft", submitted, localAtStart: editRef.current, payload: payload("draft", { expected_version: submitted.version, expected_source_fingerprint: submitted.sourceFingerprint, legal_inputs: submitted.legalInputs, narrative_sections: submitted.narrativeSections }) });
  };
  const approve = () => {
    if (!state?.current_draft || !ppmCanReview(state, dirty, conflict) || !confirmed || reason.trim().length < 3) return;
    void perform({ action: "review", payload: payload("review", { expected_version: state.current_draft.version, expected_source_fingerprint: state.source_fingerprint, reason: reason.trim(), confirmed: true }) });
  };
  const download = (saved: PpmVersion) => { setError(""); void links.open(`/capital/admin/listings/${listing.id}/ppm/versions/${saved.document_id}/url?download=true`).catch(error => { if (live.current) setError(error instanceof Error ? error.message : "The saved PPM could not be downloaded."); }); };
  const editingDisabled = !canEdit || ppm.busy && action !== "generate";
  const legacy = ppmIsLegacy(state);
  const currentApproved = state?.current_approved && !state.current_approved.stale && state.current_approved.source_fingerprint === state.source_fingerprint;
  return <section id="marketplace-ppm-workspace" tabIndex={-1} className={styles.root} aria-label="PPM draft and review">
    <header className={styles.header}><div><h2 id="marketplace-ppm-heading" tabIndex={-1}>Private placement memorandum</h2><p className={styles.note}>Prepare a draft from saved offering facts, complete the legal details and explicitly review the saved PPM.</p></div>{state ? <CellChip tone={currentApproved && state.status === "approved" ? "ok" : "warn"}>{state.managed ? state.status === "approved" ? "Reviewed current PPM" : state.status === "stale" ? "Source changed · review needed" : "Draft · staff review required" : state.current_approved ? "Uploaded PPM · legacy current" : "PPM not drafted"}</CellChip> : null}</header>
    {ppm.isPending && !state ? <p role="status">Loading PPM status…</p> : null}
    {ppm.isError ? <div className={styles.warning} role="alert">PPM status could not be loaded. Existing edits are retained. <Btn size="sm" onClick={() => void ppm.refetch()}>Retry PPM status</Btn></div> : null}
    {error ? <div className={styles.warning} role="alert">{error}{failed ? <Btn size="sm" disabled={ppm.busy || !canEdit || failed.action === "review" && (!confirmed || dirty || conflict)} onClick={() => void perform(failed)}>Retry previous {failed.action === "draft" ? "save" : failed.action === "review" ? "review" : "generation"}</Btn> : <Btn size="sm" onClick={() => void ppm.refetch()}>Reload PPM status</Btn>}</div> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {refreshWarning ? <div className={styles.warning} role="alert">The PPM operation was saved, but listing readiness could not be refreshed. Retry this read without saving or approving another version.<Btn size="sm" onClick={() => void ppm.refreshListing().then(() => { if (live.current) setRefreshWarning(false); }).catch(() => { if (live.current) setRefreshWarning(true); })}>Retry listing readiness</Btn></div> : null}
    {state ? <>
      <div className={styles.meta}><span>{state.generation_status === "ai_draft" ? "AI-assisted wording" : state.generation_status === "source_based" ? "Source-based fallback" : state.generation_status === "manual_upload" ? "Uploaded document" : "Draft not generated"}</span><span>{state.current_draft ? `Saved draft v${state.current_draft.version}` : state.current_approved ? `Reviewed version v${state.current_approved.version}` : "No saved version"}</span>{state.auto_refresh ? <span>Automatic refresh enabled for saved listing and file changes</span> : null}</div>
      {!state.managed && state.current_approved?.source === "uploaded" ? <p className={styles.note}>The existing uploaded PPM remains in use. Create an AI PPM draft to start the managed drafting workflow; the new draft will require review.</p> : <p className={styles.note}>Saved source changes prepare a new draft. Approved PDF versions remain unchanged in history; refreshed drafts are not automatically approved or published.</p>}
      {conflict ? <div className={styles.warning} role="status"><strong>Saved facts or another PPM version changed.</strong> Your edits are retained. Load the latest draft, or explicitly apply only your changed fields to its current facts.<div className={styles.actions}><Btn size="sm" disabled={ppm.busy} onClick={() => { adopt(state); setFailed(null); setError(""); }}>Discard edits and load latest</Btn>{dirty ? <Btn size="sm" disabled={ppm.busy || !canEdit || !version || version.stale || version.source_fingerprint !== state.source_fingerprint} onClick={() => save(true)}>Apply my edits to latest facts</Btn> : null}</div></div> : null}
      {state.missing.length ? <section aria-label="PPM facts still needed" className={styles.missing}><h3>Still needed in the saved draft</h3><p className={styles.note}>Save edited details to update these checks. Canonical financing figures are changed in their owning workspace.</p><ul>{state.missing.map(item => { const issue = ppmMissingIssue(item, Boolean(listing.profile_id)), legalKey = ppmMissingLegalKey(item, state.legal_fields); return <li key={`${item.section}:${item.key}`}><span>{item.label}{!item.required ? " · suggested" : ""}</span>{legalKey ? <Btn size="sm" onClick={() => { const control = document.getElementById(ppmLegalId(legalKey)); control?.scrollIntoView({ block: "center", behavior: "smooth" }); control?.focus({ preventScroll: true }); }}>Complete {state.legal_fields.find(field => field.key === legalKey)?.label}</Btn> : issue ? <Btn size="sm" onClick={() => onFix(issue)}>{issue.actionLabel}</Btn> : null}</li>; })}</ul></section> : null}
      {state.warnings.length ? <details><summary>Drafting notes · {state.warnings.length}</summary><ul className={styles.notes}>{state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
      <div className={styles.actions}>{canEdit ? <Btn variant="pri" disabled={ppm.busy || ppm.isError || dirty} onClick={() => generate(true)}>{ppm.busy && action === "generate" ? "Preparing PPM draft…" : !state.managed ? "Create AI PPM draft" : "Regenerate AI wording"}</Btn> : null}{version ? <Btn disabled={links.busy} onClick={() => download(version)}>Download {version.status === "approved" ? "reviewed PPM" : "saved draft"} v{version.version}</Btn> : null}{state.current_approved && state.current_approved.document_id !== version?.document_id ? <Btn disabled={links.busy} onClick={() => download(state.current_approved!)}>Download reviewed PPM v{state.current_approved.version}{state.current_approved.stale ? " · historical" : ""}</Btn> : null}</div>
      {dirty ? <p className={styles.note}>Unsaved wording is retained when you switch listing tabs. Downloads use the saved version. Save or discard your wording before regenerating.</p> : null}
      {edit && version && state.managed ? <>
        {version.source === "uploaded" ? <p className={styles.note}>Uploaded PDF content stays unchanged. The fields below bind its review to the saved offering facts.</p> : null}
        <section className={styles.section} aria-label="PPM offering legal details"><h3>Offering legal details</h3><p className={styles.note}>Use confirmed offering information. Unknown exemption and jurisdiction remain missing until you enter them.</p><div className={styles.fields}>{state.legal_fields.map(field => { const required = field.required || state.missing.some(item => item.required && ppmMissingLegalKey(item, state.legal_fields) === field.key); return <label key={field.key} className={styles.field}>{field.label}{required ? " *" : ""}<Textarea id={ppmLegalId(field.key)} aria-label={`PPM ${field.label}`} aria-required={required} rows={2} maxLength={12000} value={edit.legalInputs[field.key] ?? ""} disabled={editingDisabled} onChange={event => patchEdit("legalInputs", field.key, event.target.value)} /></label>; })}</div></section>
        {version.source === "generated_ppm" ? <details><summary>Edit PPM wording</summary><div className={styles.wording}>{state.narrative_fields.map(field => <label key={field.key} className={styles.field}>{field.label}<Textarea aria-label={`PPM wording: ${field.label}`} rows={5} value={Object.hasOwn(edit.narrativeSections, field.key) ? edit.narrativeSections[field.key] : version.ai_sections?.[field.key] ?? ""} disabled={editingDisabled} onChange={event => patchEdit("narrativeSections", field.key, event.target.value)} /><span className={styles.note}>{Object.hasOwn(edit.narrativeSections, field.key) ? "Your wording · preserved on source refresh" : "AI / source suggestion · edit to customize"}</span>{Object.hasOwn(edit.narrativeSections, field.key) ? <Btn size="sm" disabled={editingDisabled} onClick={() => patchEdit("narrativeSections", field.key)}>Restore suggested wording</Btn> : null}</label>)}</div></details> : null}
        <div className={styles.actions}>{canEdit ? <Btn variant="pri" disabled={ppm.busy || ppm.isError || !dirty || conflict} onClick={() => save()}>{ppm.busy && action === "draft" ? "Saving draft…" : "Save PPM draft"}</Btn> : null}{dirty ? <Btn disabled={ppm.busy} onClick={() => { adopt(state); setFailed(null); setError(""); }}>Discard PPM edits</Btn> : null}</div>
        <SavedPreview version={version} />
      </> : null}
      {!legacy ? <section className={styles.review} aria-label="Staff PPM review"><h3>Review the saved PPM</h3>{currentApproved && !state.current_draft ? <p className={styles.notice}>Current PPM v{state.current_approved?.version} reviewed · {date(state.current_approved?.reviewed_at)}</p> : <p className={styles.note}>{dirty ? "Save your edits before review." : state.missing.some(item => item.required) ? "Complete and save the required facts before approval." : conflict ? "Load or update the current saved draft before review." : "Approval applies only to this saved version and its current source facts."}</p>}<label className={styles.field}>Review reason · at least 3 characters<Input aria-label="PPM review reason" value={reason} maxLength={2000} disabled={!canEdit || ppm.busy} onChange={event => setReason(event.target.value)} /></label><label className={styles.check}><input type="checkbox" aria-label="I reviewed the current saved PPM" checked={confirmed} disabled={!canEdit || ppm.busy || !ppmCanReview(state, dirty, conflict)} onChange={event => setConfirmed(event.target.checked)} />I reviewed saved PPM v{state.current_draft?.version ?? "—"} against the current offering facts.</label><div><Btn variant="pri" disabled={!canEdit || ppm.busy || ppm.isError || !ppmCanReview(state, dirty, conflict) || !confirmed || reason.trim().length < 3} onClick={approve}>{ppm.busy && action === "review" ? "Approving…" : "Approve current PPM"}</Btn></div></section> : null}
      {state.history.length ? <details><summary>PPM version history · {state.history.length}</summary><ul className={styles.history}>{state.history.map(saved => <li key={saved.document_id}><span>v{saved.version} · {saved.status}{saved.stale ? " · source changed" : ""} · {date(saved.created_at)}</span><Btn size="sm" disabled={links.busy} onClick={() => download(saved)}>Download PPM v{saved.version}</Btn></li>)}</ul></details> : null}
    </> : null}
  </section>;
}
