"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, CellChip, Input, Select, Textarea } from "@/components/ds";
import { useMarketplacePpm } from "@/hooks/useMarketplacePpm";
import { useMarketplaceDocumentLink } from "@/hooks/useMarketplaceDocumentLink";
import type { CpListing } from "@/hooks/useCapitalPartners";
import { ppmApplyEditsToLatest, ppmApprovalValues, ppmCanReview, ppmChoosePreset, ppmConflict, ppmContentKey, ppmDirty, ppmEdit, ppmEditableVersion, ppmIsLegacy, ppmLegalFieldState, ppmLegalId, ppmMissingIssue, ppmMissingLegalKey, ppmNeedsPreparation, ppmSelectedPreset, ppmSetLegalText, type MarketplacePpm, type PpmEdit, type PpmGenerate, type PpmLegalField, type PpmMissing, type PpmReview, type PpmSave, type PpmVersion } from "@/lib/marketplacePpm";
import type { MarketplaceIssue } from "@/lib/marketplaceIssues";
import { focusMarketplaceControl } from "@/lib/marketplaceGuidanceFocus";
import { MarketplaceMembershipPolicySummary } from "./MarketplaceMembershipPolicy";
import styles from "./MarketplacePpmWorkspace.module.css";

type Action = "generate" | "draft" | "review";
type Payload = PpmGenerate | PpmSave | PpmReview;
type Attempt = { action: Action; payload: Payload; submitted?: PpmEdit | null; localAtStart?: PpmEdit | null };
const sameWords = (a: PpmEdit | null, b: PpmEdit | null) => ppmContentKey(a) === ppmContentKey(b);
const refreshKey = (state: MarketplacePpm) => `${state.source_fingerprint}:${state.draft_upgrade_available ? `upgrade-${ppmEditableVersion(state)?.version ?? 0}` : "source"}:${state.missing.some(item => item.required && item.section === "snapshot") ? "snapshot" : "current"}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

function SavedPreview({ version }: { version: PpmVersion }) {
  return <details className={styles.preview}><summary>Saved PPM preview · v{version.version}</summary><p className={styles.note}>This preview and the PDF use the saved version. Save your edits to include them.</p>{version.document?.sections?.map(section => <section key={section.key} className={styles.section}><h4>{section.title}</h4>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.facts.length ? <dl className={styles.facts}>{section.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.note ? <small>{fact.note}</small> : null}</dd></div>)}</dl> : null}{section.table ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${section.title} saved facts`}><table><thead><tr>{section.table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}</section>)}</details>;
}

function SavedSummary({ version, fields }: { version: PpmVersion; fields: PpmLegalField[] }) {
  const financing = version.document?.sections?.find(section => section.key === "terms");
  const details = (items: PpmLegalField[]) => <dl className={styles.summary}>{items.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{version.legal_inputs[field.key]?.trim() || "Not recorded"}</dd></div>)}</dl>;
  return <>
    {financing?.facts.length ? <section className={styles.section} aria-label="Saved financing facts"><h4>Saved financing</h4><dl className={styles.facts}>{financing.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.note ? <small>{fact.note}</small> : null}</dd></div>)}</dl></section> : null}
    <details className={styles.disclosures}><summary>Saved legal disclosures</summary>{details(fields)}</details>
  </>;
}

function LegalField({ field, edit, required, invalid, needsSave, disabled, onPreset, onText }: { field: PpmLegalField; edit: PpmEdit; required: boolean; invalid: boolean; needsSave: boolean; disabled: boolean; onPreset: (field: PpmLegalField, key: string) => void; onText: (key: string, text: string) => void }) {
  const id = ppmLegalId(field.key), selected = ppmSelectedPreset(field, edit);
  const option = field.options?.find(item => item.key === selected);
  const locked = disabled || field.read_only;
  const describedBy = `${id}-help${invalid ? ` ${id}-required` : ""}`;
  return <fieldset className={`${styles.legalField} ${invalid ? styles.requiredField : ""}`}><legend>{field.label}{invalid ? <span className={styles.requiredBadge}>Required</span> : null}</legend>
    {field.options?.length ? <label className={styles.field}>Draft choice<Select id={`${id}-preset`} aria-label={`PPM ${field.label} preset`} aria-required={required} aria-invalid={invalid || undefined} aria-describedby={describedBy} value={selected} disabled={locked} onChange={event => onPreset(field, event.target.value)}><option value="" disabled>Choose draft wording</option>{field.options.filter(item => item.key !== "custom").map(item => <option key={item.key} value={item.key}>{item.label}</option>)}<option value="custom">Custom wording</option></Select></label> : null}
    <label className={styles.field} htmlFor={id}>{field.options?.length ? "Draft wording · editable" : field.label}</label>
    <Textarea id={id} aria-label={`PPM ${field.label}`} aria-required={required} aria-invalid={invalid || undefined} aria-describedby={describedBy} rows={3} maxLength={12000} value={edit.legalInputs[field.key] ?? ""} disabled={locked} onChange={event => onText(field.key, event.target.value)} />
    {invalid ? <p id={`${id}-required`} className={styles.requiredText}>Required — choose confirmed wording or enter the missing detail.</p> : needsSave ? <p className={styles.note}>Save to update checks.</p> : null}
    <div id={`${id}-help`} className={styles.note}>{field.help ? <p>{field.help}</p> : null}{selected === "custom" ? <p>Custom wording is kept when saved facts change.</p> : option && !option.unresolved ? <p>Draft wording — edit it to customize.</p> : null}</div>
  </fieldset>;
}

type WorkspaceProps = { listing: CpListing; active: boolean; onFix: (issue: MarketplaceIssue) => void; onApproved: () => void; onPublish?: () => void; publishBusy?: boolean; onReadinessPending?: (pending: boolean) => void; onOwnsPpmIssues?: (owns: boolean) => void };

export function MarketplacePpmWorkspace(props: WorkspaceProps) {
  const ppm = useMarketplacePpm(props.listing.id, props.active);
  return <PpmWorkspace key={ppm.scope} {...props} ppm={ppm} />;
}

function PpmWorkspace({ listing, active, onFix, onApproved, onPublish, publishBusy = false, onReadinessPending, onOwnsPpmIssues, ppm }: WorkspaceProps & { ppm: ReturnType<typeof useMarketplacePpm> }) {
  const state = ppm.data, version = ppmEditableVersion(state);
  const links = useMarketplaceDocumentLink(`ppm:${listing.id}`);
  const [base, setBase] = useState<PpmEdit | null>(null), [edit, setEdit] = useState<PpmEdit | null>(null);
  const baseRef = useRef(base), editRef = useRef(edit), dirtyRef = useRef(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState(false), [refreshingListing, setRefreshingListing] = useState(false);
  const [reason, setReason] = useState(""), [mode, setMode] = useState<"review" | "edit">("review");
  const [visibleFieldKeys, setVisibleFieldKeys] = useState<string[]>([]), [showAllFields, setShowAllFields] = useState(false);
  const [focusField, setFocusField] = useState<{ key: string; sequence: number } | null>(null);
  const approvalRefresh = useRef(false);
  const [action, setAction] = useState<Action | null>(null), [failed, setFailed] = useState<Attempt | null>(null);
  const operation = useRef(false), keys = useRef(new Map<string, string>()), autoTried = useRef(new Set<string>());
  const live = useRef(true); useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  const canEdit = ppm.allowed && !["repaid", "withdrawn"].includes(listing.status);
  const dirty = ppmDirty(edit, base), conflict = ppmConflict(edit, state);
  dirtyRef.current = dirty; baseRef.current = base; editRef.current = edit;
  const adopt = (next: MarketplacePpm) => {
    const current = ppmEditableVersion(next), copy = current ? ppmEdit(current) : null;
    baseRef.current = copy; editRef.current = copy; dirtyRef.current = false;
    setBase(copy); setEdit(copy);
  };
  const adoptRef = useRef(adopt); adoptRef.current = adopt;
  useEffect(() => { if (state && !dirtyRef.current) adoptRef.current(state); }, [state]);
  useEffect(() => {
    if (!active || mode !== "edit" || !focusField) return;
    return focusMarketplaceControl(() => document.getElementById(`${ppmLegalId(focusField.key)}-preset`) ?? document.getElementById(ppmLegalId(focusField.key)), styles.highlight);
  }, [active, mode, focusField]);
  useEffect(() => { onReadinessPending?.(ppm.busy || refreshingListing || refreshWarning); }, [ppm.busy, refreshingListing, refreshWarning, onReadinessPending]);
  useEffect(() => () => onReadinessPending?.(false), [onReadinessPending]);
  useEffect(() => { onOwnsPpmIssues?.(active && Boolean(state) && !ppm.isError); }, [active, state, ppm.isError, onOwnsPpmIssues]);
  useEffect(() => () => onOwnsPpmIssues?.(false), [onOwnsPpmIssues]);
  const openEditor = (key?: string) => {
    if (state && editRef.current) {
      const attention = state.legal_fields.filter(field => { const result = ppmLegalFieldState(field, editRef.current!, state.missing, baseRef.current); return result.invalid || result.needsSave; }).map(field => field.key);
      setVisibleFieldKeys(current => [...new Set([...(mode === "edit" || dirtyRef.current ? current : []), ...attention, ...(key ? [key] : [])])]);
    }
    if (mode !== "edit" && !dirtyRef.current) setShowAllFields(false);
    setMode("edit"); if (key) setFocusField(current => ({ key, sequence: (current?.sequence ?? 0) + 1 }));
  };
  const lastInput = useRef(listing.updated_at), wasActive = useRef(false);
  const refetchPpm = ppm.refetch;
  useEffect(() => {
    if (active && wasActive.current && lastInput.current !== listing.updated_at && !ppm.busy) void refetchPpm();
    lastInput.current = listing.updated_at; wasActive.current = active;
  }, [active, listing.updated_at, refetchPpm, ppm.busy]);
  const patchEdit = (kind: "legalInputs" | "narrativeSections", key: string, value?: string) => {
    const current = editRef.current;
    if (!current || !canEdit || ppm.busy && action !== "generate") return;
    const fields = { ...current[kind] }; if (value === undefined) delete fields[key]; else fields[key] = value;
    const next = kind === "legalInputs" && value !== undefined ? ppmSetLegalText(current, key, value) : { ...current, [kind]: fields }; editRef.current = next; dirtyRef.current = ppmDirty(next, baseRef.current); setEdit(next); setNotice(""); setFailed(null); setError("");
  };
  const choosePreset = (field: PpmLegalField, key: string) => {
    const current = editRef.current;
    if (!current || !canEdit || field.read_only || ppm.busy && action !== "generate") return;
    const next = ppmChoosePreset(current, field, key);
    editRef.current = next; dirtyRef.current = ppmDirty(next, baseRef.current); setEdit(next); setNotice(""); setFailed(null); setError("");
  };
  const payload = <T extends Record<string, unknown>>(actionName: Action, values: T) => {
    const signature = JSON.stringify({ actionName, values });
    if (!keys.current.has(signature)) keys.current.set(signature, crypto.randomUUID());
    return { ...values, idempotency_key: keys.current.get(signature)! };
  };
  const perform = async (attempt: Attempt) => {
    if (operation.current || !canEdit) return;
    operation.current = true; setAction(attempt.action); setError(""); setNotice(""); setFailed(null); setRefreshWarning(false); setRefreshingListing(true);
    try {
      const next = attempt.action === "generate" ? await ppm.prepare(attempt.payload as PpmGenerate, Boolean(listing.profile_id)) : await ppm.mutate(attempt.action, attempt.payload);
      if (!next || !live.current) return;
      for (const [signature, key] of keys.current) if (key === attempt.payload.idempotency_key) keys.current.delete(signature);
      const originalEdits = attempt.localAtStart ?? attempt.submitted;
      if (attempt.action === "draft" && originalEdits && editRef.current && !sameWords(editRef.current, originalEdits)) {
        const saved = ppmEditableVersion(next);
        if (saved) { const freshBase = ppmEdit(saved), kept = ppmApplyEditsToLatest(originalEdits, editRef.current, saved); baseRef.current = freshBase; editRef.current = kept; dirtyRef.current = ppmDirty(kept, freshBase); setBase(freshBase); setEdit(kept); }
        setNotice("The submitted draft was saved. Your newer wording is retained and still needs Save draft.");
      } else if (attempt.action !== "generate" || !dirtyRef.current) adopt(next);
      if (attempt.action === "review") { setReason(""); setMode("review"); approvalRefresh.current = true; setNotice("The current PPM was reviewed and approved. Publish offer remains a separate action."); }
      else if (attempt.action === "draft") { if (!dirtyRef.current) setMode("review"); setNotice(current => current || "PPM draft saved. Review this saved version before approval."); }
      else setNotice(dirtyRef.current ? "Latest saved figures and PPM are prepared. Your edits are kept; save them before approval." : "Latest saved figures and PPM are prepared. Review and approve when ready.");
      try { await ppm.refreshListing(); if (live.current && approvalRefresh.current) { approvalRefresh.current = false; onApproved(); } }
      catch { if (live.current) setRefreshWarning(true); }
    } catch (error) {
      if (!live.current) return;
      const code = (error as { body?: { detail?: { code?: string } } } | null)?.body?.detail?.code;
      setError(code === "ppm_source_changed" ? "The file changed again during preparation. Finish saving the file, then choose Prepare latest offer." : error instanceof Error ? error.message : "The PPM operation could not be completed. Your edits are retained."); setFailed(attempt);
      if (attempt.action === "review") {
        const recovered = (await ppm.refetch()).data;
        if (live.current && recovered?.current_approved && !recovered.current_draft && !recovered.current_approved.stale && recovered.current_approved.source_fingerprint === recovered.source_fingerprint) {
          approvalRefresh.current = true; setRefreshWarning(true);
        }
      } else void ppm.refetch();
    } finally { operation.current = false; if (live.current) { setAction(null); setRefreshingListing(false); } }
  };
  const generate = (force = false) => {
    if (!state || !canEdit || force && dirtyRef.current) return;
    autoTried.current.add(refreshKey(state));
    void perform({ action: "generate", payload: payload("generate", { expected_source_fingerprint: state.source_fingerprint, force, auto_refresh: true }) });
  };
  const generateRef = useRef(generate); generateRef.current = generate;
  useEffect(() => {
    if (active && canEdit && listing.status === "draft" && state && !ppm.busy && !ppm.isFetching && !ppm.isError && !failed && ppmNeedsPreparation(state) && !autoTried.current.has(refreshKey(state))) generateRef.current();
  }, [active, canEdit, listing.status, state, ppm.busy, ppm.isFetching, ppm.isError, failed]);
  const save = (applyToLatest = false) => {
    if (!editRef.current || !state || !version || !canEdit) return;
    const submitted = applyToLatest && baseRef.current ? ppmApplyEditsToLatest(baseRef.current, editRef.current, version) : editRef.current;
    void perform({ action: "draft", submitted, localAtStart: editRef.current, payload: payload("draft", { expected_version: submitted.version, expected_source_fingerprint: submitted.sourceFingerprint, legal_inputs: submitted.legalInputs, legal_presets: submitted.legalPresets, narrative_sections: submitted.narrativeSections }) });
  };
  const approve = () => {
    const values = ppmApprovalValues(state, dirty, conflict, reason);
    if (!values) return;
    void perform({ action: "review", payload: payload("review", values) });
  };
  const retryListing = async () => {
    setRefreshingListing(true);
    try { await ppm.refreshListing(); if (live.current) { setRefreshWarning(false); if (approvalRefresh.current) { approvalRefresh.current = false; setError(""); setFailed(null); onApproved(); } } }
    catch { if (live.current) setRefreshWarning(true); }
    finally { if (live.current) setRefreshingListing(false); }
  };
  const reloadStatus = async (reviewLatest = false) => {
    const result = await ppm.refetch();
    if (live.current && result.isSuccess && result.data) {
      setError(""); setFailed(null);
      if (!dirtyRef.current) { adopt(result.data); if (reviewLatest) setMode("review"); }
    }
  };
  const download = (saved: PpmVersion) => { setError(""); void links.open(`/capital/admin/listings/${listing.id}/ppm/versions/${saved.document_id}/url?download=true`).catch(error => { if (live.current) setError(error instanceof Error ? error.message : "The saved PPM could not be downloaded."); }); };
  const editingDisabled = !canEdit || ppm.busy && action !== "generate";
  const legacy = ppmIsLegacy(state);
  const needsPreparation = Boolean(state && ppmNeedsPreparation(state));
  const currentApproved = state?.current_approved && !state.current_approved.stale && state.current_approved.source_fingerprint === state.source_fingerprint;
  const fieldStates = new Map(state?.legal_fields.map(field => [field.key, edit ? ppmLegalFieldState(field, edit, state.missing, base) : { required: field.required, invalid: false, needsSave: false }]) ?? []);
  const requiredItems: PpmMissing[] = state?.missing.filter(item => item.required && item.section !== "snapshot") ?? [];
  for (const field of state?.legal_fields ?? []) {
    if (fieldStates.get(field.key)?.invalid && !requiredItems.some(item => ppmMissingLegalKey(item, state?.legal_fields ?? []) === field.key)) requiredItems.push({ key: field.key, label: field.label, section: "legal", required: true });
  }
  const fixRequired = (item: PpmMissing) => {
    if (!state) return;
    const key = ppmMissingLegalKey(item, state.legal_fields), issue = ppmMissingIssue(item, Boolean(listing.profile_id));
    if (key) openEditor(key); else if (issue) onFix(issue);
  };
  const recoverReadiness = () => { if (failed?.action === "review" && currentApproved && !state?.current_draft) approvalRefresh.current = true; void retryListing(); };
  const failedOutdated = Boolean(failed && state && (failed.payload.expected_source_fingerprint !== state.source_fingerprint || "expected_version" in failed.payload && failed.payload.expected_version !== version?.version));
  const primary = () => {
    if (ppm.busy || refreshingListing || publishBusy) return <Btn variant="pri" disabled>{publishBusy ? "Publishing offer…" : ppm.busy && action === "review" ? "Approving…" : ppm.busy && action === "draft" ? "Saving draft…" : ppm.busy ? "Preparing latest offer…" : "Checking listing readiness…"}</Btn>;
    if (ppm.isError) return <Btn variant="pri" onClick={() => void reloadStatus()}>Retry PPM status</Btn>;
    if (refreshWarning || failed?.action === "review" && currentApproved && !state?.current_draft) return <Btn variant="pri" onClick={recoverReadiness}>Retry listing readiness</Btn>;
    if (state && needsPreparation) return <Btn variant="pri" disabled={!canEdit} onClick={() => generate()}>Prepare latest offer</Btn>;
    if (error && failed?.action === "generate" && !failedOutdated) return <Btn variant="pri" disabled={!canEdit} onClick={() => void perform(failed)}>Prepare latest offer</Btn>;
    if (conflict) return dirty && version && !version.stale && version.source_fingerprint === state?.source_fingerprint ? <Btn variant="pri" disabled={!canEdit} onClick={() => save(true)}>Apply my edits to latest facts</Btn> : <Btn variant="pri" onClick={() => void reloadStatus(true)}>Review latest PPM</Btn>;
    if (failedOutdated) return failed?.action === "generate" ? <Btn variant="pri" disabled={!canEdit} onClick={() => generate()}>Prepare latest offer</Btn> : <Btn variant="pri" onClick={() => void reloadStatus(true)}>Review latest PPM</Btn>;
    if (error && failed) return <Btn variant="pri" disabled={!canEdit || failed.action === "review" && !ppmCanReview(state, dirty, conflict)} onClick={() => void perform(failed)}>Retry previous {failed.action === "draft" ? "save" : failed.action === "review" ? "review" : "generation"}</Btn>;
    if (error) return <Btn variant="pri" onClick={() => void reloadStatus()}>Reload PPM status</Btn>;
    if (!state) return null;
    if (mode === "edit") return dirty ? <Btn variant="pri" disabled={!canEdit} onClick={() => save()}>Save and review</Btn> : <Btn variant="pri" onClick={() => setMode("review")}>Review saved PPM</Btn>;
    if (dirty) return <Btn variant="pri" onClick={() => openEditor()}>Back to edits</Btn>;
    if (!version) return <Btn variant="pri" disabled={!canEdit} onClick={() => generate()}>Prepare latest offer</Btn>;
    if (requiredItems.length && !legacy) return <Btn variant="pri" disabled={!canEdit} onClick={() => fixRequired(requiredItems[0])}>Fix required items</Btn>;
    if (!legacy && (!currentApproved || state.current_draft)) return <Btn variant="pri" disabled={!canEdit || !ppmApprovalValues(state, dirty, conflict, reason)} onClick={approve}>Approve current PPM</Btn>;
    return onPublish && listing.status === "draft" ? <Btn variant="pri" disabled={!canEdit} onClick={onPublish}>Publish offer</Btn> : null;
  };
  return <section id="marketplace-ppm-workspace" tabIndex={-1} className={styles.root} aria-label="PPM draft and review">
    <header className={styles.header}><div><h2 id="marketplace-ppm-heading" tabIndex={-1}>Private placement memorandum</h2><p className={styles.note}>{version ? `${version.status === "approved" ? "Reviewed version" : "Saved draft"} v${version.version}` : "Preparing your saved offering facts"}</p></div>{state ? <CellChip tone={legacy || currentApproved && !state.current_draft && !needsPreparation ? "ok" : requiredItems.length ? "bad" : "warn"}>{legacy ? "Uploaded PPM" : currentApproved && !state.current_draft && !needsPreparation ? "Approved" : requiredItems.length ? "Required items missing" : needsPreparation ? "Preparing latest saved file" : "Ready for review"}</CellChip> : null}</header>
    {ppm.isPending && !state ? <p role="status">Loading PPM…</p> : null}
    {ppm.isError ? <p className={styles.warning} role="alert">The PPM could not be loaded. Try again.</p> : null}
    {error ? <div className={styles.warning} role="alert">{error}</div> : null}
    {refreshWarning ? <p className={styles.warning} role="alert">Check listing readiness before publishing.</p> : null}
    {conflict && dirty ? <div className={styles.warning} role="status"><strong>Saved facts or another PPM version changed.</strong><p>Your edits are kept. Apply them to the latest facts, or discard them.</p><Btn size="sm" disabled={ppm.busy} onClick={() => { adopt(state!); setFailed(null); setError(""); }}>Discard edits and load latest</Btn></div> : null}
    {requiredItems.length && !legacy ? <section aria-label="PPM facts still needed" className={styles.missing}><h3>Finish these required items</h3><ul>{requiredItems.map(item => { const key = ppmMissingLegalKey(item, state?.legal_fields ?? []), issue = ppmMissingIssue(item, Boolean(listing.profile_id)); return <li key={`${item.section}:${item.key}`}><div><strong>{item.label}</strong>{key && fieldStates.get(key)?.needsSave ? <p className={styles.note}>Save to update checks.</p> : null}</div>{key ? <Btn size="sm" onClick={() => openEditor(key)}>Complete {state?.legal_fields.find(field => field.key === key)?.label}</Btn> : issue ? <Btn size="sm" onClick={() => onFix(issue)}>{issue.actionLabel}</Btn> : null}</li>; })}</ul></section> : null}
    <div className={styles.nextAction}>{primary()}{state?.managed && canEdit && mode === "review" && !dirty ? <Btn disabled={ppm.busy && action !== "generate"} onClick={() => openEditor()}>Back to edits</Btn> : mode === "edit" && dirty ? <Btn disabled={ppm.busy} onClick={() => setMode("review")}>Review saved PPM</Btn> : null}</div>
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {dirty ? <p className={styles.note}>Unsaved edits are kept. Save them before approval.</p> : null}
    {state && version && mode === "edit" && edit ? <section className={styles.editing} aria-label="Edit PPM draft">
      <h3>Complete the required details</h3>
      <section className={styles.section} aria-label="PPM offering legal details"><div className={styles.fields}>{state.legal_fields.filter(field => showAllFields || visibleFieldKeys.includes(field.key)).map(field => { const status = fieldStates.get(field.key)!; return <LegalField key={field.key} field={field} edit={edit} {...status} disabled={editingDisabled} onPreset={choosePreset} onText={(key, text) => patchEdit("legalInputs", key, text)} />; })}</div>
      {!showAllFields && !visibleFieldKeys.length ? <p className={styles.note}>No required details need editing. You can review all saved disclosures below.</p> : null}
      <div><Btn size="sm" onClick={() => setShowAllFields(value => !value)}>{showAllFields ? "Show required items only" : "Show all disclosure fields"}</Btn></div></section>
      {version.source === "generated_ppm" ? <details><summary>Edit PPM wording</summary><div className={styles.wording}>{state.narrative_fields.map(field => <label key={field.key} className={styles.field}>{field.label}<Textarea aria-label={`PPM wording: ${field.label}`} rows={5} value={Object.hasOwn(edit.narrativeSections, field.key) ? edit.narrativeSections[field.key] : version.ai_sections?.[field.key] ?? ""} disabled={editingDisabled} onChange={event => patchEdit("narrativeSections", field.key, event.target.value)} />{Object.hasOwn(edit.narrativeSections, field.key) ? <Btn size="sm" disabled={editingDisabled} onClick={() => patchEdit("narrativeSections", field.key)}>Restore suggested wording</Btn> : null}</label>)}</div></details> : null}
      {dirty ? <div><Btn disabled={ppm.busy} onClick={() => { adopt(state); setFailed(null); setError(""); }}>Discard PPM edits</Btn></div> : null}
    </section> : null}
    {state && version && mode === "review" ? <section className={styles.review} aria-label="Review saved PPM"><h3>Review saved PPM · v{version.version}</h3>
      {ppm.busy && action === "generate" ? <p className={styles.note} role="status">Preparing updated draft… The saved version remains visible.</p> : null}
      <SavedSummary version={version} fields={state.legal_fields} />
      <SavedPreview version={version} />
      {currentApproved && !state.current_draft ? <p className={styles.notice}>Current PPM v{version.version} approved. Publish when ready.</p> : null}
      {!legacy && (!currentApproved || state.current_draft) ? <details className={styles.optionalNote}><summary>Add review note (optional)</summary><label className={styles.field}>Review note<Input aria-label="PPM review note (optional)" value={reason} maxLength={2000} disabled={!canEdit || ppm.busy} onChange={event => { setReason(event.target.value); setFailed(null); setError(""); }} /></label></details> : null}
    </section> : null}
    {state ? <details className={styles.options}><summary>PPM details and history</summary><div className={styles.optionBody}>
      <p className={styles.note}>{state.generation_status === "ai_draft" ? "AI-assisted wording" : state.generation_status === "source_based" ? "Source-based draft" : state.generation_status === "manual_upload" ? "Uploaded document" : "Not generated"}{state.auto_refresh ? " · Updates from saved listing and file changes" : ""}</p>
      {legacy ? <p className={styles.note}>Your uploaded PPM remains in use until you explicitly create and approve a replacement.</p> : null}
      <div className={styles.actions}>{canEdit ? <Btn disabled={ppm.busy || ppm.isError || dirty} onClick={() => generate(true)}>{!state.managed ? "Create AI PPM draft" : "Regenerate AI wording"}</Btn> : null}{version ? <Btn disabled={links.busy} onClick={() => download(version)}>Download {version.status === "approved" ? "reviewed PPM" : "saved draft"} v{version.version}</Btn> : null}{state.current_approved && state.current_approved.document_id !== version?.document_id ? <Btn disabled={links.busy} onClick={() => download(state.current_approved!)}>Download reviewed PPM v{state.current_approved.version}{state.current_approved.stale ? " · historical" : ""}</Btn> : null}</div>
      {state.membership_policy ? <MarketplaceMembershipPolicySummary policy={state.membership_policy} showMemberLink compact /> : null}
      {state.missing.some(item => !item.required) ? <ul className={styles.notes}>{state.missing.filter(item => !item.required).map(item => <li key={`${item.section}:${item.key}`}>{item.label}</li>)}</ul> : null}
      {state.warnings.length ? <ul className={styles.notes}>{state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
      {state.history.length ? <><h4>PPM version history · {state.history.length}</h4><ul className={styles.history}>{state.history.map(saved => <li key={saved.document_id}><span>v{saved.version} · {saved.status}{saved.stale ? " · source changed" : ""} · {date(saved.created_at)}</span><Btn size="sm" disabled={links.busy} onClick={() => download(saved)}>Download PPM v{saved.version}</Btn></li>)}</ul></> : null}
    </div></details> : null}
  </section>;
}
