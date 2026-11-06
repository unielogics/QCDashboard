"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea } from "@/components/ds";
import type { AuthedApi } from "@/lib/worksheetApi";
import { financialMappingConfidence, financialMappingConflict, readFinancialWorkspace, type FinancialEvidence, type FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { realEstatePropertyLabel, type RealEstateBody, type RealEstateSchema } from "@/lib/realEstateSchedule";
import {
  applyMortgageEvidence, mortgageMappingLabel, mortgageStatementStatus, rejectMortgageEvidence, stageMortgageEvidence, unlinkMortgageEvidence,
  type MortgageEvidenceImport, type MortgageEvidenceTarget, type RealEstateEvidenceLink,
} from "@/lib/realEstateEvidence";
import styles from "./RealEstateMortgageEvidence.module.css";

type Job = { file: FinancialEvidence; status: "reading" | "ready" | "applied" | "rejected" | "failed"; proposal?: MortgageEvidenceImport; error?: string; appliedSources?: string[] };
const NEW = "__new__";
const text = (value: unknown) => value == null ? "" : String(value);
const message = (reason: unknown) => reason instanceof Error ? reason.message : "The statement could not be reviewed. Your draft is retained.";

/** Statement extraction proposes fields. Only a reviewed association becomes evidence. */
export function RealEstateMortgageEvidence({ api, profileId, snapshot, links, initialMortgageId, initialPropertyId, disabled = false, prepare, onSnapshot, onRefreshEvidence, onBusyChange, onError, onPreview, onUploadFiles }: {
  api: AuthedApi; profileId: string; snapshot: FinancialWorkspaceSnapshot; links: RealEstateEvidenceLink[] | null;
  initialMortgageId?: string | null; initialPropertyId?: string | null; disabled?: boolean;
  prepare: () => Promise<FinancialWorkspaceSnapshot>;
  onSnapshot: (next: FinancialWorkspaceSnapshot) => void; onRefreshEvidence: () => void;
  onBusyChange: (busy: boolean) => void; onError?: (error: unknown) => void;
  onPreview: (fileId: string, page?: number, hash?: string) => void;
  onUploadFiles?: (files: File[]) => Promise<void>;
}) {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [activeFile, setActiveFile] = useState("");
  const [propertyId, setProperty] = useState("");
  const [mortgageId, setMortgage] = useState("");
  const [sourceId, setSource] = useState("");
  const [bound, setBound] = useState<string | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [associationConfirmed, confirmAssociation] = useState(false);
  const [latestConfirmed, confirmLatest] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const upload = useRef<HTMLInputElement>(null);
  const body = snapshot.body as RealEstateBody;
  const properties = body.properties ?? [];
  const mortgages = body.mortgages ?? [];
  const schema = snapshot.schema as RealEstateSchema;
  const labels = useMemo(() => Object.fromEntries([...(schema.properties ?? []), ...(schema.mortgages ?? [])].map((field) => [field.key, field.label])), [schema]);
  const propertyName = (id: string) => { const index = properties.findIndex((row) => row.id === id); return index < 0 ? "Unidentified property" : realEstatePropertyLabel(properties[index], index); };
  const mortgageName = (id: string) => { const index = mortgages.findIndex((row) => row.id === id); const row = mortgages[index]; return row ? `${text(row.lender) || `Mortgage ${index + 1}`}${row.loan_reference ? ` · ${row.loan_reference}` : ""}` : "New mortgage"; };
  const activeJob = jobs.find((job) => job.file.file_id === activeFile);
  const proposal = activeJob?.proposal;
  const candidates = proposal?.evidence?.candidates ?? [];
  const candidate = candidates.find((item) => item.source_mortgage_id === sourceId);
  const visibleFiles = snapshot.evidence.filter((file) => file.file_name.toLowerCase().includes(search.trim().toLowerCase()));
  const target: MortgageEvidenceTarget = {
    ...(propertyId === NEW ? { create_property: true, create_mortgage: true } : propertyId ? { property_row_id: propertyId } : {}),
    ...(propertyId !== NEW && mortgageId === NEW ? { create_mortgage: true } : mortgageId && mortgageId !== NEW ? { mortgage_row_id: mortgageId } : {}),
    ...(sourceId ? { source_mortgage_id: sourceId } : {}),
  };
  const targetKey = JSON.stringify(target);
  const targetChosen = Boolean(propertyId && (propertyId === NEW || mortgageId) && sourceId);
  const reviewed = Boolean(proposal && bound === targetKey && !proposal.evidence.needs_association && proposal.base_revision === snapshot.draft.revision && activeJob?.status === "ready");
  const contradictions = proposal?.evidence.override_reasons?.length ? proposal.evidence.override_reasons : proposal?.evidence.contradictions ?? [];
  const overrideRequired = Boolean(proposal?.evidence.association_override_required || contradictions.length);
  const overrideReady = !overrideRequired || overrideReason.trim().length >= 12;
  const busy = disabled || Boolean(working);

  const resetReview = () => { setBound(null); setKeys([]); confirmAssociation(false); confirmLatest(false); setOverrideReason(""); };
  const chooseJob = (job: Job) => {
    setActiveFile(job.file.file_id); resetReview(); setError(""); setNotice("");
    const sources = job.proposal?.evidence?.candidates ?? [];
    const remaining = sources.filter((item) => !job.appliedSources?.includes(item.source_mortgage_id));
    const source = remaining.length === 1 ? remaining[0].source_mortgage_id : sources.length === 1 ? sources[0].source_mortgage_id : "";
    setSource(source);
    const exact = (job.proposal?.evidence?.associations ?? []).filter((item) => item.source_mortgage_id === source && item.match === "exact");
    const initial = mortgages.find((row) => row.id === initialMortgageId);
    setProperty(exact.length === 1 ? exact[0].property_row_id : text(initial?.property_row_id) || initialPropertyId || "");
    setMortgage(exact.length === 1 ? exact[0].mortgage_row_id : initial?.id ?? "");
  };
  useEffect(() => {
    const row = mortgages.find((item) => item.id === initialMortgageId);
    if (row) { setProperty(text(row.property_row_id)); setMortgage(row.id!); resetReview(); }
    else if (initialPropertyId) { setProperty(initialPropertyId); setMortgage(NEW); resetReview(); }
    // A Form-row action deliberately changes the review destination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMortgageId, initialPropertyId]);

  async function run(label: string, work: () => Promise<void>) {
    if (busy) return;
    setWorking(label); setError(""); setNotice(""); onBusyChange(true);
    try { await work(); } catch (reason) { setError(message(reason)); onError?.(reason); }
    finally { setWorking(""); onBusyChange(false); }
  }
  async function scan(files: FinancialEvidence[], current: FinancialWorkspaceSnapshot) {
    let completed = 0;
    for (let index = 0; index < files.length; index++) {
      const file = files[index]; setWorking(`Reading ${index + 1} of ${files.length}`);
      setJobs((previous) => [...previous.filter((job) => job.file.file_id !== file.file_id), { file, status: "reading" }]);
      try {
        const answer = await stageMortgageEvidence(api, profileId, current, file.file_id);
        const job: Job = { file, status: "ready", proposal: answer };
        setJobs((previous) => previous.map((item) => item.file.file_id === file.file_id ? job : item));
        completed += 1; if (completed === 1) chooseJob(job);
      } catch (reason) {
        setJobs((previous) => previous.map((item) => item.file.file_id === file.file_id ? { file, status: "failed", error: message(reason) } : item));
      }
    }
    if (completed) setNotice(`${completed} of ${files.length} statement reads are ready. Confirm each property, mortgage, and latest statement before applying.`);
    else setError("The selected statements could not be read. Inspect the errors in the review queue, then retry or choose another PDF.");
  }
  const reviewAssociation = () => void run("Preparing review", async () => {
    if (!activeJob || !targetChosen) return;
    const current = await prepare();
    const answer = await stageMortgageEvidence(api, profileId, current, activeJob.file.file_id, target);
    setJobs((previous) => previous.map((job) => job.file.file_id === activeFile ? { ...job, status: "ready", proposal: answer } : job));
    setBound(targetKey); confirmAssociation(false); confirmLatest(false);
    setKeys(answer.mappings.filter((mapping) => !(mapping.conflict ?? financialMappingConflict(mapping.before, mapping.value))).map((mapping) => mapping.key));
  });
  const apply = () => void run("Applying reviewed statement", async () => {
    if (!proposal || !reviewed || !associationConfirmed || !latestConfirmed || !overrideReady) return;
    const current = await prepare();
    const next = await applyMortgageEvidence(api, profileId, proposal.id, current.draft.revision, keys, overrideReason);
    onSnapshot(next); onRefreshEvidence();
    const appliedSources = [...new Set([...(activeJob?.appliedSources ?? []), sourceId])];
    const nextSource = candidates.find((item) => !appliedSources.includes(item.source_mortgage_id));
    setJobs((previous) => previous.map((job) => job.file.file_id === activeFile ? { ...job, status: nextSource ? "ready" : "applied", appliedSources } : job));
    resetReview();
    if (nextSource) { setSource(nextSource.source_mortgage_id); setProperty(""); setMortgage(""); }
    setNotice(`Reviewed fields and the statement link are staged. ${nextSource ? "This PDF contains another mortgage; review its association next. " : ""}Save version to publish them and satisfy the matching statement request.`);
  });

  return <section className={styles.root} aria-label="Mortgage statement evidence">
    <div className={styles.heading}><div><h4>Read mortgage statements</h4><p>Upload statements together or select files already on this account. AI proposes the destination and printed fields for your review.</p></div>
      {onUploadFiles ? <><input hidden ref={upload} type="file" accept=".pdf" multiple onChange={(event) => {
        const files = Array.from(event.target.files ?? []); if (!files.length) return;
        void run("Uploading statements", async () => {
          const current = await prepare(); const before = new Set(current.evidence.map((file) => file.file_id));
          await onUploadFiles(files);
          const refreshed = await readFinancialWorkspace(api, profileId, "real_estate_schedule", current.family_id); onSnapshot(refreshed);
          const added = refreshed.evidence.filter((file) => !before.has(file.file_id) && files.some((picked) => picked.name === file.file_name));
          if (!added.length) { setNotice("No new file is available yet. Refresh uploaded files or select the existing copy below; duplicate uploads do not add fulfillment."); return; }
          setSelectedFiles(added.map((file) => file.file_id)); await scan(added, refreshed);
        }); event.target.value = "";
      }} /><Btn disabled={busy} onClick={() => upload.current?.click()}>Upload and read statements</Btn></> : null}
    </div>
    {error ? <Callout tone="bad">{error}</Callout> : null}{notice ? <Callout tone="ok">{notice}</Callout> : null}
    {working ? <p className={styles.progress} role="status">{working}…</p> : null}
    <details className={styles.files} open={!jobs.length}>
      <summary>Select uploaded statements{selectedFiles.length ? ` · ${selectedFiles.length} selected` : ""}</summary>
      <div className={styles.fileTools}><Input aria-label="Search uploaded mortgage documents" placeholder="Find an uploaded statement" value={search} onChange={(event) => setSearch(event.target.value)} /><Btn size="sm" disabled={busy} onClick={() => void run("Refreshing files", async () => { const current = await prepare(); onSnapshot(await readFinancialWorkspace(api, profileId, "real_estate_schedule", current.family_id)); onRefreshEvidence(); })}>Refresh files</Btn></div>
      <div className={styles.fileList}>{visibleFiles.map((file) => <label key={file.file_id}><input type="checkbox" disabled={busy} checked={selectedFiles.includes(file.file_id)} onChange={(event) => setSelectedFiles((current) => event.target.checked ? [...current, file.file_id] : current.filter((id) => id !== file.file_id))} /><span>{file.file_name}</span></label>)}</div>
      <Btn disabled={busy || !selectedFiles.length} onClick={() => void run("Reading statements", async () => { const current = await prepare(); await scan(current.evidence.filter((file) => selectedFiles.includes(file.file_id)), current); })}>Read selected statements</Btn>
    </details>

    {jobs.length ? <div className={styles.reviewLayout}>
      <nav className={styles.queue} aria-label="Statement review queue">{jobs.map((job) => <button type="button" key={job.file.file_id} disabled={busy} aria-current={activeFile === job.file.file_id ? "step" : undefined} onClick={() => chooseJob(job)}><strong>{job.file.file_name}</strong><small>{job.appliedSources?.length ? `${job.appliedSources.length} of ${job.proposal?.evidence.candidates.length ?? 1} mortgage sections applied` : job.status === "ready" ? "Review association" : job.status === "failed" ? "Read failed · retry" : job.status === "rejected" ? "Rejected" : "Reading"}</small></button>)}</nav>
      {activeJob ? <div className={styles.review}>
        <div className={styles.heading}><h4>{activeJob.file.file_name}</h4><Btn size="sm" disabled={busy} onClick={() => onPreview(activeJob.file.file_id)}>Open source PDF</Btn></div>
        {activeJob.error ? <Callout tone="bad">{activeJob.error}</Callout> : null}
        {candidates.length ? <>
          <Field label="Mortgage printed in this file"><Select aria-label="Source mortgage in statement" disabled={busy} value={sourceId} onChange={(event) => { setSource(event.target.value); resetReview(); }}><option value="">Choose the printed mortgage…</option>{candidates.map((item) => <option key={item.source_mortgage_id} value={item.source_mortgage_id}>{[item.property.address, item.mortgage.lender, item.mortgage.loan_reference, item.mortgage.statement_date].filter(Boolean).join(" · ") || "Mortgage with incomplete identity"}</option>)}</Select></Field>
          {candidate ? <div className={styles.printed}><b>Printed in the statement</b><span>{[candidate.property.address, candidate.property.city, candidate.property.state].filter(Boolean).join(", ") || "Property address not stated"}</span><span>{text(candidate.mortgage.lender) || "Lender not stated"}{candidate.mortgage.loan_reference ? ` · ${candidate.mortgage.loan_reference}` : ""} · Statement {text(candidate.mortgage.statement_date) || "date not stated"}</span></div> : null}
          <div className={styles.suggestions}>{(proposal?.evidence.associations ?? []).filter((item) => item.source_mortgage_id === sourceId).map((suggestion, index) => <button type="button" key={index} disabled={busy} onClick={() => { setProperty(suggestion.property_row_id); setMortgage(suggestion.mortgage_row_id); resetReview(); }}><small>{suggestion.match === "exact" ? "Suggested match" : "Possible match · verify"}</small><b>{propertyName(suggestion.property_row_id)} → {mortgageName(suggestion.mortgage_row_id)}</b><span>{suggestion.reasons.join(" · ").replaceAll("_", " ")}</span></button>)}</div>
          <div className={styles.targets}>
            <Field label="Property receiving this statement"><Select aria-label="Statement destination property" disabled={busy} value={propertyId} onChange={(event) => { setProperty(event.target.value); setMortgage(event.target.value === NEW ? NEW : ""); resetReview(); }}><option value="">Choose a property…</option>{properties.map((row, index) => <option key={row.id} value={row.id}>{realEstatePropertyLabel(row, index)}</option>)}<option value={NEW} disabled={!text(candidate?.property.address).trim()}>Create property from the printed address</option></Select></Field>
            <Field label="Mortgage receiving this statement"><Select aria-label="Statement destination mortgage" disabled={busy || !propertyId || propertyId === NEW} value={propertyId === NEW ? NEW : mortgageId} onChange={(event) => { setMortgage(event.target.value); resetReview(); }}><option value="">Choose a mortgage…</option>{mortgages.filter((row) => row.property_row_id === propertyId).map((row) => <option key={row.id} value={row.id}>{mortgageName(row.id!)}</option>)}<option value={NEW}>Add a new mortgage to this property</option></Select></Field>
          </div>
          <Btn disabled={busy || !targetChosen} onClick={reviewAssociation}>Review fields for this association</Btn>
          {proposal?.warnings.map((warning) => <Callout key={warning} tone="warn">{warning}</Callout>)}
          {proposal && bound === targetKey ? <>
            {proposal.base_revision !== snapshot.draft.revision ? <Callout tone="warn">The draft changed. Review the association again before applying these fields.</Callout> : null}
            {proposal.evidence.needs_association ? <Callout tone="warn">This association is not resolved. Choose the printed mortgage and its exact destination before applying.</Callout> : null}
            {overrideRequired ? <Callout tone="warn"><strong>The printed identity differs from this destination.</strong><ul>{contradictions.map((reason) => <li key={reason}>{reason.replaceAll("_", " ")}</li>)}</ul><Field label="Explain the verified association"><Textarea aria-label="Verified statement association explanation" value={overrideReason} disabled={busy} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Explain the verified servicer change or address/reference difference." /></Field><small>At least 12 characters. Keep the statement on the correct property and mortgage.</small></Callout> : null}
            <div className={styles.mappings} role="group" aria-label="Mortgage statement mapped fields">{proposal.mappings.map((mapping, index) => {
              const conflict = mapping.conflict ?? financialMappingConflict(mapping.before, mapping.value);
              return <label key={`${mapping.key}:${index}`} className={conflict ? styles.conflict : ""}><input type="checkbox" disabled={busy} checked={keys.includes(mapping.key)} onChange={(event) => setKeys((current) => event.target.checked ? [...current, mapping.key] : current.filter((key) => key !== mapping.key))} /><div><strong>{mortgageMappingLabel(mapping.key, labels)}</strong><dl><dt>Existing</dt><dd>{text(mapping.before) || "Blank"}</dd><dt>Proposed</dt><dd>{text(mapping.value) || "Not stated"}</dd></dl><CellChip tone={conflict ? "warn" : "mut"}>{conflict ? "Changes existing answer" : financialMappingConfidence(mapping.confidence)}</CellChip>{mapping.source.quote ? <q>{mapping.source.quote}</q> : null}<button type="button" disabled={busy} onClick={(event) => { event.preventDefault(); onPreview(mapping.source.file_id || activeFile, mapping.source.page, mapping.source.content_hash); }}>{mapping.source.page ? `Open PDF page ${mapping.source.page}` : "Open source"}</button></div></label>;
            })}</div>
            {!proposal.mappings.length && reviewed ? <p className={styles.note}>No field changes are proposed. You can link the reviewed statement to this existing mortgage.</p> : null}
            <label className={styles.confirm}><input type="checkbox" disabled={busy || !reviewed} checked={associationConfirmed} onChange={(event) => confirmAssociation(event.target.checked)} />I checked that this statement belongs to the selected property and mortgage.</label>
            <label className={styles.confirm}><input type="checkbox" disabled={busy || !reviewed} checked={latestConfirmed} onChange={(event) => confirmLatest(event.target.checked)} />I checked that this is the latest available mortgage statement.</label>
            <div className={styles.actions}><Btn disabled={busy} onClick={() => void run("Rejecting statement", async () => { await rejectMortgageEvidence(api, profileId, proposal.id); setJobs((current) => current.map((job) => job.file.file_id === activeFile ? { ...job, status: "rejected" } : job)); resetReview(); onRefreshEvidence(); })}>Reject this association</Btn><Btn variant="pri" disabled={busy || !reviewed || !associationConfirmed || !latestConfirmed || !overrideReady || (target.create_property || target.create_mortgage) && !keys.length} onClick={apply}>{keys.length ? `Apply ${keys.length} field${keys.length === 1 ? "" : "s"} and link statement` : "Link reviewed statement only"}</Btn></div>
          </> : null}
        </> : activeJob.status === "ready" ? <p className={styles.note}>No mortgage identity was extracted. Open the source to inspect it, or choose another statement. No property or loan has been guessed.</p> : null}
      </div> : null}
    </div> : null}

    <section className={styles.linked} aria-label="Linked mortgage statements"><h4>Statement evidence by mortgage</h4>{mortgages.map((row) => {
      const status = mortgageStatementStatus(links, row.id!, row, properties.find((property) => property.id === row.property_row_id)); const attached = links?.filter((link) => link.mortgage_row_id === row.id) ?? [];
      return <article key={row.id}><div><b>{mortgageName(row.id!)}</b><small>{propertyName(text(row.property_row_id))}</small><CellChip tone={status.tone}>{status.label}</CellChip></div>{attached.map((link) => <div className={styles.link} key={`${link.import_id}:${link.file_id}`}><span>{link.file_name || "Linked statement unavailable"}<small>{link.statement_date || "Statement date not confirmed"} · {link.status}{link.reason ? ` · ${link.reason}` : ""}</small></span><Btn size="sm" disabled={busy || !link.file_id} onClick={() => { if (link.file_id) onPreview(link.file_id); }}>Open</Btn>{link.file_id && link.status !== "accepted" ? <Btn size="sm" disabled={busy} onClick={() => void run("Reading linked statement", async () => { const current = await prepare(); const file = current.evidence.find((item) => item.file_id === link.file_id) || { file_id: link.file_id!, file_name: link.file_name || "Linked statement" }; await scan([file], current); })}>{link.withdrawn ? "Review again" : "Read and review"}</Btn> : null}<Btn size="sm" disabled={busy || link.withdrawn || !link.file_id && !link.import_id} onClick={() => void run("Unlinking statement", async () => { const current = await prepare(); onSnapshot(await unlinkMortgageEvidence(api, profileId, current, row.id!, link)); onRefreshEvidence(); setNotice("Statement evidence was withdrawn. Save version to publish any financial field changes."); })}>{link.withdrawn ? "Withdrawn" : "Unlink"}</Btn></div>)}</article>;
    })}{!mortgages.length ? <p className={styles.note}>Read statements above to add reviewed properties and mortgages, or import the existing real estate schedule first.</p> : null}</section>
    <p className={styles.note}>Unreviewed uploads do not satisfy requests. Save version publishes reviewed links and fields; only statements accepted for their exact mortgage satisfy collection tasks.</p>
  </section>;
}
