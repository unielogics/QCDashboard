"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, CellChip, Input, Select, Textarea } from "@/components/ds";
import { useMarketplacePpm } from "@/hooks/useMarketplacePpm";
import { useMarketplaceDocumentLink } from "@/hooks/useMarketplaceDocumentLink";
import type { CpListing } from "@/hooks/useCapitalPartners";
import { ppmApplyEditsToLatest, ppmApprovalValues, ppmCanReview, ppmChoosePreset, ppmConflict, ppmContentKey, ppmDirty, ppmEdit, ppmEditableVersion, ppmIsLegacy, ppmLegalId, ppmMissingIssue, ppmMissingLegalKey, ppmNeedsRefresh, ppmSelectedPreset, ppmSetLegalText, type MarketplacePpm, type PpmEdit, type PpmGenerate, type PpmLegalField, type PpmReview, type PpmSave, type PpmVersion } from "@/lib/marketplacePpm";
import type { MarketplaceIssue } from "@/lib/marketplaceIssues";
import { focusMarketplaceControl } from "@/lib/marketplaceGuidanceFocus";
import { MarketplaceMembershipPolicySummary } from "./MarketplaceMembershipPolicy";
import styles from "./MarketplacePpmWorkspace.module.css";

type Action = "generate" | "draft" | "review";
type Payload = PpmGenerate | PpmSave | PpmReview;
type Attempt = { action: Action; payload: Payload; submitted?: PpmEdit | null; localAtStart?: PpmEdit | null };
const sameWords = (a: PpmEdit | null, b: PpmEdit | null) => ppmContentKey(a) === ppmContentKey(b);
const refreshKey = (state: MarketplacePpm) => `${state.source_fingerprint}:${state.draft_upgrade_available ? `upgrade-${ppmEditableVersion(state)?.version ?? 0}` : "source"}`;
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "Not recorded";

function SavedPreview({ version }: { version: PpmVersion }) {
  return <details className={styles.preview}><summary>Saved PPM preview · v{version.version}</summary><p className={styles.note}>This preview and the PDF use the saved version. Save your edits to include them.</p>{version.document?.sections?.map(section => <section key={section.key} className={styles.section}><h4>{section.title}</h4>{section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{section.facts.length ? <dl className={styles.facts}>{section.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.note ? <small>{fact.note}</small> : null}</dd></div>)}</dl> : null}{section.table ? <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={`${section.title} saved facts`}><table><thead><tr>{section.table.columns.map((column, index) => <th key={index}>{column}</th>)}</tr></thead><tbody>{section.table.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : null}</section>)}</details>;
}

function SavedSummary({ version, fields }: { version: PpmVersion; fields: PpmLegalField[] }) {
  const financing = version.document?.sections?.find(section => section.key === "terms");
  const compact = new Set(["issuer_legal_name", "offering_structure", "offering_exemption", "jurisdiction", "offering_currency"]);
  const details = (items: PpmLegalField[]) => <dl className={styles.summary}>{items.map(field => <div key={field.key}><dt>{field.label}</dt><dd>{version.legal_inputs[field.key]?.trim() || "Not recorded"}</dd></div>)}</dl>;
  return <>
    {financing?.facts.length ? <section className={styles.section} aria-label="Saved financing facts"><h4>Saved financing</h4><dl className={styles.facts}>{financing.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}{fact.note ? <small>{fact.note}</small> : null}</dd></div>)}</dl></section> : null}
    {details(fields.filter(field => compact.has(field.key)))}
    {fields.some(field => !compact.has(field.key)) ? <details className={styles.disclosures}><summary>Saved legal disclosures</summary>{details(fields.filter(field => !compact.has(field.key)))}</details> : null}
  </>;
}

function LegalField({ field, edit, required, disabled, onPreset, onText }: { field: PpmLegalField; edit: PpmEdit; required: boolean; disabled: boolean; onPreset: (field: PpmLegalField, key: string) => void; onText: (key: string, text: string) => void }) {
  const id = ppmLegalId(field.key), selected = ppmSelectedPreset(field, edit);
  const option = field.options?.find(item => item.key === selected);
  const locked = disabled || field.read_only;
  return <fieldset className={styles.legalField}><legend>{field.label}{required ? " *" : ""}</legend>
    {field.options?.length ? <label className={styles.field}>Draft choice<Select id={`${id}-preset`} aria-label={`PPM ${field.label} preset`} value={selected} disabled={locked} onChange={event => onPreset(field, event.target.value)}><option value="" disabled>Choose draft wording</option>{field.options.filter(item => item.key !== "custom").map(item => <option key={item.key} value={item.key}>{item.label}</option>)}<option value="custom">Custom wording</option></Select></label> : null}
    <label className={styles.field} htmlFor={id}>{field.options?.length ? "Draft wording · editable" : field.label}</label>
    <Textarea id={id} aria-label={`PPM ${field.label}`} aria-required={required} aria-describedby={`${id}-help`} rows={3} maxLength={12000} value={edit.legalInputs[field.key] ?? ""} disabled={locked} onChange={event => onText(field.key, event.target.value)} />
    <div id={`${id}-help`} className={styles.note}>{field.help ? <p>{field.help}</p> : null}{option?.unresolved ? <p>Confirmation is still needed. This choice does not complete the required fact.</p> : selected === "custom" ? <p>Custom wording · retained when saved sources refresh.</p> : option ? <p>Draft preset · review this wording before approval. Editing it switches to Custom wording.</p> : null}</div>
  </fieldset>;
}

type WorkspaceProps = { listing: CpListing; active: boolean; onFix: (issue: MarketplaceIssue) => void; onApproved: () => void; onPublish?: () => void; publishBusy?: boolean; onReadinessPending?: (pending: boolean) => void };

export function MarketplacePpmWorkspace(props: WorkspaceProps) {
  const ppm = useMarketplacePpm(props.listing.id, props.active);
  return <PpmWorkspace key={ppm.scope} {...props} ppm={ppm} />;
}

function PpmWorkspace({ listing, active, onFix, onApproved, onPublish, publishBusy = false, onReadinessPending, ppm }: WorkspaceProps & { ppm: ReturnType<typeof useMarketplacePpm> }) {
  const state = ppm.data, version = ppmEditableVersion(state);
  const links = useMarketplaceDocumentLink(`ppm:${listing.id}`);
  const [base, setBase] = useState<PpmEdit | null>(null), [edit, setEdit] = useState<PpmEdit | null>(null);
  const baseRef = useRef(base), editRef = useRef(edit), dirtyRef = useRef(false);
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState(false), [refreshingListing, setRefreshingListing] = useState(false);
  const [reason, setReason] = useState(""), [mode, setMode] = useState<"review" | "edit">("review");
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
  const openEditor = (key?: string) => { setMode("edit"); if (key) setFocusField(current => ({ key, sequence: (current?.sequence ?? 0) + 1 })); };
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
    const next = kind === "legalInputs" && value !== undefined ? ppmSetLegalText(current, key, value) : { ...current, [kind]: fields }; editRef.current = next; dirtyRef.current = ppmDirty(next, baseRef.current); setEdit(next); setNotice("");
  };
  const choosePreset = (field: PpmLegalField, key: string) => {
    const current = editRef.current;
    if (!current || !canEdit || field.read_only || ppm.busy && action !== "generate") return;
    const next = ppmChoosePreset(current, field, key);
    editRef.current = next; dirtyRef.current = ppmDirty(next, baseRef.current); setEdit(next); setNotice("");
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
      const next = await ppm.mutate(attempt.action, attempt.payload);
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
      else setNotice(next.generation_status === "ai_draft" ? "AI-assisted draft prepared. Complete and review it before approval." : "Source-based draft prepared. Complete and review it before approval.");
      try { await ppm.refreshListing(); if (live.current && approvalRefresh.current) { approvalRefresh.current = false; onApproved(); } }
      catch { if (live.current) setRefreshWarning(true); }
    } catch (error) {
      if (!live.current) return;
      setError(error instanceof Error ? error.message : "The PPM operation could not be completed. Your edits are retained."); setFailed(attempt);
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
    if (active && canEdit && state && !ppm.busy && !ppm.isFetching && !ppm.isError && ppmNeedsRefresh(state) && !autoTried.current.has(refreshKey(state))) generateRef.current();
  }, [active, canEdit, state, ppm.busy, ppm.isFetching, ppm.isError]);
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
  const download = (saved: PpmVersion) => { setError(""); void links.open(`/capital/admin/listings/${listing.id}/ppm/versions/${saved.document_id}/url?download=true`).catch(error => { if (live.current) setError(error instanceof Error ? error.message : "The saved PPM could not be downloaded."); }); };
  const editingDisabled = !canEdit || ppm.busy && action !== "generate";
  const legacy = ppmIsLegacy(state);
  const currentApproved = state?.current_approved && !state.current_approved.stale && state.current_approved.source_fingerprint === state.source_fingerprint;
  return <section id="marketplace-ppm-workspace" tabIndex={-1} className={styles.root} aria-label="PPM draft and review">
    <header className={styles.header}><div><h2 id="marketplace-ppm-heading" tabIndex={-1}>Private placement memorandum</h2><p className={styles.note}>Review the draft prepared from saved offering facts. Edit only what needs changing, approve the current version, then publish separately.</p></div>{state ? <CellChip tone={currentApproved && state.status === "approved" ? "ok" : "warn"}>{state.managed ? state.status === "approved" ? "Reviewed current PPM" : state.status === "stale" ? "Source changed · review needed" : "Draft · staff review required" : state.current_approved ? "Uploaded PPM · legacy current" : "PPM not drafted"}</CellChip> : null}</header>
    {ppm.isPending && !state ? <p role="status">Loading PPM status…</p> : null}
    {ppm.isError ? <div className={styles.warning} role="alert">PPM status could not be loaded. Existing edits are retained. <Btn size="sm" onClick={() => void ppm.refetch()}>Retry PPM status</Btn></div> : null}
    {error ? <div className={styles.warning} role="alert">{error}{failed ? <Btn size="sm" disabled={ppm.busy || !canEdit || failed.action === "review" && !ppmCanReview(state, dirty, conflict)} onClick={() => void perform(failed)}>Retry previous {failed.action === "draft" ? "save" : failed.action === "review" ? "review" : "generation"}</Btn> : <Btn size="sm" onClick={() => void ppm.refetch()}>Reload PPM status</Btn>}</div> : null}
    {notice ? <p role="status" className={styles.notice}>{notice}</p> : null}
    {refreshWarning ? <div className={styles.warning} role="alert">Refresh listing readiness to check the saved PPM before publishing. This read does not save or approve another version.<Btn size="sm" disabled={refreshingListing} onClick={() => void retryListing()}>Retry listing readiness</Btn></div> : null}
    {state ? <>
      <div className={styles.meta}><span>{state.generation_status === "ai_draft" ? "AI-assisted wording" : state.generation_status === "source_based" ? "Source-based fallback" : state.generation_status === "manual_upload" ? "Uploaded document" : "Draft not generated"}</span><span>{state.current_draft ? `Saved draft v${state.current_draft.version}` : state.current_approved ? `Reviewed version v${state.current_approved.version}` : "No saved version"}</span>{state.auto_refresh ? <span>Automatic refresh enabled for saved listing and file changes</span> : null}</div>
      {!state.managed && state.current_approved?.source === "uploaded" ? <p className={styles.note}>The existing uploaded PPM remains in use. Create an AI PPM draft to start the managed drafting workflow; the new draft will require review.</p> : <p className={styles.note}>Saved source changes prepare a new draft. Approved PDF versions remain unchanged in history; refreshed drafts are not automatically approved or published.</p>}
      {conflict ? <div className={styles.warning} role="status"><strong>Saved facts or another PPM version changed.</strong> Your edits are retained. Load the latest draft, or explicitly apply only your changed fields to its current facts.<div className={styles.actions}><Btn size="sm" disabled={ppm.busy} onClick={() => { adopt(state); setFailed(null); setError(""); }}>Discard edits and load latest</Btn>{dirty ? <Btn size="sm" disabled={ppm.busy || !canEdit || !version || version.stale || version.source_fingerprint !== state.source_fingerprint} onClick={() => save(true)}>Apply my edits to latest facts</Btn> : null}</div></div> : null}
      {state.missing.length ? <section aria-label="PPM facts still needed" className={styles.missing}><h3>Still needed in the saved draft</h3><p className={styles.note}>Save edited details to update these checks. Canonical financing figures are changed in their owning workspace.</p><ul>{state.missing.map(item => { const issue = ppmMissingIssue(item, Boolean(listing.profile_id)), legalKey = ppmMissingLegalKey(item, state.legal_fields); return <li key={`${item.section}:${item.key}`}><span>{item.label}{!item.required ? " · suggested" : ""}</span>{legalKey ? <Btn size="sm" onClick={() => openEditor(legalKey)}>Complete {state.legal_fields.find(field => field.key === legalKey)?.label}</Btn> : issue ? <Btn size="sm" onClick={() => onFix(issue)}>{issue.actionLabel}</Btn> : null}</li>; })}</ul></section> : null}
      {state.warnings.length ? <details><summary>Drafting notes · {state.warnings.length}</summary><ul className={styles.notes}>{state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : null}
      <div className={styles.actions}>{canEdit ? <Btn variant="pri" disabled={ppm.busy || ppm.isError || dirty} onClick={() => generate(true)}>{ppm.busy && action === "generate" ? "Preparing PPM draft…" : !state.managed ? "Create AI PPM draft" : "Regenerate AI wording"}</Btn> : null}{version ? <Btn disabled={links.busy} onClick={() => download(version)}>Download {version.status === "approved" ? "reviewed PPM" : "saved draft"} v{version.version}</Btn> : null}{state.current_approved && state.current_approved.document_id !== version?.document_id ? <Btn disabled={links.busy} onClick={() => download(state.current_approved!)}>Download reviewed PPM v{state.current_approved.version}{state.current_approved.stale ? " · historical" : ""}</Btn> : null}</div>
      {dirty ? <p className={styles.note}>Unsaved wording is retained when you switch listing tabs. Downloads use the saved version. Save or discard your wording before regenerating.</p> : null}
      {edit && version && state.managed && mode === "edit" ? <section className={styles.editing} aria-label="Edit PPM draft">
        <div className={styles.actions}><h3>Edit draft</h3><Btn size="sm" disabled={ppm.busy} onClick={() => setMode("review")}>Review saved PPM</Btn></div>
        {version.source === "uploaded" ? <p className={styles.note}>Uploaded PDF content stays unchanged. The fields below bind its review to the saved offering facts.</p> : null}
        <section className={styles.section} aria-label="PPM offering legal details"><h3>Offering legal details</h3><p className={styles.note}>Start with the draft choices below, then confirm or customize the wording. Membership eligibility follows the platform rules shown here. Governing law remains incomplete until confirmed.</p>
          {state.membership_policy ? <MarketplaceMembershipPolicySummary policy={state.membership_policy} showMemberLink compact /> : <p className={styles.note}>Membership policy was not supplied with this version. <a href="/admin/marketplace/members?tab=members" target="_blank" rel="noopener noreferrer">Review members and eligibility in a new tab</a>.</p>}
          <div className={styles.fields}>{state.legal_fields.map(field => <LegalField key={field.key} field={field} edit={edit} required={field.required || state.missing.some(item => item.required && ppmMissingLegalKey(item, state.legal_fields) === field.key)} disabled={editingDisabled} onPreset={choosePreset} onText={(key, text) => patchEdit("legalInputs", key, text)} />)}</div>
        </section>
        {version.source === "generated_ppm" ? <details><summary>Edit PPM wording</summary><div className={styles.wording}>{state.narrative_fields.map(field => <label key={field.key} className={styles.field}>{field.label}<Textarea aria-label={`PPM wording: ${field.label}`} rows={5} value={Object.hasOwn(edit.narrativeSections, field.key) ? edit.narrativeSections[field.key] : version.ai_sections?.[field.key] ?? ""} disabled={editingDisabled} onChange={event => patchEdit("narrativeSections", field.key, event.target.value)} /><span className={styles.note}>{Object.hasOwn(edit.narrativeSections, field.key) ? "Your wording · preserved on source refresh" : "AI / source suggestion · edit to customize"}</span>{Object.hasOwn(edit.narrativeSections, field.key) ? <Btn size="sm" disabled={editingDisabled} onClick={() => patchEdit("narrativeSections", field.key)}>Restore suggested wording</Btn> : null}</label>)}</div></details> : null}
        <div className={styles.actions}>{canEdit ? <Btn variant="pri" disabled={ppm.busy || ppm.isError || !dirty || conflict} onClick={() => save()}>{ppm.busy && action === "draft" ? "Saving draft…" : "Save and review"}</Btn> : null}{dirty ? <Btn disabled={ppm.busy} onClick={() => { adopt(state); setFailed(null); setError(""); }}>Discard PPM edits</Btn> : null}</div>
      </section> : null}
      {version && mode === "review" ? <section className={styles.review} aria-label="Review saved PPM">
        <div className={styles.header}><div><h3>Review saved PPM · v{version.version}</h3><p className={styles.note}>{version.status === "approved" ? `Reviewed ${date(version.reviewed_at)}` : `Saved ${date(version.created_at)}`} · {listing.ref}</p></div>{state.managed && canEdit ? <Btn disabled={ppm.busy && action !== "generate"} onClick={() => openEditor()}>Back to edits</Btn> : null}</div>
        <p className={styles.note}>{dirty ? "Your unsaved edits are retained. This summary and downloads still show the saved version; save your edits before approval." : conflict || version.stale ? "Saved facts changed. The prior saved content stays visible while a current draft is prepared." : state.draft_upgrade_available ? "Updating this saved draft with the current disclosure choices. Existing custom wording is retained." : legacy ? "The uploaded PPM remains in use. Create an AI PPM draft only if you want to replace it with a managed draft." : "Review the saved details and document below. Approval applies only to this version and its current saved facts."}</p>
        {ppm.busy && action === "generate" ? <p className={styles.note} role="status">Preparing updated draft… The saved version remains visible.</p> : null}
        <SavedSummary version={version} fields={state.legal_fields} />
        {state.membership_policy ? <MarketplaceMembershipPolicySummary policy={state.membership_policy} showMemberLink compact /> : null}
        <SavedPreview version={version} />
        {!legacy && (!currentApproved || state.current_draft) ? <>
          <p className={styles.note}>{dirty ? "Save your edits before approval." : conflict ? "Load or update the current saved draft before approval." : state.draft_upgrade_available || ppmNeedsRefresh(state) ? "Wait for the current saved draft to finish preparing before approval." : state.missing.some(item => item.required) ? "Complete and save the required facts listed above before approval." : "Select Approve current PPM to confirm you reviewed this saved version. Publishing is a separate action."}</p>
          <details className={styles.optionalNote}><summary>Add review note (optional)</summary><label className={styles.field}>Review note<Input aria-label="PPM review note (optional)" value={reason} maxLength={2000} disabled={!canEdit || ppm.busy} onChange={event => setReason(event.target.value)} /></label></details>
          <div className={styles.actions}><Btn variant="pri" disabled={!canEdit || ppm.busy || refreshingListing || ppm.isError || !ppmApprovalValues(state, dirty, conflict, reason)} onClick={approve}>{ppm.busy && action === "review" ? "Approving…" : "Approve current PPM"}</Btn></div>
        </> : currentApproved && !state.current_draft ? <p className={styles.notice}>Current PPM v{version.version} approved. Review the offer and publish when ready.</p> : null}
        {onPublish && listing.status === "draft" && (legacy || currentApproved && !state.current_draft) ? <div className={styles.actions}><Btn variant="pri" disabled={!canEdit || ppm.busy || refreshingListing || refreshWarning || ppm.isError || publishBusy || dirty || conflict} onClick={onPublish}>Publish offer</Btn>{refreshWarning || refreshingListing ? <span className={styles.note}>Refresh listing readiness before publishing.</span> : listing.publish_blockers.length ? <span className={styles.note}>Other offer requirements still need attention. Publish will show the exact items.</span> : null}</div> : null}
      </section> : null}
      {state.history.length ? <details><summary>PPM version history · {state.history.length}</summary><ul className={styles.history}>{state.history.map(saved => <li key={saved.document_id}><span>v{saved.version} · {saved.status}{saved.stale ? " · source changed" : ""} · {date(saved.created_at)}</span><Btn size="sm" disabled={links.busy} onClick={() => download(saved)}>Download PPM v{saved.version}</Btn></li>)}</ul></details> : null}
    </> : null}
  </section>;
}
