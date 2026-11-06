"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, Input, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { apiBase } from "@/lib/api";
import { Pfs413Form, type PfsBody, type PfsSchema } from "./Pfs413Form";
import { DebtScheduleForm, type DebtRow } from "./DebtScheduleForm";
import { BusinessStatementForm, type StatementBody, type StatementSchema } from "./BusinessStatementForm";
import { SheetGrid } from "@/components/sheet/SheetGrid";
import { recompute, type SheetSchema } from "@/components/sheet/compute";
import { planPaste } from "@/components/sheet/clipboard";
import type { Edit, SheetKind } from "@/components/sheet/types";
import {
  FINANCIAL_LABELS, FINANCIAL_ORDER, readFinancialWorkspace, saveFinancialDraft,
  saveFinancialVersion, stageFinancialImport, stageDebtDocumentImport, applyFinancialImport, restoreFinancialVersion,
  actOnFinancialDebt, financialVersionPdfPath, financialValues, financialLayout, applyFinancialCells, activeFinancialDebts, financialDebtTotals, createFinancialFamily, financialMappingConflict, financialMappingConfidence, isFinancialDraftConflict, clearEditedDebtSources, shareFinancialVersion, savedFinancialCompletion,
  type FinancialWorkspaceSnapshot, type FinancialBody, type FinancialDebtRow, type FinancialImport, type FinancialVersion,
  type DebtAction, type DebtDocumentRole,
} from "@/lib/financialWorkspaceApi";
import { RequestFilesDialog } from "./RequestFilesDialog";

type View = "form" | "worksheet" | "pdf" | "history";
const VIEWS: Array<{ id: View; label: string; icon: string }> = [
  { id: "form", label: "Form", icon: "note" }, { id: "worksheet", label: "Worksheet", icon: "calc" },
  { id: "pdf", label: "From the file", icon: "doc" }, { id: "history", label: "History", icon: "audit" },
];
const message = (error: unknown) => error instanceof Error ? error.message : "This change could not be saved.";
const when = (iso?: string | null) => iso ? new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
const newId = () => crypto.randomUUID();
const rowsOf = (body: FinancialBody): FinancialDebtRow[] => (body.debts as FinancialDebtRow[] | undefined) ?? [];

/** A draft has one body. Form fields, worksheet cells, and source review all edit that body. */
export function FinancialWorkspace({ open, onClose, profileId, initialKind = "debt_schedule", initialView = "form", initialDebtId, onPublished, onUploadFiles }: {
  open: boolean; onClose: () => void; profileId: string; initialKind?: SheetKind; initialView?: View; initialDebtId?: string;
  onPublished?: () => void | Promise<void>; onUploadFiles?: (files: File[]) => Promise<void>;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = useDevUser();
  const [snapshot, setSnapshot] = useState<FinancialWorkspaceSnapshot | null>(null);
  const [body, setBody] = useState<FinancialBody>({});
  const [view, setView] = useState<View>(initialView);
  const [expanded, setExpanded] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [savingDraft, setSavingDraft] = useState(false);
  const [localDirty, setLocalDirty] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  const [familyDraft, setFamilyDraft] = useState({ label: "", subject: "", period_start: "", period_end: "", as_of: "" });
  const [selectedDebt, setSelectedDebt] = useState<string | null>(initialDebtId ?? null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [rowToolsOpen, setRowToolsOpen] = useState(false);
  const [sourceFile, setSourceFile] = useState("");
  const [sourceRole, setSourceRole] = useState<DebtDocumentRole>("agreement");
  const [uploadStatus, setUploadStatus] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);
  const [fileMode, setFileMode] = useState<"sources" | "versions">("sources");
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfVersionId, setPdfVersionId] = useState<string | null>(null);
  const [savedReceipt, setSavedReceipt] = useState<FinancialVersion | null>(null);
  const [savedCompletion, setSavedCompletion] = useState<FinancialWorkspaceSnapshot["completion"] | null>(null);
  const [sharedPdf, setSharedPdf] = useState<{ url: string; expires_at: string; version_id: string } | null>(null);
  const pdfRequest = useRef(0);
  const [proposal, setProposal] = useState<FinancialImport | null>(null);
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const current = useRef<FinancialWorkspaceSnapshot | null>(null);
  const draftBody = useRef<FinancialBody>({});
  const changed = useRef(0);
  const persisted = useRef(0);
  const inFlight = useRef<Promise<void> | null>(null);
  const publishKey = useRef<string | null>(null);
  const mounted = useRef(true);
  const formRef = useRef<HTMLDivElement | null>(null);
  const uploadRef = useRef<HTMLInputElement | null>(null);

  const accept = useCallback((next: FinancialWorkspaceSnapshot) => {
    current.current = next; draftBody.current = next.body;
    changed.current = 0; persisted.current = 0;
    setSnapshot(next); setBody(next.body); setLocalDirty(false); setConflict(false);
    setSelectedDebt((selected) => rowsOf(next.body).some((row) => row.id === selected) ? selected : activeFinancialDebts(next.body)[0]?.id ?? null);
  }, []);
  const changeBody = useCallback((next: FinancialBody) => {
    if (current.current?.kind === "debt_schedule") next = clearEditedDebtSources(draftBody.current, next);
    draftBody.current = next; changed.current += 1; publishKey.current = null;
    setBody(next); setLocalDirty(true); setNotice("");
  }, []);
  useEffect(() => {
    // A source review belongs to one selected loan, including selections made outside the file tab.
    setProposal(null); setSourceFile(""); setSourceUrl(null); setSourceRole("agreement"); setUploadStatus(null);
  }, [selectedDebt, snapshot?.family_id]);

  const flush = useCallback(async (): Promise<void> => {
    if (inFlight.current) await inFlight.current;
    if (!current.current || persisted.current === changed.current) return;
    const work = async () => {
      setSavingDraft(true);
      try {
        while (persisted.current !== changed.current) {
          const revision = changed.current;
          const next = await saveFinancialDraft(api, profileId, current.current!, structuredClone(draftBody.current));
          current.current = next; persisted.current = revision;
          if (mounted.current) {
            setSnapshot(next); setLocalDirty(changed.current !== revision); setConflict(false);
            if (changed.current === revision) { draftBody.current = next.body; setBody(next.body); }
          }
        }
      } catch (reason) {
        if (mounted.current) { setError(message(reason)); setConflict(isFinancialDraftConflict(reason)); }
        throw reason;
      } finally { if (mounted.current) setSavingDraft(false); }
    };
    const promise = work(); inFlight.current = promise;
    try { await promise; } finally { if (inFlight.current === promise) inFlight.current = null; }
  }, [api, profileId]);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true); setError(""); setView(initialView);
    void readFinancialWorkspace(api, profileId, initialKind).then((next) => { if (!cancelled) accept(next); })
      .catch((reason) => { if (!cancelled) setError(message(reason)); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [accept, api, initialKind, initialView, open, profileId]);
  useEffect(() => {
    if (!localDirty || conflict) return;
    const timer = setTimeout(() => { void flush().catch(() => undefined); }, 700);
    return () => clearTimeout(timer);
  }, [body, conflict, flush, localDirty]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (changed.current !== persisted.current || inFlight.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, []);
  useEffect(() => () => { if (pdfUrl) URL.revokeObjectURL(pdfUrl); }, [pdfUrl]);

  const run = async (label: string, work: () => Promise<void>) => {
    if (busy) return;
    setBusy(label); setError("");
    try { await work(); } catch (reason) { setError(message(reason)); if (isFinancialDraftConflict(reason)) setConflict(true); }
    finally { setBusy(""); }
  };
  const close = () => { void run("close", async () => { await flush(); onClose(); }); };
  const switchForm = (kind: SheetKind, familyId?: string) => { void run("switch", async () => {
    await flush(); pdfRequest.current += 1; setLoading(true); setSavedReceipt(null); setSavedCompletion(null); setSharedPdf(null); setProposal(null); setSourceUrl(null); setSourceFile(""); setPdfUrl(null); setPdfVersionId(null);
    try { accept(await readFinancialWorkspace(api, profileId, kind, familyId)); } finally { setLoading(false); }
  }); };
  const switchView = (next: View) => { setView(next); setNotice(""); };
  const publish = (submit = false) => { void run(submit ? "file" : "publish", async () => {
    await flush(); if (!current.current) return;
    publishKey.current ??= newId();
    const next = await saveFinancialVersion(api, profileId, current.current, `${publishKey.current}:${submit ? "file" : "save"}`, submit);
    pdfRequest.current += 1;
    accept(next); publishKey.current = null;
    setPdfUrl(null); setPdfVersionId(next.saved_version?.id ?? next.current_version_id);
    const saved = next.saved_version ?? next.versions.find((version) => version.id === next.current_version_id) ?? null;
    const accepted = saved ? savedFinancialCompletion(next, saved.id) : null;
    setSavedReceipt(saved); setSavedCompletion(accepted); setSharedPdf(null);
    const isCurrent = saved?.id === next.current_version_id;
    setNotice(`Version ${saved?.version_number ?? "saved"} saved${isCurrent && (submit || next.kind === "debt_schedule" && accepted?.complete) ? " and filed on the checklist" : ""}. ${isCurrent ? "The financial interface and AI now use this version." : "This saved version is available in history; the latest version is shown in the sidebar."}`);
    for (const key of ["financial-workspace-summary", "debt-schedule-review", "financial-cockpit", "advances", "application-evidence-workspace", "application-collection-tasks", "form-answers"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    await onPublished?.();
  }); };
  const debtAction = (action: DebtAction) => { void run("row", async () => {
    await flush(); if (!current.current) return;
    accept(await actOnFinancialDebt(api, profileId, current.current, action));
    setNotice("Row adjustment saved to the draft. Save version to update the financial interface.");
  }); };
  const previewSource = (fileId = sourceFile, page?: number, expectedHash?: string) => { void run("source", async () => {
    if (!fileId) return;
    setSourceFile(fileId);
    const linkedRole = rowsOf(draftBody.current).find((row) => row.id === selectedDebt)?.evidence_links?.find((link) => link.file_id === fileId)?.role;
    if (linkedRole) setSourceRole(linkedRole);
    const hashQuery = expectedHash && /^[a-f0-9]{64}$/i.test(expectedHash) ? `?expected_content_hash=${encodeURIComponent(expectedHash)}` : "";
    const result = await api<{ url: string }>(`/application-profiles/${encodeURIComponent(profileId)}/evidence/files/${encodeURIComponent(fileId)}/url${hashQuery}`);
    setFileMode("sources");
    setSourceUrl(Number.isInteger(page) && page! > 0 ? `${result.url.split("#")[0]}#page=${page}` : result.url); setView("pdf");
  }); };
  const importSource = (fileId = sourceFile, role = sourceRole) => { void run("import", async () => {
    await flush(); if (!current.current || !fileId) return;
    if (current.current.kind === "debt_schedule" && !selectedDebt) throw new Error("Choose the loan this document belongs to before reading its terms.");
    const next = current.current.kind === "debt_schedule"
      ? await stageDebtDocumentImport(api, profileId, current.current, selectedDebt!, fileId, role)
      : await stageFinancialImport(api, profileId, current.current, fileId);
    const existing = financialValues(draftBody.current, current.current.worksheet.layout);
    setSourceFile(fileId); setSourceRole(role); setFileMode("sources");
    setProposal(next); setSelectedMappings(next.mappings.filter((mapping) => !(mapping.conflict ?? financialMappingConflict(mapping.before ?? existing[mapping.key], mapping.value))).map((mapping) => mapping.key));
  }); };
  const applyImport = () => { void run("apply", async () => {
    await flush(); if (!current.current || !proposal) return;
    accept(await applyFinancialImport(api, profileId, proposal.id, current.current.draft.revision, selectedMappings));
    setProposal(null); setNotice("Selected fields were mapped into the draft. Review the form, then save a new version.");
  }); };
  const showPdf = useCallback(async (versionId: string) => {
    const request = ++pdfRequest.current;
    const familyId = current.current?.family_id;
    let token: string | null = null;
    if (isSignedIn) token = await getToken();
    const response = await fetch(`${apiBase}/api/v1${financialVersionPdfPath(profileId, versionId)}`, {
      cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) },
    });
    if (request !== pdfRequest.current || familyId !== current.current?.family_id || !mounted.current) return null;
    if (!response.ok) throw new Error("This version’s PDF could not be opened. Try again.");
    const filename = /filename="?([^";]+)"?/i.exec(response.headers.get("Content-Disposition") ?? "")?.[1] ?? `financial-statement-${versionId}.pdf`;
    const url = URL.createObjectURL(await response.blob());
    if (request !== pdfRequest.current || familyId !== current.current?.family_id || !mounted.current) { URL.revokeObjectURL(url); return null; }
    setSharedPdf((shared) => shared?.version_id === versionId ? shared : null);
    setPdfUrl(url); setPdfVersionId(versionId);
    return { url, filename };
  }, [devUser, getToken, isSignedIn, profileId]);
  useEffect(() => {
    if (view !== "pdf" || fileMode !== "versions" || !snapshot || pdfUrl) return;
    const id = pdfVersionId ?? snapshot.current_version_id;
    if (id) void showPdf(id).catch((reason) => setError(message(reason)));
  }, [fileMode, pdfUrl, pdfVersionId, showPdf, snapshot, view]);

  const downloadPdf = (versionId: string) => { void run("download", async () => {
    const file = await showPdf(versionId); if (!file) return; const anchor = document.createElement("a");
    anchor.href = file.url; anchor.download = file.filename; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  }); };
  const copyPdfShare = (versionId: string) => { void run("share", async () => {
    const result = await shareFinancialVersion(api, profileId, versionId); setSharedPdf({ ...result, version_id: versionId });
    try { await navigator.clipboard.writeText(result.url); setNotice("Read-only PDF link copied. It opens this saved version and expires in seven days."); }
    catch { setNotice("Read-only PDF link ready below. Copy it to share this saved version."); }
  }); };
  const kind = snapshot?.kind ?? initialKind;
  const debts = rowsOf(body);
  const activeDebts = activeFinancialDebts(body);
  const selected = debts.find((row) => row.id === selectedDebt) ?? activeDebts[0] ?? null;
  const sharedLayout = useMemo(() => snapshot ? financialLayout(body, snapshot.worksheet.layout) : null, [body, snapshot]);
  const values = useMemo(() => sharedLayout ? financialValues(body, sharedLayout) : {}, [body, sharedLayout]);
  const computed = useMemo(() => {
    if (!snapshot) return {};
    const source = kind === "debt_schedule" ? financialValues({ ...body, debts: activeDebts }, sharedLayout ?? snapshot.worksheet.layout) : values;
    return kind === "debt_schedule" ? financialDebtTotals(body) : recompute(kind, snapshot.schema as SheetSchema, source);
  }, [activeDebts, body, kind, sharedLayout, snapshot, values]);
  const excludedIds = useMemo(() => new Set(debts.filter((row) => row.status === "dismissed" || row.status === "duplicate" || row.duplicate_of_id).map((row) => row.id)), [debts]);
  useEffect(() => { if (initialDebtId && excludedIds.has(initialDebtId)) setShowExcluded(true); }, [initialDebtId, excludedIds]);
  const layout = useMemo(() => {
    if (!sharedLayout) return null;
    return kind === "debt_schedule" && !showExcluded ? { ...sharedLayout, rows: sharedLayout.rows.filter((row) => !row.row_key || !excludedIds.has(row.row_key)) } : sharedLayout;
  }, [excludedIds, kind, showExcluded, sharedLayout]);
  const editCells = (edits: Edit[]) => { if (sharedLayout) changeBody(applyFinancialCells(draftBody.current, sharedLayout, edits)); };
  const addDebt = () => {
    const row = { id: newId(), lender: "", status: "active" as const, evidence_links: [] };
    changeBody({ ...draftBody.current, no_debt: false, debts: [...rowsOf(draftBody.current), row] }); setSelectedDebt(row.id); setView("form");
  };
  const sections = kind === "pfs" ? ["About you", "Assets", "Liabilities", "Annual income", "Contingent liabilities", ...((snapshot?.schema as PfsSchema | undefined)?.schedules ?? []).map((section) => section.label)]
    : kind === "p_and_l" || kind === "balance_sheet" ? ((snapshot?.schema as StatementSchema | undefined)?.sections ?? []).map((section) => section.label) : [];
  const jumpTo = (title: string) => {
    setView("form");
    requestAnimationFrame(() => {
      const heading = [...(formRef.current?.querySelectorAll("h3,h4,summary,label") ?? [])].find((element) => element.textContent?.trim().startsWith(title));
      if (heading) { const details = heading.closest("details"); if (details) details.open = true; heading.scrollIntoView({ block: "start", behavior: "smooth" }); }
    });
  };
  const currentVersion = snapshot?.versions.find((version) => version.id === snapshot.current_version_id);
  const completedVersion = kind === "debt_schedule"
    ? snapshot?.accepted_completion?.complete ? snapshot.versions.find((version) => version.id === (snapshot.accepted_version_id ?? snapshot.current_version_id)) : undefined
    : currentVersion;
  const needsCompletedDebtVersion = kind === "debt_schedule" && snapshot?.completion?.complete && !snapshot.accepted_completion?.complete;
  const hasDraft = localDirty || snapshot?.draft.dirty;
  const mappingBefore = (mapping: FinancialImport["mappings"][number]) => Object.prototype.hasOwnProperty.call(mapping, "before") ? mapping.before : values[mapping.key];
  const mappingConflict = (mapping: FinancialImport["mappings"][number]) => mapping.conflict ?? financialMappingConflict(mappingBefore(mapping), mapping.value);
  const renderFieldSource = (row: DebtRow, field: keyof DebtRow) => {
    const source = ((body.field_sources ?? {}) as Record<string, { file_id?: string; page?: number; content_hash?: string }>)[`${row.id}.${field}`];
    if (field === "monthly_payment" && row.monthly_payment_source === "native_terms") return <span className="fw-derived-tag">≈ Calculated from payment terms</span>;
    return source?.file_id ? <button type="button" className="fw-field-source" onClick={() => previewSource(source.file_id, source.page, source.content_hash)}><Icon name="file" size={11} />From the file{source.page ? ` · p${source.page}` : ""}</button> : null;
  };

  const renderFields = () => snapshot ? (<>
    {kind === "pfs" ? <Pfs413Form schema={snapshot.schema as PfsSchema} value={body as PfsBody} onChange={(next) => {
                const schedules = Object.fromEntries(Object.entries(next.schedules ?? {}).map(([key, rows]) => [key, rows.map((row) => ({ ...row, id: row.id || newId() }))]));
                changeBody({ ...next, schedules });
              }} disabled={Boolean(busy)} />
                : kind === "debt_schedule" ? <>
                  {selected ? <><DebtScheduleForm singleRow renderFieldSource={renderFieldSource} value={{ business_name: String(body.business_name ?? ""), debts: [{ ...selected, editable: true } as DebtRow] }} disabled={Boolean(busy) || excludedIds.has(selected.id)} onChange={(next) => {
                    if (!next.debts?.length) { debtAction({ op: "delete", row_id: selected.id }); return; }
                    changeBody({ ...draftBody.current, business_name: next.business_name, debts: rowsOf(draftBody.current).map((row) => row.id === selected.id ? { ...row, ...next.debts![0], id: row.id } : row) });
                  }} /><DebtInspector key={selected.id} row={selected} rows={debts} snapshot={snapshot} busy={Boolean(busy)} onAction={debtAction} onPreview={previewSource} /></>
                    : <div className="empty">No active obligations. Add an obligation or map a source document.</div>}
                </> : <BusinessStatementForm schema={snapshot.schema as StatementSchema} value={body as StatementBody} onChange={(next) => changeBody(next as FinancialBody)} disabled={Boolean(busy)} />}
  </>) : null;

  return <>
    <Drawer open={open} onClose={close} fullscreen={expanded} width="xl" closeOnBackdrop={false} title="Financial workspace" sub={snapshot?.label ?? FINANCIAL_LABELS[kind]} ariaLabel="Financial workspace" bodyClass="financial-workspace-body" headerActions={<>
      <span className="sub" aria-live="polite">{savingDraft ? "Saving draft…" : localDirty ? "Unsaved draft changes" : hasDraft ? "Draft saved" : currentVersion ? `Current v${currentVersion.version_number}` : "No saved version"}</span>
      <Btn size="sm" disabled={Boolean(busy)} onClick={() => setRequestOpen(true)}><Icon name="mail" size={14} />Request files</Btn>
      <Btn size="sm" onClick={() => setExpanded((value) => !value)} aria-label={expanded ? "Restore workspace size" : "Expand workspace"}><Icon name={expanded ? "layers" : "external"} size={14} />{expanded ? "Restore" : "Expand"}</Btn>
      {kind !== "debt_schedule" ? <Btn size="sm" disabled={!snapshot || Boolean(busy) || conflict} onClick={() => publish(true)}>{busy === "file" ? "Filing…" : "File on checklist"}</Btn> : null}
      <Btn variant="pri" disabled={!snapshot || Boolean(busy) || conflict || !hasDraft && Boolean(currentVersion) && !needsCompletedDebtVersion} onClick={() => publish()}>{busy === "publish" ? "Saving version…" : "Save version"}</Btn>
    </>}>
      <div className="fw-shell">
        <aside className="fw-sidebar" aria-label="Financial forms and sections">
          <span className="lbl">Financial forms</span>
          {FINANCIAL_ORDER.map((formKind) => <button key={formKind} type="button" className={kind === formKind ? "on" : ""} disabled={Boolean(busy)} onClick={() => switchForm(formKind)}><Icon name={formKind === "debt_schedule" ? "calc" : "doc"} size={15} /><span>{FINANCIAL_LABELS[formKind]}</span></button>)}
          {(snapshot?.families.filter((family) => family.kind === kind).length ?? 0) > 1 ? <Field label={kind === "pfs" ? "Person / statement" : "Document family"}><Select aria-label="Statement family" value={snapshot?.family_id} disabled={Boolean(busy)} onChange={(event) => switchForm(kind, event.target.value)}>{snapshot?.families.filter((family) => family.kind === kind).map((family) => <option key={family.id} value={family.id}>{family.label}</option>)}</Select></Field> : null}
          <button type="button" disabled={Boolean(busy)} aria-expanded={familyOpen} onClick={() => setFamilyOpen((value) => !value)}><Icon name="plus" size={13} />{kind === "pfs" ? "Add person / statement" : "Add reporting period"}</button>
          {familyOpen ? <div className="fw-new-family"><Field label="Statement label"><Input aria-label="Statement label" value={familyDraft.label} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, label: event.target.value }))} placeholder={kind === "pfs" ? "Jane Smith — personal statement" : "2026 year to date"} /></Field><Field label={kind === "pfs" ? "Person's name" : "Business / subject"}><Input aria-label="Statement subject" value={familyDraft.subject} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, subject: event.target.value }))} /></Field>{kind === "p_and_l" ? <><Field label="Period start"><Input aria-label="Period start" type="date" value={familyDraft.period_start} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, period_start: event.target.value }))} /></Field><Field label="Period end"><Input aria-label="Period end" type="date" value={familyDraft.period_end} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, period_end: event.target.value }))} /></Field></> : <Field label="As of"><Input aria-label="As of" type="date" value={familyDraft.as_of} onChange={(event) => setFamilyDraft((draft) => ({ ...draft, as_of: event.target.value }))} /></Field>}<Btn size="sm" disabled={Boolean(busy) || !familyDraft.label.trim() || !familyDraft.subject.trim()} onClick={() => void run("family", async () => { await flush(); const { label, ...identity } = familyDraft; accept(await createFinancialFamily(api, profileId, kind, label.trim(), Object.fromEntries(Object.entries(identity).filter(([, value]) => Boolean(value))))); setFamilyOpen(false); setFamilyDraft({ label: "", subject: "", period_start: "", period_end: "", as_of: "" }); setView("form"); })}>Create statement</Btn></div> : null}
          <div className="fw-sidebar-sections"><span className="lbl">{kind === "debt_schedule" ? "Obligations" : "Sections"}</span>
            {kind === "debt_schedule" ? <>{(showExcluded ? debts : activeDebts).map((row, index) => <button type="button" key={row.id} className={selected?.id === row.id ? "on" : ""} onClick={() => { setSelectedDebt(row.id); setView("form"); }}><span>{String(row.lender || `Obligation ${index + 1}`)}</span>{excludedIds.has(row.id) ? <small>{row.status}</small> : null}</button>)}<Btn size="sm" onClick={addDebt} disabled={Boolean(busy)}><Icon name="plus" size={13} />Add obligation</Btn><label className="checkline"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} />Show removed / duplicates</label></>
              : sections.map((section) => <button type="button" key={section} onClick={() => jumpTo(section)}>{section}</button>)}
          </div>
          <div className="fw-publication"><Icon name="shieldChk" size={16} /><strong>{completedVersion ? `Published v${completedVersion.version_number}` : currentVersion ? `Saved PDF v${currentVersion.version_number}` : "Draft only"}</strong><small>{completedVersion ? when(completedVersion.created_at) : kind === "debt_schedule" ? "No completed schedule version has been filed. Save version publishes the completed draft and its dated PDF." : "Save the first version to publish these figures."}</small><small>{completedVersion ? "The financial interface and AI use this saved version." : "Uploaded and historical PDFs remain available in History."}</small></div>
        </aside>
        <main className="fw-main">
          <nav className="fw-tabs" aria-label="Financial workspace views" role="tablist">{VIEWS.map((tab) => <button type="button" role="tab" aria-selected={view === tab.id} key={tab.id} onClick={() => switchView(tab.id)}><Icon name={tab.icon} size={15} />{tab.label}</button>)}</nav>
          {error ? <div className="fw-alert"><Callout tone="bad">{error}{conflict ? <p>Your draft is kept in this window. Reload the server draft to resolve the conflict before saving.</p> : null}<div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => void run("retry", async () => { await flush(); })}>Retry save</Btn>{conflict ? <Btn size="sm" onClick={() => void run("reload", async () => { accept(await readFinancialWorkspace(api, profileId, kind, snapshot?.family_id)); setError(""); })}>Reload server draft</Btn> : null}</div></Callout></div> : null}
          {notice ? <div className="fw-alert"><Callout tone="ok">{notice}</Callout></div> : null}
          {savedReceipt ? <div className="fw-save-receipt"><div><strong>Saved v{savedReceipt.version_number} · {when(savedReceipt.created_at)}</strong><span className="sub">{kind === "debt_schedule" ? savedCompletion?.complete ? "Debt schedule complete — dated PDF filed on the checklist." : savedCompletion?.reason || "Dated PDF ready to download or share." : "Dated PDF ready to download or share."}</span></div><div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => void run("pdf", async () => { await showPdf(savedReceipt.id); setFileMode("versions"); setView("pdf"); })}>Open saved PDF</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => downloadPdf(savedReceipt.id)}>Download PDF</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => copyPdfShare(savedReceipt.id)}>Copy PDF share link</Btn></div></div> : null}
          {sharedPdf ? <div className="fw-share-result"><label className="lbl" htmlFor="fw-pdf-share-link">Read-only PDF · v{snapshot?.versions.find((version) => version.id === sharedPdf.version_id)?.version_number ?? "saved"} · expires {when(sharedPdf.expires_at)}</label><input id="fw-pdf-share-link" readOnly value={sharedPdf.url} onFocus={(event) => event.currentTarget.select()} /></div> : null}
          {hasDraft && view !== "history" ? <div className="fw-draft-note"><Icon name="note" size={14} />Draft changes are saved here. Financial summaries and AI update when you save a version, which includes a dated PDF.</div> : null}
          {loading ? <div className="empty">Opening financial workspace…</div> : !snapshot ? <div className="empty">The financial workspace could not be opened.</div> : <>
            {view === "form" ? <div className="fw-form" ref={formRef}>
              <h3>{FINANCIAL_LABELS[kind]}</h3>
              {kind === "debt_schedule" ? <div className="fw-debt-summary"><strong>{activeDebts.length} active obligations</strong><span>{computed.total_monthly_payment == null ? "Monthly payments incomplete" : `${computed.total_monthly_payment.toLocaleString(undefined, { style: "currency", currency: "USD" })} a month`}</span><span>{computed.total_balance == null ? "Balances incomplete" : `${computed.total_balance.toLocaleString(undefined, { style: "currency", currency: "USD" })} outstanding`}</span></div> : null}
              {kind === "debt_schedule" && !activeDebts.length ? <label className="checkline fw-no-debt"><input type="checkbox" checked={body.no_debt === true} disabled={Boolean(busy)} onChange={(event) => changeBody({ ...draftBody.current, no_debt: event.target.checked })} />I confirm this business has no outstanding debt.</label> : null}
              {renderFields()}
            </div> : null}
            {view === "worksheet" && layout ? <div className="fw-worksheet">
              <div className="fw-grid-toolbar"><span className="sub">Select a cell to edit. Scroll across columns or down rows.</span>{kind === "debt_schedule" ? <><label className="checkline"><input type="checkbox" checked={showExcluded} onChange={(event) => setShowExcluded(event.target.checked)} />Show excluded</label><Btn size="sm" disabled={Boolean(busy)} onClick={addDebt}>Add obligation</Btn></> : null}</div>
              {kind === "debt_schedule" ? <div className="fw-debt-summary" aria-live="polite"><strong>{activeDebts.length} active obligations</strong><span>{computed.total_monthly_payment == null ? "Monthly payments incomplete" : `${computed.total_monthly_payment.toLocaleString(undefined, { style: "currency", currency: "USD" })} a month`}</span><span>{computed.total_balance == null ? "Balances incomplete" : `${computed.total_balance.toLocaleString(undefined, { style: "currency", currency: "USD" })} outstanding`}</span></div> : null}
              <SheetGrid layout={layout} values={values} computed={computed} canEdit={!busy && !conflict} lockedRows={excludedIds} rowDetails={kind === "debt_schedule" ? { label: "Linked documents", render: (gridRow) => {
                const debt = debts.find((item) => item.id === gridRow.row_key);
                if (!debt) return null;
                const links = debt.evidence_links ?? [];
                const payoff = links.some((link) => link.role === "payoff" && link.is_current);
                return <button type="button" className="fw-row-document-chip" aria-label={`Documents for ${debt.lender || "obligation"}: ${links.length} linked${payoff ? ", current payoff selected" : ""}`} onClick={() => { setSelectedDebt(debt.id); setRowToolsOpen(true); setFileMode("sources"); setView("pdf"); setSourceFile(links.length === 1 ? links[0].file_id : ""); setSourceUrl(null); setProposal(null); }}><Icon name={payoff ? "docCheck" : "link"} size={13} /><span>{links.length ? `${links.length} file${links.length === 1 ? "" : "s"}${payoff ? " · Payoff" : ""}` : "Link files"}</span></button>;
              } } : undefined} onEdits={editCells} onPaste={(topLeft, matrix) => { const planned = planPaste(layout, values, topLeft, matrix); editCells(planned.edits); if (planned.clipped) setNotice("Some pasted rows extend beyond this section. Add rows in Form view, then paste again."); }} onCursor={(cursor) => { if (cursor.rowKey) setSelectedDebt(cursor.rowKey); }} onNotice={(value) => setNotice(value ?? "")} />
              {kind === "debt_schedule" && selected ? <details className="fw-row-tools" open={rowToolsOpen} onToggle={(event) => setRowToolsOpen(event.currentTarget.open)}><summary>Manage {String(selected.lender || "selected obligation")}: linked files, payoff, duplicate or remove</summary><DebtInspector key={selected.id} row={selected} rows={debts} snapshot={snapshot} busy={Boolean(busy)} onAction={debtAction} onPreview={previewSource} /></details> : null}
            </div> : null}
            {view === "pdf" ? <div className="fw-pdf-workspace">
              <div className="fw-file-modes" aria-label="File views">
                <Btn size="sm" variant={fileMode === "sources" ? "pri" : "default"} onClick={() => setFileMode("sources")}>{kind === "debt_schedule" ? "Loan files" : "Source files"}</Btn>
                <Btn size="sm" variant={fileMode === "versions" ? "pri" : "default"} onClick={() => setFileMode("versions")}>Saved version PDFs</Btn>
              </div>
              {fileMode === "sources" ? <>
                {kind === "debt_schedule" ? <section className="fw-loan-files">
                  <div className="fw-loan-file-heading"><Field label="Files related to this loan"><Select aria-label="Loan for source documents" disabled={Boolean(busy)} value={selected?.id ?? ""} onChange={(event) => { setSelectedDebt(event.target.value); setSourceFile(""); setSourceUrl(null); setProposal(null); }}><option value="">Choose a loan…</option>{debts.map((row) => <option key={row.id} value={row.id}>{String(row.lender || "Unnamed obligation")}{row.status !== "active" && row.status ? ` · ${row.status}` : ""}</option>)}</Select></Field><p>Link agreements and payoff letters to the selected loan. Reviewing terms keeps current values unchanged until you apply them.</p></div>
                  {selected ? <div className="fw-related-files">{(selected.evidence_links ?? []).map((link, index) => <div key={`${link.file_id}:${link.role}:${index}`} className="fw-document-link"><Icon name="file" size={15} /><div><strong>{snapshot.evidence.find((file) => file.file_id === link.file_id)?.file_name || "Linked file"}</strong><small>{link.role}{link.is_current ? " · Current payoff" : ""}</small></div><Btn size="sm" disabled={Boolean(busy)} onClick={() => previewSource(link.file_id)}>Preview</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => importSource(link.file_id, link.role)}>Read terms</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => debtAction({ op: "unlink_document", row_id: selected.id, file_id: link.file_id, role: link.role })}>Unlink</Btn></div>)}{!selected.evidence_links?.length ? <p className="sub">No documents are linked to {String(selected.lender || "this loan")} yet.</p> : null}</div> : null}
                </section> : null}
                <div className="fw-source-tools">
                  <Field label={kind === "debt_schedule" ? "Link an uploaded file" : "Source document"}><Select aria-label="Source document" value={sourceFile} onChange={(event) => { setSourceFile(event.target.value); setSourceUrl(null); setProposal(null); const linked = selected?.evidence_links?.find((link) => link.file_id === event.target.value); if (linked) setSourceRole(linked.role); }}><option value="">Choose an uploaded document…</option>{snapshot.evidence.map((file) => <option key={file.file_id} value={file.file_id}>{file.file_name}{kind === "debt_schedule" && selected?.evidence_links?.some((link) => link.file_id === file.file_id) ? " · linked to this loan" : ""}</option>)}</Select></Field>
                  {kind === "debt_schedule" ? <Field label="Document role"><Select aria-label="Source document role" value={sourceRole} onChange={(event) => setSourceRole(event.target.value as DebtDocumentRole)}><option value="agreement">Loan agreement</option><option value="payoff">Payoff letter</option><option value="supporting">Supporting document</option></Select></Field> : null}
                  <Btn disabled={!sourceFile || Boolean(busy)} onClick={() => previewSource()}>Open source</Btn>
                  {kind === "debt_schedule" ? <Btn disabled={!selected || !sourceFile || Boolean(busy)} onClick={() => debtAction({ op: "link_document", row_id: selected!.id, file_id: sourceFile, role: sourceRole })}>Link to loan</Btn> : null}
                  <Btn disabled={!sourceFile || Boolean(busy) || kind === "debt_schedule" && !selected} onClick={() => importSource()}>{busy === "import" ? "Reading…" : kind === "debt_schedule" ? "Read terms from contract" : "Read and map fields"}</Btn>
                  {onUploadFiles ? <><input ref={uploadRef} type="file" hidden accept=".pdf" onChange={(event) => {
                    const files = Array.from(event.target.files ?? []);
                    if (files.length) void run("upload", async () => {
                      setUploadStatus(null); setNotice("");
                      await flush(); const beforeIds = new Set(current.current?.evidence.map((file) => file.file_id));
                      await onUploadFiles(files);
                      const refreshed = await readFinancialWorkspace(api, profileId, kind, snapshot.family_id);
                      if (current.current) current.current = { ...current.current, evidence: refreshed.evidence };
                      setSnapshot((old) => old ? { ...old, evidence: refreshed.evidence } : old);
                      const candidates = refreshed.evidence.filter((file) => !beforeIds.has(file.file_id) && files.some((upload) => upload.name === file.file_name));
                      if (!candidates.length) {
                        setUploadStatus({ tone: "warn", message: "The PDF is not available in this file yet. The upload may have failed or may still be processing. Check its upload status, then refresh files or try again." });
                        return;
                      }
                      if (candidates.length === 1 && files.length === 1) { setSourceFile(candidates[0].file_id); setSourceUrl(null); setProposal(null); }
                      setUploadStatus({ tone: "ok", message: kind === "debt_schedule" ? "PDF received. Review its terms or use Link to loan to attach it to the selected obligation." : "PDF received. Review its mapped fields before applying them." });
                    });
                    if (uploadRef.current) uploadRef.current.value = "";
                  }} /><Btn disabled={Boolean(busy) || kind === "debt_schedule" && !selected} onClick={() => uploadRef.current?.click()}>{kind === "debt_schedule" ? "Upload related PDF" : "Upload source PDF"}</Btn></> : null}
                  <Btn disabled={Boolean(busy)} onClick={() => void run("sources", async () => { const refreshed = await readFinancialWorkspace(api, profileId, kind, snapshot.family_id); if (current.current) current.current = { ...current.current, evidence: refreshed.evidence }; setSnapshot((old) => old ? { ...old, evidence: refreshed.evidence } : old); })}>Refresh files</Btn>
                </div>
                {uploadStatus ? <Callout tone={uploadStatus.tone}>{uploadStatus.message}</Callout> : null}
                {proposal ? <div className="fw-import"><h4>Review mapped fields</h4><p>{proposal.target_row_id ? `Apply only to ${String(debts.find((row) => row.id === proposal.target_row_id)?.lender || "the selected loan")}. The source is linked after Apply selected fields.` : "The original upload remains available. Apply selected fields to this draft, then save a new version."}</p>{proposal.warnings.map((warning) => <Callout key={warning} tone="warn">{warning}</Callout>)}<div className="fw-mappings">{proposal.mappings.map((mapping, index) => <label className={mappingConflict(mapping) ? "is-conflict" : ""} key={`${mapping.key}:${index}`}><input type="checkbox" checked={selectedMappings.includes(mapping.key)} onChange={(event) => setSelectedMappings((keys) => event.target.checked ? [...new Set([...keys, mapping.key])] : keys.filter((key) => key !== mapping.key))} /><strong>{mapping.derived ? "≈ Calculated monthly payment" : mapping.key.slice(mapping.key.indexOf(".") + 1).replaceAll("_", " ")}</strong><div className="fw-mapping-values"><small>Existing</small><span>{String(mappingBefore(mapping) ?? "") || "Blank"}</span><small>{mapping.derived ? "Calculated" : "Proposed"}</small><span>{String(mapping.value ?? "")}</span>{mapping.derived ? <small className="fw-calculation">{mapping.source.calculation || "Payment amount × monthly multiplier"}{mapping.source.multiplier ? ` (${mapping.source.multiplier})` : ""}</small> : null}</div><div className="fw-mapping-source"><CellChip tone={mappingConflict(mapping) ? "warn" : "mut"}>{mappingConflict(mapping) ? "Changes existing answer" : financialMappingConfidence(mapping.confidence)}</CellChip>{mapping.source.file_id ? <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); previewSource(mapping.source.file_id, mapping.source.page, mapping.source.content_hash); }}>{mapping.source.page ? `Open page ${mapping.source.page}` : "Open source"}</button> : <small>Calculated from reviewed payment terms</small>}</div>{mapping.source.quote ? <q title={mapping.confidence === "high" ? "Quote verified against the source page" : "Source excerpt needs review"}>{mapping.source.quote}</q> : null}</label>)}</div><div className="row"><Btn onClick={() => setProposal(null)}>Cancel mapping</Btn><Btn variant="pri" disabled={!selectedMappings.length || Boolean(busy)} onClick={applyImport}>Apply selected fields</Btn></div></div> : null}
                <div className="fw-pdf-panes split"><section><header><strong>{selected && kind === "debt_schedule" ? `Source for ${String(selected.lender || "selected loan")}` : "Original source"}</strong>{sourceUrl ? <Btn size="sm" onClick={() => setSourceUrl(null)}>Hide source</Btn> : null}</header>{sourceUrl ? <iframe title="Original financial source document" src={sourceUrl} /> : <div className="empty">Choose a related document and open its source to compare the printed terms.</div>}</section><section><header><strong>Working draft</strong><Btn size="sm" onClick={() => setView("form")}>Open form</Btn></header><div className="fw-pdf-fields">{renderFields()}</div></section></div>
              </> : <div className="fw-pdf-panes"><section><header><strong>Saved version PDF</strong>{(pdfVersionId ?? snapshot.current_version_id) ? <div className="row"><Btn size="sm" disabled={Boolean(busy)} onClick={() => downloadPdf((pdfVersionId ?? snapshot.current_version_id)!)}>Download PDF</Btn><Btn size="sm" disabled={Boolean(busy)} onClick={() => copyPdfShare((pdfVersionId ?? snapshot.current_version_id)!)}>Copy PDF share link</Btn></div> : null}{snapshot.versions.length ? <Select aria-label="PDF version" disabled={Boolean(busy)} value={pdfVersionId ?? snapshot.current_version_id ?? ""} onChange={(event) => void run("pdf", async () => { await showPdf(event.target.value); })}>{snapshot.versions.map((version) => <option key={version.id} value={version.id}>v{version.version_number} · {when(version.created_at)}</option>)}</Select> : null}</header>{pdfUrl ? <iframe title="Saved financial version PDF" src={pdfUrl} /> : <div className="empty">Save a version to generate its dated PDF.</div>}</section></div>}
            </div> : null}
            {view === "history" ? <div className="fw-history"><h3>Dated versions</h3><p>Original client files and every saved revision stay available. Restoring an older version creates a draft; Save version publishes the next version.</p>{snapshot.versions.map((version) => <article key={version.id}><div><strong>v{version.version_number}</strong>{version.id === snapshot.current_version_id ? <CellChip tone={version.id === completedVersion?.id ? "ok" : "mut"}>{version.id === completedVersion?.id ? "Current · used by AI" : "Current saved PDF"}</CellChip> : null}<span>{when(version.created_at)}</span><small>{version.actor_name || "Client upload"} · {version.source.replaceAll("_", " ")}</small></div><div className="row"><Btn disabled={Boolean(busy)} onClick={() => void run("pdf", async () => { await showPdf(version.id); setFileMode("versions"); setView("pdf"); })}>View PDF</Btn><Btn disabled={Boolean(busy)} onClick={() => void run("restore", async () => { await flush(); accept(await restoreFinancialVersion(api, profileId, version.id, current.current!.draft.revision)); setNotice(`v${version.version_number} restored into the draft. Save version to publish it as the next revision.`); setView("form"); })}>Restore to draft</Btn></div></article>)}{!snapshot.versions.length ? <div className="empty">No saved versions yet. Uploaded originals appear here as v1.</div> : null}</div> : null}
          </>}
        </main>
      </div>
    </Drawer>
    {requestOpen ? <RequestFilesDialog profileId={profileId} open onClose={() => setRequestOpen(false)} onRequested={() => { void onPublished?.(); }} /> : null}
  </>;
}

function DebtInspector({ row, rows, snapshot, busy, onAction, onPreview }: {
  row: FinancialDebtRow; rows: FinancialDebtRow[]; snapshot: FinancialWorkspaceSnapshot; busy: boolean;
  onAction: (action: DebtAction) => void; onPreview: (fileId: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [fileId, setFileId] = useState("");
  const [role, setRole] = useState<DebtDocumentRole>("payoff");
  const [payoffAmount, setPayoffAmount] = useState("");
  const [payoffDate, setPayoffDate] = useState("");
  const excluded = row.status === "dismissed" || row.status === "duplicate" || Boolean(row.duplicate_of_id);
  const links = row.evidence_links ?? [];
  return <section className="fw-debt-inspector" aria-label={`Manage ${row.lender || "obligation"}`}>
    <div className="fw-row-heading"><h4>Obligation controls</h4><CellChip tone={excluded ? "warn" : "ok"}>{row.status || "active"}</CellChip>{row.duplicate_of_id ? <span className="sub">Duplicate of {String(rows.find((item) => item.id === row.duplicate_of_id)?.lender || row.duplicate_of_id)}</span> : null}</div>
    <div className="fw-row-actions">{excluded ? <Btn disabled={busy} onClick={() => onAction({ op: "restore", row_id: row.id })}>Restore row</Btn> : <><Btn disabled={busy} onClick={() => onAction({ op: "delete", row_id: row.id })}><Icon name="trash" size={14} />Remove row</Btn><Select aria-label="This obligation is a duplicate of" value={target} onChange={(event) => setTarget(event.target.value)}><option value="">Same obligation as…</option>{rows.filter((candidate) => candidate.id !== row.id && candidate.status !== "dismissed" && candidate.status !== "duplicate" && !candidate.duplicate_of_id).map((candidate) => <option key={candidate.id} value={candidate.id}>{String(candidate.lender || "Unnamed obligation")}</option>)}</Select><Btn disabled={busy || !target} onClick={() => onAction({ op: "duplicate", row_id: row.id, target_row_id: target })}>Mark duplicate</Btn></>}</div>
    <h4>Linked agreements and payoff letters</h4>
    {links.map((link, index) => <div className="fw-document-link" key={`${link.file_id}:${link.role}:${index}`}><Icon name="file" size={15} /><div><strong>{snapshot.evidence.find((file) => file.file_id === link.file_id)?.file_name || "Linked document"}</strong><small>{link.role}{link.is_current ? " · Selected current payoff" : ""}{link.payoff_amount != null ? ` · $${link.payoff_amount}` : ""}{link.payoff_date ? ` · ${link.payoff_date}` : ""}</small></div><Btn size="sm" disabled={busy} onClick={() => onPreview(link.file_id)}>View</Btn>{link.role === "payoff" && !link.is_current ? <Btn size="sm" disabled={busy} onClick={() => onAction({ op: "select_payoff", row_id: row.id, file_id: link.file_id, role: "payoff", payoff_amount: link.payoff_amount == null ? null : String(link.payoff_amount), payoff_date: link.payoff_date })}>Use payoff</Btn> : null}<Btn size="sm" disabled={busy} onClick={() => onAction({ op: "unlink_document", row_id: row.id, file_id: link.file_id, role: link.role })}>Unlink</Btn></div>)}
    {!links.length ? <p className="sub">Link each payoff letter to its obligation so the system knows which debt it belongs to.</p> : null}
    <div className="fw-link-composer"><Field label="Document"><Select aria-label="Document" value={fileId} onChange={(event) => setFileId(event.target.value)}><option value="">Choose evidence…</option>{snapshot.evidence.map((file) => <option key={file.file_id} value={file.file_id}>{file.file_name}</option>)}</Select></Field><Field label="Document role"><Select aria-label="Document role" value={role} onChange={(event) => setRole(event.target.value as DebtDocumentRole)}><option value="payoff">Payoff letter</option><option value="agreement">Loan agreement</option><option value="supporting">Supporting document</option></Select></Field>{role === "payoff" ? <><Field label="Payoff amount"><Input aria-label="Payoff amount" inputMode="decimal" value={payoffAmount} onChange={(event) => setPayoffAmount(event.target.value)} /></Field><Field label="Payoff date"><Input aria-label="Payoff date" type="date" value={payoffDate} onChange={(event) => setPayoffDate(event.target.value)} /></Field></> : null}<Btn disabled={busy || !fileId} onClick={() => onAction({ op: "link_document", row_id: row.id, file_id: fileId, role, ...(role === "payoff" ? { payoff_amount: payoffAmount || null, payoff_date: payoffDate || null } : {}) })}>Link document</Btn></div>
  </section>;
}
