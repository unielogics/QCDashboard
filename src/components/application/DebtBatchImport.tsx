"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDevUser } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { debtTypeLabel } from "@/lib/debtTypes";
import { financialDebtChoiceLabel } from "@/lib/financialWorkspaceEntry";
import { financialMappingConfidence, readFinancialWorkspace, type FinancialEvidence, type FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { DEBT_SOURCE_ACCEPT, financialSourceIsImage, financialUploadContentType } from "@/lib/financialSourceFiles";
import { uploadFinancialEvidence } from "@/lib/financialEvidenceUpload";
import {
  applyDebtBatchImport, blankDebtBatchChoice, debtBatchApplyAttempt, debtBatchApplySignature, debtBatchChoiceReady, debtBatchField, debtBatchMappingConflict, debtBatchReviewReady,
  listDebtBatchImports, readDebtBatchImport, reconcileDebtBatchChoices, refreshDebtBatchImport, retryDebtBatchImport, selectDebtBatchMapping, stageDebtBatchImport,
  type DebtBatchChoice, type DebtBatchDecision, type DebtBatchMapping, type DebtBatchReview,
} from "@/lib/financialDebtBatchImport";
import type { AuthedApi } from "@/lib/worksheetApi";
import styles from "./DebtBatchImport.module.css";

type Upload = { id: string; file: File; file_id?: string; status: "waiting" | "uploading" | "received" | "failed"; error?: string };
const errorText = (reason: unknown) => reason instanceof Error ? reason.message : "This batch could not be processed. Received originals and your review are retained.";
const text = (value: unknown) => value == null || value === "" ? "Not stated" : String(value);
const fieldLabels: Record<string, string> = { lender: "Lender", debt_type: "Debt type", loan_reference: "Loan reference", original_amount: "Original amount", balance: "Current balance", monthly_payment: "Monthly payment", rate: "APR (%)", originated_on: "Loan date", maturity_on: "Maturity date", payment_status: "Payment status", secured: "Secured", collateral: "Collateral", factor_rate: "Factor rate", payment_amount: "Payment amount", payment_frequency: "Payment frequency", notes: "Notes", mca_modified: "MCA modified", mca_modification_note: "Modification details" };
const printedValue = (field: string, value: unknown) => field === "debt_type" ? debtTypeLabel(String(value ?? "")) || "Not stated" : field === "payment_frequency" ? ({ daily: "Business day", weekly: "Week", biweekly: "Every two weeks", monthly: "Month" }[String(value)] ?? text(value)) : text(value);
const processing = (review?: DebtBatchReview | null) => review?.status === "queued" || review?.status === "processing";

/** A schedule-level batch never guesses which same-lender loan should receive a file. */
export function DebtBatchImport({ api, profileId, snapshot, disabled, prepare, onSnapshot, onBusyChange, onError }: {
  api: AuthedApi; profileId: string; snapshot: FinancialWorkspaceSnapshot; disabled: boolean;
  prepare: () => Promise<FinancialWorkspaceSnapshot>; onSnapshot: (next: FinancialWorkspaceSnapshot) => void;
  onBusyChange: (busy: boolean) => void; onError: (error: unknown) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const uploadsRef = useRef(uploads); uploadsRef.current = uploads;
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [review, setReview] = useState<DebtBatchReview | null>(null);
  const [recoverable, setRecoverable] = useState<DebtBatchReview[]>([]);
  const [pollFailed, setPollFailed] = useState(false);
  const [choices, setChoices] = useState<Record<string, DebtBatchChoice>>({});
  const [active, setActive] = useState("");
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState<{ file: FinancialEvidence; page?: number; hash?: string; image?: boolean } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const reviewPane = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);
  const operation = useRef(0);
  const context = useRef(snapshot); context.current = snapshot;
  const stagingAttempt = useRef<{ signature: string; key: string } | null>(null);
  const applyAttempt = useRef<{ signature: string; key: string; revision: number } | null>(null);
  const refreshAttempt = useRef<{ signature: string; key: string } | null>(null);
  const busyChange = useRef(onBusyChange); busyChange.current = onBusyChange;
  const rows = (snapshot.body.debts ?? []) as import("@/lib/financialWorkspaceApi").FinancialDebtRow[];
  const activeRows = rows.filter((row) => (row.status ?? "active") === "active" && !row.duplicate_of_id);
  const stale = Boolean(review && review.base_revision !== snapshot.draft.revision && review.status !== "applied");
  const busy = disabled || Boolean(working);
  const candidate = review?.candidates.find((item) => item.id === active);
  const choice = candidate ? choices[candidate.id] ?? blankDebtBatchChoice() : blankDebtBatchChoice();
  const ready = Boolean(review && debtBatchReviewReady(review, choices, rows, snapshot.draft.revision));
  const decisions: DebtBatchDecision[] = review?.candidates.map((item) => { const selected = choices[item.id] ?? blankDebtBatchChoice(); return { candidate_id: item.id, action: selected.action as DebtBatchDecision["action"], ...(selected.target_row_id ? { target_row_id: selected.target_row_id } : {}), selected_keys: selected.selected_keys, confirmed: selected.action === "skip" || selected.confirmed, ...(selected.confirm_separate_loan ? { confirm_separate_loan: true } : {}) }; }) ?? [];
  const decisionSignature = review ? debtBatchApplySignature(review, decisions) : "";
  const retryingApply = Boolean(review && review.status !== "applied" && applyAttempt.current?.signature === decisionSignature);
  const selectedCount = review?.candidates.filter((item) => choices[item.id]?.action && choices[item.id]?.action !== "skip").length ?? 0;
  const received = uploads.filter((upload) => upload.file_id).map((upload) => upload.file_id!);
  const allFiles = [...new Map([...(review?.files ?? []).map((file) => ({ file_id: file.file_id, file_name: file.file_name })), ...snapshot.evidence, ...uploads.filter((upload) => upload.file_id).map((upload) => ({ file_id: upload.file_id!, file_name: upload.file.name, content_type: financialUploadContentType(upload.file) }))].map((file) => [file.file_id, file as FinancialEvidence])).values()];
  const batchFiles = review?.files ?? [];
  const failedFileIds = batchFiles.filter((file) => ["unreadable", "unavailable"].includes(file.status)).map((file) => file.file_id);
  const batchId = review?.id;
  const batchStatus = review?.status;
  const isProcessing = processing(review);
  const storageKey = useCallback((id: string) => `financial-debt-review:${profileId}:${snapshot.family_id}:${id}`, [profileId, snapshot.family_id]);
  const restoreChoices = useCallback((answer: DebtBatchReview) => { try { const cached = sessionStorage.getItem(storageKey(answer.id)); return cached ? reconcileDebtBatchChoices(answer, JSON.parse(cached) as Record<string, DebtBatchChoice>) : {}; } catch { return {}; } }, [storageKey]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; operation.current += 1; busyChange.current(false); }; }, []);
  useEffect(() => { if (batchId && batchStatus !== "applied" && Object.keys(choices).length) try { sessionStorage.setItem(storageKey(batchId), JSON.stringify(choices)); } catch { /* Browser storage is optional; originals and server batches remain recoverable. */ } }, [choices, batchId, batchStatus, storageKey]);
  useEffect(() => {
    const id = operation.current; let cancelled = false;
    void listDebtBatchImports(api, profileId, snapshot.family_id).then((answer) => {
      if (cancelled || !mounted.current || operation.current !== id) return;
      setRecoverable(answer.items);
      const latest = answer.items[0];
      if (latest) { setReview(latest); setSelectedFiles(latest.files.map((file) => file.file_id)); setChoices(restoreChoices(latest)); setActive(latest.candidates[0]?.id ?? ""); setExpanded(latest.status !== "applied"); }
    }).catch(() => { if (!cancelled && operation.current === id) setError("Previous batch reads could not be loaded. Use Recover batch reads below to retry; existing loan data is unchanged."); });
    return () => { cancelled = true; };
  }, [api, profileId, snapshot.family_id, restoreChoices]);
  useEffect(() => {
    if (!batchId || !isProcessing || pollFailed || working) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      const generation = operation.current;
      try {
        const answer = await readDebtBatchImport(api, profileId, batchId);
        if (cancelled || !mounted.current || operation.current !== generation) return;
        setReview(answer); setActive((selected) => answer.candidates.some((item) => item.id === selected) ? selected : answer.candidates[0]?.id ?? "");
        if (!processing(answer)) setChoices((previous) => reconcileDebtBatchChoices(answer, previous));
        if (processing(answer)) timer = setTimeout(poll, 2500);
      } catch (reason) { if (!cancelled && mounted.current) { setPollFailed(true); setError(`${errorText(reason)} The server keeps processing this batch. Check read progress to reconnect.`); } }
    };
    timer = setTimeout(poll, 2500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [api, profileId, batchId, isProcessing, pollFailed, working]);
  const currentOperation = (id: number, familyId: string) => mounted.current && operation.current === id && context.current.family_id === familyId;
  async function run(label: string, work: (id: number, familyId: string) => Promise<void>) {
    if (busy) return;
    const id = ++operation.current; const familyId = snapshot.family_id;
    setWorking(label); setError(""); setNotice(""); onBusyChange(true);
    try { await work(id, familyId); }
    catch (reason) { if (currentOperation(id, familyId)) { setError(errorText(reason)); onError(reason); } }
    finally { if (currentOperation(id, familyId)) { setWorking(""); onBusyChange(false); } }
  }
  async function finishReading(initial: DebtBatchReview, id: number, familyId: string, keepChoices = false) {
    const answer = initial;
    if (!currentOperation(id, familyId)) return;
    stagingAttempt.current = null;
    setReview(answer); setSelectedFiles(answer.files.map((file) => file.file_id)); setPollFailed(false); setRecoverable((previous) => [answer, ...previous.filter((item) => item.id !== answer.id)]);
    if (answer.status === "applied") {
      await prepare();
      const next = await readFinancialWorkspace(api, profileId, "debt_schedule", familyId);
      if (!currentOperation(id, familyId)) return;
      onSnapshot(next);
    }
    if (!keepChoices) { setChoices(restoreChoices(answer)); applyAttempt.current = null; }
    setActive((selected) => answer.candidates.some((item) => item.id === selected) ? selected : answer.candidates[0]?.id ?? "");
    setNotice(answer.status === "applied" ? "This review was previously finished. The current worksheet has been reloaded; Save version remains a separate step." : processing(answer) ? "The files are being read in the background. You can keep using the worksheet or return to this batch later; originals are retained." : `${answer.candidates.length} loan${answer.candidates.length === 1 ? "" : "s"} detected. Review each destination, selected answer, and source before applying. Nothing has been published.`);
  }
  async function stage(fileIds: string[], id: number, familyId: string) {
    const ids = [...new Set(fileIds)];
    if (!ids.length) throw new Error("Upload or select at least one received file.");
    if (ids.length > 20) throw new Error("Review up to 20 source files together.");
    const current = await prepare();
    if (!currentOperation(id, familyId) || current.family_id !== familyId) return;
    const signature = JSON.stringify([familyId, current.draft.revision, [...ids].sort()]);
    if (stagingAttempt.current?.signature !== signature) stagingAttempt.current = { signature, key: crypto.randomUUID() };
    const answer = await stageDebtBatchImport(api, profileId, current, ids, stagingAttempt.current.key);
    if (!currentOperation(id, familyId)) return;
    setChoices((previous) => processing(answer) ? Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, { ...value, confirmed: false }])) : reconcileDebtBatchChoices(answer, previous)); setPreview(null); await finishReading(answer, id, familyId, true);
  }
  const readReceived = () => void run("Preparing debt review", (id, familyId) => stage([...selectedFiles, ...received], id, familyId));
  const upload = (incoming: Upload[], fresh = false) => void run("Uploading debt files", async (id, familyId) => {
    await prepare(); if (!currentOperation(id, familyId)) return;
    const receivedIds: string[] = [];
    for (let index = 0; index < incoming.length; index++) {
      const item = incoming[index];
      if (item.file_id) { receivedIds.push(item.file_id); continue; }
      setWorking(`Uploading ${index + 1} of ${incoming.length}`);
      setUploads((previous) => previous.map((row) => row.id === item.id ? { ...row, status: "uploading", error: undefined } : row));
      try {
        const fileId = await uploadFinancialEvidence(api, profileId, item.file);
        if (!currentOperation(id, familyId)) return;
        receivedIds.push(fileId);
        setUploads((previous) => previous.map((row) => row.id === item.id ? { ...row, file_id: fileId, status: "received", error: undefined } : row));
      } catch (reason) {
        if (!currentOperation(id, familyId)) return;
        setUploads((previous) => previous.map((row) => row.id === item.id ? { ...row, status: "failed", error: errorText(reason) } : row));
      }
    }
    if (!currentOperation(id, familyId)) return;
    const fileIds = [...new Set([...(fresh ? [] : uploadsRef.current.filter((item) => item.file_id).map((item) => item.file_id!)), ...receivedIds, ...(fresh ? [] : selectedFiles)])];
    if (fileIds.length) await stage(fileIds, id, familyId);
    else setError("No files were received. Retry the failed uploads below; no debt rows were added.");
  });
  const updateChoice = (changes: Partial<DebtBatchChoice>) => {
    if (!candidate) return;
    setChoices((previous) => ({ ...previous, [candidate.id]: { ...(previous[candidate.id] ?? blankDebtBatchChoice()), ...changes } }));
  };
  const openSource = (fileId: string, mapping?: DebtBatchMapping) => {
    const file = allFiles.find((item) => item.file_id === fileId) ?? { file_id: fileId, file_name: batchFiles.find((item) => item.file_id === fileId)?.file_name ?? "Source file" };
    const readFile = batchFiles.find((item) => item.file_id === fileId);
    const mappedSource = mapping?.source ?? review?.candidates.flatMap((item) => item.mappings).find((item) => item.source.file_id === fileId)?.source;
    setPreview({ file: { ...file, content_type: mappedSource?.content_type ?? readFile?.content_type ?? file.content_type }, page: mapping?.source.page, hash: mappedSource?.content_hash ?? readFile?.content_hash ?? undefined, image: mappedSource?.kind === "image" });
  };
  const apply = () => void run("Applying reviewed loans", async (id, familyId) => {
    if (!review || !ready && !retryingApply) return;
    const current = await prepare(); if (!currentOperation(id, familyId) || current.family_id !== review.family_id) return;
    applyAttempt.current = debtBatchApplyAttempt(review, decisions, current.draft.revision, applyAttempt.current, () => crypto.randomUUID());
    const next = await applyDebtBatchImport(api, profileId, review, applyAttempt.current.revision, decisions, applyAttempt.current.key);
    if (!currentOperation(id, familyId)) return;
    onSnapshot(next); setReview({ ...review, status: "applied" }); try { sessionStorage.removeItem(storageKey(review.id)); } catch { /* Optional cache. */ }
    setNotice(selectedCount ? `${selectedCount} reviewed loan${selectedCount === 1 ? "" : "s"} applied to the working draft with the source files linked. Save version publishes the updated schedule and dated PDF.` : "Review finished without financial changes. The original files remain available.");
  });

  return <section className={styles.root} aria-label="Upload debt screenshots and files">
    <div className={styles.heading}><div><strong>Build rows from loan files</strong><p>Upload several screenshots, HEIC images, or PDFs together. Review the loans and their source links before adding them.</p></div><div className={styles.actions}>
      <input ref={input} hidden type="file" multiple accept={DEBT_SOURCE_ACCEPT} aria-label="Debt batch files" onChange={(event) => {
        const files = Array.from(event.target.files ?? []); event.target.value = ""; if (!files.length) return;
        setExpanded(true);
        const fresh = review?.status === "applied";
        if (files.length + (fresh ? 0 : uploads.length) > 20) { setError("Choose up to 20 files in one review. Start a new batch after applying the current one."); return; }
        const incoming = files.map((file): Upload => ({ id: crypto.randomUUID(), file, status: "waiting" }));
        if (fresh) { setUploads(incoming); setSelectedFiles([]); setReview(null); setChoices({}); } else setUploads((previous) => [...previous, ...incoming]); upload(incoming, fresh);
      }} /><Btn size="sm" disabled={busy || processing(review)} onClick={() => input.current?.click()}><Icon name="upload" size={13} />Upload debt screenshots/files</Btn>
      <Btn size="sm" disabled={busy} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Close batch review" : review ? "Review batch" : "Choose uploaded files"}</Btn>
    </div></div>
    {expanded ? <div className={styles.content}>
      {error ? <Callout tone="bad">{error}</Callout> : null}{notice ? <Callout tone="ok">{notice}</Callout> : null}
      {working ? <p role="status" className={styles.progress}>{working}…</p> : null}
      {!working && processing(review) ? <p role="status" className={styles.progress}>Reading debt files · {review?.progress?.done ?? 0} of {review?.progress?.total ?? review?.files.length} complete. You can keep using the worksheet.</p> : null}
      {uploads.length ? <div className={styles.uploads} aria-label="Debt file upload progress">{uploads.map((item) => <div key={item.id}><span>{item.file.name}</span><CellChip tone={item.status === "failed" ? "warn" : item.status === "received" ? "ok" : "mut"}>{item.status === "received" ? "Original retained" : item.status}</CellChip>{item.error ? <small>{item.error}</small> : null}</div>)}{uploads.some((item) => item.status === "failed") ? <Btn size="sm" disabled={busy} onClick={() => upload(uploads.filter((item) => item.status === "failed"))}>Retry failed uploads only</Btn> : null}</div> : null}
      <details className={styles.existing}><summary>Use files already uploaded to this client{selectedFiles.length ? ` · ${selectedFiles.length} selected` : ""}</summary><div className={styles.fileList}>{allFiles.map((file) => <label key={file.file_id}><input type="checkbox" disabled={busy || received.includes(file.file_id)} checked={selectedFiles.includes(file.file_id) || received.includes(file.file_id)} onChange={(event) => setSelectedFiles((previous) => event.target.checked ? [...previous, file.file_id] : previous.filter((item) => item !== file.file_id))} /><span>{file.file_name}</span></label>)}</div></details>
      <div className={styles.actions}><Btn size="sm" disabled={busy || processing(review) || !selectedFiles.length && !received.length} onClick={readReceived}>{review?.status === "applied" ? "Start a fresh review of these files" : "Read received files with AI"}</Btn><Btn size="sm" disabled={busy} onClick={() => void run("Recovering batch reads", async (id, familyId) => { const answer = await listDebtBatchImports(api, profileId, familyId); if (!currentOperation(id, familyId)) return; setRecoverable(answer.items); const latest = (stagingAttempt.current ? undefined : answer.items.find((item) => item.id === review?.id)) ?? answer.items[0]; if (latest) await finishReading(latest, id, familyId, latest.id === review?.id); else setNotice("No previous batch reads are available for this schedule."); })}>Recover batch reads</Btn>{processing(review) ? <Btn size="sm" disabled={busy} onClick={() => void run("Checking read progress", async (id, familyId) => finishReading(await readDebtBatchImport(api, profileId, review!.id), id, familyId, true))}>Check read progress</Btn> : null}</div>
      {recoverable.length > 1 ? <Field label="Recent batch reads"><Select aria-label="Recent debt batch reads" disabled={busy} value={review?.id ?? ""} onChange={(event) => { const selected = recoverable.find((item) => item.id === event.target.value); if (selected) void run("Opening batch review", async (id, familyId) => finishReading(await readDebtBatchImport(api, profileId, selected.id), id, familyId)); }}><option value="">Choose a batch…</option>{recoverable.map((item, index) => <option key={item.id} value={item.id}>Batch {recoverable.length - index} · {item.files.length} files · {item.status}</option>)}</Select></Field> : null}
      {review ? <>
        {stale ? <Callout tone="warn">The working schedule changed after this read. Review it against the current draft before applying; your current draft is preserved.<div className={styles.actions}><Btn size="sm" disabled={busy || processing(review)} onClick={() => void run("Refreshing conflicts", async (id, familyId) => { const current = await prepare(); const signature = `${review.id}:${current.draft.revision}`; if (refreshAttempt.current?.signature !== signature) refreshAttempt.current = { signature, key: crypto.randomUUID() }; const next = await refreshDebtBatchImport(api, profileId, review, current.draft.revision, refreshAttempt.current.key); if (!currentOperation(id, familyId)) return; setChoices((previous) => processing(next) ? Object.fromEntries(Object.entries(previous).map(([key, value]) => [key, { ...value, confirmed: false }])) : reconcileDebtBatchChoices(next, previous)); await finishReading(next, id, familyId, true); })}>Review against current draft</Btn></div></Callout> : null}
        <div className={styles.fileResults} aria-label="Batch source results">{batchFiles.map((file) => <div key={file.file_id}><button type="button" disabled={busy} onClick={() => openSource(file.file_id)}>{file.file_name}</button><CellChip tone={file.status === "ready" ? "ok" : ["queued", "processing"].includes(file.status) ? "mut" : "warn"}>{file.status === "duplicate" ? "Duplicate source · no extra row" : file.status}</CellChip>{file.error ? <small>{file.error}</small> : null}</div>)}</div>
        {failedFileIds.length && review.status === "proposed" ? <Btn size="sm" disabled={busy || stale} onClick={() => void run("Retrying unread files", async (id, familyId) => { const current = await prepare(); const next = await retryDebtBatchImport(api, profileId, review, current.draft.revision, failedFileIds); await finishReading(next, id, familyId, true); })}>Retry failed reads only</Btn> : null}
        {review.status === "applied" ? <p className={styles.note}>Batch applied to the draft. The existing worksheet and manual Add row remain available below.</p> : <>
          {!review.candidates.length && !processing(review) ? <Callout tone="warn">No loan was identified clearly enough to propose a row. Inspect the retained source files, retry failed reads, or add the loan manually.</Callout> : null}
          {review.candidates.length ? <div className={styles.reviewLayout}>
            <nav className={styles.queue} aria-label="Detected loan review queue">{review.candidates.map((item, index) => <button key={item.id} type="button" disabled={busy} aria-current={item.id === active ? "step" : undefined} onClick={() => { setActive(item.id); setPreview(null); }}><strong>{index + 1}. {item.lender || "Lender not stated"}</strong><span>{item.loan_reference ? `Reference ${item.loan_reference}` : "Loan reference not stated"}</span><span>{item.possible_duplicate_row_ids.length ? "Possible duplicate" : item.suggested_action === "create" ? "New row suggested" : item.suggested_action === "update" ? "Update suggested" : "Destination needs review"}</span><small>{choices[item.id]?.action === "skip" ? "Skipped" : debtBatchChoiceReady(item, choices[item.id] ?? blankDebtBatchChoice(), rows) ? "Reviewed" : "Review needed"}</small></button>)}</nav>
            {candidate ? <div ref={reviewPane} className={styles.review}>
              <h4>{candidate.lender || "Loan with lender not stated"}{candidate.loan_reference ? ` · ${candidate.loan_reference}` : ""}</h4>
              <div className={styles.sourceLinks}>{candidate.source_file_ids.map((fileId) => <Btn key={fileId} size="sm" disabled={busy} onClick={() => openSource(fileId)}>Open {batchFiles.find((file) => file.file_id === fileId)?.file_name || "source file"}</Btn>)}</div>
              {candidate.warnings.map((warning, index) => <Callout key={index} tone="warn">{warning}</Callout>)}
              {candidate.possible_duplicate_row_ids.length ? <Callout tone="warn"><strong>Possible existing loans — verify the exact account.</strong><ul>{candidate.possible_duplicate_row_ids.map((rowId) => { const row = rows.find((item) => item.id === rowId); return row ? <li key={rowId}>{financialDebtChoiceLabel(row, rows.indexOf(row) + 1)}{row.status === "dismissed" ? " · Removed row" : row.status === "duplicate" || row.duplicate_of_id ? " · Duplicate row" : ""}</li> : null; })}</ul><small>Separate loans at one lender stay separate. Nothing is automatically merged or removed.</small></Callout> : null}
              {candidate.suggested_target_row_id ? <p className={styles.note}>AI suggests an existing row. Choose and confirm the destination yourself.</p> : null}
              <Field label="How should this loan be handled?"><Select aria-label="Detected loan action" value={choice.action} disabled={busy || stale} onChange={(event) => updateChoice({ action: event.target.value as DebtBatchChoice["action"], target_row_id: "", selected_keys: [], confirmed: false, confirm_separate_loan: false })}><option value="">Choose an action…</option><option value="create">Create a separate loan row</option><option value="update">Update an existing loan and link its files</option><option value="link">Link evidence only to an existing loan</option><option value="skip">Skip this detected loan</option></Select></Field>
              {choice.action === "update" || choice.action === "link" ? <Field label="Exact loan receiving these files"><Select aria-label="Detected loan destination row" value={choice.target_row_id} disabled={busy || stale} onChange={(event) => updateChoice({ target_row_id: event.target.value, selected_keys: [], confirmed: false })}><option value="">Choose the exact loan…</option>{activeRows.map((row) => <option key={row.id} value={row.id}>{financialDebtChoiceLabel(row, rows.indexOf(row) + 1)}</option>)}</Select></Field> : null}
              {choice.action === "create" && candidate.possible_duplicate_row_ids.length ? <p className={styles.note}>Confirm this is a separate obligation before creating a new row.</p> : null}
              {choice.action === "create" && candidate.requires_separate_loan_confirmation ? <label className={styles.confirm}><input type="checkbox" aria-label="Confirm separate loan despite possible match" disabled={busy || stale} checked={choice.confirm_separate_loan === true} onChange={(event) => updateChoice({ confirm_separate_loan: event.target.checked, confirmed: false })} /><span>I confirm this is a separate loan despite the possible match.</span></label> : null}
              {choice.action === "create" || choice.action === "update" ? <div className={styles.mappings} role="group" aria-label="Detected loan fields">{candidate.mappings.map((mapping) => {
                const field = debtBatchField(mapping); const conflict = debtBatchMappingConflict(mapping, choice, rows); const existing = choice.action === "update" ? rows.find((row) => row.id === choice.target_row_id)?.[field] : null;
                const alternative = candidate.mappings.some((other) => other.key !== mapping.key && debtBatchField(other) === field && String(other.value ?? "") !== String(mapping.value ?? ""));
                return <label key={mapping.key} className={conflict || alternative ? styles.conflict : ""}><input type="checkbox" aria-label={`Accept ${fieldLabels[field] ?? field}: ${printedValue(field, mapping.value)}`} disabled={busy || stale || choice.action === "update" && !choice.target_row_id} checked={choice.selected_keys.includes(mapping.key)} onChange={(event) => updateChoice({ selected_keys: selectDebtBatchMapping(candidate, choice.selected_keys, mapping.key, event.target.checked), confirmed: false })} /><div><strong>{fieldLabels[field] ?? field.replaceAll("_", " ")}</strong><dl>{choice.action === "update" ? <><dt>Current row</dt><dd>{printedValue(field, existing)}</dd></> : null}<dt>Proposed</dt><dd>{printedValue(field, mapping.value)}</dd></dl><CellChip tone={conflict || alternative ? "warn" : "mut"}>{alternative ? "Source values conflict · choose one" : conflict ? "Changes existing answer" : financialMappingConfidence(mapping.confidence)}</CellChip><small>{batchFiles.find((file) => file.file_id === mapping.source.file_id)?.file_name || "Original source"}{mapping.source.page ? ` · page ${mapping.source.page}` : ""}</small>{mapping.source.quote ? <q>{mapping.source.quote}</q> : null}<button type="button" disabled={busy} onClick={(event) => { event.preventDefault(); openSource(mapping.source.file_id ?? candidate.source_file_ids[0], mapping); }}>{mapping.source.page ? `Open source page ${mapping.source.page}` : "Inspect original source"}</button></div></label>;
              })}</div> : null}
              {choice.action === "link" ? <p className={styles.note}>Only source evidence will be linked. Existing financial answers stay as recorded.</p> : null}
              {choice.action === "create" && !candidate.mappings.some((mapping) => debtBatchField(mapping) === "lender" && choice.selected_keys.includes(mapping.key) && String(mapping.value ?? "").trim()) ? <p className={styles.note}>Select the printed lender to create this row. If the source does not identify it, add the loan manually and link the evidence to that row.</p> : null}
              {choice.action && choice.action !== "skip" ? <label className={styles.confirm}><input type="checkbox" aria-label="Confirm detected loan and source association" disabled={busy || stale || choice.action !== "create" && !choice.target_row_id || choice.action !== "link" && !choice.selected_keys.length} checked={choice.confirmed} onChange={(event) => updateChoice({ confirmed: event.target.checked })} /><span>I checked the source files, selected answers, and exact loan{choice.action === "create" ? "; this is a separate obligation" : " receiving this evidence"}.</span></label> : null}
              {choice.action === "skip" ? <p className={styles.note}>This detected loan will not change a row or its evidence. The original files remain available.</p> : null}
            </div> : null}
          </div> : null}
          {review.status === "proposed" ? <div className={styles.apply}><p>Review every detected loan or explicitly skip it. Apply changes the working draft; Save version publishes the financial figures and dated PDF.</p><Btn variant="pri" disabled={busy || !ready && !retryingApply} onClick={apply}>{selectedCount ? `Apply ${selectedCount} reviewed loan${selectedCount === 1 ? "" : "s"} to draft` : "Finish review without changes"}</Btn></div> : null}
        </>}
      </> : null}
      {preview ? <SourcePreview api={api} profileId={profileId} source={preview} onClose={() => { setPreview(null); requestAnimationFrame(() => reviewPane.current?.scrollIntoView({ block: "start" })); }} /> : null}
    </div> : null}
  </section>;
}

function SourcePreview({ api, profileId, source, onClose }: { api: AuthedApi; profileId: string; source: { file: FinancialEvidence; page?: number; hash?: string; image?: boolean }; onClose: () => void }) {
  const { getToken, isSignedIn } = useConsoleAuth(); const devUser = useDevUser();
  const [url, setUrl] = useState(""); const [original, setOriginal] = useState(""); const [error, setError] = useState("");
  const previewPane = useRef<HTMLElement>(null);
  const image = source.image || financialSourceIsImage(source.file);
  useEffect(() => {
    let cancelled = false; let blobUrl = "";
    setUrl(""); setOriginal(""); setError("");
    void (async () => {
      const query = source.hash && /^[a-f0-9]{64}$/i.test(source.hash) ? `?expected_content_hash=${encodeURIComponent(source.hash)}` : "";
      const result = await api<{ url: string }>(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/${encodeURIComponent(source.file.file_id)}/url${query}`);
      if (cancelled) return; setOriginal(result.url);
      if (image) {
        const token = isSignedIn ? await getToken() : null;
        const response = await fetch(`${apiBase}/api/v1/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/evidence/${encodeURIComponent(source.file.file_id)}/image-preview${query}`, { cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) } });
        if (!response.ok) throw new Error("The readable image preview could not be loaded. Retry opening this source; its original is retained.");
        const blob = await response.blob(); if (cancelled) return;
        blobUrl = URL.createObjectURL(blob); setUrl(blobUrl);
      } else setUrl(source.page ? `${result.url.split("#")[0]}#page=${source.page}` : result.url);
    })().catch((reason) => { if (!cancelled) setError(errorText(reason)); });
    return () => { cancelled = true; if (blobUrl) URL.revokeObjectURL(blobUrl); };
  }, [api, devUser, getToken, image, isSignedIn, profileId, source]);
  useEffect(() => { previewPane.current?.scrollIntoView({ block: "start" }); }, [url, error]);
  return <section ref={previewPane} className={styles.preview} aria-label="Batch original source preview"><div className={styles.heading}><strong>{source.file.file_name}</strong><Btn size="sm" onClick={onClose}>Close source preview</Btn></div>{error ? <Callout tone="bad">{error}</Callout> : !url ? <p role="status">Opening original source…</p> : image ? <img src={url} alt={source.file.file_name} onError={() => setError("This image preview could not be displayed. Reopen the source to retry; the original is retained.")} /> : <iframe title={`Original ${source.file.file_name}`} src={url} />}{original ? <a href={original} target="_blank" rel="noreferrer">Open original {image ? "image" : "file"}</a> : null}</section>;
}
